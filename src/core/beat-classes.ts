import { elgendiWindows, type DetectedBeat } from './beats';
import { DSP_CONFIG } from './config';
import type { BeatClass, ClassifiedBeat, RejectedSpan } from './live-session';
import { median } from './median';
import type { ResampledSegment } from './resample';

// Pearson correlation; null when either side is flat.
function correlation(x: Float64Array, y: Float64Array): number | null {
  let meanX = 0;
  let meanY = 0;
  for (let k = 0; k < x.length; k++) {
    meanX += x[k]!;
    meanY += y[k]!;
  }
  meanX /= x.length;
  meanY /= y.length;
  let cross = 0;
  let squaresX = 0;
  let squaresY = 0;
  for (let k = 0; k < x.length; k++) {
    const dx = x[k]! - meanX;
    const dy = y[k]! - meanY;
    cross += dx * dy;
    squaresX += dx * dx;
    squaresY += dy * dy;
  }
  return squaresX > 0 && squaresY > 0 ? cross / Math.sqrt(squaresX * squaresY) : null;
}

function pointwise(windows: Float64Array[], combine: (column: number[]) => number): Float64Array {
  return Float64Array.from(windows[0]!, (_, k) => combine(windows.map((window) => window[k]!)));
}

const mean = (column: number[]) => column.reduce((sum, value) => sum + value, 0) / column.length;

// Nearest `count` items at odd and at even offsets from p, cut to the same length so bigeminy stays
// balanced at segment edges. Null below `minimum` per parity.
function balancedNeighbours<T>(items: T[], p: number, count: number, minimum: number): T[] | null {
  const odd: T[] = [];
  const even: T[] = [];
  for (let distance = 1; distance < items.length; distance++) {
    const side = distance % 2 === 1 ? odd : even;
    for (const j of [p - distance, p + distance])
      if (j >= 0 && j < items.length && side.length < count) side.push(items[j]!);
  }
  const perParity = Math.min(odd.length, even.length);
  return perParity < minimum ? null : [...odd.slice(0, perParity), ...even.slice(0, perParity)];
}

