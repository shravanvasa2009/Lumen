package expo.modules.lumenwidgets

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.res.Configuration
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlin.math.roundToInt

// Shared with the standing-step alerts so the user manages both in one place.
private const val CHANNEL_ID = "standing"
private const val NOTIFICATION_ID = 0x5747

// Progress bar resolution; JS sends progress as 0 to 1.
internal const val PROGRESS_MAX = 1000

// Mirrors StandingTimerContent in src/index.ts.
class StandingTimerContent : Record {
    @Field val channelName: String = ""

    @Field val title: String = ""

    @Field val text: String = ""

    @Field val step: String = ""

    @Field val tapHint: String = ""

    @Field val actionLabel: String = ""

    @Field val countdownMs: Double? = null

    @Field val progress: Double = 0.0

    @Field val accentLight: String = ""

    @Field val accentDark: String = ""
}

// https://developer.android.com/develop/ui/views/notifications/build-notification
internal fun standingNotification(context: Context, content: StandingTimerContent, nowMs: Long): Notification {
    val open =
        PendingIntent.getActivity(
            context,
            0,
            linkIntent(context, STANDING_LINK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    // The shade follows the phone's theme, not the app's.
    val night =
        context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val countdownMs = content.countdownMs
    val builder =
        NotificationCompat
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.lumen_notification_mark)
            .setColor(parseColor(if (night) content.accentDark else content.accentLight).toInt())
            .setContentTitle(content.title)
            .setSubText(content.step)
            .setContentText(if (countdownMs == null) content.tapHint else content.text)
            .setProgress(PROGRESS_MAX, (content.progress.coerceIn(0.0, 1.0) * PROGRESS_MAX).roundToInt(), false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            // No health details, so the lock screen may show it in full.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .addAction(0, content.actionLabel, open)
    if (countdownMs == null) {
        builder.setShowWhen(false)
    } else {
        builder
            .setWhen(nowMs + countdownMs.toLong())
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
    }
    return builder.build()
}

// Ongoing notification, not a foreground service. The system draws the chronometer, so it keeps counting.
fun postStandingTimer(context: Context, content: StandingTimerContent) {
    val manager = NotificationManagerCompat.from(context)
    // Notifications off; the in-app timer still runs.
    if (!manager.areNotificationsEnabled()) return
    if (manager.getNotificationChannelCompat(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_HIGH).setName(content.channelName).build(),
        )
    }
    manager.notify(NOTIFICATION_ID, standingNotification(context, content, System.currentTimeMillis()))
}

fun endStandingTimer(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
}
