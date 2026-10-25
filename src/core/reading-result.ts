import { DSP_CONFIG } from './config';
import { median } from './median';
import type { ReadingAnalysis, Tier } from './reading';
import { hrv, lowQualityRmssd } from './reading-metrics';
import { judgesRhythm } from './rhythm-features';
import type {
  Confidence,
  DiabetesMetric,
  EvidenceLabel,
  ExperimentalMeasurements,
  HeadlineKey,
  HrFlag,
  HrMetric,
  MetricQuality,
  QualityReason,
  ReadingQuality,
  ReadingResult,
  ReadingRhythm,
  RespMetric,
  RetakePrompt,
  RhythmClass,
  RhythmMetric,
  RhythmScorer,
  RmssdMetric,
} from './results';

// Rhythm model output per row of rhythmModelRows, in the manifest's label order: sinus, af, other.
export interface RhythmOutputs {
  windowProbs: [number, number, number][];
  tauAf: number; // the manifest threshold for reading-level P(AF)
  scorer?: RhythmScorer; // absent in older saved readings, which were model-scored
}
export interface DiabetesOutputs {
  probability: number;
  tauDm: number;
}
// Models run in the app or replay, never in core; null when a model did not run.
export interface ModelOutputs {
  rhythm: RhythmOutputs | null;
  diabetes: DiabetesOutputs | null;
}

// docs/validation/evidence.json; only label and passed are read.
export interface EvidenceFile {
  metrics: Record<string, { label: string; passed?: boolean } | undefined>;
}

export interface Profile {
  athlete: boolean;
  betaBlocker: boolean;
  pacemaker: boolean; // turns rhythm screening off
  knownAf: boolean; // "rhythm tracking": no rhythm flags
}

// What earlier saved readings contribute to the history rules.
export interface PastReading {
  atMs: number;
  rhythmPositive: boolean; // that reading's irregular rule fired
  rmssdMs: number | null;
  diabetes: { day: string; probability: number; confidence: Confidence } | null;
}

export const RHYTHM_CLASSES: readonly RhythmClass[] = ['sinus', 'af', 'other'];
const LEVELS: Confidence[] = ['low', 'moderate', 'high'];
const lowest = (...levels: Confidence[]): Confidence =>
  LEVELS[Math.min(...levels.map((level) => LEVELS.indexOf(level)))]!;

interface Graded<T> {
  metric: T;
  reasons: QualityReason[];
}

// A metric's tag from the standard floors it failed.
function tag(reasons: QualityReason[]): {
  quality: MetricQuality;
  qualityReasons: QualityReason['kind'][];
  qualityDetails: QualityReason[];
} {
  const own = unique(reasons);
  return {
    quality: own.length > 0 ? 'low' : 'standard',
    qualityReasons: own.map((reason) => reason.kind),
    qualityDetails: own,
  };
}

// A lower-quality value is capped at low confidence, unless only `advisory` reasons tagged it
// (readingConfidence already caps those at moderate).
function graded(
  reasons: QualityReason[],
  confidence: Confidence,
  advisory: readonly QualityReason['kind'][] = ['sqiFlagged', 'sqiUnscored'],
) {
  const floorMissed = reasons.some((reason) => !advisory.includes(reason.kind));
  return { ...tag(reasons), confidence: floorMissed ? ('low' as const) : confidence };
}

// SQI-Net is advisory: only a reading mostly flagged by it is tagged.
function sqiReasons(analysis: ReadingAnalysis): QualityReason[] {
  const flagged = analysis.sqiFlagged;
  const mostlyFlagged =
    flagged !== null &&
    flagged.total > 0 &&
    flagged.windows / flagged.total >= DSP_CONFIG.dsp3.sqiFlaggedTagShare;
  return mostlyFlagged ? [{ kind: 'sqiFlagged', ...flagged }] : [];
}

