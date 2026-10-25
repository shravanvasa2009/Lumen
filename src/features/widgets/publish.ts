import i18next from 'i18next';

import { lockscreenStrings } from '@/ui/i18n/lockscreen';
import { loadScheduleRecord } from '@/features/notifications/record';
import { followUpAnsweredAt } from '@/data/profile/followUp';
import { lockTextLines } from '@/features/settings/lockText';
import { listReadings } from '@/data/store/readings';
import type { Appearance } from '@/ui/theme/preferences';
import tokens from '@/ui/theme/tokens.json';

import { LumenWidgets } from '../../../modules/lumen-widgets/src';
import { widgetSnapshot, type WidgetStatus } from './snapshot';

type WidgetPreferences = { appearance: Appearance; hideWidgetValues: boolean };

type Palette = Record<keyof typeof PALETTE_TOKENS, string>;

// The native widgets' color roles and their tokens, so tokens.json stays the only source. The ring arc is
// accent, flag or criticalText by status on a ringTrack circle; buttons are buttonFill and tonalFill.
const PALETTE_TOKENS = {
  surface: 'surface',
  text: 'text',
  textDim: 'textDim',
  accent: 'accent',
  ringTrack: 'surface3',
  buttonFill: 'buttonFill',
  onButtonFill: 'onButtonFill',
  tonalFill: 'accentTint',
  onTonalFill: 'accent',
  flag: 'flag',
  criticalText: 'criticalText',
} as const satisfies Record<string, keyof typeof tokens.light>;

function paletteOf(colors: typeof tokens.light): Palette {
  return Object.fromEntries(
    Object.entries(PALETTE_TOKENS).map(([role, token]) => [role, colors[token]]),
  ) as Palette;
}

// The widgets' copy, in the app's language; native code keeps at most a fallback empty state. "Last check"
// and "next check" stay templates the widget fills when it draws, since the hours drift between publishes.
// i18next does not re-interpolate a value, so "{{hours}}" survives t().
function widgetDisplay(language: string) {
  const lock = lockscreenStrings(language);
  const t = i18next.getFixedT(language);
  const upToDate = lockTextLines(lock['widget.lock.upToDate']);
  const checkAgain = lockTextLines(lock['widget.lock.checkAgain']).status;
  const status: Record<WidgetStatus, string> = {
    regular: upToDate.status,
    'check-again': checkAgain,
    'see-doctor': lock['widget.status.doctor'],
    // Couldn't tell: the same ask as check-again, a retake.
    inconclusive: checkAgain,
  };
  // The inline lock-screen line. lockscreen.json has no full line for a doctor visit, so it is joined
  // the same way as the other two.
  const inline: Record<WidgetStatus, string> = {
    regular: lock['widget.lock.upToDate'],
    'check-again': lock['widget.lock.checkAgain'],
    'see-doctor': `${upToDate.name} · ${status['see-doctor']}`,
    inconclusive: lock['widget.lock.checkAgain'],
  };
  return {
    // Swift formats the next-check time in the app's language, not the phone's.
    language,
    name: upToDate.name,
    status,
    inline,
    nextCheck: lock['widget.lock.nextCheck'],
    lastCheck: t('widgets.lastCheck', { hours: '{{hours}}' }),
    bpm: t('widgets.bpm'),
    checkNow: t('widgets.checkNow'),
    fullScan: t('mode.full'),
    empty: { title: lock['widget.empty.title'], body: lock['widget.empty.body'] },
    // The Android lock-screen widget's own copy, all from lockscreen.json: with the name and the empty title,
    // it's everything that widget shows. "{{hours}}" stays a template, like lastCheck.
    lock: { lastCheck: lock['widget.lock.lastCheck'], checkNow: lock['widget.lock.checkNow'] },
    palette: { light: paletteOf(tokens.light), dark: paletteOf(tokens.dark) },
  };
}

// The soonest confirmation reminder the last notification sync scheduled. A reminder that already fired
// is not "next".
function nextConfirmationAt(now: number): number | null {
  const upcoming = loadScheduleRecord()
    .filter((entry) => entry.type === 'confirmation')
    .map((entry) => Date.parse(entry.fireAt))
    .filter((fireAt) => fireAt > now);
  return upcoming.length === 0 ? null : Math.min(...upcoming);
}

// Reads the saved readings each time, so a preference change never publishes an empty history.
// Does nothing where the native module is not linked.
export async function publishWidgets(preferences: WidgetPreferences, now = Date.now()): Promise<void> {
  if (!LumenWidgets) return;
  const snapshot = widgetSnapshot({
    readings: await listReadings(),
    nextConfirmationAt: nextConfirmationAt(now),
    // Only "Yes, I saw a doctor" gives a time, and only one after the flagged reading clears it.
    followUpAnsweredAt: await followUpAnsweredAt(),
    hideValues: preferences.hideWidgetValues,
    theme: preferences.appearance,
    now,
  });
  await LumenWidgets.publishSnapshot(
    JSON.stringify(snapshot),
    JSON.stringify(widgetDisplay(i18next.language)),
  );
}

// Run at launch so widgets get the app's copy before the first reading or after an update, and the picker
// has a preview. Only the copy goes, so a launch never changes what a widget says about readings.
export async function publishWidgetCopy(): Promise<void> {
  if (!LumenWidgets) return;
  await LumenWidgets.publishDisplay(JSON.stringify(widgetDisplay(i18next.language)));
}
