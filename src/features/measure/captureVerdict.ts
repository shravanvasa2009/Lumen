import type { CoachingKey, RejectedSpan } from '@/core';

import type { LiveCapture } from './useLiveCapture';

// The level never reads above OK while the clean-seconds count is stopped.
const OK_CEILING = 0.5;
// A rejected span still counts as current within this many seconds of the newest frame; the session
// clock starts a little after the screen's.
const NOW_TOLERANCE_S = 2;

// Lines for a stopped count: exposure still steering, or any other stall.
export type CaptureCoaching = CoachingKey | 'coach.brightness' | 'coach.notClean';

const COACHING_FOR: Partial<Record<RejectedSpan['reason'], CaptureCoaching>> = {
  coverage: 'coach.cover',
  clipping: 'coach.lighter',
  pressure: 'coach.lighter',
  motion: 'coach.still',
  coldHands: 'coach.warm',
  // The exposure lock's own steering greys out the second after each change.
  exposure: 'coach.brightness',
};

export type CaptureVerdict = {
  level: number | null;
  // Why the count is stopped; null while it counts.
  coaching: CaptureCoaching | null;
};

// The coaching line is debounced, so the count decides, not the level. Reason order: coaching line,
// open rejection, exposure still steering, then plain "not clean yet". A stopped count is never silent.
export function captureVerdict(live: LiveCapture): CaptureVerdict {
  if (live.phase !== 'running') return { level: null, coaching: null };
  const level = live.signalLevel;
  if (live.advancing) return { level, coaching: live.coachingKey };
  const open = live.rejectedSpans
    .filter((span) => span.endS >= live.elapsedS - NOW_TOLERANCE_S)
    .reduce<RejectedSpan | null>(
      (latest, span) => (latest && latest.endS >= span.endS ? latest : span),
      null,
    );
  const fromSpan = open ? (COACHING_FOR[open.reason] ?? null) : null;
  const fallback = live.adjustingExposure ? 'coach.brightness' : 'coach.notClean';
  return {
    level: level === null ? null : Math.min(level, OK_CEILING),
    coaching: live.coachingKey ?? fromSpan ?? fallback,
  };
}
