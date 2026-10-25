package expo.modules.lumencapture

import androidx.camera.core.CameraControl

// OperationCanceledException means a newer value was set or the camera closed, not that the torch refused.
// Seen on a Galaxy A17 when backgrounding; the next OPEN restores the torch.
internal fun isSupersededTorchRequest(failure: Throwable?): Boolean = failure is CameraControl.OperationCanceledException

internal fun torchOutcomeText(failure: Throwable?): String =
    when {
        failure == null -> "ok"
        isSupersededTorchRequest(failure) -> "superseded, ${failure.message}"
        else -> "failed, $failure"
    }
