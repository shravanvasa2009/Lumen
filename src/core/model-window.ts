import { DSP_CONFIG } from './config';
import { sqiModelInput } from './finger-signal';
import type { RejectedSpan } from './live-session';
import { HALF_NS_S, isFrameGap, resampleCubic } from './resample';

// Shared by LiveSession and analyzeReading so the live screen and saved result reject the same windows.

/** Time of the next once-per-second model check after tS. */
export function nextModelTickS(tS: number): number {
  const { sqiEveryS } = DSP_CONFIG.live;
  return (Math.floor(tS / sqiEveryS) + 1) * sqiEveryS;
}

/** First frame of a covered, gap-free run reaching back to fromS, else null. */
export function usableFrom(
  tS: ArrayLike<number>,
  covered: ArrayLike<number>,
  count: number,
  fromS: number,
): number | null {
  if (count === 0 || tS[0]! > fromS) return null;
  let first = count - 1;
  while (first > 0 && tS[first - 1]! >= fromS) first--;
  if (first > 0) first--; // one frame before fromS, so a spline covers fromS itself
  for (let i = first; i < count; i++) {
    if (!covered[i]) return null;
    if (i > first && isFrameGap(tS[i - 1]!, tS[i]!)) return null;
  }
  return first;
}

// Covered frames back to just before fromS; uncovered ones count as dropped. Null on a frame gap or
// when coverage does not reach fromS.
function windowFrames(
  tS: ArrayLike<number>,
  covered: ArrayLike<number>,
  count: number,
  fromS: number,
): number[] | null {
  const kept: number[] = [];
  let laterS = tS[count - 1]!;
  for (let i = count - 1; i >= 0; i--) {
    if (!covered[i]) continue;
    if (isFrameGap(tS[i]!, laterS)) return null;
    kept.push(i);
    laterS = tS[i]!;
    // One frame before fromS so the spline covers fromS itself.
    if (tS[i]! < fromS || (i === 0 && tS[i]! <= fromS)) return kept.reverse();
  }
  return null;
}

// Most frame intervals longer than longerThanS that fit in one live.subWindowS span.
function intervalsInSpan(
  tS: ArrayLike<number>,
  first: number,
  count: number,
  endS: number,
  longerThanS: number,
): number {
  const { subWindowS } = DSP_CONFIG.live;
  const startsS: number[] = [];
  let oldest = 0;
  let most = 0;
  for (let i = first + 1; i < count && tS[i]! <= endS; i++) {
    if (tS[i]! - tS[i - 1]! <= longerThanS + HALF_NS_S) continue;
    startsS.push(tS[i - 1]!);
    while (tS[i]! - startsS[oldest]! > subWindowS + HALF_NS_S) oldest++;
    most = Math.max(most, startsS.length - oldest);
  }
  return most;
}

// True when the model window is sampled too sparsely for the pulse or its 2nd harmonic: too few frames
// overall or in any 1 s span, too many long intervals, too few distinct sample times, or a long sparse run.
// The 1 s checks stop a fast burst from paying for a sparse rest of the window.
function underEffectiveFps(tS: ArrayLike<number>, count: number, endS: number): boolean {
  const {
    minEffectiveFps,
    minSubWindowFps,
    subWindowS,
    maxFrameGapS,
    sparseIntervalS,
    maxSparseIntervalsPerS,
    minDistinctSamplesPerS,
  } = DSP_CONFIG.live;
  const startS = endS - DSP_CONFIG.dsp3.modelWindowS;
  let first = count;
  let frames = 0;
  for (let i = count - 1; i >= 0 && tS[i]! >= startS; i--) {
    first = i;
    if (tS[i]! <= endS) frames++;
  }
  if (frames < minEffectiveFps * DSP_CONFIG.dsp3.modelWindowS) return true;
  if (intervalsInSpan(tS, first, count, endS, maxFrameGapS) >= 2) return true;
  if (intervalsInSpan(tS, first, count, endS, sparseIntervalS) >= maxSparseIntervalsPerS) return true;
  const spanFrames = Math.ceil(minSubWindowFps * subWindowS);
  for (let i = first; i < count && tS[i]! + subWindowS <= endS; i++) {
    const last = i + spanFrames - 1;
    if (last >= count || !(tS[last]! <= tS[i]! + subWindowS)) return true;
    if (distinctSamples(tS, i, count, tS[i]! + subWindowS) < minDistinctSamplesPerS * subWindowS) return true;
  }
  return longSparseRun(tS, first, count, endS);
}