// SQI-Net is the only check that tells noise from a pulse, so a rate it never fully scored is tagged.
function unscoredReasons(analysis: ReadingAnalysis): QualityReason[] {
  if (!analysis.sqiAvailable) return [{ kind: 'noSqi' }];
  const seconds = analysis.sqiUnscoredS ?? 0;
  return seconds > DSP_CONFIG.dsp3.sqiUnscoredMaxS ? [{ kind: 'sqiUnscored', seconds }] : [];
}

const shortClean = (analysis: ReadingAnalysis, wantS: number): QualityReason[] =>
  analysis.cleanSeconds < wantS ? [{ kind: 'shortClean', haveS: analysis.cleanSeconds, wantS }] : [];
// lowFps when the format is slower than wantFps, else phoneTier when the rating is below `needed`.
// A non-finite or non-positive rate counts as 0 fps so the Results JSON never holds NaN or Infinity.
function rateReasons(analysis: ReadingAnalysis, needed: Tier, wantFps: number): QualityReason[] {
  const { captureFps } = analysis.context;
  const fps = Number.isFinite(captureFps) && captureFps > 0 ? captureFps : 0;
  if (fps < wantFps) return [{ kind: 'lowFps', fps, wantFps }];
  return tierAtLeast(analysis, needed)
    ? []
    : [{ kind: 'phoneTier', tier: effectiveTier(analysis), wantTier: needed }];
}

// Tier gate alone, for breathing.
function tierReasons(analysis: ReadingAnalysis, needed: Tier, wantFps: number): QualityReason[] {
  return tierAtLeast(analysis, needed) ? [] : rateReasons(analysis, needed, wantFps);
}

// A label only when evidence.json states it and passed is true.
function evidenceLabel(evidence: EvidenceFile, metric: string): EvidenceLabel {
  const entry = evidence.metrics[metric];
  if (entry?.passed !== true) return 'experimental';
  return entry.label === 'checked' || entry.label === 'public-data' ? entry.label : 'experimental';
}

// An unrated phone is judged by its frame rate alone.
const TIER_ORDER: Tier[] = ['limited', 'basic', 'full'];
function effectiveTier(analysis: ReadingAnalysis): Tier {
  const { tier, captureFps } = analysis.context;
  return tier ?? (captureFps >= 60 ? 'full' : captureFps >= 30 ? 'basic' : 'limited');
}
function tierAtLeast(analysis: ReadingAnalysis, needed: Tier): boolean {
  return TIER_ORDER.indexOf(effectiveTier(analysis)) >= TIER_ORDER.indexOf(needed);
}

// Clean coverage, capped at moderate when SQI is missing or flagged, or on a Limited or unrated phone.
function readingConfidence(analysis: ReadingAnalysis): Confidence {
  const { highCoverage, moderateCoverage } = DSP_CONFIG.confidence;
  const coverage = analysis.durationS > 0 ? analysis.cleanSeconds / analysis.durationS : 0;
  const fromCoverage: Confidence =
    coverage >= highCoverage ? 'high' : coverage >= moderateCoverage ? 'moderate' : 'low';
  const { tier } = analysis.context;
  const capped =
    unscoredReasons(analysis).length > 0 ||
    sqiReasons(analysis).length > 0 ||
    tier === null ||
    tier === 'limited';
  return capped ? lowest(fromCoverage, 'moderate') : fromCoverage;
}

// Why readingConfidence is below high; null for an unrated phone, which has no reason to name.
function confidenceReasons(analysis: ReadingAnalysis): QualityReason[] | null {
  const { tier } = analysis.context;
  if (tier === null) return null;
  const coverage = analysis.durationS > 0 ? analysis.cleanSeconds / analysis.durationS : 0;
  const reasons: QualityReason[] = [];
  if (coverage < DSP_CONFIG.confidence.highCoverage)
    reasons.push({ kind: 'contact', coveredPct: 100 * coverage });
  reasons.push(...unscoredReasons(analysis), ...sqiReasons(analysis));
  if (tier === 'limited') reasons.push(...rateReasons(analysis, 'basic', 30));
  return reasons;
}

