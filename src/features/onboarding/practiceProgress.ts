// 30 steady seconds gives the perfusion index enough clean signal for a real rating.
export const STEADY_SECONDS_NEEDED = 30;

// The analysis counts first to last frame, so stopping at exactly 30.0 s yields just under 30 clean
// seconds and no perfusion index. The ring fills 1 s later.
const HOLD_PAST_NEEDED_S = 1;

export function practiceSteadySeconds(cleanSeconds: number | null): number {
  const clean = cleanSeconds ?? 0;
  if (clean >= STEADY_SECONDS_NEEDED + HOLD_PAST_NEEDED_S) return STEADY_SECONDS_NEEDED;
  return Math.min(Math.floor(clean), STEADY_SECONDS_NEEDED - 1);
}