// Spacing over 1 / (2 x 2nd harmonic of 220 bpm), 68 ms, under-samples that harmonic. A run of such
// spacings may last at most live.maxSparseRunS.
function longSparseRun(tS: ArrayLike<number>, first: number, count: number, endS: number): boolean {
  const { distinctSampleS, maxSparseRunS } = DSP_CONFIG.live;
  const nyquistS = 60 / (2 * 2 * DSP_CONFIG.rules.fastRegularBpm[1]!);
  let lastS = tS[first]!;
  let runS = 0;
  for (let k = first + 1; k < count && tS[k]! <= endS; k++) {
    const spacingS = tS[k]! - lastS;
    if (spacingS < distinctSampleS - HALF_NS_S) continue;
    lastS = tS[k]!;
    runS = spacingS > nyquistS + HALF_NS_S ? runS + spacingS : 0;
    if (runS > maxSparseRunS + HALF_NS_S) return true;
  }
  return false;
}

// Frames closer than live.distinctSampleS to the last counted one are merged, so a clump counts once.
function distinctSamples(tS: ArrayLike<number>, i: number, count: number, untilS: number): number {
  const { distinctSampleS } = DSP_CONFIG.live;
  let samples = 1;
  let lastS = tS[i]!;
  for (let k = i + 1; k < count && tS[k]! <= untilS + HALF_NS_S; k++) {
    if (tS[k]! - lastS < distinctSampleS - HALF_NS_S) continue;
    samples++;
    lastS = tS[k]!;
  }
  return samples;
}

/** The latest SQI-Net window (256 points of -R at 64 Hz); input is null when it must be rejected. */
export function modelWindowAt(
  tS: Float64Array,
  red: Float64Array,
  covered: ArrayLike<number>,
  count: number,
): { endS: number; input: Float32Array | null; flat: boolean; sparse: boolean } | null {
  const { modelRateHz } = DSP_CONFIG.dsp2;
  const samples = DSP_CONFIG.dsp3.modelWindowS * modelRateHz;
  // Two grid steps of slack for 256 points. Clamped to the first frame, or [0, 1 s) would be in no window.
  const fromS = Math.max(tS[0]!, tS[count - 1]! - (samples + 1) / modelRateHz);
  const kept = windowFrames(tS, covered, count, fromS);
  if (kept === null) return null;
  const window = Float64Array.from(kept, (i) => red[i]!);
  const [segment] = resampleCubic(
    Float64Array.from(kept, (i) => tS[i]!),
    window.map((value) => -value),
    modelRateHz,
  );
  if (!segment || segment.values.length < samples) return null;
  const values = segment.values.slice(-samples);
  const endS = (segment.firstIndex + segment.values.length - 1) / modelRateHz;
  // Judged on frames: a spline through equal values can leave wiggles that z-scoring blows up.
  const flat = window.every((value) => value === window[0]);
  const sparse = underEffectiveFps(tS, count, endS);
  const input = !flat && !sparse && values.every(Number.isFinite) ? sqiModelInput(values) : null;
  return { endS, input, flat, sparse };
}

/** Seconds since the last formed window when a check finds none; not clean once SQI-Net has run. */
export function unscoredSpan(
  tS: ArrayLike<number>,
  count: number,
  sinceS: number | null,
): RejectedSpan | null {
  const tickS = tS[count - 1]!;
  if (tickS - tS[0]! < DSP_CONFIG.dsp3.modelWindowS) return null;
  const startS = sinceS ?? tS[0]!;
  return startS < tickS ? { startS, endS: tickS, reason: 'quality' } : null;
}

// Constant red holds no pulse. A covered run whose red never changes is rejected at any length, and
// inside a longer run any equal-red stretch of live.minFlatS or more.
export class FlatRuns {
  private readonly closed: RejectedSpan[] = [];
  private runStartS: number | null = null; // null outside a covered run
  private runFlat = false;
  private stretchStartS = 0; // first frame of the current equal-red stretch
  private lastS = 0;
  private red = 0;

  add(tS: number, red: number, covered: boolean): void {
    const continues = covered && this.runStartS !== null && !isFrameGap(this.lastS, tS);
    if (continues && red === this.red) {
      this.lastS = tS;
      return;
    }
    if (continues) {
      this.closed.push(...this.stretchSpan());
      this.runFlat = false;
    } else {
      this.closed.push(...this.openSpan());
      this.runStartS = covered ? tS : null;
      this.runFlat = true;
    }
    this.stretchStartS = tS;
    this.lastS = tS;
    this.red = red;
  }

  // Closed spans, then the current run if it is flat so far or its current stretch is long enough.
  spans(): RejectedSpan[] {
    return [...this.closed.map((span) => ({ ...span })), ...this.openSpan()];
  }

  private openSpan(): RejectedSpan[] {
    if (this.runStartS === null) return [];
    if (this.runFlat) return this.lastS > this.runStartS ? [this.spanFrom(this.runStartS)] : [];
    return this.stretchSpan();
  }

  private stretchSpan(): RejectedSpan[] {
    return this.lastS - this.stretchStartS >= DSP_CONFIG.live.minFlatS
      ? [this.spanFrom(this.stretchStartS)]
      : [];
  }

  private spanFrom(startS: number): RejectedSpan {
    return { startS, endS: this.lastS, reason: 'quality' };
  }
}