/** Class and long-pause flag per beat; artifacts come from rejected spans and impossible intervals only. */
export function classifyBeats(
  beats: DetectedBeat[],
  shape: ResampledSegment,
  rejectedSpans: RejectedSpan[],
): ClassifiedBeat[] {
  const config = DSP_CONFIG.dsp9;
  const { shapeRateHz } = DSP_CONFIG.dsp2;
  const [shortestS, longestS] = config.artifactIntervalS as [number, number];
  const [smallest, largest] = config.amplitudeRatioRange as [number, number];
  const overlapsSpan = (startS: number, endS: number) =>
    rejectedSpans.some((span) => span.startS <= endS && span.endS >= startS);
  // A NaN fails every comparison and would pass every rule as normal.
  beats.forEach((beat, i) => {
    if (![beat.peakS, beat.maxUpslope, beat.amplitude, beat.onsetS ?? 0].every(Number.isFinite))
      throw new RangeError(`beat ${i} has a non-finite time, upslope, or amplitude`);
  });
  const inSpan = (beat: DetectedBeat) => overlapsSpan(beat.onsetS ?? beat.peakS, beat.peakS);

  // Median over candidates outside rejected spans, so motion upslopes do not raise the floor.
  const cleanUpslopes = beats.filter((beat) => !inSpan(beat)).map((beat) => beat.maxUpslope);
  const upslopeFloor =
    config.notABeatUpslopeRatio *
    median(cleanUpslopes.length > 0 ? cleanUpslopes : beats.map((beat) => beat.maxUpslope));
  const classes: BeatClass[] = beats.map((beat) =>
    beat.maxUpslope < upslopeFloor ? 'not-a-beat' : 'normal',
  );

  const previousBeat: (number | null)[] = [];
  let lastBeat: number | null = null;
  beats.forEach((_, i) => {
    previousBeat.push(lastBeat);
    if (classes[i] !== 'not-a-beat') lastBeat = i;
  });

  beats.forEach((beat, i) => {
    if (classes[i] === 'not-a-beat') return;
    const previous = previousBeat[i];
    const intervalS = previous == null ? null : beat.peakS - beats[previous]!.peakS;
    const impossible = intervalS !== null && (intervalS < shortestS || intervalS > longestS);
    if (inSpan(beat) || impossible) classes[i] = 'artifact';
  });

  const beforePeak = Math.round(config.templateBeforePeakS * shapeRateHz);
  const afterPeak = Math.round(config.templateAfterPeakS * shapeRateHz);
  const windowOf = (beat: DetectedBeat) => {
    const peak = Math.round(beat.peakS * shapeRateHz) - shape.firstIndex;
    if (peak - beforePeak < 0 || peak + afterPeak >= shape.values.length) return null;
    return shape.values.slice(peak - beforePeak, peak + afterPeak + 1);
  };

  // "Early": short against the median of neighbouring intervals.
  const references = <T>(items: T[], p: number) =>
    balancedNeighbours(items, p, config.neighbours, config.minNeighboursPerParity);
  const kept = beats.flatMap((_, i) => (classes[i] !== 'not-a-beat' ? [i] : []));
  // Interval q ends at beat kept[q + 1].
  const keptIntervals = kept.slice(1).map((i, q) => beats[i]!.peakS - beats[kept[q]!]!.peakS);
  const earlyBeats = new Set<number>();
  keptIntervals.forEach((ownS, q) => {
    const others = references(keptIntervals, q);
    if (others && ownS < config.earlyIntervalRatio * median(others)) earlyBeats.add(kept[q + 1]!);
  });

  const candidates = beats.flatMap((_, i) => (classes[i] === 'normal' ? [i] : []));
  const windows = candidates.map((i) => windowOf(beats[i]!));
  // A beat with no observed foot has an unreliable amplitude, so it is never a reference.
  const footSeen = (i: number) => beats[i]!.onsetS !== null;
  // Seed with a pointwise median so one early premature beat cannot become the template.
  const seedWindows = windows
    .flatMap((window, p) => (window !== null && footSeen(candidates[p]!) ? [window] : []))
    .slice(0, config.templateBeats);
  const normalWindows: Float64Array[] = [];
  candidates.forEach((i, p) => {
    const pool = candidates.filter((j) => j === i || footSeen(j));
    const others = references(pool, pool.indexOf(i));
    const reference = others ? median(others.map((j) => beats[j]!.amplitude)) : NaN;
    const ratio = beats[i]!.amplitude / reference;
    const window = windows[p] ?? null;
    const template =
      normalWindows.length > 0
        ? pointwise(normalWindows.slice(-config.templateBeats), mean)
        : seedWindows.length > 0
          ? pointwise(seedWindows, median)
          : null;
    const similarity = window && template ? correlation(window, template) : null;
    const oddSize = Number.isFinite(ratio) && (ratio < smallest || ratio > largest);
    const oddShape = similarity !== null && similarity < config.templateCorrelationMin;
    // Early alone is not enough; it must also be small.
    const earlyAndSmall =
      earlyBeats.has(i) && Number.isFinite(ratio) && ratio < config.earlySmallAmplitudeRatio;
    if (oddSize || oddShape || earlyAndSmall) classes[i] = 'atypical';
    else if (window && footSeen(i)) normalWindows.push(window);
  });

  // Long-pause references skip intervals touching a problem or a segment edge, where a cut foot search or
  // Elgendi's MA_beat running past the end (zero-padded, lowering THR1) can fake a pause.
  const minimumSearch = Math.round(DSP_CONFIG.dsp8.minimumSearchS * shapeRateHz);
  const endMargin = (elgendiWindows(shapeRateHz).beatSamples - 1) / 2;
  const nearSegmentEdge = (i: number) => {
    const peak = Math.round(beats[i]!.peakS * shapeRateHz) - shape.firstIndex;
    return (i === 0 && peak < minimumSearch) || peak > shape.values.length - 1 - endMargin;
  };
  const cleanIntervals: { end: number; lengthS: number }[] = [];
  beats.forEach((beat, i) => {
    const start = previousBeat[i];
    if (start == null || classes[i] === 'not-a-beat' || classes[i] === 'artifact') return;
    if (classes[start] === 'artifact' || overlapsSpan(beats[start]!.peakS, beat.peakS)) return;
    if (nearSegmentEdge(i) || nearSegmentEdge(start)) return;
    cleanIntervals.push({ end: i, lengthS: beat.peakS - beats[start]!.peakS });
  });
  const longPauses = new Set<number>();
  cleanIntervals.forEach(({ end, lengthS }, q) => {
    const others = references(cleanIntervals, q);
    if (others && lengthS >= config.longPauseRatio * median(others.map((n) => n.lengthS)))
      longPauses.add(end);
  });

  return beats.map((beat, i) => ({
    peakS: beat.peakS,
    onsetS: beat.onsetS,
    beatClass: classes[i]!,
    longPause: longPauses.has(i),
  }));
}
