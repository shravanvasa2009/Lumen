package expo.modules.lumencapture

import android.graphics.SurfaceTexture
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.annotation.RequiresApi
import androidx.camera.core.SurfaceRequest
import java.util.concurrent.Executor

private const val TAG = "LumenCapture"

// Owned here, not by a view, so the preview surface lives from bind() to stop() and views can come and go.
internal class PreviewStream(val texture: SurfaceTexture, val size: Size) {
    var transform: SurfaceRequest.TransformationInfo? = null

    // True while a TextureView holds the texture; that view then releases it.
    var shown = false
    var ended = false
}

// Connects the Preview use case to the one live view on screen. Main thread only.
// In CameraX 1.6.2, setting a surface provider on a bound Preview rebuilds the camera graph, which turns the
// torch off and restarts AE. So one provider is set before binding and always answers with this texture.
// An undrawn texture does not stall the camera; a GPU-texture consumer runs async, so frames are replaced.
internal object LivePreview {
    private var stream: PreviewStream? = null
    private var view: LumenPreviewView? = null
    private val mainExecutor = Executor { Handler(Looper.getMainLooper()).post(it) }

    @RequiresApi(Build.VERSION_CODES.O)
    fun provide(request: SurfaceRequest) {
        val size = request.resolution
        // Detached mode (API 26); the TextureView attaches it to its own GL context.
        val texture = SurfaceTexture(false).apply { setDefaultBufferSize(size.width, size.height) }
        val surface = Surface(texture)
        val next = PreviewStream(texture, size)
        stream = next
        request.setTransformationInfoListener(mainExecutor) { transform ->
            next.transform = transform
            if (stream === next) view?.fit()
        }
        request.provideSurface(surface, mainExecutor) { outcome ->
            surface.release()
            next.ended = true
            if (!next.shown) texture.release()
            if (stream === next) stream = null
            Log.i(TAG, "Live view preview stream ${sizeText(next)} ended: ${surfaceResultText(outcome.resultCode)}")
        }
        Log.i(TAG, "Live view preview stream ${sizeText(next)} ready, ${if (view == null) "no view attached" else "shown"}")
        view?.show(next)
    }

    fun attach(attached: LumenPreviewView) {
        // One view at a time; the newest wins, such as a screen pushed over another.
        view?.takeIf { it !== attached }?.yieldTexture()
        view = attached
        Log.i(TAG, "Live view attached, preview resolution ${sizeText(stream)}")
        stream?.let { attached.show(it) }
    }

    fun detach(detached: LumenPreviewView) {
        if (view !== detached) return
        view = null
        Log.i(TAG, "Live view detached, preview resolution ${sizeText(stream)}")
    }

    // For onSurfaceTextureDestroyed: keep the live stream's texture for the next view, release anything else.
    fun releaseOnDetach(texture: SurfaceTexture): Boolean {
        val live = stream?.takeIf { it.texture === texture && !it.ended } ?: return true
        live.shown = false
        return false
    }
}

private fun sizeText(stream: PreviewStream?): String = stream?.let { "${it.size.width}x${it.size.height}" } ?: "none (no preview stream)"

private fun surfaceResultText(code: Int): String =
    when (code) {
        SurfaceRequest.Result.RESULT_SURFACE_USED_SUCCESSFULLY -> "used"
        SurfaceRequest.Result.RESULT_REQUEST_CANCELLED -> "request cancelled"
        SurfaceRequest.Result.RESULT_INVALID_SURFACE -> "invalid surface"
        SurfaceRequest.Result.RESULT_SURFACE_ALREADY_PROVIDED -> "already provided"
        SurfaceRequest.Result.RESULT_WILL_NOT_PROVIDE_SURFACE -> "not provided"
        else -> "result $code"
    }