function hrFlag(
  analysis: ReadingAnalysis,
  bpm: number,
  profile: Profile,
  confidence: Confidence,
): HrFlag | null {
  const rules = DSP_CONFIG.rules;
  if (
    confidence === 'low' ||
    !analysis.context.restTimerDone ||
    analysis.cleanSeconds < rules.restingMinCleanS
  )
    return null;
  const [fastRegularLow, fastRegularHigh] = rules.fastRegularBpm as [number, number];
  const veryRegular =
    analysis.normalizedRmssd !== null && analysis.normalizedRmssd < rules.fastRegularMaxNormalizedRmssd;
  if (bpm >= fastRegularLow && bpm <= fastRegularHigh && veryRegular) return 'fastRegular';
  if (bpm > rules.fastRestingBpm) return 'fastResting';
  const slowBelow =
    profile.athlete || profile.betaBlocker ? rules.slowRestingAdjustedBpm : rules.slowRestingBpm;
  return bpm < slowBelow ? 'slowResting' : null;
}

// Below its floors, the low-quality rate with the floor it missed.
function hrMetric(
  analysis: ReadingAnalysis,
  evidence: EvidenceFile,
  profile: Profile,
  confidence: Confidence,
): Graded<HrMetric> | null {
  const lowBpm = analysis.lowQuality.heartRateBpm;
  const bpm = analysis.heartRateBpm ?? lowBpm;
  if (bpm === null) return null;
  const { minCleanS } = DSP_CONFIG.dsp11;
  const reasons = [...sqiReasons(analysis), ...unscoredReasons(analysis)];
  if (analysis.heartRateBpm === null) {
    reasons.push(...shortClean(analysis, minCleanS));
    // Enough clean time, but the accepted intervals spanned under minCleanS.
    if (!reasons.some((reason) => reason.kind === 'shortClean'))
      reasons.push({
        kind: 'fewBeats',
        beats: analysis.intervals.filter((interval) => interval.accepted).length,
        wantBeats: Math.ceil((minCleanS * bpm) / 60),
      });
  }
  // Unscored is capped at moderate like sqiFlagged, so its flags still show.
  const grade = graded(reasons, confidence, ['sqiFlagged', 'sqiUnscored', 'noSqi']);
  const metric: HrMetric = {
    value: bpm,
    unit: 'bpm',
    evidence: evidenceLabel(evidence, 'hr'),
    ...grade,
    flag: hrFlag(analysis, bpm, profile, grade.confidence),
  };
  return { metric, reasons };
}

interface RhythmCall {
  metric: RhythmMetric;
  topProb: number | null; // null with no class
  positive: boolean; // the irregular rule fired (before the 2-of-3 rule)
  reasons: QualityReason[];
}

/** True when a row holds one probability per class, summing to 1. */
export function isProbabilityRow(row: readonly number[]): boolean {
  if (row.length !== RHYTHM_CLASSES.length) return false;
  let total = 0;
  for (let c = 0; c < row.length; c++) {
    const probability = row[c];
    if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) return false;
    total += probability;
  }
  return Math.abs(total - 1) <= DSP_CONFIG.rules.rhythmRowSumTolerance;
}

/** Rhythm model input rows: the rhythm windows, else the reading-wide one. */
export function rhythmModelRows(analysis: ReadingAnalysis): number[][] {
  if (analysis.rhythmFeatures.length > 0) return analysis.rhythmFeatures;
  return analysis.lowQuality.rhythmFeatures ? [analysis.lowQuality.rhythmFeatures] : [];
}

