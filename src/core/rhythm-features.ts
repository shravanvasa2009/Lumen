import { DSP_CONFIG } from './config';
import { median } from './median';

// Sums run in index order to match the Python doubles, up to 1 ulp where Python's ** 2 uses pow().

// Training order: 8 v1 features (rhythmFeatureVector), then 7 v2 (rhythmV2Features). A model reads the
// prefix its manifest featureOrder names.
export const RHYTHM_FEATURE_NAMES = Object.freeze([
  'normalizedRmssd',
  'shannonEntropyBits',
  'turningPointRatio',
  'sd1S',
  'sd2S',
  'pnn50',
  'sampleEntropy',
  'atypicalFraction',
  'medianAbsDiffNorm',
  'shortLongPairShare',
  'rmssdPairsRemovedNorm',
  'trimmedRmssdNorm',
  'largeChangeShare',
  'rrLag1Autocorr',
  'rrLag2Autocorr',
] as const);

export interface RhythmWindow {
  startInterval: number; // index of the window's first interval in the reading
  intervalsS: number[];
  normalizedRmssd: number; // RMSSD / mean interval
  shannonEntropyBits: number;
  turningPointRatio: number; // turning points / (n - 2); ties are not turning points
  sd1S: number;
  sd2S: number;
  pnn50: number;
  sampleEntropy: number | null; // null when no template pairs match at length m or m + 1
  atypicalFraction: number; // atypical beats among the n + 1 beats that bound the window
}

function sum(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

// Divides by n. Exactly 0 when all values are equal.
function populationSd(values: number[]): number {
  if (values.every((value) => value === values[0])) return 0;
  const mean = sum(values) / values.length;
  return Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / values.length);
}

