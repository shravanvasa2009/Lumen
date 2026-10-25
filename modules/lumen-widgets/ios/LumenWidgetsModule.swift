import ActivityKit
import ExpoModulesCore
import WidgetKit

// Mirrors StandingTimerContent in src/index.ts. channelName and actionLabel are for the Android notification.
struct StandingTimerRecord: Record {
  @Field var title: String = ""
  @Field var text: String = ""
  @Field var step: String = ""
  @Field var tapHint: String = ""
  @Field var countdownMs: Double?

  func state(at now: Date) -> StandingActivityAttributes.ContentState {
    StandingActivityAttributes.ContentState(
      title: title,
      text: text,
      step: step,
      tapHint: tapHint,
      // A late update can see a reading that has just opened; a range never runs backwards.
      countdown: countdownMs.map { now...now.addingTimeInterval(max(0, $0) / 1000) }
    )
  }
}

private typealias StandingActivity = Activity<StandingActivityAttributes>

// Local only, no push. The app stays open for the whole test, which ActivityKit needs to start one.
// https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
private enum StandingTimer {
  static func start(_ state: StandingActivityAttributes.ContentState) async throws {
    // End any timer left from a test the app was closed during.
    await end()
    // Live Activities turned off; the in-app timer still runs.
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    _ = try StandingActivity.request(
      attributes: StandingActivityAttributes(),
      content: ActivityContent(state: state, staleDate: nil),
      pushType: nil
    )
  }

  // An update brings the timer back if it is not showing, as on Android.
  static func update(_ state: StandingActivityAttributes.ContentState) async throws {
    let running = StandingActivity.activities
    if running.isEmpty {
      try await start(state)
      return
    }
    for activity in running {
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
  }

  static func end() async {
    for activity in StandingActivity.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

// Same five calls as the Android module.
public final class LumenWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LumenWidgets")

    AsyncFunction("publishSnapshot") { (snapshotJson: String, displayJson: String) in
      // Parsed once here so a bad payload rejects the call instead of breaking the widgets later.
      _ = try WidgetContent(snapshotJson: snapshotJson, displayJson: displayJson)
      try WidgetStore.write(snapshotJson: snapshotJson, displayJson: displayJson)
      WidgetCenter.shared.reloadAllTimelines()
    }

    // Called at every launch, so a widget placed before the first reading draws the empty state in the app's
    // language and palette. https://developer.apple.com/documentation/widgetkit/widgetcenter
    AsyncFunction("publishDisplay") { (displayJson: String) in
      _ = try WidgetContent(snapshotJson: nil, displayJson: displayJson)
      try WidgetStore.writeDisplay(displayJson)
      WidgetCenter.shared.reloadAllTimelines()
    }

    // Async closures run as Swift concurrency tasks, which ActivityKit's update and end need.
    AsyncFunction("startStandingTimer") { (content: StandingTimerRecord) async throws in
      try await StandingTimer.start(content.state(at: Date()))
    }

    AsyncFunction("updateStandingTimer") { (content: StandingTimerRecord) async throws in
      try await StandingTimer.update(content.state(at: Date()))
    }

    AsyncFunction("endStandingTimer") { () async in
      await StandingTimer.end()
    }
  }
}