// Mean probabilities over rows and the rhythm floors missed; null when there is no rhythm card.
function readingRhythmProbs(
  analysis: ReadingAnalysis,
  outputs: RhythmOutputs | null,
  profile: Profile,
): { probs: number[]; judged: boolean; reasons: QualityReason[] } | null {
  const rows = rhythmModelRows(analysis).length;
  if (outputs && outputs.windowProbs.length !== rows)
    throw new RangeError(`${rows} rhythm rows but ${outputs.windowProbs.length} probability rows`);
  // A NaN here would reach the card as a class-less "irregular, retake".
  if (outputs && !outputs.windowProbs.every(isProbabilityRow))
    throw new RangeError('each rhythm window needs sinus, af, other probabilities that sum to 1');
  if (!outputs || profile.pacemaker || rows === 0) return null;

  const { minUsableIntervals } = DSP_CONFIG.dsp15;
  const reasons = [...sqiReasons(analysis), ...shortClean(analysis, DSP_CONFIG.rules.rhythmMinCleanS)];
  if (!analysis.enoughRhythmIntervals)
    reasons.push({ kind: 'fewBeats', beats: analysis.usableRhythmIntervals, wantBeats: minUsableIntervals });
  if (analysis.rhythmFeatures.length === 0) reasons.push({ kind: 'fewWindows', windows: 0, wantWindows: 1 });
  if (outputs.scorer === 'rule') reasons.push({ kind: 'modelFallback' });
  const probs = RHYTHM_CLASSES.map((_, c) => {
    let total = 0;
    for (const row of outputs.windowProbs) total += row[c]!;
    return total / rows;
  });
  const wide = analysis.lowQuality.rhythmWindow;
  const judged = analysis.rhythmFeatures.length > 0 || wide === null || judgesRhythm(wide);
  return { probs, judged, reasons };
}

// First class wins a tie.
const topClass = (probs: number[]) => probs.indexOf(Math.max(...probs));

/** The rhythm decision that gates HRV and diabetes-net's hrSummary; null when no class was judged. */
export function readingRhythm(
  analysis: ReadingAnalysis,
  outputs: RhythmOutputs | null,
  profile: Profile,
): ReadingRhythm | null {
  // Replay validation only; null in the app.
  if (outputs === null) return analysis.context.validationRhythmLabel;
  const call = readingRhythmProbs(analysis, outputs, profile);
  if (!call?.judged) return null;
  const top = topClass(call.probs);
  return call.probs[top]! >= DSP_CONFIG.rules.uncertainBelowTopProb ? RHYTHM_CLASSES[top]! : 'uncertain';
}

function rhythmCall(
  analysis: ReadingAnalysis,
  outputs: RhythmOutputs | null,
  evidence: EvidenceFile,
  profile: Profile,
  history: PastReading[],
  confidence: Confidence,
): RhythmCall | null {
  const rules = DSP_CONFIG.rules;
  const call = readingRhythmProbs(analysis, outputs, profile);
  if (!outputs || !call) return null;
  if (!call.judged) {
    // "Too short to judge the rhythm": a card with no class, probability, or flag.
    const metric: RhythmMetric = {
      class: null,
      pAF: null,
      evidence: outputs.scorer === 'rule' ? 'experimental' : evidenceLabel(evidence, 'rhythm'),
      scorer: outputs.scorer,
      ...graded(call.reasons, confidence),
      flag: null,
    };
    return { metric, topProb: null, positive: false, reasons: call.reasons };
  }
  const { probs } = call;
  const top = topClass(probs);
  const topProb = probs[top]!;
  const fromProb: Confidence =
    topProb >= DSP_CONFIG.confidence.highTopProb
      ? 'high'
      : topProb >= rules.uncertainBelowTopProb
        ? 'moderate'
        : 'low';
  const pAF = probs[1]!;
  // A confident irregular call shows even on a lower-confidence reading, tagged with why.
  // An unrated phone still holds it back.
  const shortfall = confidence === 'high' ? [] : confidenceReasons(analysis);
  const positive =
    topProb >= rules.uncertainBelowTopProb &&
    pAF >= outputs.tauAf &&
    fromProb === 'high' &&
    shortfall !== null;
  const reasons = positive ? [...call.reasons, ...(shortfall ?? [])] : call.reasons;
  const grade = graded(reasons, lowest(confidence, fromProb));

  let flag: RhythmMetric['flag'] = null;
  if (positive && !profile.knownAf) {
    flag = 'irregular';
    const now = analysis.context.recordedAt?.ms;
    if (now !== undefined) {
      const recent = history
        .filter((past) => past.atMs < now && now - past.atMs <= rules.possibleAfWindowHours * 3_600_000)
        .sort((x, y) => y.atMs - x.atMs)
        .slice(0, rules.possibleAfReadings - 1);
      if (1 + recent.filter((past) => past.rhythmPositive).length >= rules.possibleAfPositives)
        flag = 'possibleAf';
    }
  }
  return {
    metric: {
      class: RHYTHM_CLASSES[top]!,
      pAF,
      // evidence.json describes the model, not the fallback rule.
      evidence: outputs.scorer === 'rule' ? 'experimental' : evidenceLabel(evidence, 'rhythm'),
      scorer: outputs.scorer,
      ...grade,
      flag,
    },
    topProb,
    positive,
    reasons,
  };
}

