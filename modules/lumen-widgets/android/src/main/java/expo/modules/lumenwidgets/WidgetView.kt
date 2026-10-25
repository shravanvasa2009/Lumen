package expo.modules.lumenwidgets

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private const val HOUR_MS = 3_600_000L

// ARGB per color role, sent by JS so the design tokens stay in one place.
data class Palette(
    val surface: Long,
    val text: Long,
    val textDim: Long,
    val accent: Long,
    val ringTrack: Long,
    val buttonFill: Long,
    val onButtonFill: Long,
    val tonalFill: Long,
    val onTonalFill: Long,
    val flag: Long,
    val criticalText: Long,
)

// Every string comes from the JS display payload; null parts are left out.
data class WidgetView(
    val name: String,
    // "regular", "check-again", "see-doctor" or "inconclusive"; null before the first reading.
    val statusKey: String?,
    val status: String?,
    val lastCheck: String?,
    val bpm: String?,
    val bpmUnit: String,
    val checkNow: String,
    val fullScan: String,
    val emptyTitle: String,
    val emptyBody: String,
    val theme: String,
    val light: Palette,
    val dark: Palette,
) {
    internal val colors = WidgetColors(theme, light, dark)
}

// UTC to the second. SimpleDateFormat because minSdk is 24 and java.time needs 26 without desugaring.
internal fun parseUtcSeconds(text: String): Long {
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.parse(text)?.time ?: throw IllegalArgumentException("Not a UTC time: $text")
}

// "#RRGGBB" only, since the widget colors are opaque.
internal fun parseColor(hex: String): Long {
    require(Regex("^#[0-9A-Fa-f]{6}$").matches(hex)) { "Not a #RRGGBB color: $hex" }
    return 0xFF000000L or hex.substring(1).toLong(16)
}

internal fun paletteOf(json: JSONObject) =
    Palette(
        surface = parseColor(json.getString("surface")),
        text = parseColor(json.getString("text")),
        textDim = parseColor(json.getString("textDim")),
        accent = parseColor(json.getString("accent")),
        ringTrack = parseColor(json.getString("ringTrack")),
        buttonFill = parseColor(json.getString("buttonFill")),
        onButtonFill = parseColor(json.getString("onButtonFill")),
        tonalFill = parseColor(json.getString("tonalFill")),
        onTonalFill = parseColor(json.getString("onTonalFill")),
        flag = parseColor(json.getString("flag")),
        criticalText = parseColor(json.getString("criticalText")),
    )

// optString turns a JSON null into "null", so check nulls first.
internal fun JSONObject.stringOrNull(key: String): String? = if (isNull(key)) null else getString(key)

internal fun snapshotOf(snapshotJson: String): JSONObject {
    val snapshot = JSONObject(snapshotJson)
    val version = snapshot.getInt("v")
    require(version == 1) { "Unknown widget snapshot version: $version" }
    return snapshot
}

// Whole hours, never negative if the clock is set back.
internal fun hoursSince(lastReadingAt: String, nowMs: Long): Long = maxOf(0L, (nowMs - parseUtcSeconds(lastReadingAt)) / HOUR_MS)

// Throws on a malformed payload so it is never stored.
fun widgetView(snapshotJson: String, displayJson: String, nowMs: Long): WidgetView {
    val snapshot = snapshotOf(snapshotJson)
    val display = JSONObject(displayJson)
    val empty = display.getJSONObject("empty")
    val status = snapshot.stringOrNull("status")
    val lastReadingAt = snapshot.stringOrNull("lastReadingAt")
    // hideValues is checked too so a stale snapshot never shows a hidden number.
    val hrBpm = if (snapshot.isNull("hrBpm") || snapshot.getBoolean("hideValues")) null else snapshot.getInt("hrBpm")
    val palettes = display.getJSONObject("palette")
    return WidgetView(
        name = display.getString("name"),
        statusKey = status,
        status = status?.let { display.getJSONObject("status").getString(it) },
        lastCheck =
            lastReadingAt?.let { display.getString("lastCheck").replace("{{hours}}", hoursSince(it, nowMs).toString()) },
        bpm = hrBpm?.toString(),
        bpmUnit = display.getString("bpm"),
        checkNow = display.getString("checkNow"),
        fullScan = display.getString("fullScan"),
        emptyTitle = empty.getString("title"),
        emptyBody = empty.getString("body"),
        theme = snapshot.getString("theme"),
        light = paletteOf(palettes.getJSONObject("light")),
        dark = paletteOf(palettes.getJSONObject("dark")),
    )
}
