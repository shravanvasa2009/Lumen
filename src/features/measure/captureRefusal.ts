import type { KeptCapture } from './keptCapture';

const MIN_FRAMES = 2;

// buildTimebase needs two frames for an interval, so shorter captures are refused here. Non-finite
// values only cost clean time. A samples/stats count mismatch is a broken module, not a short
// recording, so analyzeKeptCapture throws instead.
export function isTooShort({ samples, stats }: KeptCapture): boolean {
  return samples.length === stats.length && samples.length < MIN_FRAMES;
}
