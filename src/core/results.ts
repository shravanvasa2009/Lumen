import type { Tier } from './reading';

// Results JSON for one reading. A null metric missed its clean-data floor or rule gate, and its card
// shows "Not enough clean signal".

// Comes only from evidence.json.
export type EvidenceLabel = 'checked' | 'public-data' | 'experimental';
// About this one reading; low-confidence results are never flags.
export type Confidence = 'high' | 'moderate' | 'low';
export type RhythmClass = 'sinus' | 'af' | 'other';
// 'uncertain' when the top probability is under rules.uncertainBelowTopProb.
export type ReadingRhythm = RhythmClass | 'uncertain';
export type HeadlineKey =
  | 'result.regular'
  | 'result.irregularRetake'
  | 'result.possibleAf'
  | 'result.inconclusive'
  | 'result.uncertain'
  | 'result.hrOnly';
export type NotChecked = 'bp' | 'spo2' | 'heartAttack';

// Each names a standard floor that failed.
export type QualityReason =
  | { kind: 'shortClean'; haveS: number; wantS: number }
  | { kind: 'lowFps'; fps: number; wantFps: number }
  | { kind: 'noSqi' }
  | { kind: 'modelFallback' }
  // The diabetes pattern needs a Full Scan.
  | { kind: 'quickMode' }
  | { kind: 'contact'; coveredPct: number }
  | { kind: 'fewBeats'; beats: number; wantBeats: number }
  | { kind: 'fewWindows'; windows: number; wantWindows: number }
  // All three breathing estimates found but they disagree; the interval estimate alone is shown.
  | { kind: 'estimatesDisagree' }
  // The rating, not the frame rate, is below the needed tier.
  | { kind: 'phoneTier'; tier: Tier; wantTier: Tier }
  // RMSSD computed without a sinus check.
  | { kind: 'rhythmUnjudged' }
  // Advisory: flagged seconds still count as clean, and this alone caps confidence at moderate.
  | { kind: 'sqiFlagged'; windows: number; total: number }
  // SQI-Net ran but left `seconds` clean seconds unscored.
  | { kind: 'sqiUnscored'; seconds: number };
// 'low': a standard floor failed and the same math ran on the beats available.
export type MetricQuality = 'standard' | 'low';
// 'low' when any metric is; reasons are unioned, one per kind.
export interface ReadingQuality {
  level: MetricQuality;
  reasons: QualityReason[];
}
interface MetricQualityFields {
  quality: MetricQuality;
  qualityReasons: QualityReason['kind'][];
  // This metric's own floors (a heart rate's 15 s, not the diabetes pattern's 90 s).
  qualityDetails: QualityReason[];
}

// Fast regular rhythm needs only 30 clean s, so it lives on the HR card, not the rhythm card.
// It wins over fastResting since it carries the "seek care" message.
export type HrFlag = 'slowResting' | 'fastResting' | 'fastRegular';
// possibleAf: 2 of 3 readings within 24 h.
export type RhythmFlag = 'irregular' | 'possibleAf';
// Only once its accuracy target is met.
export type DiabetesFlag = 'pattern';

export interface HrMetric extends MetricQualityFields {
  value: number;
  unit: 'bpm';
  evidence: EvidenceLabel;
  confidence: Confidence;
  flag: HrFlag | null;
}
// 'rule': the logistic fallback ("basic analysis") when the model could not run.
export type RhythmScorer = 'model' | 'rule';
// class and pAF are null when a reading-wide window was too short to judge.
export interface RhythmMetric extends MetricQualityFields {
  class: RhythmClass | null;
  pAF: number | null;
  evidence: EvidenceLabel;
  scorer?: RhythmScorer; // absent in older saved readings, which were model-scored
  confidence: Confidence;
  flag: RhythmFlag | null;
}
// Never flagged.
export interface RmssdMetric extends MetricQualityFields {
  value: number;
  unit: 'ms';
  band: [number, number] | null; // personal band, null for the first 7 "learning" readings
  evidence: EvidenceLabel;
  confidence: Confidence;
}
export interface RespMetric extends MetricQualityFields {
  value: number;
  unit: 'br/min';
  evidence: EvidenceLabel;
  confidence: Confidence;
}
export interface DiabetesMetric extends MetricQualityFields {
  probability: number; // mean over readingsUsed Full Scans on different days
  readingsUsed: number;
  evidence: EvidenceLabel;
  confidence: Confidence;
  flag: DiabetesFlag | null;
}

// Extra beats and long pauses; never flagged.
export interface ExperimentalMeasurements extends MetricQualityFields {
  extraBeatsPerMin: number;
  longPauses: number;
  pulseShape: { available: boolean };
}
export interface LostSeconds {
  motion: number;
  pressure: number;
  coverage: number;
  coldHands: number;
}

// A lower-quality rate under 40 or over 150 bpm asks for a retake; the Emergency screen reads only the
// standard analysis.
export type RetakePrompt = 'shortSlow' | 'shortFast';

export interface ReadingResult {
  headlineKey: HeadlineKey;
  quality: ReadingQuality;
  retakePrompt: RetakePrompt | null;
  cleanSeconds: number;
  beats: number;
  rejectedBeats: number;
  metrics: {
    hr: HrMetric | null;
    rhythm: RhythmMetric | null;
    rmssd: RmssdMetric | null;
    resp: RespMetric | null;
    diabetes: DiabetesMetric | null;
  };
  experimental: ExperimentalMeasurements;
  lostSeconds: LostSeconds;
  notChecked: NotChecked[];
}
