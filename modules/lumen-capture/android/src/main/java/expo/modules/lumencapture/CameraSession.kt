package expo.modules.lumencapture

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.util.Range
import android.util.Size
import androidx.annotation.OptIn
import androidx.annotation.RequiresApi
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.google.common.util.concurrent.ListenableFuture
import java.util.Locale
import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt
import kotlin.math.roundToLong

data class SessionSettings(
    val lens: RearLens,
    val fps: FpsRange,
    val torchLevel: Double,
    val exposureTarget: ClosedFloatingPointRange<Double>,
    val labEvents: Boolean,
)

data class SessionSummary(val startedNs: Long, val stoppedNs: Long, val lensId: String, val frames: Long, val dropped: Long)

// Newest capture-result values, for the Lab event and exposure steering.
private data class ResultSnapshot(
    val iso: Int,
    val exposureNs: Long,
    val torchOn: Boolean,
    val aeLocked: Boolean,
    // Applied CONTROL_AE_LOCK and CONTROL_AE_STATE, to tell whether an AE lock took hold.
    val aeLockOn: Boolean,
    val aeState: Int?,
    val awbLocked: Boolean,
    val afLocked: Boolean,
    val focusDistance: Float?,
    // Applied CONTROL_AE_EXPOSURE_COMPENSATION, to tell whether steering took hold.
    val aeCompensation: Int?,
    // Tells a slow sensor apart from frames lost before the analyzer.
    val frameDurationNs: Long?,
    // Applied CONTROL_AE_TARGET_FPS_RANGE, to check the requested range reached the camera.
    val aeFpsRange: Range<Int>?,
)

// Camera2 options added on top of CameraX's request. Exposure thread only.
private data class RequestState(
    val manual: ExposureSetting? = null,
    val aeLock: Boolean = false,
    // CONTROL_AE_EXPOSURE_COMPENSATION index; steers AE on lenses that only take an AE lock.
    val aeCompensation: Int = 0,
    val awbLock: Boolean = false,
    val focusDistance: Float? = null,
)

private const val TAG = "LumenCapture"

// 320 x 240 keeps the per-frame reduction well under the 4 ms budget.
private val ANALYSIS_SIZE = Size(320, 240)

// The live view is a 176 dp circle (about 460 px), so 640 x 480 is plenty and keeps the second stream cheap.
// 4:3 matches the analysis stream.
private val PREVIEW_SIZE = Size(640, 480)

private const val BATCH_MS = 100L // samples event
private const val STATUS_MS = 250L // status event at 4 Hz
private const val LAB_MS = 1000L // lab event at 1 Hz
private const val CONTACT_LOG_MS = 1000L
private const val MOTION_PERIOD_US = 20_000 // 50 Hz

// Same as iOS: at most 4 exposure steps, each judged on 3 frames taken after EXPOSURE_LATENCY_MS.
private const val MAX_EXPOSURE_STEPS = 4
private const val FRESH_FRAMES = 3
private const val FRESH_FRAME_POLL_MS = 20L
private const val POST_LOCK_FRAMES = 10
private const val ANALYZER_DRAIN_MS = 100L
private const val EVENT_DRAIN_MS = 50L
private const val FAILURE_LOG_EVERY = 100

// start() fails if no frame and torch arrive within this time of bind.
// Budget HALs can take 2-3 s to open, plus the torch.
private const val START_TIMEOUT_MS = 5000L

