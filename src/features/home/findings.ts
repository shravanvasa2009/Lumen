import type { DiabetesMetric, RhythmMetric, RmssdMetric } from '@/core';

import { isLowQuality } from '@/features/results/quality';

import type { StoredReading } from './readings';

// Two Full Scans on different days are needed before the diabetes pattern can be flagged.
export const DIABETES_DAYS_NEEDED = 2;

type Found<Metric> = { reading: StoredReading; metric: Metric };

function newestFirst(readings: readonly StoredReading[]): StoredReading[] {
  return [...readings].sort((first, second) => second.takenAt - first.takenAt);
}

function newestWith<Metric>(
  readings: readonly StoredReading[],
  pick: (reading: StoredReading) => Metric | null,
): Found<Metric> | null {
  for (const reading of newestFirst(readings)) {
    const metric = pick(reading);
    if (metric !== null) return { reading, metric };
  }
  return null;
}

export function latestRhythm(readings: readonly StoredReading[]): Found<RhythmMetric> | null {
  return newestWith(readings, (reading) => reading.outcome.metrics.rhythm);
}

export function latestRmssd(readings: readonly StoredReading[]): Found<RmssdMetric> | null {
  return newestWith(readings, (reading) => reading.outcome.metrics.rmssd);
}

type DiabetesProgress = { days: number; latest: Found<DiabetesMetric> | null };

// Lower-quality diabetes values are left out of the mean, so they do not count toward
// "N of M readings so far" either. Days follow the phone's calendar.
export function diabetesProgress(readings: readonly StoredReading[]): DiabetesProgress {
  const days = new Set<string>();
  for (const reading of readings)
    if (reading.outcome.metrics.diabetes && !isLowQuality(reading.outcome.metrics.diabetes))
      days.add(new Date(reading.takenAt).toDateString());
  return { days: days.size, latest: newestWith(readings, (reading) => reading.outcome.metrics.diabetes) };
}
