import Foundation

struct FormatCandidate {
  let width: Int
  let height: Int
  let maxFps: Double
}

// With no requested rate, use the lens maximum up to 120 fps, so a 100 ms batch stays near 2 KB.
let maxCaptureFps = 240.0
let defaultMaxCaptureFps = 120.0

func resolveTargetFps(requested: Double?, lensMaxFps: Double) -> Double {
  guard let requested, requested > 0 else { return min(lensMaxFps, defaultMaxCaptureFps) }
  return min(requested, lensMaxFps, maxCaptureFps)
}

// Lowest-resolution format that reaches the target rate. Half a frame of slack lets 59.94 fps count as 60.
func chooseFormat(_ candidates: [FormatCandidate], targetFps: Double) -> Int? {
  candidates.indices
    .filter { candidates[$0].maxFps >= targetFps - 0.5 }
    .min { candidates[$0].width * candidates[$0].height < candidates[$1].width * candidates[$1].height }
}

// Default lock window for the red mean, as a fraction of full scale.
let defaultExposureTarget = 0.55...0.80

// nil unless the window is two increasing values within 0..1.
func exposureWindow(_ bounds: [Double]?) -> ClosedRange<Double>? {
  guard let bounds else { return defaultExposureTarget }
  guard bounds.count == 2, bounds[0] >= 0, bounds[0] < bounds[1], bounds[1] <= 1 else { return nil }
  return bounds[0]...bounds[1]
}

struct ExposureSetting {
  let durationS: Double
  let iso: Double
}

struct ExposureLimits {
  let minDurationS: Double
  // Capped at one frame interval so exposure never lowers the frame rate.
  let maxDurationS: Double
  let minISO: Double
  let maxISO: Double
}

// Red is gamma-encoded (sRGB, IEC 61966-2-1), so exposure scales with about the 2.2 power of the change.
// Clamped to 3 stops per step so one bad frame cannot swing the exposure far.
func exposureFactor(red: Double, target: ClosedRange<Double>) -> Double {
  let middle = (target.lowerBound + target.upperBound) / 2
  let wanted = pow(middle / max(red, 0.01), 2.2)
  return min(max(wanted, 0.125), 8)
}

// Scales duration x ISO by `factor`, preferring longer duration over ISO, since ISO adds sensor noise.
func planExposure(from current: ExposureSetting, factor: Double, limits: ExposureLimits) -> ExposureSetting {
  let total = current.durationS * current.iso * factor
  let duration = min(max(total / limits.minISO, limits.minDurationS), limits.maxDurationS)
  let iso = min(max(total / duration, limits.minISO), limits.maxISO)
  return ExposureSetting(durationS: duration, iso: iso)
}

// 10 frame intervals clamped to 1 to 3 s. Same as Android.
func lockWaitS(medianIntervalNs: Double) -> Double {
  min(max(10 * medianIntervalNs / 1e9, 1), 3)
}

// A lens with no autofocus counts as holding focus, since it cannot drift during a reading.
func focusHolds(lockedSupported: Bool, autoFocusSupported: Bool, continuousAutoFocusSupported: Bool) -> Bool {
  lockedSupported || (!autoFocusSupported && !continuousAutoFocusSupported)
}