// CameraX ImageAnalysis with Camera2 interop for frame rate, exposure and locks, plus a Preview stream for
// the live view. Frames are reduced to numbers on the analyzer thread and never leave this class.
@OptIn(markerClass = [ExperimentalCamera2Interop::class])
class CameraSession(
    private val context: Context,
    private val settings: SessionSettings,
    private val emit: (String, Map<String, Any?>) -> Unit,
) {
    private val lens = settings.lens
    private val frameIntervalNs = 1_000_000_000L / settings.fps.upper
    private val counters = CaptureCounters(frameIntervalNs)
    private val exposureLog = ExposureLog()
    private val motion = MotionWindow()
    private val analyzerThread: ExecutorService = Executors.newSingleThreadExecutor()

    // lockExposure() blocks between steps while it waits for frames.
    private val exposureThread: ExecutorService = Executors.newSingleThreadExecutor()
    private val eventThread = HandlerThread("LumenCaptureEvents").apply { start() }
    private val events = Handler(eventThread.looper)
    private val mainExecutor = Executor { Handler(Looper.getMainLooper()).post(it) }

    // Only the start timer and first-frame note go here, so stop() can cancel just those.
    private val mainHandler = Handler(Looper.getMainLooper())
    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val powerManager = context.getSystemService(PowerManager::class.java)

    @Volatile private var latest: ResultSnapshot? = null

    @Volatile private var frameWidth = 0

    @Volatile private var frameHeight = 0

    @Volatile private var torchLevel = 0.0

    // Restored whenever the camera reopens.
    @Volatile private var requestedTorch = settings.torchLevel

    @Volatile private var running = false

    // elapsedRealtimeNanos; the lock's settle wait counts from here.
    @Volatile private var firstFrameRealtimeNs: Long? = null

    // One lockExposure() at a time; a concurrent call rejects.
    private val locking = AtomicBoolean(false)

    @Volatile private var camera: Camera? = null
    private var added = RequestState()

    // Kept apart from `added`, which a failed restore can leave unlocked, so a reopen still relocks.
    // Exposure thread only.
    private var aeLockWanted = false
    private var startedNs = 0L
    private var provider: ProcessCameraProvider? = null
    private var analysis: ImageAnalysis? = null
    private var preview: Preview? = null
    private var stopped = false // main thread only
    private var seenOpen = false // main thread only
    private var reopened = false // main thread only
    private val analysisFailures = AtomicInteger(0)

    // For the contact log: result rate, analyze() time, and the delay from sensor timestamp to analyze().
    private val captureResults = AtomicLong(0)
    private var loggedResults = 0L // event thread only
    private var loggedResultsNs = 0L // event thread only
    private val analyzeTiming = TimingWindow()
    private val queueTiming = TimingWindow()

    // Cleared once the start succeeds or fails. Main thread only, like the fields below.
    private var startDone: ((Throwable?) -> Unit)? = null
    private var torchReady = false
    private var frameReady = false
    private var lastCameraError: CameraState.StateError? = null
    private var summary: SessionSummary? = null

    private val startTimeout =
        Runnable {
            val missing = if (!frameReady) "delivered no frames" else "did not set the torch"
            val lastError = lastCameraError?.let { "; last camera error: ${cameraErrorText(it.code)}" } ?: ""
            finishStart(IllegalStateException("The camera $missing within ${START_TIMEOUT_MS / 1000} s of opening$lastError"))
        }

    private val firstFrameArrived =
        Runnable {
            frameReady = true
            if (torchReady) finishStart(null)
        }

    // CameraX 1.6.2 resets the torch when use cases detach, so the camera reopens dark after backgrounding.
    private val cameraStateObserver =
        Observer<CameraState> { state ->
            val error = state.error
            if (error == null) {
                Log.i(TAG, "Camera state ${state.type}")
            } else {
                Log.e(TAG, "Camera state ${state.type}, ${error.type} error: ${cameraErrorText(error.code)}", error.cause)
                lastCameraError = error
                // CameraX retries RECOVERABLE errors itself; those fail a start only through the timeout.
                // Posted because LiveData can deliver inside observe(), which would run stop() mid-bind().
                if (error.type == CameraState.ErrorType.CRITICAL) {
                    val failure = IllegalStateException("Camera error: ${cameraErrorText(error.code)}", error.cause)
                    mainHandler.post { finishStart(failure) }
                }
            }
            if (state.type == CameraState.Type.OPEN) {
                if (reopened) restoreAfterReopen()
                seenOpen = true
                reopened = false
            } else if (seenOpen) {
                reopened = true
            }
        }

    // Main thread. `done` runs once, when the torch is set and the first frame is in, or on failure.
    // On failure the caller still calls stop(), which unbinds the camera and turns the torch off.
    fun start(owner: LifecycleOwner, done: (Throwable?) -> Unit) {
        startDone = done
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            // stop() has already failed this start.
            if (stopped) return@addListener
            val outcome = runCatching { bind(owner, providerFuture.get()) }
            outcome.exceptionOrNull()?.let {
                finishStart(it)
                return@addListener
            }
            // stop() ran during bind and already unbound the camera.
            if (stopped) return@addListener
            mainHandler.postDelayed(startTimeout, START_TIMEOUT_MS)
            setTorch(settings.torchLevel) { failure ->
                if (failure != null) return@setTorch finishStart(failure)
                torchReady = true
                if (frameReady) finishStart(null)
            }
        }, mainExecutor)
    }

    private fun finishStart(failure: Throwable?) {
        val done = startDone ?: return
        startDone = null
        mainHandler.removeCallbacks(startTimeout)
        if (failure == null) Log.i(TAG, "Capture started") else Log.e(TAG, "Capture start failed", failure)
        done(failure)
    }

    private fun bind(owner: LifecycleOwner, cameraProvider: ProcessCameraProvider) {
        val builder =
            ImageAnalysis.Builder()
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                // Every frame is a pulse sample. KEEP_ONLY_LATEST drops late frames under UI load;
                // blocking keeps them all, and analysis is far shorter than a frame interval.
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_BLOCK_PRODUCER)
                .setResolutionSelector(
                    ResolutionSelector.Builder()
                        .setResolutionStrategy(
                            ResolutionStrategy(ANALYSIS_SIZE, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
                        ).build(),
                )
        sameRequest(Camera2Interop.Extender(builder)).setSessionCaptureCallback(resultListener)
        val useCase = builder.build()
        useCase.setAnalyzer(analyzerThread, ::analyze)
        val livePreview = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) buildPreview() else null
        val selector =
            CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                .addCameraFilter { infos -> infos.filter { Camera2CameraInfo.from(it).getCameraId() == lens.cameraId } }
                .build()
        startedNs = frameClockNs()
        // One bind for both use cases, so the session is configured once.
        val bound = cameraProvider.bindToLifecycle(owner, selector, *listOfNotNull(useCase, livePreview).toTypedArray())
        // Set right after binding so any later stop() unbinds the camera and puts the torch out.
        camera = bound
        provider = cameraProvider
        analysis = useCase
        preview = livePreview
        logBound()
        running = true
        sensorManager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let {
            sensorManager.registerListener(motionListener, it, MOTION_PERIOD_US, events)
        }
        events.postDelayed(::emitBatch, BATCH_MS)
        events.postDelayed(::emitStatus, STATUS_MS)
        if (settings.labEvents) events.postDelayed(::emitLab, LAB_MS)
        events.postDelayed(::logContactInputs, CONTACT_LOG_MS)
        // Last, since observe() can call the observer immediately with the current state.
        bound.cameraInfo.cameraState.observe(owner, cameraStateObserver)
    }

    // Same fps range, stabilization and lens on every use case, so CameraX's merged request has one of each.
    private fun <T> sameRequest(interop: Camera2Interop.Extender<T>): Camera2Interop.Extender<T> {
        interop
            .setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(settings.fps.lower, settings.fps.upper))
            .setCaptureRequestOption(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF)
        if (lens.physicalId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            interop.setPhysicalCameraId(lens.physicalId)
        }
        return interop
    }

    // The surface provider is set before binding and never changed. In CameraX 1.6.2, setting one on a bound
    // Preview rebuilds the camera session.
    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPreview(): Preview {
        val builder =
            Preview.Builder().setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(ResolutionStrategy(PREVIEW_SIZE, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                    .build(),
            )
        sameRequest(Camera2Interop.Extender(builder))
        return builder.build().apply { setSurfaceProvider(mainExecutor, LivePreview::provide) }
    }

    // Logged in release builds too, so a first run on a new phone shows the camera path.
    // Camera settings only, never a health value.
    private fun logBound() {
        val manual = if (lens.manualExposure != null) "on" else "off"
        val aeLock = if (lens.exposureLock) "available" else "not available"
        val clock = if (lens.realtimeTimestamps) "realtime" else "unknown"
        Log.i(
            TAG,
            "Camera bound: lens ${lens.id} (${lens.kind}), cameraId ${lens.cameraId}, physicalId ${lens.physicalId ?: "none"}, " +
                "fps range ${settings.fps.lower}-${settings.fps.upper}, manual exposure $manual, AE lock $aeLock, " +
                "hardware level ${hardwareLevelName(lens.hardwareLevel)}, timestamps $clock, " +
                "preview stream ${preview?.resolutionInfo?.resolution ?: "not bound"}",
        )
    }

    // Main thread. Sends the last batch before returning so no frame is lost.
    // A second call returns the same summary.
    fun stop(): SessionSummary {
        summary?.let { return it }
        stopped = true
        running = false
        mainHandler.removeCallbacks(startTimeout)
        // A late firstFrameArrived is harmless; finishStart() below clears startDone.
        mainHandler.removeCallbacks(firstFrameArrived)
        camera?.cameraInfo?.cameraState?.removeObserver(cameraStateObserver)
        analysis?.clearAnalyzer()
        provider?.unbind(*listOfNotNull(analysis, preview).toTypedArray())
        sensorManager?.unregisterListener(motionListener)
        events.removeCallbacksAndMessages(null)
        analyzerThread.shutdown()
        // analyze() takes a few ms, so this bound is generous.
        analyzerThread.awaitTermination(ANALYZER_DRAIN_MS, TimeUnit.MILLISECONDS)
        // Let an in-flight batch go out first so batches stay in time order.
        eventThread.quitSafely()
        eventThread.join(EVENT_DRAIN_MS)
        emitBatchNow()
        // Interrupts a waiting lockExposure() so its promise rejects.
        exposureThread.shutdownNow()
        val finished = SessionSummary(startedNs, frameClockNs(), lens.id, counters.frames, counters.dropped)
        summary = finished
        finishStart(IllegalStateException("capture stopped before the camera started"))
        return finished
    }

    // Runs on the exposure thread so stop() never waits on it.
    fun lockExposure(done: (Throwable?) -> Unit) {
        if (!locking.compareAndSet(false, true)) return done(IllegalStateException("lockExposure is already running"))
        exposureThread.execute {
            val failure = runCatching { lockOnExposureThread() }.exceptionOrNull()
            locking.set(false)
            done(failure)
        }
    }

    // Frame timestamps use the sensor's clock (SENSOR_INFO_TIMESTAMP_SOURCE), so the summary does too.
    private fun frameClockNs(): Long = if (lens.realtimeTimestamps) SystemClock.elapsedRealtimeNanos() else System.nanoTime()

    // A throw here would escape CameraX's executor and crash the app.
    // A failed frame is logged and skipped, and counts as dropped.
    private fun analyze(image: ImageProxy) {
        val entryNs = System.nanoTime()
        // Sensor timestamps share elapsedRealtimeNanos() only with a realtime timestamp source.
        if (lens.realtimeTimestamps) queueTiming.add(SystemClock.elapsedRealtimeNanos() - image.imageInfo.timestamp)
        try {
            reduceAndCount(image)
        } catch (e: RuntimeException) {
            val failures = analysisFailures.incrementAndGet()
            if (failures == 1 || failures % FAILURE_LOG_EVERY == 0) Log.e(TAG, "Frame reduction failed ($failures so far)", e)
        } finally {
            analyzeTiming.add(System.nanoTime() - entryNs)
        }
    }

    private fun reduceAndCount(image: ImageProxy) {
        image.use {
            val workStart = System.nanoTime()
            val plane = it.planes[0]
            if (firstFrameRealtimeNs == null) {
                firstFrameRealtimeNs = SystemClock.elapsedRealtimeNanos()
                Log.i(TAG, "First frame: ${it.width}x${it.height}, rowStride ${plane.rowStride}, pixelStride ${plane.pixelStride}")
                mainHandler.post(firstFrameArrived)
            }
            val numbers = reduceRgbaFrame(plane.buffer, it.width, it.height, plane.rowStride, plane.pixelStride)
            val workNs = System.nanoTime() - workStart
            val tNs = it.imageInfo.timestamp
            frameWidth = it.width
            frameHeight = it.height
            val overexposed =
                counters.addFrame(
                    CapturedFrame(tNs, numbers, exposureLog.exposureAt(tNs)),
                    SystemClock.elapsedRealtimeNanos(),
                    workNs,
                )
            if (overexposed) onExposureThread(::relieveOverexposure)
        }
    }

    private fun onExposureThread(task: () -> Unit) {
        try {
            exposureThread.execute(task)
        } catch (e: RejectedExecutionException) {
            // stop() already shut the exposure thread.
            Log.i(TAG, "Exposure task skipped after stop", e)
        }
    }

    // Main thread, when the camera is OPEN again after an interruption.
    private fun restoreAfterReopen() {
        // Stale results would let the torch and lock checks below pass early.
        latest = null
        setTorch(requestedTorch) { failure ->
            when {
                failure == null -> Unit
                isSupersededTorchRequest(failure) ->
                    Log.i(TAG, "Torch restore superseded (${failure.message}); the newer request or the next reopen sets it")
                else -> Log.e(TAG, "Restoring the torch failed", failure)
            }
        }
        onExposureThread(::restoreExposureAfterReopen)
    }

    // Exposure thread. A manual exposure is re-sent as is. An AE lock first waits for the torch and the
    // settle, since AE restarts with the camera and an immediate lock would hold a dark exposure.
    private fun restoreExposureAfterReopen() {
        val held = added.copy(aeLock = aeLockWanted)
        if (held == RequestState()) return
        try {
            if (!held.aeLock) {
                applyRequest(held)
                return
            }
            applyRequest(held.copy(aeLock = false))
            awaitTorchOn()
            freshRed(lockWaitMs(counters.lockIntervalNs()))
            applyRequest(held)
            Log.i(TAG, "Exposure relocked after reopen: ${confirmAeLock()}")
            logExposureAfterLock()
        } catch (e: InterruptedException) {
            // Interrupted by stop().
            Thread.currentThread().interrupt()
            Log.i(TAG, "Exposure lock restore cut short by stop", e)
        } catch (e: RuntimeException) {
            // Not rethrown; it would escape the exposure thread and crash the app.
            Log.e(TAG, "Restoring the exposure lock failed; exposure is ${if (added.aeLock) "locked" else "unlocked"}", e)
        }
    }

    // Waits at most the lock wait; a failed torch restore logs its own error.
    private fun awaitTorchOn() {
        if (requestedTorch <= 0) return
        val deadline = SystemClock.elapsedRealtime() + lockWaitMs(counters.lockIntervalNs())
        while (latest?.torchOn != true && SystemClock.elapsedRealtime() < deadline) Thread.sleep(FRESH_FRAME_POLL_MS)
    }

    // Steer until the red mean is inside exposureTarget, then hold exposure, white balance and focus.
    private fun lockOnExposureThread() {
        check(running) { "lockExposure needs a running capture" }
        // AE gets at least 1 s to settle, longer on a slow camera.
        val firstWaitMs =
            settleWaitMs(lockWaitMs(counters.lockIntervalNs()), firstFrameRealtimeNs, SystemClock.elapsedRealtimeNanos())
        // Every path reads fresh frames after the settle, so a stalled camera rejects instead of locking.
        val exposure =
            when (lens.exposureHold) {
                ExposureHold.MANUAL -> {
                    steerExposure(checkNotNull(lens.manualExposure), firstWaitMs)
                    "manual (AE off)"
                }
                ExposureHold.AE_LOCK -> {
                    steerAeCompensation(firstWaitMs)
                    aeLockWanted = true
                    applyRequest(added.copy(aeLock = true))
                    confirmAeLock()
                }
                ExposureHold.NONE -> {
                    freshRed(firstWaitMs)
                    Log.w(
                        TAG,
                        "Exposure cannot be locked on this lens: no MANUAL_SENSOR and CONTROL_AE_LOCK_AVAILABLE is " +
                            "not true, so auto-exposure keeps adjusting during the reading",
                    )
                    "not available"
                }
            }
        // Hold the distance autofocus reached, else the lens minimum (the finger touches the lens).
        val focusDistance =
            if (lens.focusLock && !lens.fixedFocus) latest?.focusDistance ?: lens.minimumFocusDistance else null
        applyRequest(added.copy(awbLock = lens.whiteBalanceLock, focusDistance = focusDistance))
        Log.i(
            TAG,
            "Locks applied: exposure $exposure, white balance ${lens.whiteBalanceLock}, focus distance ${focusDistance ?: "not set"}",
        )
        counters.armOverexposureWatch()
        // Queued so the promise resolves first and this never delays the reading.
        onExposureThread(::logExposureAfterLock)
    }

    // Core discards a second of signal on every exposure change, so log the first exposures after the lock.
    // A held lock repeats one value.
    private fun logExposureAfterLock() {
        val values = mutableListOf<Long>()
        val deadline = SystemClock.elapsedRealtime() + lockWaitMs(counters.lockIntervalNs())
        var seenFrames = counters.frames
        try {
            while (values.size < POST_LOCK_FRAMES && SystemClock.elapsedRealtime() < deadline) {
                val frames = counters.frames
                if (frames != seenFrames) {
                    seenFrames = frames
                    latest?.let { values.add(it.exposureNs) }
                }
                Thread.sleep(FRESH_FRAME_POLL_MS)
            }
        } catch (e: InterruptedException) {
            // Interrupted by stop().
            Thread.currentThread().interrupt()
            Log.i(TAG, "Post-lock exposure check cut short by stop", e)
            return
        }
        val verdict =
            when {
                values.isEmpty() -> "no capture results"
                values.distinct().size == 1 -> "steady"
                else -> "changing"
            }
        Log.i(TAG, "Exposure after lock, ${values.size} frames: ${values.joinToString()} ns ($verdict)")
    }

    // The settings future only means CameraX sent the request; capture results show whether the lock holds.
    // An unconfirmed lock is logged, not rejected, since white balance and focus still lock.
    private fun confirmAeLock(): String {
        val waitMs = lockWaitMs(counters.lockIntervalNs())
        val deadline = SystemClock.elapsedRealtime() + waitMs
        while (SystemClock.elapsedRealtime() < deadline) {
            val snapshot = latest
            if (snapshot?.aeLockOn == true && snapshot.aeState == CaptureResult.CONTROL_AE_STATE_LOCKED) {
                return "locked (AE lock confirmed by capture result, AE state LOCKED)"
            }
            Thread.sleep(FRESH_FRAME_POLL_MS)
        }
        val snapshot = latest
        val seen = "AE lock ${if (snapshot?.aeLockOn == true) "on" else "off"}, AE state ${aeStateName(snapshot?.aeState)}"
        Log.w(TAG, "Exposure lock sent, but after $waitMs ms the capture result reports $seen")
        return "lock sent, not confirmed ($seen)"
    }

    private fun steerExposure(manual: ManualExposureRange, firstWaitMs: Long) {
        var steps = 0
        var red = freshRed(firstWaitMs)
        while (red !in settings.exposureTarget && steps < MAX_EXPOSURE_STEPS) {
            scaleExposure(manual, exposureFactor(red, settings.exposureTarget))
            steps++
            red = freshRed(EXPOSURE_LATENCY_MS)
        }
        // Already on target, so hold the current exposure as a manual one.
        if (added.manual == null) scaleExposure(manual, 1.0)
        Log.i(TAG, "Exposure held after $steps steps: red $red, ${added.manual}")
    }

    // For lenses with only an AE lock. AE meters overall brightness, which a finger makes mostly dark green,
    // so it runs long and clips red. Compensation moves AE's target until red is in range.
    private fun steerAeCompensation(firstWaitMs: Long) {
        val red = freshRed(firstWaitMs)
        val compensation = lens.aeCompensation
        if (compensation == null) {
            Log.i(TAG, "Exposure not compensated: the lens has no AE compensation range; red ${redText(red)}")
            return
        }
        val path = steerAndApply(CompensationStep(added.aeCompensation, red), compensation)
        Log.i(TAG, "Exposure compensated after ${path.size - 1} steps: ${compensationText(path, compensation)}")
    }

    // Exposure thread, AE unlocked. Each step is judged on the settled red mean.
    private fun steerAndApply(start: CompensationStep, compensation: AeCompensation): List<CompensationStep> =
        steerCompensation(start, settings.exposureTarget, compensation, MAX_EXPOSURE_STEPS) { index ->
            applyRequest(added.copy(aeCompensation = index))
            convergedRed(index)
        }

    // Final red and EV, then every step.
    private fun compensationText(path: List<CompensationStep>, compensation: AeCompensation): String {
        val last = path.last()
        val steps = path.joinToString(" -> ") { "${evText(it.index * compensation.stepEv)} EV: ${redText(it.red)}" }
        return "red ${redText(last.red)}, EV ${evText(last.index * compensation.stepEv)} (index ${last.index}, " +
            "result index ${latest?.aeCompensation ?: "not reported"}, range ${compensation.minIndex}..${compensation.maxIndex}), " +
            "exposureNs ${latest?.exposureNs}; steps $steps"
    }

    // AE takes several frames to follow a new compensation. Wait for the new index in the results, then the
    // latency, then CONVERGED or FLASH_REQUIRED (settled but short of light). Each wait is bounded.
    private fun convergedRed(index: Int): Double {
        val waitMs = lockWaitMs(counters.lockIntervalNs())
        var deadline = SystemClock.elapsedRealtime() + waitMs
        while (latest?.aeCompensation != index && SystemClock.elapsedRealtime() < deadline) Thread.sleep(FRESH_FRAME_POLL_MS)
        Thread.sleep(EXPOSURE_LATENCY_MS)
        deadline = SystemClock.elapsedRealtime() + waitMs
        while (SystemClock.elapsedRealtime() < deadline) {
            val state = latest?.aeState
            if (state == CaptureResult.CONTROL_AE_STATE_CONVERGED || state == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED) break
            Thread.sleep(FRESH_FRAME_POLL_MS)
        }
        return freshRed(0)
    }

    // Red stayed above 0.95 after the lock, so lower the exposure and hold it.
    // Core sees the exposureNs change and marks the span as artifact.
    private fun relieveOverexposure() {
        if (!running) return
        val manual = lens.manualExposure
        when {
            manual != null ->
                runCatching { scaleExposure(manual, exposureFactor(counters.lastRed ?: 1.0, settings.exposureTarget)) }
                    .onFailure { Log.e(TAG, "Lowering the exposure failed", it) }
            added.aeLock -> relieveUnderAeLock()
        }
    }

    // Unlock, settle, steer back into exposureTarget, relock. Red is re-measured after the unlock because
    // steering from the stale clipped value overshot on a Galaxy A17.
    private fun relieveUnderAeLock() {
        val compensation = lens.aeCompensation
        if (compensation == null) {
            Log.w(TAG, "Red stays clipped under the AE lock; the lens has no AE compensation")
            return
        }
        try {
            applyRequest(added.copy(aeLock = false))
            val path = steerAndApply(CompensationStep(added.aeCompensation, convergedRed(added.aeCompensation)), compensation)
            applyRequest(added.copy(aeLock = true))
            Log.i(
                TAG,
                "Overexposure relieved under AE lock after ${path.size - 1} steps: ${compensationText(path, compensation)}; " +
                    confirmAeLock(),
            )
        } catch (e: InterruptedException) {
            // Interrupted by stop().
            Thread.currentThread().interrupt()
            Log.i(TAG, "Overexposure relief cut short by stop", e)
        } catch (e: RuntimeException) {
            // Not rethrown, it would crash the app. The unlock has usually gone through, so try one relock.
            Log.e(TAG, "Lowering the exposure under AE lock failed; exposure is ${if (added.aeLock) "locked" else "unlocked"}", e)
            relockAfterFailedRelief()
        }
    }

    // Best effort, once. On a second failure AE stays free until a reopen relocks.
    private fun relockAfterFailedRelief() {
        if (added.aeLock) return
        try {
            applyRequest(added.copy(aeLock = true))
            Log.i(TAG, "Exposure relocked after the failed relief: ${confirmAeLock()}")
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            Log.i(TAG, "Relock after the failed relief cut short by stop", e)
        } catch (e: RuntimeException) {
            Log.e(TAG, "Relocking after the failed relief failed; exposure stays unlocked", e)
        }
    }

    private fun scaleExposure(manual: ManualExposureRange, factor: Double) {
        val current =
            added.manual
                ?: latest?.let { ExposureSetting(it.exposureNs.toDouble(), it.iso.toDouble()) }
                ?: throw IllegalStateException("No capture result has reported the exposure yet")
        val limits =
            ExposureLimits(
                minDurationNs = manual.minDurationNs.toDouble(),
                maxDurationNs = minOf(manual.maxDurationNs, frameIntervalNs).toDouble(),
                minIso = manual.minIso.toDouble(),
                maxIso = manual.maxIso.toDouble(),
            )
        applyRequest(added.copy(manual = planExposure(current, factor, limits)))
    }

    // The red mean of a frame taken after the latest exposure change.
    private fun freshRed(waitMs: Long): Double {
        val before = counters.frames
        Thread.sleep(waitMs)
        val deadline = SystemClock.elapsedRealtime() + lockWaitMs(counters.lockIntervalNs())
        while (SystemClock.elapsedRealtime() < deadline) {
            val red = counters.lastRed
            if (counters.frames - before >= FRESH_FRAMES && red != null) return red
            Thread.sleep(FRESH_FRAME_POLL_MS)
        }
        throw IllegalStateException("No camera frames arrived while setting exposure")
    }

    private fun applyRequest(next: RequestState) {
        val control = camera?.cameraControl ?: throw IllegalStateException("camera is not running")
        val options = CaptureRequestOptions.Builder()
        next.manual?.let { manual ->
            // AE off holds this exposure; the frame duration keeps the rate. FLASH_MODE still applies with
            // AE off, so the torch stays on (CaptureRequest.FLASH_MODE docs).
            options
                .setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF)
                .setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, manual.durationNs.roundToLong())
                .setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, manual.iso.roundToInt())
                .setCaptureRequestOption(CaptureRequest.SENSOR_FRAME_DURATION, frameIntervalNs)
        }
        if (next.aeCompensation != 0) {
            options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, next.aeCompensation)
        }
        if (next.aeLock) options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_LOCK, true)
        if (next.awbLock) options.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_LOCK, true)
        next.focusDistance?.let {
            options
                .setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
                .setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, it)
        }
        val waitMs = lockWaitMs(counters.lockIntervalNs())
        try {
            Camera2CameraControl.from(control).setCaptureRequestOptions(options.build()).get(waitMs, TimeUnit.MILLISECONDS)
        } catch (e: ExecutionException) {
            throw IllegalStateException("The camera rejected the exposure settings", e.cause ?: e)
        } catch (e: TimeoutException) {
            throw IllegalStateException("The camera did not apply the exposure settings within $waitMs ms", e)
        }
        added = next
    }

    private val resultListener =
        object : CameraCaptureSession.CaptureCallback() {
            override fun onCaptureCompleted(
                session: CameraCaptureSession,
                request: CaptureRequest,
                captureResult: TotalCaptureResult,
            ) {
                captureResults.incrementAndGet()
                val exposureNs = captureResult.get(CaptureResult.SENSOR_EXPOSURE_TIME) ?: 0L
                captureResult.get(CaptureResult.SENSOR_TIMESTAMP)?.let { exposureLog.record(it, exposureNs) }
                val afState = captureResult.get(CaptureResult.CONTROL_AF_STATE)
                latest =
                    ResultSnapshot(
                        iso = captureResult.get(CaptureResult.SENSOR_SENSITIVITY) ?: 0,
                        exposureNs = exposureNs,
                        torchOn = captureResult.get(CaptureResult.FLASH_MODE) == CaptureResult.FLASH_MODE_TORCH,
                        // A manual exposure (AE off) is held as firmly as an AE lock.
                        aeLocked =
                            captureResult.get(CaptureResult.CONTROL_AE_MODE) == CaptureResult.CONTROL_AE_MODE_OFF ||
                                captureResult.get(CaptureResult.CONTROL_AE_STATE) == CaptureResult.CONTROL_AE_STATE_LOCKED,
                        aeLockOn = captureResult.get(CaptureResult.CONTROL_AE_LOCK) == true,
                        aeState = captureResult.get(CaptureResult.CONTROL_AE_STATE),
                        awbLocked = captureResult.get(CaptureResult.CONTROL_AWB_STATE) == CaptureResult.CONTROL_AWB_STATE_LOCKED,
                        afLocked =
                            lens.fixedFocus ||
                                captureResult.get(CaptureResult.CONTROL_AF_MODE) == CaptureResult.CONTROL_AF_MODE_OFF ||
                                afState == CaptureResult.CONTROL_AF_STATE_FOCUSED_LOCKED ||
                                afState == CaptureResult.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED,
                        focusDistance = captureResult.get(CaptureResult.LENS_FOCUS_DISTANCE),
                        aeCompensation = captureResult.get(CaptureResult.CONTROL_AE_EXPOSURE_COMPENSATION),
                        frameDurationNs = captureResult.get(CaptureResult.SENSOR_FRAME_DURATION),
                        aeFpsRange = captureResult.get(CaptureResult.CONTROL_AE_TARGET_FPS_RANGE),
                    )
            }
        }

    // Sensor values are stamped on arrival with the same clock the status timer reads.
    private val motionListener =
        object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                motion.add(SystemClock.elapsedRealtimeNanos(), event.values[0], event.values[1], event.values[2])
            }

            override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
        }

    private fun emitBatch() {
        emitBatchNow()
        events.postDelayed(::emitBatch, BATCH_MS)
    }

    private fun emitBatchNow() {
        val batch = counters.drainBatch()
        if (batch.isEmpty()) return
        emit(
            "samples",
            mapOf(
                "samples" to batch.map { mapOf("tNs" to it.tNs.toDouble(), "r" to it.numbers.r, "g" to it.numbers.g, "b" to it.numbers.b) },
                "stats" to
                    batch.map {
                        mapOf(
                            "tNs" to it.tNs.toDouble(),
                            "spatialStdR" to it.numbers.spatialStdR,
                            "clipFrac" to it.numbers.clipFrac,
                            "exposureNs" to it.exposureNs.toDouble(),
                        )
                    },
            ),
        )
    }

    private fun emitStatus() {
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val numbers = counters.status(nowNs)
        val thermal =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && powerManager != null) {
                thermalName(powerManager.currentThermalStatus)
            } else {
                "nominal"
            }
        emit(
            "status",
            mapOf(
                "fingerCovered" to numbers.fingerCovered,
                "motionRms" to motion.rmsG(nowNs),
                "thermal" to thermal,
                "fps" to numbers.fps,
                "droppedFrac" to numbers.droppedFrac,
            ),
        )
        events.postDelayed(::emitStatus, STATUS_MS)
    }

    // Logged once a second in release builds to show why the finger hint is on or off.
    // Frame averages only, never a health value.
    private fun logContactInputs() {
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val results = captureResults.get()
        val resultsPerS = if (loggedResultsNs == 0L) 0.0 else (results - loggedResults) * 1e9 / (nowNs - loggedResultsNs)
        loggedResults = results
        loggedResultsNs = nowNs
        val analyzeMs = analyzeTiming.take()
        val queueMs = queueTiming.take()
        counters.lastFrame?.let { frame ->
            val numbers = frame.numbers
            val sumGb = numbers.g + numbers.b
            val ratio = if (sumGb > 0) "%.2f".format(Locale.ROOT, numbers.r / sumGb) else "inf"
            Log.i(
                TAG,
                "Contact inputs: R/(G+B) $ratio, mean R ${"%.3f".format(Locale.ROOT, numbers.r)}, " +
                    "spatialStdR ${"%.3f".format(Locale.ROOT, numbers.spatialStdR)}, " +
                    "clipFrac ${"%.3f".format(Locale.ROOT, numbers.clipFrac)}, covered ${fingerCovered(numbers)}, " +
                    "exposureNs ${frame.exposureNs}, fps ${counters.recentFps(nowNs).roundToInt()}, " +
                    "results/s ${resultsPerS.roundToInt()}, frameDurationNs ${latest?.frameDurationNs ?: "not reported"}, " +
                    "AE fps range ${latest?.aeFpsRange ?: "not reported"}, " +
                    "median interval ms ${msText(counters.lockIntervalNs() / 1e6)}, dropped ${counters.dropped}, " +
                    "analyze ms ${msText(analyzeMs.mean)}/${msText(analyzeMs.max)}, " +
                    "queue ms ${if (lens.realtimeTimestamps) "${msText(queueMs.mean)}/${msText(queueMs.max)}" else "n/a"}",
            )
        }
        events.postDelayed(::logContactInputs, CONTACT_LOG_MS)
    }

    private fun emitLab() {
        val work = counters.takeFrameWork()
        val snapshot = latest
        emit(
            "lab",
            mapOf(
                "lensId" to lens.id,
                "formatWidth" to frameWidth,
                "formatHeight" to frameHeight,
                "targetFps" to settings.fps.upper,
                "frameWorkMsMean" to work.mean,
                "frameWorkMsMax" to work.max,
                "iso" to (snapshot?.iso ?: 0),
                "exposureNs" to (snapshot?.exposureNs ?: 0L).toDouble(),
                "torchOn" to (snapshot?.torchOn ?: false),
                "torchLevel" to torchLevel,
                "locked" to
                    mapOf(
                        "exposure" to (snapshot?.aeLocked ?: false),
                        "whiteBalance" to (snapshot?.awbLocked ?: false),
                        "focus" to (snapshot?.afLocked ?: false),
                    ),
            ),
        )
        events.postDelayed(::emitLab, LAB_MS)
    }

    fun setTorch(level: Double, done: (Throwable?) -> Unit) {
        requestedTorch = level
        val active = camera ?: return done(IllegalStateException("camera is not running"))
        val control = active.cameraControl
        val cameraInfo = active.cameraInfo
        if (!cameraInfo.hasFlashUnit()) {
            Log.i(TAG, "Torch: the camera reports no flash unit")
            return done(if (level > 0) UnsupportedOperationException("this lens has no torch") else null)
        }
        control.enableTorch(level > 0).whenDone { failure ->
            Log.i(TAG, "Torch ${if (level > 0) "on" else "off"}: ${torchOutcomeText(failure)}")
            if (failure != null || level <= 0 || !cameraInfo.isTorchStrengthSupported) {
                if (failure == null) torchLevel = if (level > 0) 1.0 else 0.0
                return@whenDone done(failure)
            }
            val maxLevel = cameraInfo.maxTorchStrengthLevel
            val strength = (level * maxLevel).roundToInt().coerceIn(1, maxLevel)
            control.setTorchStrengthLevel(strength).whenDone { strengthFailure ->
                Log.i(TAG, "Torch strength $strength of $maxLevel: ${torchOutcomeText(strengthFailure)}")
                if (strengthFailure == null) torchLevel = strength.toDouble() / maxLevel
                done(strengthFailure)
            }
        }
    }

    private fun <T> ListenableFuture<T>.whenDone(block: (Throwable?) -> Unit) {
        addListener({
            val failure =
                try {
                    get()
                    null
                } catch (e: ExecutionException) {
                    e.cause ?: e
                } catch (e: CancellationException) {
                    e
                }
            block(failure)
        }, mainExecutor)
    }
}

