import { DSP_CONFIG } from './config';
import { emergencyHeartRate, type UrgentHeartRate } from './emergency';
import type { RejectedSpan, RejectionReason } from './live-session';
import type { ReadingAnalysis } from './reading';
import type { LostSeconds } from './results';

// lostSeconds keys. On the Inconclusive screen, light = coverage.
export type LostCause = keyof LostSeconds;

export type InconclusiveReason = 'tooFewCleanSeconds' | 'noHeartRate';

export interface InconclusiveOutcome {
  kind: 'inconclusive';
  reasons: InconclusiveReason[];
  cleanSeconds: number;
  neededCleanSeconds: number;
  // Each lost second counted once under its first cause, so these plus clean and other seconds add up to
  // the capture length. The Results JSON counts each cause separately.
  lostSeconds: LostSeconds;
  otherLostSeconds: number; // SQI-rejected and flat windows, and the 1 s after an exposure change
  causes: LostCause[]; // causes that lost >= 0.5 ms, most first; the first two pick the tips
  // An inconclusive capture can still trigger it; the rule needs only its own 60 clean seconds.
  urgent: UrgentHeartRate | null;
}

export type ReadingOutcome = { kind: 'reading'; urgent: UrgentHeartRate | null } | InconclusiveOutcome;

// Priority: contact, motion, pressure, cold hands.
const COACHING_ORDER: readonly LostCause[] = ['coverage', 'motion', 'pressure', 'coldHands'];

// Clipping is pressing too hard. Quality and exposure spans have no coaching cause.
const CAUSE: Record<RejectionReason, LostCause | null> = {
  coverage: 'coverage',
  motion: 'motion',
  pressure: 'pressure',
  clipping: 'pressure',
  coldHands: 'coldHands',
  quality: null,
  exposure: null,
};

function lostByCause(spans: RejectedSpan[], durationS: number) {
  const ranked = spans
    .map((span) => {
      const cause = CAUSE[span.reason];
      return {
        fromS: Math.max(span.startS, 0),
        toS: Math.min(span.endS, durationS),
        rank: cause === null ? COACHING_ORDER.length : COACHING_ORDER.indexOf(cause),
      };
    })
    .filter((span) => span.toS > span.fromS);
  const edges = [...new Set(ranked.flatMap((span) => [span.fromS, span.toS]))].sort((x, y) => x - y);
  const lostSeconds: LostSeconds = { motion: 0, pressure: 0, coverage: 0, coldHands: 0 };
  let otherLostSeconds = 0;
  for (let i = 1; i < edges.length; i++) {
    const fromS = edges[i - 1]!;
    const toS = edges[i]!;
    let rank = Infinity;
    for (const span of ranked) if (span.fromS <= fromS && span.toS >= toS) rank = Math.min(rank, span.rank);
    if (rank === Infinity) continue;
    const cause = COACHING_ORDER[rank];
    if (cause) lostSeconds[cause] += toS - fromS;
    else otherLostSeconds += toS - fromS;
  }
  return { lostSeconds, otherLostSeconds };
}

/** Whether a capture may be saved as a reading; only one with no heart rate at all is inconclusive. */
export function readingOutcome(analysis: ReadingAnalysis): ReadingOutcome {
  const { mode } = analysis.context;
  const targets: Record<string, number> = DSP_CONFIG.rules.modeMinCleanS;
  if (!Object.hasOwn(targets, mode)) throw new RangeError(`mode ${mode} has no clean-seconds target`);
  const neededCleanSeconds = targets[mode]!;

  const urgent = emergencyHeartRate(analysis);
  if ((analysis.heartRateBpm ?? analysis.lowQuality.heartRateBpm) !== null)
    return { kind: 'reading', urgent };
  const reasons: InconclusiveReason[] = [];
  if (analysis.cleanSeconds < neededCleanSeconds) reasons.push('tooFewCleanSeconds');
  reasons.push('noHeartRate');

  const { lostSeconds, otherLostSeconds } = lostByCause(analysis.rejectedSpans, analysis.durationS);
  // Whole ms, so float rounding (3.7 - 3 = 0.7000000000000002) cannot break a tie.
  const lostMs = (cause: LostCause) => Math.round(lostSeconds[cause] * 1000);
  const causes = COACHING_ORDER.filter((cause) => lostMs(cause) > 0).sort((x, y) => lostMs(y) - lostMs(x));
  return {
    kind: 'inconclusive',
    reasons,
    cleanSeconds: analysis.cleanSeconds,
    neededCleanSeconds,
    lostSeconds,
    otherLostSeconds,
    causes,
    urgent,
  };
}
