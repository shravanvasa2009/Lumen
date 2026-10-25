import { DSP_CONFIG } from './config';
import type { Tier } from './reading';

// Lumen Compatibility Rating: a points score and the tier it earns.

// The DeviceProbe `Capabilities` fields the rating reads; core cannot import the module's type.
export interface RatingCapabilities {
  rearLenses: { id: string; maxFps: number; torchUsable: boolean }[];
  torch: { available: boolean };
  locks: { exposure: boolean; whiteBalance: boolean; focus: boolean };
}

export interface RatingMeasures {
  lensId: string | null; // null on the phone check, before lens selection
  achievedFps: number | null; // frames per second actually delivered in practice
  frameIntervalSdMs: number | null; // SD of frame intervals in practice
  // Practice PI (%) and SNR (dB). 'no-pulse': none even in ambient mode after two tries; null: not yet.
  coupling: { perfusionIndexPct: number; snrDb: number } | 'no-pulse' | null;
}

export type RatingTier = Tier | 'unsupported';
export type HardFail = 'no-rear-camera' | 'below-24-fps' | 'no-pulse';
// Basic's Full Scan omits HRV and pulse shape because those keys are absent.
export type RatingMode =
  | 'quickCheck'
  | 'rhythmFlags'
  | 'breathing'
  | 'standingTest'
  | 'extraBeats'
  | 'hrv'
  | 'deepHrv'
  | 'pulseShape'
  | 'diabetes'
  | 'fullScan';

export interface DeviceRating {
  components: { frameRate: number; coupling: number | null; locks: number; timing: number };
  score: number; // before practice, the phone check's capability points
  fpsLevel: number | null; // the frame-rate level reached; null on a hard fail
  ambient: boolean;
  tier: RatingTier | null; // null until coupling is measured, unless a hard fail already decides it
  hardFail: HardFail | null;
  unlocks: readonly RatingMode[];
}

const UNLOCKS: Record<RatingTier, readonly RatingMode[]> = {
  full: [
    'quickCheck',
    'rhythmFlags',
    'breathing',
    'standingTest',
    'extraBeats',
    'hrv',
    'deepHrv',
    'pulseShape',
    'diabetes',
    'fullScan',
  ],
  basic: ['quickCheck', 'rhythmFlags', 'breathing', 'standingTest', 'extraBeats', 'fullScan'],
  // Quick Check at confidence <= moderate, so no rhythm flags.
  limited: ['quickCheck'],
  unsupported: [],
};

/** Modes a tier unlocks. */
export function tierUnlocks(tier: RatingTier): readonly RatingMode[] {
  return UNLOCKS[tier];
}

function frameRateLevel(
  formatFps: number,
  achievedFps: number | null,
): { minFps: number; points: number } | null {
  const { fpsLevels, achievedFpsToleranceFps } = DSP_CONFIG.rating;
  const reached = fpsLevels.find(
    ({ minFps }) =>
      formatFps >= minFps && (achievedFps === null || achievedFps >= minFps - achievedFpsToleranceFps),
  );
  return reached ?? null;
}

function couplingFactors(perfusionIndexPct: number, snrDb: number): [number, number] {
  const config = DSP_CONFIG.rating;
  const piFactor = Math.min(1, Math.max(0, perfusionIndexPct / config.couplingFullPiPct));
  // Negative SNR scores 0, not negative points.
  const snrFactor = Math.min(1, Math.max(0, snrDb / config.couplingFullSnrDb));
  return [piFactor, snrFactor];
}

/** Coupling level in 0..1 for the practice meter; 0 with no pulse (null SNR). */
export function couplingFactor(perfusionIndexPct: number, snrDb: number | null): number {
  if (snrDb === null) return 0;
  const [piFactor, snrFactor] = couplingFactors(perfusionIndexPct, snrDb);
  return piFactor * snrFactor;
}

