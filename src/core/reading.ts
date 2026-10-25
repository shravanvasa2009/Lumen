import { detectBeats } from './beats';
import { classifyBeats } from './beat-classes';
import { breathingEstimates, breathingRate, type BreathingRate } from './breathing';
import type { FrameStat, Sample } from './capture';
import { DSP_CONFIG } from './config';
import { frameProblem, validChannels } from './contact';
import { butterBandpass, filterZeroPhase } from './filters';
import { fingerSignals } from './finger-signal';
import { FlatRuns, modelWindowAt, nextModelTickS, unscoredSpan } from './model-window';
import { ensembleBeat, lowQualityEnsembleBeat, type PulseShape } from './pulse-shape';
import type { RejectedSpan, RejectionReason } from './live-session';
import {
  cleanSeconds,
  frameGapSpan,
  heartRate,
  lowQualityHeartRate,
  measureBeats,
  perfusionIndex,
  type MeasuredBeat,
} from './reading-metrics';
import { resampleCubic, type ResampledSegment } from './resample';
import type { LostSeconds, RhythmClass } from './results';
import {
  hasEnoughUsableIntervals,
  readingWideWindow,
  rhythmFeatureVector,
  rhythmV2Features,
  rhythmWindows,
  type RhythmWindow,
} from './rhythm-features';
import { buildTimebase, type Timebase } from './timebase';

export type Tier = 'full' | 'basic' | 'limited';

// Capture-clock ns, same clock as Sample.tNs.
export interface NsSpan {
  startNs: number;
  endNs: number;
}

// SQI-Net scores for 4 s windows ending at endNs, and the manifest threshold for P(clean).
export interface SqiScores {
  threshold: number;
  windows: { endNs: number; pClean: number }[];
}

export interface ReadingContext {
  captureFps: number; // the capture format's frame rate (30, 60, 120), not a measured rate
  tier: Tier | null; // rating tier; null when the phone has not been rated
  mode: string; // 'quick' | 'full' and later modes; diabetes needs 'full' (Full Scan)
  restTimerDone: boolean; // resting-rate rules
  recordedAt: { ms: number; day: string } | null; // epoch ms and local calendar day, for history rules
  motionSpans: NsSpan[]; // accelerometer RMS above the app's threshold
  coldHandsSpans: NsSpan[]; // live perfusion index under the device floor: the reading paused
  sqi: SqiScores | null; // null when SQI-Net did not run
  // Offline validation only: stands in for the rhythm class in the HRV gate when no
  // rhythm model ran; never makes a rhythm card. Null in the app.
  validationRhythmLabel: RhythmClass | null;
}

// One row of replay-intervals.csv: the interval ending at the beat peaking at tNs.
export interface BeatInterval {
  tNs: number;
  ibiMs: number;
  accepted: boolean; // both beats are normal or atypical
  nn: boolean; // both beats normal and no long pause (HRV's input before its 20% filter)
}

export interface ReadingAnalysis {
  context: ReadingContext;
  startNs: number;
  durationS: number; // first to last frame
  sqiAvailable: boolean;
  // Windows under SQI-Net's threshold stay clean and are only counted here; null when it never ran.
  sqiFlagged: { windows: number; total: number } | null;
  // Clean seconds no scored SQI-Net window covers; null when it never ran.
  sqiUnscoredS: number | null;
  rejectedSpans: RejectedSpan[]; // seconds from the first frame, sorted by start
  cleanSeconds: number;
  lostSeconds: LostSeconds;
  segments: MeasuredBeat[][]; // one per analysed gap-free segment
  intervals: BeatInterval[];
  heartRateBpm: number | null;
  perfusionIndexPct: number | null;
  breathing: BreathingRate | null;
  normalizedRmssd: number | null; // over accepted intervals, for the fast regular rhythm rule
  rhythmWindows: RhythmWindow[];
  rhythmFeatures: number[][]; // per window, RHYTHM_FEATURE_NAMES order (v1 8 + v2 7)
  enoughRhythmIntervals: boolean;
  usableRhythmIntervals: number; // intervals that span no artifact
  pulseShape: PulseShape | null; // averaged beat (readingShape): diabetes-net's beat input
  // For the emergency rule: intervals and spans without SQI-Net's or the frame-floor windows; null
  // when there are none, so the reading's own apply.
  withoutSqiNet: { intervals: BeatInterval[]; rejectedSpans: RejectedSpan[] } | null;
  // Same math on whatever beats exist, for outputs whose standard floor failed. Null when the standard
  // value exists or even the lowQuality floors are not met.
  lowQuality: {
    heartRateBpm: number | null;
    breathing: BreathingRate | null;
    pulseShape: PulseShape | null;
    rhythmWindow: RhythmWindow | null; // only when no 32-interval window fits
    rhythmFeatures: number[] | null; // RHYTHM_FEATURE_NAMES order, as rhythmFeatures
  };
}

