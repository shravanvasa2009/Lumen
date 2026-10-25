import { DSP_CONFIG } from '@/core';

import type { Capabilities } from '../../../modules/lumen-capture/src';

const RATING = DSP_CONFIG.rating;

// Coupling (35) needs a finger and frame timing needs practice, so the dial totals the other three.
export const PHONE_CHECK_MAX = {
  camera: RATING.fpsLevels[0]?.points ?? 0,
  locks: RATING.exposureLockPoints + RATING.whiteBalanceLockPoints + RATING.focusLockPoints,
  timing: RATING.timingLevels[0]?.points ?? 0,
};
export const PHONE_CHECK_TOTAL = PHONE_CHECK_MAX.camera + PHONE_CHECK_MAX.locks + PHONE_CHECK_MAX.timing;

export function cameraPoints(fps: number): number {
  return RATING.fpsLevels.find(({ minFps }) => fps >= minFps)?.points ?? 0;
}

export function lockPoints(locks: Capabilities['locks']): number {
  return (
    (locks.exposure ? RATING.exposureLockPoints : 0) +
    (locks.whiteBalance ? RATING.whiteBalanceLockPoints : 0) +
    (locks.focus ? RATING.focusLockPoints : 0)
  );
}
