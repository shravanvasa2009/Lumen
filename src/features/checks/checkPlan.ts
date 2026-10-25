import { DSP_CONFIG, type RatingMode, type RatingTier, tierUnlocks } from '@/core';

import type { IconName } from '@/ui/components/Icon';
import type { StoredRating } from '@/data/store/deviceRating';
import type { MODES } from '@/features/measure/mode';

export type PlanMode = keyof typeof MODES;
export type CheckId = 'afib' | 'hrv' | 'diabetes' | 'pots';
type PlanTier = RatingTier | 'unrated';
// Reason text is in lockText.ts, shared with the mode lock.
export type LockWhy = 'fps60' | 'flash' | 'full' | 'basic' | 'unsupported';

// What the checks table needs to know about a phone: its tier, whether the flash reaches the finger (ambient
// mode means it does not) and whether the rear camera films at 60 fps or more.
export type PlanPhone = { tier: PlanTier; ambient: boolean; fps60: boolean };

const UNRATED_PHONE: PlanPhone = { tier: 'unrated', ambient: false, fps60: false };

const FPS_FOR_HRV = 60;

export function planPhone(rating: StoredRating | null | undefined): PlanPhone {
  if (rating === null || rating === undefined) return UNRATED_PHONE;
  return {
    tier: rating.tier,
    ambient: rating.ambient,
    fps60: rating.fpsLevel !== null && rating.fpsLevel >= FPS_FOR_HRV,
  };
}
export type CheckCell =
  { state: 'runs'; cleanSeconds: number | null } | { state: 'notInScan' } | { state: 'locked'; why: LockWhy };

export const CHECK_IDS: readonly CheckId[] = ['afib', 'hrv', 'diabetes', 'pots'];

export const CHECK_ICON: Record<CheckId, IconName> = {
  afib: 'pulse',
  hrv: 'trends',
  diabetes: 'lens',
  pots: 'standing',
};

// The rating row each check needs. A Limited phone has no rhythmFlags row, and Quick (30 s)
// is shorter than the 60 s the rhythm check needs, so Limited gets no rhythm result in any mode.
const REQUIRED_RATING_MODE: Record<CheckId, RatingMode> = {
  afib: 'rhythmFlags',
  hrv: 'hrv',
  diabetes: 'diabetes',
  pots: 'standingTest',
};

// HRV and the diabetes pattern need at least 60 fps; their lock reads as the frame rate.
const NEEDS_60_FPS: ReadonlySet<CheckId> = new Set<CheckId>(['hrv', 'diabetes']);

// The rating row that opens each mode.
const MODE_RATING_ROW: Record<PlanMode, RatingMode> = {
  quick: 'quickCheck',
  full: 'fullScan',
  deep: 'deepHrv',
  standing: 'standingTest',
};

// AFib needs 60 s of clean signal, so it is not part of the 30 s Quick Check.
const QUICK_RUNS_AFIB = false;
const MODE_RUNS: Record<PlanMode, ReadonlySet<CheckId>> = {
  quick: new Set<CheckId>(QUICK_RUNS_AFIB ? ['afib'] : []),
  full: new Set<CheckId>(['afib', 'hrv', 'diabetes']),
  deep: new Set<CheckId>(['hrv']),
  standing: new Set<CheckId>(['pots']),
};

function cleanSecondsFor(check: CheckId, mode: PlanMode): number | null {
  const { rules, dsp12 } = DSP_CONFIG;
  if (check === 'afib') return rules.rhythmMinCleanS;
  if (check === 'hrv') return mode === 'deep' ? dsp12.sdnnMinCleanS : dsp12.rmssdMinCleanS;
  if (check === 'diabetes') return rules.diabetesMinCleanS;
  return null;
}

// Limited is a score of 25 to 49, or a flash that does not reach the finger. HRV and the diabetes pattern
// need 60 fps and a Full rating, so the lock names what is missing: flash first (as modeLock.ts does),
// then frame rate, then rating.
function lockFor(check: CheckId, mode: PlanMode, phone: PlanPhone): LockWhy | null {
  const { tier, ambient, fps60 } = phone;
  if (tier === 'unrated') return null;
  if (tier === 'unsupported') return 'unsupported';
  const unlocks = tierUnlocks(tier);
  const checkOpen = unlocks.includes(REQUIRED_RATING_MODE[check]);
  const notEnough: LockWhy = ambient ? 'flash' : 'basic';
  if (!checkOpen) {
    if (!NEEDS_60_FPS.has(check)) return notEnough;
    if (ambient) return 'flash';
    return fps60 ? 'full' : 'fps60';
  }
  return unlocks.includes(MODE_RATING_ROW[mode]) ? null : notEnough;
}

// What the mode runs, minus what the phone's tier locks. An unrated phone keeps everything open.
export function checkCell(mode: PlanMode, check: CheckId, phone: PlanPhone): CheckCell {
  if (!MODE_RUNS[mode].has(check)) return { state: 'notInScan' };
  const why = lockFor(check, mode, phone);
  return why === null
    ? { state: 'runs', cleanSeconds: cleanSecondsFor(check, mode) }
    : { state: 'locked', why };
}
