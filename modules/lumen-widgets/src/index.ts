import { NativeModule, requireOptionalNativeModule } from 'expo';

// Standing-test timer for the Android notification and iOS Live Activity. Strings come from lockscreen.json,
// so neither carries a value or a condition name.
type StandingTimerContent = {
  // Android only: the notification channel's name and the "Measure now" action button.
  channelName: string;
  actionLabel: string;
  title: string;
  text: string;
  // iOS always shows tapHint because a Live Activity has no buttons on iOS 16; Android shows it only while
  // a reading is due.
  step: string;
  tapHint: string;
  // ms until the next reading opens; null while a reading is due.
  countdownMs: number | null;
  // Android only: 0 to 1, for the progress bar.
  progress: number;
  // Android only: "#RRGGBB" accent per phone theme.
  accentLight: string;
  accentDark: string;
};

declare class LumenWidgetsNative extends NativeModule {
  // displayJson holds the localized labels and palette, so native code holds no copy.
  publishSnapshot(snapshotJson: string, displayJson: string): Promise<void>;
  // Copy alone, sent at every launch.
  publishDisplay(displayJson: string): Promise<void>;
  startStandingTimer(content: StandingTimerContent): Promise<void>;
  updateStandingTimer(content: StandingTimerContent): Promise<void>;
  endStandingTimer(): Promise<void>;
}

// null where the module is not linked (Expo Go), so importing never throws.
export const LumenWidgets = requireOptionalNativeModule<LumenWidgetsNative>('LumenWidgets');
