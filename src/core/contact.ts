import type { FrameStat, Sample } from './capture';
import { DSP_CONFIG } from './config';
import type { RejectionReason } from './live-session';

// Shared by analyzeReading and LiveSession so both reject the same frames.

// Channel means are 0..1; anything else (NaN, Infinity, a 0-255 value) is a broken frame, treated as
// dropped.
export function validChannels(sample: Sample): boolean {
  return [sample.r, sample.g, sample.b].every((channel) => channel >= 0 && channel <= 1);
}

/** Finger coverage per frame: null when covered, "clipping" if only the clip limit fails, else "coverage". */
export function frameProblem(sample: Sample, stat: FrameStat): RejectionReason | null {
  const { minRedRatio, minRedMean, maxSpatialStdR, maxClipFrac } = DSP_CONFIG.dsp4;
  const covered =
    validChannels(sample) &&
    [stat.spatialStdR, stat.clipFrac].every(Number.isFinite) &&
    sample.r >= minRedRatio * (sample.g + sample.b) &&
    sample.r >= minRedMean &&
    stat.spatialStdR <= maxSpatialStdR;
  if (!covered) return 'coverage';
  return stat.clipFrac > maxClipFrac ? 'clipping' : null;
}