// Linear interpolation between order statistics, as numpy's default percentile.
function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.min(sorted.length - 1, below + 1);
  return sorted[below]! + (position - below) * (sorted[above]! - sorted[below]!);
}

// Median +/- 1.5 IQR of earlier values, after the "learning" readings.
function personalBand(values: number[]): [number, number] | null {
  const { personalBandMinReadings, personalBandIqrs } = DSP_CONFIG.rules;
  if (values.length < personalBandMinReadings) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const middle = median(sorted);
  return [middle - personalBandIqrs * iqr, middle + personalBandIqrs * iqr];
}

// HRV needs sinus rhythm, a Full tier, and the fps floor; without a judged rhythm it gets the
// low-quality RMSSD. A non-sinus rhythm gets none.
function rmssdMetric(
  analysis: ReadingAnalysis,
  models: ModelOutputs,
  rhythm: RhythmCall | null,
  evidence: EvidenceFile,
  profile: Profile,
  history: PastReading[],
  confidence: Confidence,
): Graded<RmssdMetric> | null {
  const rhythmClass = readingRhythm(analysis, models.rhythm, profile);
  if (rhythmClass !== null && rhythmClass !== 'sinus') return null;
  if (rhythmClass === null && profile.pacemaker) return null;
  const { captureFps } = analysis.context;
  const config = DSP_CONFIG.dsp12;
  const reasons: QualityReason[] =
    rhythmClass === null ? [{ kind: 'rhythmUnjudged' }] : [...(rhythm?.reasons ?? [])];
  reasons.push(...rateReasons(analysis, 'full', config.minFps));

  let value = reasons.every((reason) => reason.kind === 'sqiFlagged')
    ? (hrv(analysis.segments, 'sinus', captureFps, analysis.cleanSeconds)?.rmssdMs ?? null)
    : null;
  if (value === null) {
    const low = lowQualityRmssd(analysis.segments);
    if (low === null) return null;
    value = low.rmssdMs;
    reasons.push(...shortClean(analysis, config.rmssdMinCleanS));
    if (low.nnIntervals < config.rmssdMinIntervals)
      reasons.push({ kind: 'fewBeats', beats: low.nnIntervals, wantBeats: config.rmssdMinIntervals });
  }
  const earlier = history.flatMap((past) => (past.rmssdMs === null ? [] : [past.rmssdMs]));
  const kept = unique([...reasons, ...sqiReasons(analysis)]);
  const metric: RmssdMetric = {
    value,
    unit: 'ms',
    band: personalBand(earlier),
    evidence: evidenceLabel(evidence, 'hrv'),
    ...graded(kept, confidence),
  };
  return { metric, reasons: kept };
}

// Falls back to the interval estimate alone on a Limited phone or when the three estimates disagree.
function respMetric(
  analysis: ReadingAnalysis,
  evidence: EvidenceFile,
  confidence: Confidence,
): Graded<RespMetric> | null {
  const estimates = analysis.breathing ?? analysis.lowQuality.breathing;
  const value = estimates?.rateBrpm ?? estimates?.intervalBrpm ?? null;
  if (estimates === null || value === null) return null;
  const reasons: QualityReason[] = [
    ...sqiReasons(analysis),
    ...shortClean(analysis, DSP_CONFIG.dsp13.minCleanS),
    ...tierReasons(analysis, 'basic', 30),
  ];
  if (estimates.rateBrpm === null) {
    const found = [estimates.intensityBrpm, estimates.amplitudeBrpm, estimates.intervalBrpm].filter(
      (brpm) => brpm !== null,
    ).length;
    reasons.push(
      found === 3 ? { kind: 'estimatesDisagree' } : { kind: 'fewWindows', windows: found, wantWindows: 3 },
    );
  }
  const metric: RespMetric = {
    value,
    unit: 'br/min',
    evidence: evidenceLabel(evidence, 'resp'),
    ...graded(reasons, confidence),
  };
  return { metric, reasons };
}

