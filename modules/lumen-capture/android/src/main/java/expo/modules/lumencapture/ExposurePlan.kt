package expo.modules.lumencapture

import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.roundToLong

// Default lock window for the red mean, as a fraction of full scale.
val DEFAULT_EXPOSURE_TARGET = 0.55..0.80

// null unless the window is two increasing values within 0..1.
fun exposureWindow(bounds: List<Double>?): ClosedFloatingPointRange<Double>? {
    if (bounds == null) return DEFAULT_EXPOSURE_TARGET
    if (bounds.size != 2 || bounds[0] < 0 || bounds[0] >= bounds[1] || bounds[1] > 1) return null
    return bounds[0]..bounds[1]
}

data class ExposureSetting(val durationNs: Double, val iso: Double)

// maxDurationNs is capped at one frame interval so exposure never lowers the frame rate.
data class ExposureLimits(val minDurationNs: Double, val maxDurationNs: Double, val minIso: Double, val maxIso: Double)

// sRGB-like output (IEC 61966-2-1): exposure scales with the 2.2 power of the wanted change in red.
// Clamped to 3 stops per step so one bad frame cannot swing the exposure far.
private const val GAMMA = 2.2
private const val MIN_FACTOR = 0.125
private const val MAX_FACTOR = 8.0
private const val MIN_RED = 0.01

// Exposure change that should bring the red mean to the middle of the window. Same rule as iOS.
fun exposureFactor(red: Double, target: ClosedFloatingPointRange<Double>): Double {
    val middle = (target.start + target.endInclusive) / 2
    val wanted = (middle / red.coerceAtLeast(MIN_RED)).pow(GAMMA)
    return wanted.coerceIn(MIN_FACTOR, MAX_FACTOR)
}

// lockExposure() waits are clamp(10 x median frame interval, 1 s, 3 s), so a slow camera gets more time.
private const val WAIT_FRAMES = 10
private const val MIN_WAIT_MS = 1000L
private const val MAX_WAIT_MS = 3000L

fun lockWaitMs(medianIntervalNs: Double): Long =
    (WAIT_FRAMES * medianIntervalNs / 1_000_000).roundToLong().coerceIn(MIN_WAIT_MS, MAX_WAIT_MS)

// A changed exposure reaches the output a few frames late; 0.2 s covers 30 to 240 fps.
const val EXPOSURE_LATENCY_MS = 200L

// Remaining settle before the first red reading, counted from the first frame (the closest Android match to
// iOS startRunning()), and never less than the exposure latency.
fun settleWaitMs(lockWaitMs: Long, firstFrameNs: Long?, nowNs: Long): Long {
    val elapsedMs = if (firstFrameNs == null) 0L else (nowNs - firstFrameNs) / 1_000_000
    return maxOf(lockWaitMs - elapsedMs, EXPOSURE_LATENCY_MS)
}

// Scales duration x ISO by `factor`, preferring longer duration over ISO, since ISO adds sensor noise.
fun planExposure(current: ExposureSetting, factor: Double, limits: ExposureLimits): ExposureSetting {
    val total = current.durationNs * current.iso * factor
    val duration = (total / limits.minIso).coerceIn(limits.minDurationNs, limits.maxDurationNs)
    val iso = (total / duration).coerceIn(limits.minIso, limits.maxIso)
    return ExposureSetting(duration, iso)
}

// Manual exposure with MANUAL_SENSOR, else CONTROL_AE_LOCK if available, else nothing. AE lock is guaranteed
// only with MANUAL_SENSOR or BURST_CAPTURE (CameraCharacteristics docs), so some LIMITED phones get NONE.
enum class ExposureHold { MANUAL, AE_LOCK, NONE }

fun exposureHold(manualExposure: Boolean, aeLockAvailable: Boolean): ExposureHold =
    when {
        manualExposure -> ExposureHold.MANUAL
        aeLockAvailable -> ExposureHold.AE_LOCK
        else -> ExposureHold.NONE
    }

// CONTROL_AE_COMPENSATION_RANGE in steps of CONTROL_AE_COMPENSATION_STEP EV. null when the range is [0, 0].
data class AeCompensation(val minIndex: Int, val maxIndex: Int, val stepEv: Double)

// A clipped red says nothing about how far over the window it is.
private const val CLIPPED_RED = 0.95

// Small steps, each from a fresh red, so they cannot jump past the window. On a Galaxy A17 a fixed -2 EV step
// left red at 0.29. A clipped red takes -0.5 EV, then -1 EV while still clipped: -1 EV from 0.95 lands at
// 0.95 x 2^(-1/gamma), above 0.55 for any gamma above 1.27 (the A17 measured about 1.8).
private const val FIRST_CLIPPED_STEP_EV = -0.5
private const val MAX_STEP_EV = 1.0

// For AE-lock-only lenses: exposureFactor() in EV, capped at MAX_STEP_EV, or a fixed step down when clipped.
fun compensationStepEv(red: Double, target: ClosedFloatingPointRange<Double>, clippedBefore: Boolean): Double =
    when {
        red < CLIPPED_RED -> log2(exposureFactor(red, target)).coerceIn(-MAX_STEP_EV, MAX_STEP_EV)
        clippedBefore -> -MAX_STEP_EV
        else -> FIRST_CLIPPED_STEP_EV
    }

// Moves at least one index in the wanted direction, within the lens range.
fun nextCompensationIndex(current: Int, stepEv: Double, compensation: AeCompensation): Int {
    if (stepEv == 0.0) return current
    val indices = stepEv / compensation.stepEv
    val step = if (indices < 0) minOf(indices.roundToInt(), -1) else maxOf(indices.roundToInt(), 1)
    return (current + step).coerceIn(compensation.minIndex, compensation.maxIndex)
}

data class CompensationStep(val index: Int, val red: Double)

// Steps until red is inside `target`, for at most `maxSteps` or until the range edge. `measure` applies an
// index and returns the settled red. Returns `start` followed by every step.
fun steerCompensation(
    start: CompensationStep,
    target: ClosedFloatingPointRange<Double>,
    compensation: AeCompensation,
    maxSteps: Int,
    measure: (Int) -> Double,
): List<CompensationStep> {
    val path = mutableListOf(start)
    while (path.last().red !in target && path.size <= maxSteps) {
        val current = path.last()
        val clippedBefore = path.size > 1 && path[path.size - 2].red >= CLIPPED_RED
        val index = nextCompensationIndex(current.index, compensationStepEv(current.red, target, clippedBefore), compensation)
        if (index == current.index) break
        path.add(CompensationStep(index, measure(index)))
    }
    return path
}
