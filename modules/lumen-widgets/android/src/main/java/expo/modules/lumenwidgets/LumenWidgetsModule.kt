package expo.modules.lumenwidgets

import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class LumenWidgetsModule : Module() {
    private val context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() =
        ModuleDefinition {
            Name("LumenWidgets")

            // An app update resets picker previews, and nothing may publish for days, so set them at start.
            // The scope has no exception handler, so failures are caught and reported.
            OnCreate {
                val reactContext = appContext.reactContext ?: return@OnCreate
                appContext.backgroundCoroutineScope.launch {
                    try {
                        val displayJson = WidgetStore.display(reactContext) ?: return@launch
                        refreshPickerPreviews(reactContext, displayJson)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        Log.w("LumenWidgets", "Picker previews could not be re-set at start-up", error)
                    }
                }
            }

            AsyncFunction("publishSnapshot") Coroutine { snapshotJson: String, displayJson: String ->
                // Parsed here so a bad payload rejects instead of breaking the widgets later.
                widgetView(snapshotJson, displayJson, System.currentTimeMillis())
                WidgetStore.write(context, snapshotJson, displayJson)
                refreshWidgets(context)
                refreshPickerPreviews(context, displayJson)
            }

            // Called at every launch so the widgets use the app's language and palette before any reading.
            AsyncFunction("publishDisplay") Coroutine { displayJson: String ->
                widgetView(NO_READING_SNAPSHOT, displayJson, System.currentTimeMillis())
                WidgetStore.writeDisplay(context, displayJson)
                refreshWidgets(context)
                refreshPickerPreviews(context, displayJson)
            }

            // Same notification on Android; separate calls because iOS starts and updates a Live Activity.
            AsyncFunction("startStandingTimer") { content: StandingTimerContent -> postStandingTimer(context, content) }

            AsyncFunction("updateStandingTimer") { content: StandingTimerContent -> postStandingTimer(context, content) }

            AsyncFunction("endStandingTimer") { endStandingTimer(context) }
        }
}
