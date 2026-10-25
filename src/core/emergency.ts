import { DSP_CONFIG } from './config';
import type { RejectedSpan } from './live-session';
import { median } from './median';
import type { BeatInterval, ReadingAnalysis } from './reading';
import { cleanSeconds } from './reading-metrics';

// Reads only the emergency view (withoutSqiNet), so no model output can raise or suppress a trigger and
// the frame-rate floor cannot hide a fast pulse.
export interface UrgentHeartRate {
  // HR > 150 bpm sustained 60 s at rest.
  fastSustained: boolean;
  // HR < 40 bpm; urgent only with symptoms, which the app asks for.
  slowBelow40: boolean;
}

// Whole ns so sums and gaps compare exactly (160 x 375 ms is exactly 60 s).
interface CleanInterval {
  startNs: number;
  endNs: number;
  ns: number;
}

// Accepted intervals touching no rejected span, in time order.
function cleanIntervals(intervals: BeatInterval[], rejectedSpans: RejectedSpan[], startNs: number) {
  return intervals
    .flatMap((interval): CleanInterval[] => {
      if (!interval.accepted || !(interval.ibiMs > 0)) return [];
      const ns = Math.round(interval.ibiMs * 1e6);
      const endNs = Math.round(interval.tNs);
      const endS = (endNs - startNs) / 1e9;
      const startS = endS - ns / 1e9;
      const touched = rejectedSpans.some((span) => span.startS < endS && span.endS > startS);
      return touched ? [] : [{ startNs: endNs - ns, endNs, ns }];
    })
    .sort((x, y) => x.endNs - y.endNs);
}

// Larger of the mean rate and the median-interval rate. The median survives missed beats; the mean is
// exact for repeating patterns like bigeminy, where the median can flip between values.
function rollingBpm(lengthsNs: number[], sumNs: number): number {
  return Math.max((60e9 * lengthsNs.length) / sumNs, 60e9 / median(lengthsNs));
}

// Rolling windowS window over clean intervals; a run of fast windows must reach sustainS clean seconds.
// Gaps up to maxBreakS are bridged but not counted; longer ones restart the count.
function sustainedFast(intervals: CleanInterval[]): boolean {
  const { fastBpm, fastMarginBpm, sustainS, windowS, windowMinCleanS, maxBreakS } =
    DSP_CONFIG.rules.emergency;
  let windowFirst = 0;
  let windowNs = 0;
  let inRun = false;
  let runNs = 0;
  for (let k = 0; k < intervals.length; k++) {
    const interval = intervals[k]!;
    const previous = intervals[k - 1];
    if (previous && interval.startNs - previous.endNs > maxBreakS * 1e9) {
      windowFirst = k;
      windowNs = 0;
      inRun = false;
    }
    windowNs += interval.ns;
    while (windowNs > windowS * 1e9 && windowFirst <= k) {
      windowNs -= intervals[windowFirst]!.ns;
      windowFirst++;
    }
    const fast =
      windowNs >= windowMinCleanS * 1e9 &&
      rollingBpm(
        intervals.slice(windowFirst, k + 1).map(({ ns }) => ns),
        windowNs,
      ) >
        fastBpm + fastMarginBpm;
    if (!fast) {
      inRun = false;
      continue;
    }
    runNs = inRun ? runNs + interval.ns : windowNs;
    inRun = true;
    if (runNs >= sustainS * 1e9) return true;
  }
  return false;
}

// heartRate's rule applied to the emergency view; the reading's own HR when there is no view.
function heartRateWithoutSqiNet(analysis: ReadingAnalysis): number | null {
  if (!analysis.withoutSqiNet) return analysis.heartRateBpm;
  const { intervals, rejectedSpans } = analysis.withoutSqiNet;
  const { minCleanS } = DSP_CONFIG.dsp11;
  if (!(cleanSeconds(0, analysis.durationS, rejectedSpans) >= minCleanS)) return null;
  const acceptedMs = intervals.flatMap((interval) =>
    interval.accepted && interval.ibiMs > 0 ? [interval.ibiMs] : [],
  );
  let spannedMs = 0;
  for (const ibiMs of acceptedMs) spannedMs += ibiMs;
  return spannedMs >= minCleanS * 1000 ? 60000 / median(acceptedMs) : null;
}

/** Emergency screen heart-rate triggers; null when neither holds. */
export function emergencyHeartRate(analysis: ReadingAnalysis): UrgentHeartRate | null {
  const { slowBpm, slowMarginBpm } = DSP_CONFIG.rules.emergency;
  const { intervals, rejectedSpans } = analysis.withoutSqiNet ?? analysis;
  // "At rest" means the rest timer finished.
  const fastSustained =
    analysis.context.restTimerDone &&
    sustainedFast(cleanIntervals(intervals, rejectedSpans, analysis.startNs));
  const heartRateBpm = heartRateWithoutSqiNet(analysis);
  const slowBelow40 = heartRateBpm !== null && heartRateBpm < slowBpm - slowMarginBpm;
  return fastSustained || slowBelow40 ? { fastSustained, slowBelow40 } : null;
}