function diabetesMetric(
  analysis: ReadingAnalysis,
  rhythm: RhythmCall | null,
  outputs: DiabetesOutputs | null,
  evidence: EvidenceFile,
  history: PastReading[],
  confidence: Confidence,
): Graded<DiabetesMetric> | null {
  const rules = DSP_CONFIG.rules;
  const { mode, recordedAt } = analysis.context;
  if (!outputs || (mode !== 'full' && mode !== 'quick')) return null;
  const reasons: QualityReason[] = [
    ...(mode === 'quick' ? [{ kind: 'quickMode' } as const] : []),
    ...sqiReasons(analysis),
    ...rateReasons(analysis, 'full', 60),
    ...shortClean(analysis, rules.diabetesMinCleanS),
    // The rhythm call feeds diabetes-net's HRV summary.
    ...(rhythm?.reasons ?? []),
  ];
  const lowShape = analysis.pulseShape === null ? analysis.lowQuality.pulseShape : null;
  if (lowShape !== null) {
    const { minFps, minNormalBeats } = DSP_CONFIG.dsp14;
    reasons.push(...rateReasons(analysis, 'full', minFps));
    if (lowShape.beatsUsed < minNormalBeats)
      reasons.push({ kind: 'fewBeats', beats: lowShape.beatsUsed, wantBeats: minNormalBeats });
  }
  const kept = unique(reasons);
  const grade = graded(kept, confidence);
  const earlier = history.flatMap((past) => (past.diabetes ? [past.diabetes] : []));
  const readings = [
    { day: recordedAt?.day ?? null, probability: outputs.probability, confidence: grade.confidence },
    ...earlier,
  ];
  let total = 0;
  for (const reading of readings) total += reading.probability;
  const probability = total / readings.length;
  const days = new Set(readings.map((reading) => reading.day).filter((day) => day !== null));
  const label = evidenceLabel(evidence, 'diabetes');
  // Flags only once evidence.json records the accuracy target as met (public-data, passed).
  const flagged =
    grade.quality === 'standard' &&
    label === 'public-data' &&
    days.size >= rules.diabetesMinReadings &&
    readings.every((reading) => reading.confidence !== 'low') &&
    probability >= outputs.tauDm;
  const metric: DiabetesMetric = {
    probability,
    readingsUsed: readings.length,
    evidence: label,
    ...grade,
    flag: flagged ? 'pattern' : null,
  };
  return { metric, reasons: kept };
}

// Extra beats and long pauses share the rhythm card's clean-time floor.
function experimentalMeasurements(analysis: ReadingAnalysis): Graded<ExperimentalMeasurements> {
  const beats = analysis.segments.flat().filter((beat) => beat.beatClass !== 'not-a-beat');
  const atypical = beats.filter((beat) => beat.beatClass === 'atypical').length;
  const reasons = [...sqiReasons(analysis), ...shortClean(analysis, DSP_CONFIG.rules.rhythmMinCleanS)];
  const metric: ExperimentalMeasurements = {
    extraBeatsPerMin: analysis.cleanSeconds > 0 ? atypical / (analysis.cleanSeconds / 60) : 0,
    longPauses: beats.filter((beat) => beat.longPause).length,
    pulseShape: { available: (analysis.pulseShape ?? analysis.lowQuality.pulseShape) !== null },
    ...tag(reasons),
  };
  return { metric, reasons };
}

