import { smoothPath, type Range } from './waveformPath';

export type Series = { t: number[]; v: number[] };

export type TraceGeometry = {
  width: number;
  height: number;
  dotX: number;
  padding: number;
  windowS: number;
  upIsHigh: boolean;
};

// Batches land about every 100 ms with gaps up to about 200 ms on a Galaxy A17; 300 ms covers that
// and still reads as live.
export const PLAYBACK_DELAY_S = 0.3;
// Wider gaps (finger lift, camera stall) are bridged with a straight line. Neighbours at 22 to 30 fps
// are 33 to 45 ms apart.
const GAP_S = 0.3;
// Caps path length on budget phones; normal captures are still drawn sample for sample.
const MIN_STEP_PX = 2;
// Slewing toward the clock position makes an offset correction a small speed change, not a jump.
const PLAYHEAD_SETTLE_MS = 1000;
// Further off than this (a long stall) resets instead of slewing.
const RESYNC_S = 1;
// Catch-up speed limit after a short stall, as a multiple of real time.
const MAX_CATCH_UP = 1.25;
// A late batch says little about the true offset, an early one says a lot.
const OFFSET_RISE_SHARE = 0.02;

// Samples covered by the new window are replaced by it.
export function mergeSeries(stored: Series, incoming: Series, keepS: number): Series {
  const firstNew = incoming.t[0];
  if (firstNew === undefined || incoming.t.length !== incoming.v.length) return { t: [], v: [] };
  let keepUntil = 0;
  while (keepUntil < stored.t.length && stored.t[keepUntil]! < firstNew) keepUntil += 1;
  const t = [...stored.t.slice(0, keepUntil), ...incoming.t];
  const v = [...stored.v.slice(0, keepUntil), ...incoming.v];
  const newest = t[t.length - 1]!;
  let drop = 0;
  while (drop < t.length && newest - t[drop]! > keepS) drop += 1;
  return { t: t.slice(drop), v: v.slice(drop) };
}

// Capture-to-screen clock offset (ms): down at once, up slowly.
export function smoothClockOffset(current: number | null, observed: number): number {
  'worklet';
  if (current === null || observed <= current) return observed;
  return current + (observed - current) * OFFSET_RISE_SHARE;
}

// Right-edge capture second: constant speed, never backward, never past the data.
export function advancePlayhead(
  previous: number | null,
  elapsedMs: number,
  targetS: number,
  newestS: number,
): number {
  'worklet';
  let next = targetS;
  if (previous !== null && Math.abs(targetS - previous) <= RESYNC_S) {
    const advanced = previous + elapsedMs / 1000;
    next = advanced + (targetS - advanced) * (1 - Math.exp(-elapsedMs / PLAYHEAD_SETTLE_MS));
    next = Math.min(next, previous + (MAX_CATCH_UP * elapsedMs) / 1000);
  }
  return Math.min(newestS, Math.max(previous ?? -Infinity, next));
}

export function playheadTargetS(frameMs: number, offsetMs: number): number {
  'worklet';
  return (frameMs - offsetMs) / 1000 - PLAYBACK_DELAY_S;
}

// Points are placed by their own timestamps. A sample is kept when it starts a new time cell of
// windowS * MIN_STEP_PX / dotX seconds, so the same samples stay drawn as the window scrolls.
export function tracePath(
  series: Series,
  endS: number,
  range: Range,
  geometry: TraceGeometry,
): { d: string; dotY: number } | null {
  'worklet';
  const { t, v } = series;
  const { dotX, height, padding, windowS, upIsHigh } = geometry;
  let last = t.length - 1;
  while (last >= 0 && t[last]! > endS) last -= 1;
  if (last < 0) return null;
  let first = last;
  while (first > 0 && t[first]! >= endS - windowS) first -= 1;
  const span = range.high - range.low;
  const pxPerS = dotX / windowS;
  const yOf = (value: number) => {
    const unit = span > 0 ? Math.min(1, Math.max(0, (value - range.low) / span)) : 0.5;
    return padding + (upIsHigh ? 1 - unit : unit) * (height - 2 * padding);
  };
  const stepS = (windowS * MIN_STEP_PX) / dotX;
  const points: { x: number; y: number; bridge?: boolean }[] = [];
  let previousTime = t[first]!;
  for (let index = first; index <= last; index += 1) {
    const newCell = index === first || Math.floor(t[index]! / stepS) !== Math.floor(t[index - 1]! / stepS);
    if (index !== last && !newCell) continue;
    const x = dotX - (endS - t[index]!) * pxPerS;
    const y = yOf(v[index]!);
    const previous = points[points.length - 1];
    if (previous && t[index]! - previousTime > GAP_S) {
      points.push({ x, y: previous.y, bridge: true }, { x, y, bridge: true });
    } else {
      points.push({ x, y });
    }
    previousTime = t[index]!;
  }
  const lastY = yOf(v[last]!);
  const lastTime = t[last]!;
  const next = t[last + 1];
  if (next !== undefined && endS > lastTime) {
    if (next - lastTime > GAP_S) {
      points.push({ x: dotX, y: lastY, bridge: true });
      return { d: smoothPath(points, height), dotY: lastY };
    }
    const endY = lastY + (yOf(v[last + 1]!) - lastY) * ((endS - lastTime) / (next - lastTime));
    points.push({ x: dotX, y: endY });
    return { d: smoothPath(points, height), dotY: endY };
  }
  return { d: smoothPath(points, height), dotY: lastY };
}