// A run of failing frames spans from its first frame to the next good one. With skipBroken, broken frames
// are passed over as if dropped.
function contactSpans(
  timebase: Timebase,
  samples: Sample[],
  stats: FrameStat[],
  skipBroken: boolean,
): RejectedSpan[] {
  const spans: RejectedSpan[] = [];
  const { tS } = timebase;
  let open: RejectedSpan | null = null;
  for (let i = 0; i < samples.length; i++) {
    if (skipBroken && !validChannels(samples[i]!)) continue;
    const reason = frameProblem(samples[i]!, stats[i]!);
    if (open && open.reason !== reason) {
      open.endS = tS[i]!;
      spans.push(open);
      open = null;
    }
    if (reason && !open) open = { startS: tS[i]!, endS: tS[i]!, reason };
  }
  if (open) {
    open.endS = tS[tS.length - 1]!;
    spans.push(open);
  }
  return spans;
}

function exposureSpans(timebase: Timebase): RejectedSpan[] {
  const spans: RejectedSpan[] = [];
  const { exposureNs, tS } = timebase;
  for (let i = 1; i < exposureNs.length; i++) {
    if (exposureNs[i] === exposureNs[i - 1]) continue;
    spans.push({
      startS: tS[i]!,
      endS: tS[i]! + DSP_CONFIG.dsp5.exposureChangeArtifactS,
      reason: 'exposure',
    });
  }
  return spans;
}

function sensorSpans(context: ReadingContext, startNs: number): RejectedSpan[] {
  const seconds = (tNs: number) => (tNs - startNs) / 1e9;
  const fromNs = (spans: NsSpan[], reason: RejectionReason) =>
    spans.map((span): RejectedSpan => ({ startS: seconds(span.startNs), endS: seconds(span.endNs), reason }));
  return [...fromNs(context.motionSpans, 'motion'), ...fromNs(context.coldHandsSpans, 'coldHands')];
}

// SQI-Net rejects nothing, since it accepted only about 64% of clean windows; flagged windows only tag
// the reading. Each window counts once, by its lowest score, so repeats cannot dilute the flagged share.
function sqiWindowsInside(sqi: SqiScores | null, startNs: number, durationS: number): SqiScores | null {
  if (sqi === null) return null;
  const windowS = DSP_CONFIG.dsp3.modelWindowS;
  const lowest = new Map<number, number>();
  for (const { endNs, pClean } of sqi.windows) {
    const endS = (endNs - startNs) / 1e9;
    if (endS - windowS < 0 || endS > durationS) continue;
    lowest.set(endNs, Math.min(pClean, lowest.get(endNs) ?? pClean));
  }
  return {
    threshold: sqi.threshold,
    windows: Array.from(lowest, ([endNs, pClean]) => ({ endNs, pClean })),
  };
}

function sqiFlaggedWindows(sqi: SqiScores | null): ReadingAnalysis['sqiFlagged'] {
  if (sqi === null) return null;
  const windows = sqi.windows.filter((window) => window.pClean < sqi.threshold).length;
  return { windows, total: sqi.windows.length };
}

// Clean time outside every scored window [endS - modelWindowS, endS].
function sqiUnscoredSeconds(
  sqi: SqiScores | null,
  startNs: number,
  durationS: number,
  rejectedSpans: RejectedSpan[],
): number | null {
  if (sqi === null) return null;
  const windowS = DSP_CONFIG.dsp3.modelWindowS;
  const ends = sqi.windows.map((window) => (window.endNs - startNs) / 1e9).sort((x, y) => x - y);
  let unscored = 0;
  let scoredToS = 0;
  for (const endS of [...ends, durationS + windowS]) {
    const gapEndS = Math.min(endS - windowS, durationS);
    if (gapEndS > scoredToS) unscored += cleanSeconds(scoredToS, gapEndS, rejectedSpans);
    scoredToS = Math.max(scoredToS, endS);
  }
  return unscored;
}

