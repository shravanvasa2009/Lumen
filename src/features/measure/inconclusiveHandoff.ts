import type { InconclusiveOutcome } from '@/core';

import { type KeptCapture, keptCapture } from './keptCapture';

// In memory only; a refused capture is never stored. Cleared once a newer capture is kept so no stale
// numbers show.
let handed: { capture: KeptCapture; outcome: InconclusiveOutcome } | null = null;

export function handOverInconclusive(outcome: InconclusiveOutcome | null): void {
  const capture = keptCapture();
  handed = capture === null || outcome === null ? null : { capture, outcome };
}

export function handedInconclusive(): InconclusiveOutcome | null {
  return handed !== null && handed.capture === keptCapture() ? handed.outcome : null;
}
