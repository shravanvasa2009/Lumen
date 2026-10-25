import Foundation

// Touched only on the capture queue, so it needs no lock. Payload keys follow LumenCapture.types.ts.
struct CaptureCounters {
  // A gap above 1.5 median intervals counts round(gap / median) - 1 dropped frames. The median covers the
  // last 1 s; the nominal interval stands in until 5 exist.
  static let dropGapFactor = 1.5
  static let medianWindowNs: Int64 = 1_000_000_000
  static let minIntervalsForMedian = 5
  static let fpsWindowNs: Int64 = 1_000_000_000
  // Red above 0.95 for 0.5 s after the lock triggers one exposure step down, so one bright frame does not.
  static let overexposedRed = 0.95
  static let overexposedForNs: Int64 = 500_000_000

  let nominalIntervalNs: Double
  private(set) var frames = 0
  private(set) var dropped = 0
  private(set) var lastRed: Double?

  private var lastFrameNs: Int64?
  private var recentFrameNs: [Int64] = []
  private var recentIntervals: [(endNs: Int64, ns: Double)] = []
  private var lastFiveIntervals: [Double] = []
  private var samples: [[String: Double]] = []
  private var stats: [[String: Double]] = []
  private var latestSinceStatus: FrameReduction?
  private var motion = MotionWindow()
  private var workMsTotal = 0.0
  private var workMsMax = 0.0
  private var workCount = 0
  private var watchArmed = false
  private var overexposedSinceNs: Int64?

  init(nominalIntervalNs: Double) {
    self.nominalIntervalNs = nominalIntervalNs
  }

  var droppedFrac: Double {
    let expected = frames + dropped
    return expected == 0 ? 0 : Double(dropped) / Double(expected)
  }

  // True once when the armed watch sees red above 0.95 for 0.5 s.
  mutating func addFrame(tNs: Int64, reduction: FrameReduction, exposureNs: Int64, workMs: Double) -> Bool {
    if let lastFrameNs {
      let gap = Double(tNs - lastFrameNs)
      let reference = referenceIntervalNs(at: tNs)
      if gap > Self.dropGapFactor * reference {
        dropped += Int((gap / reference).rounded()) - 1
      }
      recentIntervals.append((endNs: tNs, ns: gap))
      lastFiveIntervals.append(gap)
      if lastFiveIntervals.count > 5 {
        lastFiveIntervals.removeFirst()
      }
    }
    lastFrameNs = tNs
    frames += 1
    recentFrameNs.append(tNs)
    lastRed = reduction.r
    latestSinceStatus = reduction
    samples.append(["tNs": Double(tNs), "r": reduction.r, "g": reduction.g, "b": reduction.b])
    stats.append([
      "tNs": Double(tNs),
      "spatialStdR": reduction.spatialStdR,
      "clipFrac": reduction.clipFrac,
      "exposureNs": Double(exposureNs),
    ])
    workMsTotal += workMs
    workMsMax = max(workMsMax, workMs)
    workCount += 1
    return watchOverexposure(red: reduction.r, tNs: tNs)
  }

  mutating func addMotion(x: Double, y: Double, z: Double) {
    motion.add(x: x, y: y, z: z)
  }

  mutating func armOverexposureWatch() {
    watchArmed = true
    overexposedSinceNs = nil
  }

  // nil when no frame arrived since the last batch.
  mutating func drainBatch() -> [String: Any]? {
    guard !samples.isEmpty else { return nil }
    let batch: [String: Any] = ["samples": samples, "stats": stats]
    samples.removeAll(keepingCapacity: true)
    stats.removeAll(keepingCapacity: true)
    return batch
  }

  // fps counts frames in the last 1 s on the frame clock. Contact uses the newest frame since the previous
  // status, so a stalled camera reports no contact.
  mutating func status(nowNs: Int64, thermal: ProcessInfo.ThermalState) -> [String: Any] {
    recentFrameNs.removeAll { $0 <= nowNs - Self.fpsWindowNs }
    let covered = latestSinceStatus?.coversLens ?? false
    latestSinceStatus = nil
    return [
      "fingerCovered": covered,
      "motionRms": motion.rms,
      "thermal": thermalName(thermal),
      "fps": recentFrameNs.count,
      "droppedFrac": droppedFrac,
    ]
  }

  // In ms, for the 1 Hz Lab event.
  mutating func drainWork() -> (meanMs: Double, maxMs: Double) {
    let work = (meanMs: workCount == 0 ? 0 : workMsTotal / Double(workCount), maxMs: workMsMax)
    workMsTotal = 0
    workMsMax = 0
    workCount = 0
    return work
  }

  // Nominal interval while fewer than 5 exist.
  var medianIntervalNs: Double {
    guard recentIntervals.count >= Self.minIntervalsForMedian else { return nominalIntervalNs }
    let sorted = recentIntervals.map { $0.ns }.sorted()
    let middle = sorted.count / 2
    return sorted.count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }

  // For lockExposure waits. The last 5 intervals however old, so waits still scale below 5 fps.
  var lastFiveMedianIntervalNs: Double {
    guard lastFiveIntervals.count == 5 else { return nominalIntervalNs }
    return lastFiveIntervals.sorted()[2]
  }

  // Before this frame's own interval joins the window.
  private mutating func referenceIntervalNs(at tNs: Int64) -> Double {
    recentIntervals.removeAll { $0.endNs <= tNs - Self.medianWindowNs }
    return medianIntervalNs
  }

  private mutating func watchOverexposure(red: Double, tNs: Int64) -> Bool {
    guard watchArmed, red > Self.overexposedRed else {
      overexposedSinceNs = nil
      return false
    }
    let since = overexposedSinceNs ?? tNs
    overexposedSinceNs = since
    guard tNs - since >= Self.overexposedForNs else { return false }
    watchArmed = false
    overexposedSinceNs = nil
    return true
  }
}

// RMS of gravity-removed acceleration in g over the last 1 s, sampled at 50 Hz.
struct MotionWindow {
  static let capacity = 50

  private var squares = [Double](repeating: 0, count: Self.capacity)
  private var next = 0
  private var filled = 0

  mutating func add(x: Double, y: Double, z: Double) {
    squares[next] = x * x + y * y + z * z
    next = (next + 1) % Self.capacity
    filled = min(filled + 1, Self.capacity)
  }

  var rms: Double {
    guard filled > 0 else { return 0 }
    return (squares.prefix(filled).reduce(0, +) / Double(filled)).squareRoot()
  }
}

// Unknown future states count as critical, so the torch-heat rule stops early.
func thermalName(_ state: ProcessInfo.ThermalState) -> String {
  switch state {
  case .nominal: return "nominal"
  case .fair: return "fair"
  case .serious: return "serious"
  case .critical: return "critical"
  @unknown default: return "critical"
  }
}
