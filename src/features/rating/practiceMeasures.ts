import {
  analyzeReading,
  DSP_CONFIG,
  estimateLiveHeartRate,
  type ReadingContext,
  type RatingMeasures,
  type Sample,
} from '@/core';

import type { KeptCapture } from '@/features/measure/keptCapture';
import type { PracticeSummary } from '@/data/store/deviceRating';

const NS_PER_S = 1e9;
const NS_PER_MS = 1e6;

// Spans and SQI scores go in as analyzeKeptCapture passes them, so "clean" means what it does in a real
// reading. The rating reads perfusion, never a verdict about the rhythm.
const practiceContext = (capture: KeptCapture): ReadingContext => ({
  captureFps: capture.captureFps,
  tier: null,
  mode: 'quick',
  restTimerDone: true,
  recordedAt: null,
  motionSpans: capture.motionSpans,
  coldHandsSpans: capture.coldHandsSpans,
  sqi: capture.sqi,
  validationRhythmLabel: null,
});

function intervalsNs(capture: KeptCapture): number[] {
  return capture.samples.slice(1).map((sample, index) => sample.tNs - capture.samples[index]!.tNs);
}

// The live estimator reads only the last windowS seconds, so a lifted finger at the end would hide a good
// practice. Each second ends a window and coupling is the median over all of them. A window with no pulse
// counts at minSnrDb, so patchy contact lowers the median; if no window finds a pulse there is no SNR.
function pulseSnrDb(samples: readonly Sample[]): number | null {
  const last = samples[samples.length - 1];
  const first = samples[0];
  if (!last || !first) return null;
  const windowNs = DSP_CONFIG.liveHr.windowS * NS_PER_S;
  const snrs: number[] = [];
  let withPulse = 0;
  let from = 0;
  for (let endNs = first.tNs + windowNs; endNs < last.tNs + NS_PER_S; endNs += NS_PER_S) {
    const cappedEndNs = Math.min(endNs, last.tNs);
    while (samples[from]!.tNs < cappedEndNs - windowNs) from += 1;
    let to = from;
    while (to < samples.length && samples[to]!.tNs <= cappedEndNs) to += 1;
    const found = estimateLiveHeartRate(samples.slice(from, to));
    if (found) withPulse += 1;
    snrs.push(found?.snrDb ?? DSP_CONFIG.liveHr.minSnrDb);
  }
  if (withPulse === 0) return null;
  const sorted = snrs.sort((low, high) => low - high);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// fps and frame-interval SD come from the frames' own clock; perfusion index and spectral SNR from the same
// frames. No pulse found leaves coupling null, and under 30 clean seconds leaves perfusion null, so the
// rating stays open rather than scoring a guess.
export function practiceMeasures(capture: KeptCapture): {
  measures: RatingMeasures;
  summary: PracticeSummary;
} {
  const intervals = intervalsNs(capture);
  const spanNs = intervals.reduce((total, interval) => total + interval, 0);
  const achievedFps = intervals.length > 0 && spanNs > 0 ? (intervals.length * NS_PER_S) / spanNs : null;
  let frameIntervalSdMs: number | null = null;
  if (intervals.length > 1) {
    const mean = spanNs / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + (interval - mean) ** 2, 0) / intervals.length;
    frameIntervalSdMs = Math.sqrt(variance) / NS_PER_MS;
  }
  const perfusionIndexPct =
    capture.samples.length > 1
      ? analyzeReading({ samples: [...capture.samples], stats: [...capture.stats] }, practiceContext(capture))
          .perfusionIndexPct
      : null;
  const snrDb = pulseSnrDb(capture.samples);
  const coupling = perfusionIndexPct !== null && snrDb !== null ? { perfusionIndexPct, snrDb } : null;
  return {
    measures: { lensId: capture.lensId, achievedFps, frameIntervalSdMs, coupling },
    summary: { achievedFps, frameIntervalSdMs, perfusionIndexPct, snrDb },
  };
}