// Equal-width bins over [min, max], max in the last bin; log base 2.
function shannonEntropyBits(intervalsS: number[]): number {
  const { histogramBins } = DSP_CONFIG.dsp15;
  const low = Math.min(...intervalsS);
  const high = Math.max(...intervalsS);
  const counts = new Array<number>(histogramBins).fill(0);
  for (const value of intervalsS) {
    const bin =
      high === low
        ? 0
        : Math.min(histogramBins - 1, Math.floor(((value - low) / (high - low)) * histogramBins));
    counts[bin]!++;
  }
  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const probability = count / intervalsS.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

// Richman & Moorman (2000): r = R x population SD, Chebyshev distance <= r, no self-matches, the same
// first N - m templates for lengths m and m + 1. SampEn = ln(B / A).
function sampleEntropy(intervalsS: number[]): number | null {
  const { sampleEntropyM: m, sampleEntropyR } = DSP_CONFIG.dsp15;
  const r = sampleEntropyR * populationSd(intervalsS);
  const templates = intervalsS.length - m;
  const matchingPairs = (length: number) => {
    let count = 0;
    for (let i = 0; i < templates; i++) {
      for (let j = i + 1; j < templates; j++) {
        let within = true;
        for (let k = 0; k < length && within; k++)
          within = Math.abs(intervalsS[i + k]! - intervalsS[j + k]!) <= r;
        if (within) count++;
      }
    }
    return count;
  };
  const shorter = matchingPairs(m);
  const longer = matchingPairs(m + 1);
  return shorter === 0 || longer === 0 ? null : Math.log(shorter / longer);
}

function windowFeatures(startInterval: number, intervalsS: number[], atypicalBeats: boolean[]): RhythmWindow {
  const n = intervalsS.length;
  const differences = intervalsS.slice(1).map((value, i) => value - intervalsS[i]!);
  const mean = sum(intervalsS) / n;
  const rmssd = Math.sqrt(sum(differences.map((difference) => difference * difference)) / differences.length);

  let turningPoints = 0;
  for (let i = 1; i < n - 1; i++) if (differences[i - 1]! * differences[i]! < 0) turningPoints++;

  const sd1S = populationSd(differences.map((difference) => difference / Math.SQRT2));
  const sd2S = populationSd(intervalsS.slice(1).map((value, i) => (value + intervalsS[i]!) / Math.SQRT2));
  const overThreshold = differences.filter(
    (difference) => Math.abs(difference) > DSP_CONFIG.dsp15.pnnThresholdS,
  );
  const boundingBeats = atypicalBeats.slice(startInterval, startInterval + n + 1);

  return {
    startInterval,
    intervalsS,
    normalizedRmssd: rmssd / mean,
    shannonEntropyBits: shannonEntropyBits(intervalsS),
    turningPointRatio: turningPoints / (n - 2),
    sd1S,
    sd2S,
    pnn50: overThreshold.length / differences.length,
    sampleEntropy: sampleEntropy(intervalsS),
    atypicalFraction: boundingBeats.filter(Boolean).length / boundingBeats.length,
  };
}

// Finite, positive intervals keep the feature vector finite.
function checkRhythmInputs(intervalsS: number[], spansArtifact: boolean[], atypicalBeats: boolean[]): void {
  if (spansArtifact.length !== intervalsS.length)
    throw new RangeError(`${intervalsS.length} intervals but ${spansArtifact.length} artifact flags`);
  if (atypicalBeats.length !== intervalsS.length + 1)
    throw new RangeError(
      `${intervalsS.length} intervals need ${intervalsS.length + 1} beat flags, got ${atypicalBeats.length}`,
    );
  intervalsS.forEach((intervalS, i) => {
    if (!(Number.isFinite(intervalS) && intervalS > 0))
      throw new RangeError(`interval ${i} must be finite and positive seconds, got ${intervalS}`);
  });
}

// [start, end) runs of intervals spanning no artifact, so every pairing is truly adjacent in time.
function usableRuns(spansArtifact: boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  for (let runStart = 0; runStart < spansArtifact.length;) {
    if (spansArtifact[runStart]) {
      runStart++;
      continue;
    }
    let runEnd = runStart;
    while (runEnd < spansArtifact.length && !spansArtifact[runEnd]) runEnd++;
    runs.push([runStart, runEnd]);
    runStart = runEnd;
  }
  return runs;
}

/** Rhythm features per 32-interval window (step 16) within each run of usable intervals. */
export function rhythmWindows(
  intervalsS: number[],
  spansArtifact: boolean[],
  atypicalBeats: boolean[],
): RhythmWindow[] {
  checkRhythmInputs(intervalsS, spansArtifact, atypicalBeats);
  const { windowIntervals, windowStep } = DSP_CONFIG.dsp15;
  const windows: RhythmWindow[] = [];
  for (const [runStart, runEnd] of usableRuns(spansArtifact)) {
    for (let start = runStart; start + windowIntervals <= runEnd; start += windowStep) {
      windows.push(windowFeatures(start, intervalsS.slice(start, start + windowIntervals), atypicalBeats));
    }
  }
  return windows;
}

/** Low-quality fallback: one window over the longest usable run when no 32-interval window fits. */
export function readingWideWindow(
  intervalsS: number[],
  spansArtifact: boolean[],
  atypicalBeats: boolean[],
): RhythmWindow | null {
  checkRhythmInputs(intervalsS, spansArtifact, atypicalBeats);
  let longest: [number, number] | null = null;
  for (const run of usableRuns(spansArtifact)) {
    if (run[1] - run[0] >= DSP_CONFIG.dsp15.windowIntervals) return null;
    if (longest === null || run[1] - run[0] > longest[1] - longest[0]) longest = run;
  }
  if (longest === null || longest[1] - longest[0] < DSP_CONFIG.lowQuality.rhythmMinIntervals) return null;
  return windowFeatures(longest[0], intervalsS.slice(longest[0], longest[1]), atypicalBeats);
}

/** Whether a reading-wide window has enough intervals for a rhythm class. */
export function judgesRhythm(window: RhythmWindow): boolean {
  return window.intervalsS.length >= DSP_CONFIG.lowQuality.rhythmClassMinIntervals;
}

// Richman & Moorman (2000) upper bound for undefined SampEn: ln((N - m)(N - m - 1) / 2).
function sampleEntropyUpperBound(): number {
  const { windowIntervals: n, sampleEntropyM: m } = DSP_CONFIG.dsp15;
  return Math.log(((n - m) * (n - m - 1)) / 2);
}

/** The 8 Rhythm-Net features in fixed order, with undefined sample entropy filled. */
export function rhythmFeatureVector(window: RhythmWindow): number[] {
  return [
    window.normalizedRmssd,
    window.shannonEntropyBits,
    window.turningPointRatio,
    window.sd1S,
    window.sd2S,
    window.pnn50,
    window.sampleEntropy ?? sampleEntropyUpperBound(),
    window.atypicalFraction,
  ];
}

/** A reading needs at least 40 intervals that do not span an artifact. */
export function hasEnoughUsableIntervals(spansArtifact: boolean[]): boolean {
  return spansArtifact.filter((spans) => !spans).length >= DSP_CONFIG.dsp15.minUsableIntervals;
}

const NEAR_CONSTANT_SD = 1e-9;

// Population form; 0 when either side is constant.
function pearson(a: number[], b: number[]): number {
  const meanA = sum(a) / a.length;
  const meanB = sum(b) / b.length;
  const sdA = populationSd(a);
  const sdB = populationSd(b);
  // A spread under 1e-9 of the mean is rounding noise (one-ulp alternation read +0.94 for a true -1).
  if (sdA <= NEAR_CONSTANT_SD * meanA || sdB <= NEAR_CONSTANT_SD * meanB) return 0;
  const covariance = sum(a.map((value, i) => (value - meanA) * (b[i]! - meanB))) / a.length;
  return covariance / (sdA * sdB);
}

function rootMeanSquare(values: number[]): number {
  return Math.sqrt(sum(values.map((value) => value * value)) / values.length);
}

/** Rhythm v2: 7 irregularity features that isolated premature beats barely move. */
export function rhythmV2Features(window: RhythmWindow): number[] {
  const { prematureShortFactor, pauseLongFactor, trimmedDiffShare, largeChangeFactor } = DSP_CONFIG.dsp15;
  const x = window.intervalsS;
  const differences = x.slice(1).map((value, i) => value - x[i]!);
  const absolute = differences.map(Math.abs);
  const med = median(x);

  // Short-long pairs: a premature beat and its compensatory pause, which AF lacks.
  const pairs: number[] = [];
  for (let i = 0; i < differences.length; i++)
    if (x[i]! < prematureShortFactor * med && x[i + 1]! > pauseLongFactor * med) pairs.push(i);
  const kept = new Array<boolean>(x.length).fill(true);
  for (const i of pairs) for (let j = Math.max(0, i - 1); j < Math.min(x.length, i + 3); j++) kept[j] = false;
  // Never difference across a dropped stretch.
  const keptDifferences = differences.filter((_, i) => kept[i] && kept[i + 1]);
  const pairsRemoved = keptDifferences.length < 2 ? 0 : rootMeanSquare(keptDifferences) / med;

  const trimmed = [...absolute]
    .sort((a, b) => a - b)
    .slice(0, Math.max(1, Math.floor(trimmedDiffShare * absolute.length)));
  const large = absolute.filter((value) => value > largeChangeFactor * med).length;
  return [
    median(absolute) / med,
    pairs.length / differences.length,
    pairsRemoved,
    rootMeanSquare(trimmed) / med,
    large / absolute.length,
    pearson(x.slice(0, -1), x.slice(1)),
    pearson(x.slice(0, -2), x.slice(2)),
  ];
}
