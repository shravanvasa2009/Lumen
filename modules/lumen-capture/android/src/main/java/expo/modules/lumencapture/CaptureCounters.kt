package expo.modules.lumencapture

import android.os.PowerManager
import kotlin.math.roundToLong
import kotlin.math.sqrt

data class CapturedFrame(val tNs: Long, val numbers: FrameNumbers, val exposureNs: Long)

data class StatusNumbers(val fingerCovered: Boolean, val fps: Double, val droppedFrac: Double)

data class FrameWorkMs(val mean: Double, val max: Double)

private const val ONE_SECOND_NS = 1_000_000_000L

// A gap over 1.5x the median interval hides round(gap / median) - 1 frames. The median covers the last 1 s;
// the nominal interval stands in until 5 intervals exist.
private const val DROP_GAP_FACTOR = 1.5
private const val MIN_MEDIAN_INTERVALS = 5

// Red above 0.95 for 0.5 s after the lock triggers one exposure step down.
private const val OVEREXPOSED_RED = 0.95
private const val OVEREXPOSED_FOR_NS = 500_000_000L

// The analyzer thread adds frames while the event thread drains them, so shared state is synchronized.
class CaptureCounters(private val nominalIntervalNs: Long) {
    private val pending = ArrayList<CapturedFrame>()
    private val arrivalsNs = ArrayDeque<Long>()
    private var lastFrameNs: Long? = null
    private val intervalEndsNs = ArrayDeque<Long>()
    private val intervalsNs = ArrayDeque<Long>()
    private val lastIntervalsNs = ArrayDeque<Long>()
    private var newestSinceStatus: FrameNumbers? = null
    private val work = TimingWindow()
    private var watchArmed = false
    private var overexposedSinceNs: Long? = null

    var frames = 0L
        @Synchronized get
        private set
    var dropped = 0L
        @Synchronized get
        private set
    var lastRed: Double? = null
        @Synchronized get
        private set

    // For the contact log; unlike newestSinceStatus, reading it changes nothing.
    var lastFrame: CapturedFrame? = null
        @Synchronized get
        private set

    init {
        require(nominalIntervalNs > 0) { "nominal frame interval must be positive" }
    }

    // Returns true once when the armed over-exposure watch sees red above 0.95 for 0.5 s.
    @Synchronized
    fun addFrame(frame: CapturedFrame, arrivalNs: Long, workNs: Long): Boolean {
        countDropped(frame.tNs)
        frames++
        lastRed = frame.numbers.r
        lastFrame = frame
        pending.add(frame)
        newestSinceStatus = frame.numbers
        arrivalsNs.addLast(arrivalNs)
        dropOldArrivals(arrivalNs)
        work.add(workNs)
        return watchOverexposure(frame.numbers.r, frame.tNs)
    }

    // Median of the last 5 intervals whatever their age, so lock waits still work below 5 fps.
    @Synchronized
    fun lockIntervalNs(): Double = medianIntervalNs(lastIntervalsNs) ?: nominalIntervalNs.toDouble()

    @Synchronized
    fun armOverexposureWatch() {
        watchArmed = true
        overexposedSinceNs = null
    }

    // Frames since the previous call, for the 100 ms samples event.
    @Synchronized
    fun drainBatch(): List<CapturedFrame> {
        val batch = pending.toList()
        pending.clear()
        return batch
    }

    // fps falls to 0 when frames stop. Contact uses the newest frame since the previous status, so a stalled
    // camera reports no contact.
    @Synchronized
    fun status(nowNs: Long): StatusNumbers {
        dropOldArrivals(nowNs)
        val covered = newestSinceStatus?.let(::fingerCovered) ?: false
        newestSinceStatus = null
        val seen = frames + dropped
        return StatusNumbers(
            fingerCovered = covered,
            fps = arrivalsNs.size.toDouble(),
            droppedFrac = if (seen > 0) dropped.toDouble() / seen else 0.0,
        )
    }

    // Same count status() reports as fps.
    @Synchronized
    fun recentFps(nowNs: Long): Double {
        dropOldArrivals(nowNs)
        return arrivalsNs.size.toDouble()
    }

    // Per-frame reduction time, for the Lab event. Budget is 4 ms at 60 fps.
    fun takeFrameWork(): FrameWorkMs = work.take()

    private fun countDropped(tNs: Long) {
        val previous = lastFrameNs
        lastFrameNs = tNs
        if (previous == null) return
        while (intervalEndsNs.isNotEmpty() && intervalEndsNs.first() <= tNs - ONE_SECOND_NS) {
            intervalEndsNs.removeFirst()
            intervalsNs.removeFirst()
        }
        val referenceNs = medianIntervalNs(intervalsNs) ?: nominalIntervalNs.toDouble()
        val gapNs = tNs - previous
        if (gapNs > DROP_GAP_FACTOR * referenceNs) dropped += (gapNs / referenceNs).roundToLong() - 1
        intervalEndsNs.addLast(tNs)
        intervalsNs.addLast(gapNs)
        lastIntervalsNs.addLast(gapNs)
        if (lastIntervalsNs.size > MIN_MEDIAN_INTERVALS) lastIntervalsNs.removeFirst()
    }

