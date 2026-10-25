import { DSP_CONFIG } from './config';
import { butterLowpass, filterZeroPhase } from './filters';

/** Display only: the live graph's pulse with one smooth bump per beat; never used for analysis. */
export function displayPulse(
  tS: readonly number[],
  ppg: readonly number[],
  rateBpm: number | null,
): number[] {
  const { order, cutoffPerFundamental, cutoffRangeHz, fallbackCutoffHz } = DSP_CONFIG.displayPulse;
  const unchanged = [...ppg];
  // filterZeroPhase pads with 3 x (2 x sections + 1) samples and needs more than that.
  const padLength = 3 * (2 * Math.ceil(order / 2) + 1);
  if (ppg.length !== tS.length || ppg.length <= padLength || !ppg.every(Number.isFinite)) return unchanged;
  const spanS = tS[tS.length - 1]! - tS[0]!;
  const rateHz = (ppg.length - 1) / spanS;
  if (!(rateHz > 0) || !Number.isFinite(rateHz)) return unchanged;

  // Trust the reported rate. A rate locked on 2x can show a dicrotic wave as a second bump, but halving
  // would hide real beats in bigeminy, which is worse.
  const [lowHz, highHz] = cutoffRangeHz as [number, number];
  const cutoffHz =
    rateBpm !== null && Number.isFinite(rateBpm) && rateBpm > 0
      ? Math.min(highHz, Math.max(lowHz, (cutoffPerFundamental * rateBpm) / 60))
      : fallbackCutoffHz;
  if (cutoffHz >= rateHz / 2) return unchanged;
  return Array.from(filterZeroPhase(butterLowpass(order, cutoffHz, rateHz), ppg));
}