// Flat and under-floor windows, checked once per second as LiveSession does so the two agree. Unscorable
// windows are rejected only when SQI-Net ran. Sparse windows are kept apart for the emergency view.
function frameQualitySpans(timebase: Timebase, samples: Sample[], stats: FrameStat[], modelRan: boolean) {
  const covered = Uint8Array.from(samples, (sample, i) =>
    frameProblem(sample, stats[i]!) === 'coverage' ? 0 : 1,
  );
  const windowS = DSP_CONFIG.dsp3.modelWindowS;
  const spans: RejectedSpan[] = [];
  const unscored: RejectedSpan[] = [];
  const sparse: RejectedSpan[] = [];
  const flatRuns = new FlatRuns();
  let nextTickS = DSP_CONFIG.live.sqiEveryS;
  let formedEndS: number | null = null;
  timebase.tS.forEach((tS, i) => {
    flatRuns.add(tS, timebase.r[i]!, covered[i] === 1);
    if (tS < nextTickS) return;
    nextTickS = nextModelTickS(tS);
    const window = modelWindowAt(timebase.tS, timebase.r, covered, i + 1);
    if (window && !window.input) {
      const span: RejectedSpan = { startS: window.endS - windowS, endS: window.endS, reason: 'quality' };
      spans.push(span);
      if (window.sparse && !window.flat) sparse.push(span);
    }
    const missing = window ? null : unscoredSpan(timebase.tS, i + 1, formedEndS);
    if (missing) unscored.push(missing);
    if (window) formedEndS = window.endS;
  });
  const rejectedUnscored = modelRan ? unscored : [];
  // LiveSession's order, so equal starts sort alike.
  return { all: [...spans, ...rejectedUnscored, ...flatRuns.spans()], unscored: rejectedUnscored, sparse };
}

function lostSecondsOf(spans: RejectedSpan[], durationS: number): LostSeconds {
  // Coaching causes only. Clipping is pressing too hard.
  const lost = (reasons: RejectionReason[]) =>
    durationS -
    cleanSeconds(
      0,
      durationS,
      spans.filter((span) => reasons.includes(span.reason)),
    );
  return {
    motion: lost(['motion']),
    pressure: lost(['clipping']),
    coverage: lost(['coverage']),
    coldHands: lost(['coldHands']),
  };
}

function morphologyBand(segment: ResampledSegment, rateHz: number): ResampledSegment {
  const { morphologyOrder, morphologyBandHz } = DSP_CONFIG.dsp6;
  const [lowHz, highHz] = morphologyBandHz as [number, number];
  return {
    firstIndex: segment.firstIndex,
    values: filterZeroPhase(butterBandpass(morphologyOrder, lowHz, highHz, rateHz), segment.values),
  };
}

interface BeatSegment {
  beats: MeasuredBeat[];
  shape: ResampledSegment; // morphology band at 256 Hz
  beatsWithoutSqiNet: MeasuredBeat[] | null; // classed in the emergency view's spans; null without one
}

// Segments shorter than dsp7.minSegmentS are skipped. Detected beats are classed again against
// spansWithoutSqiNet for the emergency view.
function beatSegments(
  timebase: Timebase,
  samples: Sample[],
  stats: FrameStat[],
  spans: RejectedSpan[],
  spansWithoutSqiNet: RejectedSpan[] | null,
): BeatSegment[] {
  const { modelRateHz, shapeRateHz } = DSP_CONFIG.dsp2;
  const { primary } = fingerSignals(timebase);
  // Uncovered frames are dropped: left in, their step swamps the beat detector. Resampling splines
  // across them or splits the segment; the coverage span still marks beats there as artifacts.
  const kept = samples.flatMap((sample, i) => (frameProblem(sample, stats[i]!) === 'coverage' ? [] : [i]));
  const keptS = Float64Array.from(kept, (i) => timebase.tS[i]!);
  const keptSignal = Float64Array.from(kept, (i) => primary[i]!);
  const models = resampleCubic(keptS, keptSignal, modelRateHz);
  const shapes = resampleCubic(keptS, keptSignal, shapeRateHz);
  // Both rates split at the same gaps, but a very short segment can lack a 64 Hz grid point, so pairs
  // are matched by time.
  const span = (segment: ResampledSegment, rateHz: number) =>
    [segment.firstIndex / rateHz, (segment.firstIndex + segment.values.length - 1) / rateHz] as const;
  return shapes.flatMap((raw) => {
    if (raw.values.length < DSP_CONFIG.dsp7.minSegmentS * shapeRateHz) return [];
    const [startS, endS] = span(raw, shapeRateHz);
    const model = models.find((candidate) => {
      const [from, to] = span(candidate, modelRateHz);
      return from <= endS && to >= startS;
    })!;
    const shape = morphologyBand(raw, shapeRateHz);
    const detected = detectBeats(morphologyBand(model, modelRateHz), shape);
    const measured = (against: RejectedSpan[]) =>
      measureBeats(detected, classifyBeats(detected, shape, against), raw);
    return [
      {
        beats: measured(spans),
        shape,
        beatsWithoutSqiNet: spansWithoutSqiNet && measured(spansWithoutSqiNet),
      },
    ];
  });
}

