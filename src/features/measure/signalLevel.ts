import { couplingFactor, estimateLiveHeartRate, type Sample } from '@/core';

// Practice meter position (0 to 1) from core's coupling factor of live perfusion index and pulse SNR.
// The estimator returns null below 6 dB, so the SNR factor drops from 0.5 to 0 there; the bar is a
// coarse guide. Missing inputs map to 0/null so the level is never NaN.
export function signalLevel(perfusionPct: number | null, frames: readonly Sample[]): number | null {
  if (perfusionPct === null) return null;
  const level = couplingFactor(
    Number.isFinite(perfusionPct) ? perfusionPct : 0,
    estimateLiveHeartRate([...frames])?.snrDb ?? null,
  );
  return Number.isFinite(level) ? level : 0;
}
