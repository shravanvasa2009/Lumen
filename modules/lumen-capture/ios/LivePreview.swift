import AVFoundation
import QuartzCore

// Main thread only. The layer gets the session once and lives with the module, so views coming and going only
// move the layer and never reconfigure the session (which could reset the torch or restart AE).
@MainActor
enum LivePreview {
  private static let previewLayer: AVCaptureVideoPreviewLayer = {
    let layer = AVCaptureVideoPreviewLayer()
    // Fill the circle rather than letterbox.
    layer.videoGravity = .resizeAspectFill
    return layer
  }()
  private static weak var holder: LumenPreviewView?

  // A JS reload creates a new session, so replace rather than keep the first.
  static func connect(to session: AVCaptureSession) {
    previewLayer.session = session
  }

  // One view at a time; the newest wins, such as a screen pushed over another.
  static func attach(_ view: LumenPreviewView) {
    holder = view
    withoutAnimation {
      previewLayer.removeFromSuperlayer()
      view.layer.addSublayer(previewLayer)
      previewLayer.frame = view.bounds
    }
  }

  static func detach(_ view: LumenPreviewView) {
    guard holder === view else { return }
    holder = nil
    withoutAnimation { previewLayer.removeFromSuperlayer() }
  }

  static func layout(_ view: LumenPreviewView) {
    guard holder === view else { return }
    withoutAnimation { previewLayer.frame = view.bounds }
  }

  // Standalone layers animate frame changes by default.
  private static func withoutAnimation(_ change: () -> Void) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    change()
    CATransaction.commit()
  }
}
