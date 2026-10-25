package expo.modules.lumencapture

import kotlin.math.max

// Upright, centered and cropped like PreviewView's FILL_CENTER. Scale then rotate, both about the center.
internal data class LiveViewFit(val scaleX: Float, val scaleY: Float, val rotationDegrees: Int)

// TextureView first applies the SurfaceTexture's transform (the sensor orientation, with hasCameraTransform).
// The remaining turn follows CameraX 1.6.2 PreviewTransformation.getRemainingRotationDegrees.
internal fun fitLiveView(
    bufferWidth: Int,
    bufferHeight: Int,
    rotationDegrees: Int,
    targetDegrees: Int,
    hasCameraTransform: Boolean,
    viewWidth: Int,
    viewHeight: Int,
): LiveViewFit {
    // Rear camera: sensor orientation = sensor-to-target rotation + target rotation.
    val cameraTurn = if (hasCameraTransform) normalDegrees(rotationDegrees + targetDegrees) else 0
    val remaining = normalDegrees(if (hasCameraTransform) -targetDegrees else rotationDegrees)
    val (shownWidth, shownHeight) = swapIfQuarterTurn(bufferWidth, bufferHeight, cameraTurn)
    val (finalWidth, finalHeight) = swapIfQuarterTurn(shownWidth, shownHeight, remaining)
    val scale = max(viewWidth.toFloat() / finalWidth, viewHeight.toFloat() / finalHeight)
    return LiveViewFit(shownWidth * scale / viewWidth, shownHeight * scale / viewHeight, remaining)
}

private fun normalDegrees(degrees: Int): Int = ((degrees % 360) + 360) % 360

private fun swapIfQuarterTurn(width: Int, height: Int, degrees: Int): Pair<Int, Int> =
    if (degrees % 180 == 0) width to height else height to width
