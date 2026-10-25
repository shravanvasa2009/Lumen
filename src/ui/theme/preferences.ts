import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { isRecord } from '@/data/evidence';
import { publishWidgets } from '@/features/widgets/publish';

export type Appearance = 'system' | 'light' | 'dark';

type Preferences = {
  appearance: Appearance;
  hideWidgetValues: boolean;
};

const defaults: Preferences = { appearance: 'system', hideWidgetValues: false };

const PREFS_FILE = 'preferences.json';
const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

const prefsFile = () => new File(Paths.document, PREFS_FILE);

// Persisted so "Hide values on widgets" survives a restart. Each field falls back to its default alone.
function loadPreferences(): Preferences {
  const file = prefsFile();
  if (!file.exists) return defaults;
  try {
    const stored: unknown = JSON.parse(file.textSync());
    if (!isRecord(stored)) return defaults;
    return {
      appearance: APPEARANCES.find((value) => value === stored.appearance) ?? defaults.appearance,
      hideWidgetValues:
        typeof stored.hideWidgetValues === 'boolean' ? stored.hideWidgetValues : defaults.hideWidgetValues,
    };
  } catch (error) {
    // A damaged file falls back to defaults; the next change replaces it.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Preferences could not be read, using defaults: ${reason}`);
    return defaults;
  }
}

let current: Preferences = loadPreferences();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, () => current);
}

// For code outside React, such as the widget publish.
export function currentPreferences(): Preferences {
  return current;
}

export function setPreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]) {
  current = { ...current, [key]: value };
  listeners.forEach((listener) => listener());
  try {
    const file = prefsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(current));
  } catch (error) {
    // Still applies for this session; a full disk must not crash a toggle.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Preferences could not be saved: ${reason}`);
  }
  // Report a failed publish, since release builds drop unhandled rejections.
  publishWidgets(current).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Widget update failed: ${reason}`);
  });
}

export function resetPreferences() {
  current = defaults;
  listeners.forEach((listener) => listener());
  const file = prefsFile();
  if (file.exists) file.delete();
}
