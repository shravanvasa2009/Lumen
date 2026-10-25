import type { CaptureStatus, FrameStat, Sample, SampleBatch } from './capture';
import type { NsSpan, SqiScores } from './reading';

// Never assigned from interval irregularity alone.
export type BeatClass = 'not-a-beat' | 'artifact' | 'atypical' | 'normal';

// Times are seconds from capture start.
export interface ClassifiedBeat {
  peakS: number;
  // null when nothing rises before the peak.
  onsetS: number | null;
  beatClass: BeatClass;
  longPause: boolean; // long pause on the interval ending at this beat: kept for rhythm, not HRV
}

// Shown one at a time.
export type CoachingKey = 'coach.cover' | 'coach.lighter' | 'coach.still' | 'coach.warm' | 'coach.flat';

// Acquisition causes; quality = SQI-rejected window, exposure = the 1 s after a change.
export type RejectionReason =
  'motion' | 'pressure' | 'coverage' | 'coldHands' | 'quality' | 'clipping' | 'exposure';

// Greyed out and labeled on the live waveform.
export interface RejectedSpan {
  startS: number;
  endS: number;
  reason: RejectionReason;
}

// SQI-Net v1 input [1, 256]: -R, 4 s at 64 Hz, z-scored.
export interface SqiWindow {
  endS: number;
  input: Float32Array;
}

// Fed by the app's CaptureController.
export interface LiveSession {
  pushSamples(batch: SampleBatch): void;
  pushStatus(status: CaptureStatus): void;
  // Pass sqiWindow.endS unchanged. Advisory: a low score tags the reading and rejects nothing.
  setSqi(windowEndS: number, pClean: number): void;
  readonly cleanSeconds: number;
  // Live PI in % over the last live.perfusionWindowS of covered, gap-free frames; null until available.
  readonly perfusionPct: number | null;
  readonly recentWaveform: { tS: number[]; ppg: number[] }; // last 6 s
  readonly coachingKey: CoachingKey | null;
  readonly rejectedSpans: RejectedSpan[];
  readonly sqiWindow: SqiWindow | null; // null until 4 s of covered signal exists
  // Everything analyzeReading needs, so the saved result matches the live screen. Open spans close at
  // the newest frame.
  readingInput(): {
    capture: { samples: Sample[]; stats: FrameStat[] };
    motionSpans: NsSpan[];
    coldHandsSpans: NsSpan[];
    sqi: SqiScores | null;
  };
}
