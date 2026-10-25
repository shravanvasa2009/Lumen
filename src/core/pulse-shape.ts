import { DSP_CONFIG } from './config';
import { median } from './median';

// Averaged pulse shape, diabetes-net's [1, 1, 256] input. Matches the Python training code operation for
// operation; Savitzky-Golay there is scipy.signal.savgol_filter.

export interface WaveLabels {
  // Sample indices; null when that wave or an earlier one is not found.
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  e: number | null;
}

export interface PulseShape {
  beat: Float64Array; // ensemble average of min-max normalized beats
  smoothed: Float64Array;
  secondDerivative: Float64Array; // per sample^2; only signs and extrema are used
  waves: WaveLabels;
  beatsUsed: number;
}

// Savitzky-Golay weights for derivative `deriv` at position x over -h..h, via the normal equations.
function savgolWeights(halfWidth: number, order: number, deriv: number, x: number): number[] {
  const positions = Array.from({ length: 2 * halfWidth + 1 }, (_, i) => i - halfWidth);
  const size = order + 1;
  const normal = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => positions.reduce((sum, p) => sum + p ** (r + c), 0)),
  );
  // Derivative of [1, x, x^2, ...] at x.
  const basis = Array.from({ length: size }, (_, j) => {
    if (j < deriv) return 0;
    let factor = 1;
    for (let m = j - deriv + 1; m <= j; m++) factor *= m;
    return factor * x ** (j - deriv);
  });
  // Solve normal * z = basis, then weight_i = sum_j z_j * p_i^j.
  const augmented = normal.map((row, r) => [...row, basis[r]!]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let r = col + 1; r < size; r++)
      if (Math.abs(augmented[r]![col]!) > Math.abs(augmented[pivot]![col]!)) pivot = r;
    [augmented[col], augmented[pivot]] = [augmented[pivot]!, augmented[col]!];
    for (let r = col + 1; r < size; r++) {
      const ratio = augmented[r]![col]! / augmented[col]![col]!;
      for (let c = col; c <= size; c++) augmented[r]![c]! -= ratio * augmented[col]![c]!;
    }
  }
  const z = new Array<number>(size).fill(0);
  for (let r = size - 1; r >= 0; r--) {
    let rest = augmented[r]![size]!;
    for (let c = r + 1; c < size; c++) rest -= augmented[r]![c]! * z[c]!;
    z[r] = rest / augmented[r]![r]!;
  }
  return positions.map((p) => z.reduce((sum, zj, j) => sum + zj * p ** j, 0));
}

/** Savitzky-Golay filter (window 9, order 3), as scipy savgol_filter with mode 'interp'. */
export function savgolFilter(values: ArrayLike<number>, deriv: number): Float64Array {
  const { savgolWindow, savgolOrder } = DSP_CONFIG.dsp14;
  const half = (savgolWindow - 1) / 2;
  const n = values.length;
  if (n < savgolWindow)
    throw new RangeError(`Savitzky–Golay needs at least ${savgolWindow} samples, got ${n}`);
  const filtered = new Float64Array(n);
  const apply = (weights: number[], start: number) =>
    weights.reduce((sum, w, i) => sum + w * values[start + i]!, 0);
  const centre = savgolWeights(half, savgolOrder, deriv, 0);
  for (let k = half; k < n - half; k++) filtered[k] = apply(centre, k - half);
  // 'interp': edge samples come from the polynomial fitted to the first and last full windows.
  for (let k = 0; k < half; k++) {
    filtered[k] = apply(savgolWeights(half, savgolOrder, deriv, k - half), 0);
    filtered[n - half + k] = apply(savgolWeights(half, savgolOrder, deriv, k + 1), n - savgolWindow);
  }
  return filtered;
}

export const isLocalMax = (y: Float64Array, i: number) => y[i - 1]! < y[i]! && y[i]! >= y[i + 1]!;
export const isLocalMin = (y: Float64Array, i: number) => y[i - 1]! > y[i]! && y[i]! <= y[i + 1]!;

/** Exclusive end of the systolic span searched for the peak, a-e waves, and notch. */
export function systolicSpanEnd(): number {
  const { leadFraction, systoleFraction, beatSamples } = DSP_CONFIG.dsp14;
  return Math.floor((leadFraction + systoleFraction) * beatSamples + 0.5);
}

/** First highest sample of the smoothed beat within the systolic span. */
export function systolicPeakIndex(smoothed: Float64Array): number {
  const spanEnd = systolicSpanEnd();
  let systolicPeak = 0;
  for (let k = 1; k < spanEnd; k++) if (smoothed[k]! > smoothed[systolicPeak]!) systolicPeak = k;
  return systolicPeak;
}

