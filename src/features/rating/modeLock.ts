import type { RatingMode } from '@/core';

import type { LockWhy } from '@/features/checks/checkPlan';
import type { MODES } from '@/features/measure/mode';
import type { StoredRating } from '@/data/store/deviceRating';

type ListedMode = keyof typeof MODES;

// The rating row each listed mode needs.
const REQUIRED_MODE: Record<ListedMode, RatingMode> = {
  quick: 'quickCheck',
  full: 'fullScan',
  deep: 'deepHrv',
  standing: 'standingTest',
};

const DEEP_HRV_MIN_FPS = 60;

// Why the phone's rating keeps a mode locked, or null when open. An unrated phone keeps every mode open,
// since nothing has been measured to gate on.
export function lockReason(rating: StoredRating | null | undefined, mode: ListedMode): LockWhy | null {
  if (rating === null || rating === undefined) return null;
  if (rating.unlocks.includes(REQUIRED_MODE[mode])) return null;
  if (rating.tier === 'unsupported') return 'unsupported';
  if (rating.ambient) return 'flash';
  if (mode !== 'deep') return 'basic';
  // Deep HRV needs 60 fps and a Full rating; the frame rate is the reason only when it is the cause.
  return rating.fpsLevel === null || rating.fpsLevel < DEEP_HRV_MIN_FPS ? 'fps60' : 'full';
}
