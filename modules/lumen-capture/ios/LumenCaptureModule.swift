import AVFoundation
import ExpoModulesCore

// CaptureConfig in LumenCapture.types.ts.
struct CaptureConfigRecord: Record {
  @Field var lensId: String?
  @Field var targetFps: Double?
  @Field var torchLevel: Double?
  @Field var exposureTarget: [Double]?
}

// Camera work runs on the capture session's own queue, so a slow call never blocks Expo's shared queue.
public final class LumenCaptureModule: Module {
  private let capture = CaptureSession()

  public func definition() -> ModuleDefinition {
    Name("LumenCapture")

    Events("samples", "status", "lab")

    View(LumenPreviewView.self) {}

    OnCreate {
      self.capture.emit = { [weak self] name, body in
        self?.sendEvent(name, body.mapValues { Optional($0) })
      }
      // Joined once, before any start(); later views only move the layer and never touch the session.
      let session = self.capture.previewSession
      Task { @MainActor in LivePreview.connect(to: session) }
    }

    // A JS reload destroys the module; stop so the torch never stays on.
    OnDestroy {
      let capture = self.capture
      capture.sessionQueue.async { capture.stopCapture() }
    }

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      LumenCaptureModule.capabilities()
    }.runOnQueue(capture.sessionQueue)

    AsyncFunction("getPermission") { () -> [String: Any] in
      LumenCaptureModule.cameraPermission()
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      AVCaptureDevice.requestAccess(for: .video) { _ in
        promise.resolve(LumenCaptureModule.cameraPermission())
      }
    }

    AsyncFunction("start") { (config: CaptureConfigRecord) -> [String: Any] in
      do {
        let activeFps = try self.capture.start(
          lensId: config.lensId,
          targetFps: config.targetFps,
          torchLevel: config.torchLevel,
          exposureTarget: config.exposureTarget
        )
        return ["activeFps": activeFps]
      } catch {
        throw captureError(wrapping: error)
      }
    }.runOnQueue(capture.sessionQueue)

    // Events run at normal priority but promise results at immediate priority, so resolving at once could
    // overtake the last batch. Resolving from a normal-priority task queued after it keeps the order.
    AsyncFunction("stop") { (promise: Promise) in
      do {
        let summary = try self.capture.stop()
        guard let runtime = try self.appContext?.runtime else {
          throw captureError("The JavaScript runtime is gone")
        }
        // resolve(Any?) takes a plain value; the generic resolve requires a `sending` one.
        runtime.schedule { promise.resolve(summary as Any?) }
      } catch {
        promise.reject(captureError(wrapping: error))
      }
    }.runOnQueue(capture.sessionQueue)

    AsyncFunction("setTorch") { (level: Double) in
      do {
        try self.capture.setTorch(level)
      } catch {
        throw captureError(wrapping: error)
      }
    }.runOnQueue(capture.sessionQueue)

    AsyncFunction("lockExposure") { (promise: Promise) in
      self.capture.lockExposure { error in
        if let error {
          promise.reject(captureError(wrapping: error))
        } else {
          promise.resolve()
        }
      }
    }.runOnQueue(capture.sessionQueue)
  }

  // As Expo's PermissionResponse: Only an explicit denial stops asking; restricted counts as denied.
  private static func cameraPermission() -> [String: Any] {
    let status: String
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: status = "granted"
    case .notDetermined: status = "undetermined"
    case .denied, .restricted: status = "denied"
    @unknown default: status = "denied"
    }
    return ["status": status, "expires": "never", "granted": status == "granted", "canAskAgain": status != "denied"]
  }

  private static func capabilities() -> [String: Any] {
    let lenses = CaptureSession.rearLenses()
    let torch = lenses.contains { CaptureSession.torchUsable($0) }
    // Locks are reported for the default lens, which start() uses when no lens is named.
    let main = CaptureSession.defaultLens(lenses)
    let version = ProcessInfo.processInfo.operatingSystemVersion
    return [
      "platform": "ios",
      "modelId": machineIdentifier(),
      "osVersion": "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
      "rearLenses": lenses.map { lens -> [String: Any] in
        [
          "id": lens.uniqueID,
          "kind": CaptureSession.kind(of: lens),
          "maxFps": CaptureSession.maxFps(of: lens),
          "torchUsable": CaptureSession.torchUsable(lens),
        ]
      },
      // Every iOS torch takes a brightness level through setTorchModeOn(level:).
      "torch": ["available": torch, "levels": torch],
      "locks": [
        "exposure": main.map { $0.isExposureModeSupported(.custom) || $0.isExposureModeSupported(.locked) } ?? false,
        "whiteBalance": main?.isWhiteBalanceModeSupported(.locked) ?? false,
        "focus": main.map {
          focusHolds(
            lockedSupported: $0.isFocusModeSupported(.locked),
            autoFocusSupported: $0.isFocusModeSupported(.autoFocus),
            continuousAutoFocusSupported: $0.isFocusModeSupported(.continuousAutoFocus)
          )
        } ?? false,
      ],
    ]
  }

  // From utsname, e.g. "iPhone15,2".
  private static func machineIdentifier() -> String {
    var system = utsname()
    guard uname(&system) == 0 else { return "unknown" }
    return withUnsafeBytes(of: &system.machine) { raw in
      String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
    }
  }
}