// One reason per kind, keeping the strictest (a 90 s floor over a 60 s one).
function unique(reasons: QualityReason[]): QualityReason[] {
  const asks = (reason: QualityReason) =>
    reason.kind === 'shortClean'
      ? reason.wantS
      : reason.kind === 'lowFps'
        ? reason.wantFps
        : reason.kind === 'fewBeats'
          ? reason.wantBeats
          : reason.kind === 'fewWindows'
            ? reason.wantWindows
            : reason.kind === 'contact'
              ? -reason.coveredPct
              : reason.kind === 'phoneTier'
                ? TIER_ORDER.indexOf(reason.wantTier)
                : 0;
  const byKind = new Map<QualityReason['kind'], QualityReason>();
  for (const reason of reasons) {
    const kept = byKind.get(reason.kind);
    if (!kept || asks(reason) > asks(kept)) byKind.set(reason.kind, reason);
  }
  return [...byKind.values()];
}

function headline(hr: HrMetric | null, rhythm: RhythmCall | null): HeadlineKey {
  if (!hr) return 'result.inconclusive';
  if (rhythm?.metric.flag === 'possibleAf') return 'result.possibleAf';
  if (rhythm?.metric.flag === 'irregular') return 'result.irregularRetake';
  // Rhythm not judged (pacemaker or no model): state only the rate rather than claim a rhythm.
  if (!rhythm || rhythm.topProb === null) return 'result.hrOnly';
  if (rhythm.topProb < DSP_CONFIG.rules.uncertainBelowTopProb) return 'result.uncertain';
  return rhythm.metric.class === 'sinus' ? 'result.regular' : 'result.irregularRetake';
}

// A low-quality rate (under 15 clean s) past the emergency levels asks for a retake now. Standard
// rates go through emergencyHeartRate instead.
function retakePrompt(analysis: ReadingAnalysis, hr: HrMetric | null): RetakePrompt | null {
  if (hr === null || analysis.heartRateBpm !== null) return null;
  const { slowBpm, fastBpm } = DSP_CONFIG.rules.emergency;
  return hr.value < slowBpm ? 'shortSlow' : hr.value > fastBpm ? 'shortFast' : null;
}

/** Results JSON for one reading: decision rules, clean-data floors, confidence, and quality tags. */
export function buildReadingResult(
  analysis: ReadingAnalysis,
  models: ModelOutputs,
  evidence: EvidenceFile,
  profile: Profile,
  history: PastReading[],
): ReadingResult {
  const confidence = readingConfidence(analysis);
  const hr = hrMetric(analysis, evidence, profile, confidence);
  const rhythm = rhythmCall(analysis, models.rhythm, evidence, profile, history, confidence);
  const rmssd = rmssdMetric(analysis, models, rhythm, evidence, profile, history, confidence);
  const resp = respMetric(analysis, evidence, confidence);
  const diabetes = diabetesMetric(analysis, rhythm, models.diabetes, evidence, history, confidence);
  const experimental = experimentalMeasurements(analysis);

  const beats = analysis.segments.flat().filter((beat) => beat.beatClass !== 'not-a-beat');
  const reasons = unique(
    [hr, rhythm, rmssd, resp, diabetes, experimental].flatMap((graded) => graded?.reasons ?? []),
  );
  const quality: ReadingQuality = { level: reasons.length > 0 ? 'low' : 'standard', reasons };
  return {
    headlineKey: headline(hr?.metric ?? null, rhythm),
    quality,
    retakePrompt: retakePrompt(analysis, hr?.metric ?? null),
    cleanSeconds: analysis.cleanSeconds,
    beats: beats.length,
    rejectedBeats: beats.filter((beat) => beat.beatClass === 'artifact').length,
    metrics: {
      hr: hr?.metric ?? null,
      rhythm: rhythm?.metric ?? null,
      rmssd: rmssd?.metric ?? null,
      resp: resp?.metric ?? null,
      diabetes: diabetes?.metric ?? null,
    },
    experimental: experimental.metric,
    lostSeconds: analysis.lostSeconds,
    notChecked: ['bp', 'spo2', 'heartAttack'],
  };
}