    private fun watchOverexposure(red: Double, tNs: Long): Boolean {
        if (!watchArmed || red <= OVEREXPOSED_RED) {
            overexposedSinceNs = null
            return false
        }
        val since = overexposedSinceNs ?: tNs.also { overexposedSinceNs = it }
        if (tNs - since < OVEREXPOSED_FOR_NS) return false
        watchArmed = false
        overexposedSinceNs = null
        return true
    }

    private fun dropOldArrivals(nowNs: Long) {
        while (arrivalsNs.isNotEmpty() && nowNs - arrivalsNs.first() >= ONE_SECOND_NS) arrivalsNs.removeFirst()
    }
}

// Mean and max in ms since the previous take(). One thread adds while another takes.
class TimingWindow {
    private var count = 0
    private var sumNs = 0L
    private var maxNs = 0L

    @Synchronized
    fun add(ns: Long) {
        count++
        sumNs += ns
        if (ns > maxNs) maxNs = ns
    }

    @Synchronized
    fun take(): FrameWorkMs {
        val window = if (count == 0) FrameWorkMs(0.0, 0.0) else FrameWorkMs(sumNs / 1e6 / count, maxNs / 1e6)
        count = 0
        sumNs = 0
        maxNs = 0
        return window
    }
}

// Results and frames arrive on different threads, so results are kept and matched by sensor timestamp.
class ExposureLog(private val capacity: Int = 32) {
    private val timestamps = LongArray(capacity)
    private val exposures = LongArray(capacity)
    private var count = 0
    private var next = 0

    @Synchronized
    fun record(sensorTimestampNs: Long, exposureNs: Long) {
        timestamps[next] = sensorTimestampNs
        exposures[next] = exposureNs
        next = (next + 1) % capacity
        if (count < capacity) count++
    }

    // Exact match, else the newest before it, else the newest of all; 0 before any.
    @Synchronized
    fun exposureAt(frameTimestampNs: Long): Long {
        var best = -1
        var newest = -1
        for (i in 0 until count) {
            val t = timestamps[i]
            if (t == frameTimestampNs) return exposures[i]
            if (newest < 0 || t > timestamps[newest]) newest = i
            if (t < frameTimestampNs && (best < 0 || t > timestamps[best])) best = i
        }
        return when {
            best >= 0 -> exposures[best]
            newest >= 0 -> exposures[newest]
            else -> 0L
        }
    }
}

// null with fewer than 5 intervals.
fun medianIntervalNs(intervalsNs: Collection<Long>): Double? {
    val intervals = intervalsNs.sorted()
    if (intervals.size < MIN_MEDIAN_INTERVALS) return null
    val middle = intervals.size / 2
    return if (intervals.size % 2 == 1) intervals[middle].toDouble() else (intervals[middle - 1] + intervals[middle]) / 2.0
}

// Copied from src/core/config.ts. Only the live hint; core recomputes contact.
private const val CONTACT_MIN_RED_RATIO = 2.0
private const val CONTACT_MIN_RED = 0.30
private const val CONTACT_MAX_STD_R = 0.10

// Same test as core's frameProblem() in src/core/contact.ts. Clipping does not clear the hint: before the
// lock a covered finger can clip, and "not covered" would stop JS from ever asking for the lock.
fun fingerCovered(frame: FrameNumbers): Boolean =
    listOf(frame.r, frame.g, frame.b).all { it in 0.0..1.0 } &&
        frame.spatialStdR.isFinite() &&
        frame.clipFrac.isFinite() &&
        frame.r >= CONTACT_MIN_RED_RATIO * (frame.g + frame.b) &&
        frame.r >= CONTACT_MIN_RED &&
        frame.spatialStdR <= CONTACT_MAX_STD_R

// Maps Android's seven thermal levels onto iOS's four, following the PowerManager docs.
fun thermalName(status: Int): String =
    when (status) {
        PowerManager.THERMAL_STATUS_NONE -> "nominal"
        PowerManager.THERMAL_STATUS_LIGHT, PowerManager.THERMAL_STATUS_MODERATE -> "fair"
        PowerManager.THERMAL_STATUS_SEVERE -> "serious"
        else -> "critical"
    }

private const val STANDARD_GRAVITY = 9.80665 // m/s^2 per g

// RMS of gravity-removed acceleration over the last 1 s, in g. Written and read on the event thread only.
class MotionWindow {
    private val times = ArrayDeque<Long>()
    private val squares = ArrayDeque<Double>()
    private var sumSquares = 0.0

    fun add(tNs: Long, x: Float, y: Float, z: Float) {
        val square = (x.toDouble() * x + y.toDouble() * y + z.toDouble() * z) / (STANDARD_GRAVITY * STANDARD_GRAVITY)
        times.addLast(tNs)
        squares.addLast(square)
        sumSquares += square
        dropOld(tNs)
    }

    fun rmsG(nowNs: Long): Double {
        dropOld(nowNs)
        if (squares.isEmpty()) return 0.0
        return sqrt((sumSquares / squares.size).coerceAtLeast(0.0))
    }

    private fun dropOld(nowNs: Long) {
        while (times.isNotEmpty() && nowNs - times.first() >= ONE_SECOND_NS) {
            times.removeFirst()
            sumSquares -= squares.removeFirst()
        }
    }
}