// a: largest local max of the second derivative before the systolic peak; b, c, d, e: the next local
// min, max, min, max after it, within the systolic span.
function labelWaves(smoothed: Float64Array, secondDerivative: Float64Array): WaveLabels {
  const waves: WaveLabels = { a: null, b: null, c: null, d: null, e: null };
  const spanEnd = systolicSpanEnd();
  const systolicPeak = systolicPeakIndex(smoothed);
  for (let i = 1; i < systolicPeak; i++) {
    if (
      isLocalMax(secondDerivative, i) &&
      (waves.a === null || secondDerivative[i]! > secondDerivative[waves.a]!)
    )
      waves.a = i;
  }
  if (waves.a === null) return waves;
  const next = (from: number, isWave: (y: Float64Array, i: number) => boolean) => {
    for (let i = from + 1; i < spanEnd - 1; i++) if (isWave(secondDerivative, i)) return i;
    return null;
  };
  waves.b = next(waves.a, isLocalMin);
  waves.c = waves.b === null ? null : next(waves.b, isLocalMax);
  waves.d = waves.c === null ? null : next(waves.c, isLocalMin);
  waves.e = waves.d === null ? null : next(waves.d, isLocalMax);
  return waves;
}

function allFinite(values: ArrayLike<number>, from: number, to: number): boolean {
  for (let j = from; j <= to; j++) if (!Number.isFinite(values[j]!)) return false;
  return true;
}

function checkPairs(onsets: number[], normal: boolean[]): void {
  if (onsets.length !== normal.length)
    throw new RangeError(`${onsets.length} onsets but ${normal.length} normal-beat flags`);
}

/** Ensemble beat of >= 20 normal beats of the 0.5-8 Hz morphology band at 256 Hz, with a-e labels. */
export function ensembleBeat(
  morphology256: ArrayLike<number>,
  onsets: number[],
  normal: boolean[],
  captureFps: number,
): PulseShape | null {
  checkPairs(onsets, normal);
  const { minNormalBeats, minFps } = DSP_CONFIG.dsp14;
  // Configured rate, not measured: a 60 fps session measures 59.9x. NaN and +Infinity fail.
  if (!(Number.isFinite(captureFps) && captureFps >= minFps)) return null;
  return averageBeat(morphology256, onsets, normal, minNormalBeats);
}

/** Low-quality averaged beat: any frame rate, from one normal beat. */
export function lowQualityEnsembleBeat(
  morphology256: ArrayLike<number>,
  onsets: number[],
  normal: boolean[],
): PulseShape | null {
  return averageBeat(morphology256, onsets, normal, DSP_CONFIG.lowQuality.shapeMinBeats);
}

function averageBeat(
  morphology256: ArrayLike<number>,
  onsets: number[],
  normal: boolean[],
  minNormalBeats: number,
): PulseShape | null {
  checkPairs(onsets, normal);
  const { beatSamples, leadFraction, maxPeriodRatio } = DSP_CONFIG.dsp14;

  // A beat runs onset to next onset, so both must be normal.
  const candidates: number[] = [];
  for (let i = 0; i + 1 < onsets.length; i++) {
    if (normal[i] && normal[i + 1] && onsets[i + 1]! - onsets[i]! > 0) candidates.push(i);
  }
  if (candidates.length < minNormalBeats) return null;
  const longestPeriod = maxPeriodRatio * median(candidates.map((i) => onsets[i + 1]! - onsets[i]!));

  const sums = new Float64Array(beatSamples);
  let beatsUsed = 0;
  for (const i of candidates) {
    const onset = onsets[i]!;
    const period = onsets[i + 1]! - onset;
    const first = onset - leadFraction * period;
    const last = onset + ((beatSamples - 1) / beatSamples - leadFraction) * period;
    if (period > longestPeriod || first < 0 || Math.floor(last) + 1 > morphology256.length - 1) continue;
    // One non-finite sample would make the whole average NaN.
    if (!allFinite(morphology256, Math.floor(first), Math.floor(last) + 1)) continue;
    const raw = new Float64Array(beatSamples);
    for (let k = 0; k < beatSamples; k++) {
      const x = onset + (k / beatSamples - leadFraction) * period;
      const j = Math.floor(x);
      raw[k] = morphology256[j]! + (morphology256[j + 1]! - morphology256[j]!) * (x - j);
    }
    let low = raw[0]!;
    let high = raw[0]!;
    for (const value of raw) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    if (high === low) continue;
    for (let k = 0; k < beatSamples; k++) sums[k]! += (raw[k]! - low) / (high - low);
    beatsUsed++;
  }
  if (beatsUsed < minNormalBeats) return null;

  const beat = sums.map((sum) => sum / beatsUsed);
  const smoothed = savgolFilter(beat, 0);
  const secondDerivative = savgolFilter(beat, 2);
  return {
    beat,
    smoothed,
    secondDerivative,
    waves: labelWaves(smoothed, secondDerivative),
    beatsUsed,
  };
}