private fun redText(red: Double): String = "%.3f".format(Locale.ROOT, red)

private fun evText(ev: Double): String = "%.2f".format(Locale.ROOT, ev)

private fun msText(ms: Double): String = "%.1f".format(Locale.ROOT, ms)

// For the lock log line.
private fun aeStateName(state: Int?): String =
    when (state) {
        null -> "not reported"
        CaptureResult.CONTROL_AE_STATE_INACTIVE -> "INACTIVE"
        CaptureResult.CONTROL_AE_STATE_SEARCHING -> "SEARCHING"
        CaptureResult.CONTROL_AE_STATE_CONVERGED -> "CONVERGED"
        CaptureResult.CONTROL_AE_STATE_LOCKED -> "LOCKED"
        CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED -> "FLASH_REQUIRED"
        CaptureResult.CONTROL_AE_STATE_PRECAPTURE -> "PRECAPTURE"
        else -> "state $state"
    }

// CameraState.ERROR_* codes (CameraX 1.6.2) in words for the JS error.
private fun cameraErrorText(code: Int): String =
    when (code) {
        CameraState.ERROR_MAX_CAMERAS_IN_USE -> "too many cameras are open (ERROR_MAX_CAMERAS_IN_USE)"
        CameraState.ERROR_CAMERA_IN_USE -> "another app is using the camera (ERROR_CAMERA_IN_USE)"
        CameraState.ERROR_OTHER_RECOVERABLE_ERROR -> "the camera closed unexpectedly (ERROR_OTHER_RECOVERABLE_ERROR)"
        CameraState.ERROR_STREAM_CONFIG -> "the camera rejected the stream setup (ERROR_STREAM_CONFIG)"
        CameraState.ERROR_CAMERA_DISABLED -> "the camera is disabled by a device policy (ERROR_CAMERA_DISABLED)"
        CameraState.ERROR_CAMERA_FATAL_ERROR -> "the camera hit a fatal error; restarting the phone may help (ERROR_CAMERA_FATAL_ERROR)"
        CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED ->
            "the camera cannot open while Do Not Disturb is on (ERROR_DO_NOT_DISTURB_MODE_ENABLED)"
        CameraState.ERROR_CAMERA_REMOVED -> "the camera was disconnected (ERROR_CAMERA_REMOVED)"
        else -> "camera error code $code"
    }
