import { DSP_CONFIG } from './config';
import { isLocalMax, isLocalMin, systolicPeakIndex, systolicSpanEnd, type PulseShape } from './pulse-shape';

// The averaged beat is one period: sample k is at onset + (k / 256 - lead fraction) x period, so the
// onset is at 25.6 and samples 0-25 end the previous period. Times are fractions of the period and
// amplitudes are relative to the systolic peak, so fps, heart rate, gain, and offset drop out.
// Undefined features are null; the model imputes its training median.

// Must match the training code's SHAPE_FEATURE_NAMES.
export const SHAPE_FEATURE_NAMES = [
  'riseTime',
  'width50',
  'width25',
  'notchTime',
  'notchHeight',
  'diastolicPeakHeight',
  'bOverA',
  'cOverA',
  'dOverA',
  'eOverA',
  'agingIndex',
  'areaRatio',
] as const;

const crossing = (smoothed: Float64Array, k: number, level: number) =>
  k + (level - smoothed[k]!) / (smoothed[k + 1]! - smoothed[k]!);

// From the last rise through `level` before the peak to the first fall after it.
function peakWidth(smoothed: Float64Array, peak: number, level: number): number | null {
  let rise: number | null = null;
  for (let k = peak - 1; k >= 0 && rise === null; k--)
    if (smoothed[k]! < level && smoothed[k + 1]! >= level) rise = crossing(smoothed, k, level);
  let fall: number | null = null;
  for (let k = peak; k + 1 < smoothed.length && fall === null; k++)
    if (smoothed[k]! >= level && smoothed[k + 1]! < level) fall = crossing(smoothed, k, level);
  return rise === null || fall === null ? null : (fall - rise) / smoothed.length;
}

// The dicrotic notch (aortic valve closure) lies between the systolic peak and the end of the systolic
// span: the first local minimum followed by a diastolic peak, else (Dawber class 3-4) the first positive
// local max of the second derivative. The e-wave is not used; in older pulses it falls after the
// diastolic peak.
function notchIndex(smoothed: Float64Array, secondDerivative: Float64Array, peak: number): number | null {
  const spanEnd = systolicSpanEnd();
  for (let k = peak + 1; k < spanEnd - 1; k++) {
    if (!isLocalMin(smoothed, k)) continue;
    for (let j = k + 1; j < smoothed.length - 1; j++) if (isLocalMax(smoothed, j)) return k;
    break;
  }
  for (let k = peak + 1; k < spanEnd - 1; k++)
    if (isLocalMax(secondDerivative, k) && secondDerivative[k]! > 0) return k;
  return null;
}

// Trapezoid rule. Systolic is onset to notch; diastolic is notch to window end, wrapping through the
// lead-in back to the onset since it is the same cycle in phase.
function areaRatio(
  height: (k: number) => number,
  onset: number,
  onsetHeight: number,
  notch: number,
  samples: number,
) {
  const first = Math.floor(onset);
  let systolic = ((onsetHeight + height(first + 1)) / 2) * (first + 1 - onset);
  for (let k = first + 1; k < notch; k++) systolic += (height(k) + height(k + 1)) / 2;
  let diastolic = 0;
  for (let k = notch; k < samples - 1; k++) diastolic += (height(k) + height(k + 1)) / 2;
  diastolic += (height(samples - 1) + height(0)) / 2;
  for (let k = 0; k < first; k++) diastolic += (height(k) + height(k + 1)) / 2;
  diastolic += ((height(first) + onsetHeight) / 2) * (onset - first);
  return systolic > 0 ? diastolic / systolic : null;
}

// Highest local max after the notch, relative to the peak; 0 when the beat only decays.
function diastolicPeak(height: (k: number) => number, notch: number, samples: number, peakHeight: number) {
  let highest = 0;
  for (let k = notch + 1; k < samples - 1; k++)
    if (height(k - 1) < height(k) && height(k) >= height(k + 1)) highest = Math.max(highest, height(k));
  return highest / peakHeight;
}

/** Diabetes-net's 12 shape features from an averaged pulse shape, null where undefined. */
export function shapeFeatures(shape: PulseShape): (number | null)[] {
  const { smoothed, secondDerivative, waves } = shape;
  const samples = smoothed.length;
  const onset = DSP_CONFIG.dsp14.leadFraction * samples;
  const first = Math.floor(onset);
  // The 0.5 Hz high-pass can pull the diastolic tail below the onset, so heights are above the minimum.
  let reference = smoothed[0]!;
  for (const value of smoothed) reference = Math.min(reference, value);
  const height = (k: number) => smoothed[k]! - reference;
  const onsetHeight = height(first) + (height(first + 1) - height(first)) * (onset - first);
  const peak = systolicPeakIndex(smoothed);
  const peakHeight = height(peak);
  const hasPeak = peakHeight > 0 && peak > onset;
  const notch = hasPeak ? notchIndex(smoothed, secondDerivative, peak) : null;

  const [upperLevel, lowerLevel] = DSP_CONFIG.diabetesFeatures.widthLevels;
  const width = (fraction: number) =>
    hasPeak ? peakWidth(smoothed, peak, reference + fraction * peakHeight) : null;

  const a = waves.a === null ? 0 : secondDerivative[waves.a]!;
  // Ratios need a positive a-wave.
  const ratio = (wave: number | null) => (a > 0 && wave !== null ? secondDerivative[wave]! / a : null);
  const [b, c, d, e] = [ratio(waves.b), ratio(waves.c), ratio(waves.d), ratio(waves.e)];

  return [
    hasPeak ? (peak - onset) / samples : null,
    width(upperLevel!),
    width(lowerLevel!),
    notch === null ? null : (notch - onset) / samples,
    notch === null ? null : height(notch) / peakHeight,
    notch === null ? null : diastolicPeak(height, notch, samples, peakHeight),
    b,
    c,
    d,
    e,
    b === null || c === null || d === null || e === null ? null : b - c - d - e,
    notch === null ? null : areaRatio(height, onset, onsetHeight, notch, samples),
  ];
}