// Beats at the same or reversed times are one beat found twice: the later one is dropped and the
// interval bridging it is not used, so no interval is <= 0.
function distinctBeats(segment: MeasuredBeat[]): { beat: MeasuredBeat; bridgesDuplicate: boolean }[] {
  const kept: { beat: MeasuredBeat; bridgesDuplicate: boolean }[] = [];
  let bridgesDuplicate = false;
  for (const beat of segment) {
    if (beat.beatClass === 'not-a-beat') continue;
    const previous = kept[kept.length - 1];
    if (previous && !(beat.peakS > previous.beat.peakS)) {
      bridgesDuplicate = true;
      continue;
    }
    kept.push({ beat, bridgesDuplicate });
    bridgesDuplicate = false;
  }
  return kept;
}

// Averaged beat as diabetes-net training computes it on a VitalDB segment: onsets in 256 Hz samples.
type AverageBeat = (
  morphology256: ArrayLike<number>,
  onsets: number[],
  normal: boolean[],
) => PulseShape | null;

function segmentShape(segment: BeatSegment, average: AverageBeat): PulseShape | null {
  const { shapeRateHz } = DSP_CONFIG.dsp2;
  const onsets: number[] = [];
  const normal: boolean[] = [];
  for (const beat of segment.beats) {
    if (beat.beatClass === 'not-a-beat' || beat.onsetS === null) continue;
    onsets.push(beat.onsetS * shapeRateHz - segment.shape.firstIndex);
    normal.push(beat.beatClass === 'normal');
  }
  return average(segment.shape.values, onsets, normal);
}

// Training averages one gap-free segment, so try segments longest first and keep the first that gives
// a shape; a long noisy stretch then cannot hide a shorter clean one.
function readingShape(segments: BeatSegment[], average: AverageBeat): PulseShape | null {
  const byLength = [...segments].sort((x, y) => y.shape.values.length - x.shape.values.length);
  for (const segment of byLength) {
    const shape = segmentShape(segment, average);
    if (shape) return shape;
  }
  return null;
}

// No interval crosses a segment gap.
function intervalsBySegment(segments: MeasuredBeat[][], startNs: number): BeatInterval[][] {
  const toNs = (peakS: number) => startNs + Math.round(peakS * 1e9);
  return segments.map((segment) => {
    const beats = distinctBeats(segment);
    return beats.slice(1).map(({ beat: to, bridgesDuplicate }, i) => {
      const from = beats[i]!.beat;
      const tNs = toNs(to.peakS);
      return {
        tNs,
        ibiMs: (tNs - toNs(from.peakS)) / 1e6,
        accepted: !bridgesDuplicate && from.beatClass !== 'artifact' && to.beatClass !== 'artifact',
        nn: !bridgesDuplicate && from.beatClass === 'normal' && to.beatClass === 'normal' && !to.longPause,
      };
    });
  });
}

// An interval spans an artifact when either beat is one, it bridges a duplicate, or it crosses a gap.
function rhythmInputs(segments: MeasuredBeat[][]) {
  const beats: MeasuredBeat[] = [];
  const spansArtifact: boolean[] = [];
  const intervalsS: number[] = [];
  for (const segment of segments) {
    distinctBeats(segment).forEach(({ beat, bridgesDuplicate }, i) => {
      const previous = beats[beats.length - 1];
      if (previous) {
        intervalsS.push(beat.peakS - previous.peakS);
        spansArtifact.push(
          i === 0 || bridgesDuplicate || previous.beatClass === 'artifact' || beat.beatClass === 'artifact',
        );
      }
      beats.push(beat);
    });
  }
  return { intervalsS, spansArtifact, atypicalBeats: beats.map((beat) => beat.beatClass === 'atypical') };
}

// RMSSD / mean interval (unitless), differencing only accepted neighbours within a segment.
function normalizedRmssdOf(bySegment: BeatInterval[][]): number | null {
  let total = 0;
  let count = 0;
  let squares = 0;
  let differences = 0;
  for (const intervals of bySegment) {
    intervals.forEach((interval, i) => {
      if (!interval.accepted) return;
      total += interval.ibiMs;
      count++;
      const previous = intervals[i - 1];
      if (!previous?.accepted) return;
      squares += (interval.ibiMs - previous.ibiMs) ** 2;
      differences++;
    });
  }
  return differences > 0 ? Math.sqrt(squares / differences) / (total / count) : null;
}