function couplingPoints(perfusionIndexPct: number, snrDb: number): number {
  const [piFactor, snrFactor] = couplingFactors(perfusionIndexPct, snrDb);
  // (points x PI) x SNR in this order; 35 x (PI x SNR) can land just under a whole number and floor a
  // point away. Floored so components never round up a tier.
  return Math.floor(DSP_CONFIG.rating.couplingPoints * piFactor * snrFactor);
}

function lockPoints(locks: RatingCapabilities['locks']): number {
  const config = DSP_CONFIG.rating;
  // No fixed-focus field, so a fixed-focus lens scores only if locks.focus is reported true.
  return (
    (locks.exposure ? config.exposureLockPoints : 0) +
    (locks.whiteBalance ? config.whiteBalanceLockPoints : 0) +
    (locks.focus ? config.focusLockPoints : 0)
  );
}

function timingPoints(frameIntervalSdMs: number | null): number {
  if (frameIntervalSdMs === null) return 0;
  const reached = DSP_CONFIG.rating.timingLevels.find(({ belowSdMs }) => frameIntervalSdMs < belowSdMs);
  return reached === undefined ? 0 : reached.points;
}

function tierFor(score: number, fpsLevel: number, ambient: boolean): RatingTier {
  const config = DSP_CONFIG.rating;
  // Ambient-light mode is Limited at any score.
  if (ambient) return 'limited';
  if (score < config.limitedMinScore) return 'unsupported';
  if (score >= config.fullMinScore && fpsLevel >= config.fullMinFps) return 'full';
  if (score >= config.basicMinScore && fpsLevel >= config.basicMinFps) return 'basic';
  return 'limited';
}

/** Lumen Compatibility Rating (score, tier, and unlocked modes) from the probe and practice. */
export function rateDevice(capabilities: RatingCapabilities, measures: RatingMeasures): DeviceRating {
  const torchLenses = capabilities.rearLenses.filter((lens) => lens.torchUsable);
  let lens: RatingCapabilities['rearLenses'][number] | undefined;
  if (measures.lensId === null) {
    // Fastest keepable lens, preferring one with a torch.
    const candidates = torchLenses.length > 0 ? torchLenses : capabilities.rearLenses;
    lens = candidates.reduce<typeof lens>(
      (best, candidate) => (best === undefined || candidate.maxFps > best.maxFps ? candidate : best),
      undefined,
    );
  } else {
    lens = capabilities.rearLenses.find((candidate) => candidate.id === measures.lensId);
    if (lens === undefined) throw new Error(`rateDevice: lens ${measures.lensId} is not in the probe`);
  }

  const frameRateMatch = lens === undefined ? null : frameRateLevel(lens.maxFps, measures.achievedFps);
  const fpsLevel = frameRateMatch === null ? null : frameRateMatch.minFps;
  const { ambientBelowCouplingPoints } = DSP_CONFIG.rating;
  const coupling =
    measures.coupling === null
      ? null
      : measures.coupling === 'no-pulse'
        ? 0
        : couplingPoints(measures.coupling.perfusionIndexPct, measures.coupling.snrDb);
  const components = {
    frameRate: frameRateMatch === null ? 0 : frameRateMatch.points,
    coupling,
    locks: lockPoints(capabilities.locks),
    timing: timingPoints(measures.frameIntervalSdMs),
  };
  const score = components.frameRate + (coupling ?? 0) + components.locks + components.timing;
  // No torch or weak coupling means ambient-light mode.
  const ambient =
    !capabilities.torch.available ||
    lens === undefined ||
    !lens.torchUsable ||
    (coupling !== null && coupling < ambientBelowCouplingPoints);

  const hardFail: HardFail | null =
    lens === undefined
      ? 'no-rear-camera'
      : fpsLevel === null
        ? 'below-24-fps'
        : measures.coupling === 'no-pulse'
          ? 'no-pulse'
          : null;
  let tier: RatingTier | null = null;
  if (hardFail !== null) tier = 'unsupported';
  else if (coupling !== null && fpsLevel !== null) tier = tierFor(score, fpsLevel, ambient);

  return {
    components,
    score,
    fpsLevel,
    ambient,
    tier,
    hardFail,
    unlocks: tier === null ? [] : UNLOCKS[tier],
  };
}
