import type { ReadingResult } from '@/core';

import type { MeasureMode } from '@/features/measure/mode';

// A reading without a mode counts as a Quick Check, so it never clears the widget's doctor status.
// intervalsMs is [] for readings saved before intervals were kept.
export type StoredReading = {
  id: string;
  takenAt: number;
  outcome: ReadingResult;
  mode?: MeasureMode;
  intervalsMs?: readonly number[];
};

export function latestReading(readings: readonly StoredReading[]): StoredReading | null {
  return readings.reduce<StoredReading | null>(
    (newest, reading) => (newest === null || reading.takenAt > newest.takenAt ? reading : newest),
    null,
  );
}
