import { DSP_CONFIG } from './config';
import { butterLowpass, filterZeroPhase } from './filters';
import type { Timebase } from './timebase';

export interface FingerSignals {
  primary: Float64Array; // -R: more blood absorbs more red, so inverting makes the pulse rise
  secondary: Float64Array; // -G
}

/** The finger PPG signals from per-frame channel means. */
export function fingerSignals(timebase: Timebase): FingerSignals {
  return {
    primary: timebase.r.map((red) => -red),
    secondary: timebase.g.map((green) => -green),
  };
}

// Population SD with sums in index order, to match the Python doubles.
/** Z-score of one model-input window; null when flat (all samples equal) or any sample is not finite. */
export function zScoreWindow(window: ArrayLike<number>): Float64Array | null {
  const values = Array.from(window);
  if (!values.every(Number.isFinite)) return null;
  if (values.every((value) => value === values[0])) return null;
  let total = 0;
  for (const value of values) total += value;
  const mean = total / values.length;
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  const sd = Math.sqrt(squares / values.length);
  return Float64Array.from(values, (value) => (value - mean) / sd);
}

/** SQI-Net v1 input, 256 float32: the 4 s -R window, z-scored; null if flat or not finite. */
export function sqiModelInput(primary: ArrayLike<number>): Float32Array | null {
  const samples = DSP_CONFIG.dsp3.modelWindowS * DSP_CONFIG.dsp2.modelRateHz;
  if (primary.length !== samples)
    throw new RangeError(`SQI windows need ${samples} samples, got ${primary.length}`);
  const scored = zScoreWindow(primary);
  return scored && Float32Array.from(scored);
}

/** DC level (zero-phase Butterworth low-pass below 0.3 Hz) of a uniformly sampled channel. */
export function dcLevel(channel: ArrayLike<number>, rateHz: number): Float64Array {
  const { dcOrder, dcCutoffHz } = DSP_CONFIG.dsp3;
  return filterZeroPhase(butterLowpass(dcOrder, dcCutoffHz, rateHz), channel);
}