/** Full analysis of one capture, with its rejected spans. */
export function analyzeReading(
  capture: { samples: Sample[]; stats: FrameStat[] },
  context: ReadingContext,
): ReadingAnalysis {
  const timebase = buildTimebase(capture.samples, capture.stats);
  const durationS = timebase.tS[timebase.tS.length - 1]!;
  const modelRan = context.sqi !== null;
  const scoredWindows = sqiWindowsInside(context.sqi, timebase.startNs, durationS);
  const frameQuality = frameQualitySpans(timebase, capture.samples, capture.stats, modelRan);
  const otherSpans = [
    ...exposureSpans(timebase),
    ...sensorSpans(context, timebase.startNs),
    ...frameQuality.all,
  ];
  // The emergency view leaves out unscorable and frame-floor windows, so neither can raise or hide the
  // trigger.
  const notInEmergencySpans = new Set([...frameQuality.unscored, ...frameQuality.sparse]);
  const emergencyView = modelRan || frameQuality.sparse.length > 0;
  const inEmergencyView = (span: RejectedSpan) => !notInEmergencySpans.has(span);
  const byStart = (x: RejectedSpan, y: RejectedSpan) => x.startS - y.startS;
  // Frame gaps count against clean seconds only, last in LiveSession's order.
  const gapSpans = Array.from(timebase.tS.subarray(1), (tS, i) => frameGapSpan(timebase.tS[i]!, tS)).filter(
    (span) => span !== null,
  );
  const rejectedSpans = [
    ...contactSpans(timebase, capture.samples, capture.stats, false),
    ...otherSpans,
    ...gapSpans,
  ].sort(byStart);
  const clean = cleanSeconds(0, durationS, rejectedSpans);
  // Broken frames count against clean seconds but are treated as dropped when classing beats.
  const signalSpans = [...contactSpans(timebase, capture.samples, capture.stats, true), ...otherSpans].sort(
    byStart,
  );

  const bands = beatSegments(
    timebase,
    capture.samples,
    capture.stats,
    signalSpans,
    emergencyView ? signalSpans.filter(inEmergencyView) : null,
  );
  const segments = bands.map((segment) => segment.beats);
  const bySegment = intervalsBySegment(segments, timebase.startNs);
  const { intervalsS, spansArtifact, atypicalBeats } = rhythmInputs(segments);
  const windows = atypicalBeats.length > 0 ? rhythmWindows(intervalsS, spansArtifact, atypicalBeats) : [];
  const wideWindow =
    windows.length === 0 && atypicalBeats.length > 0
      ? readingWideWindow(intervalsS, spansArtifact, atypicalBeats)
      : null;
  const heartRateBpm = heartRate(segments, clean);
  const breathing = breathingRate(segments, clean);
  const pulseShape = readingShape(bands, (morphology256, onsets, normal) =>
    ensembleBeat(morphology256, onsets, normal, context.captureFps),
  );

  return {
    context,
    startNs: timebase.startNs,
    durationS,
    sqiAvailable: modelRan,
    sqiFlagged: sqiFlaggedWindows(scoredWindows),
    sqiUnscoredS: sqiUnscoredSeconds(scoredWindows, timebase.startNs, durationS, rejectedSpans),
    rejectedSpans,
    cleanSeconds: clean,
    lostSeconds: lostSecondsOf(rejectedSpans, durationS),
    segments,
    intervals: bySegment.flat(),
    heartRateBpm,
    perfusionIndexPct: perfusionIndex(segments, clean),
    breathing,
    normalizedRmssd: normalizedRmssdOf(bySegment),
    rhythmWindows: windows,
    rhythmFeatures: windows.map((window) => [...rhythmFeatureVector(window), ...rhythmV2Features(window)]),
    enoughRhythmIntervals: hasEnoughUsableIntervals(spansArtifact),
    usableRhythmIntervals: spansArtifact.filter((spans) => !spans).length,
    pulseShape,
    withoutSqiNet: emergencyView
      ? {
          intervals: intervalsBySegment(
            bands.map((band) => band.beatsWithoutSqiNet ?? band.beats),
            timebase.startNs,
          ).flat(),
          rejectedSpans: rejectedSpans.filter(inEmergencyView),
        }
      : null,
    lowQuality: {
      heartRateBpm: heartRateBpm === null ? lowQualityHeartRate(segments) : null,
      breathing: breathing === null ? breathingEstimates(segments) : null,
      pulseShape: pulseShape === null ? readingShape(bands, lowQualityEnsembleBeat) : null,
      rhythmWindow: wideWindow,
      rhythmFeatures: wideWindow && [...rhythmFeatureVector(wideWindow), ...rhythmV2Features(wideWindow)],
    },
  };
}
