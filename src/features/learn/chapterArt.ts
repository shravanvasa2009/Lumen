// Illustration shapes built from fixed numbers, never measurements.

// Always drawn on the dark plot panel, so these ignore the light/dark tokens.
export const panelArt = {
  teal: '#2EC4B6',
  amber: '#FFB340',
  pulseRed: '#FF5A6E',
  muted: '#AEAEB2',
  grid: '#48484A',
  inset: '#2C2C2E',
} as const;

const gauss = (distance: number, spread: number) => Math.exp(-((distance / spread) ** 2) / 2);

// Sharp rise, then a softer second bump on the way down. Widths and offset are in x units.
const beatLook = { peakSpread: 4.5, bumpOffset: 21, bumpSpread: 6, bumpHeight: 0.32 } as const;

type PulseTraceSpec = {
  width: number;
  top: number;
  bottom: number;
  // Uneven gaps draw an irregular rhythm.
  beats: readonly number[];
};

const STEP = 1.5;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function pulseTracePath({ width, top, bottom, beats }: PulseTraceSpec): string {
  const points: string[] = [];
  for (let x = 0; x <= width; x += STEP) {
    const lift = beats.reduce(
      (sum, beat) =>
        sum +
        gauss(x - beat, beatLook.peakSpread) +
        beatLook.bumpHeight * gauss(x - beat - beatLook.bumpOffset, beatLook.bumpSpread),
      0,
    );
    points.push(
      `${points.length === 0 ? 'M' : 'L'}${round(x)} ${round(bottom - Math.min(lift, 1) * (bottom - top))}`,
    );
  }
  return points.join(' ');
}

// The "changed" shape is lower and rounder, with a faint second bump.
export function singleBeatPath(width: number, height: number, changed: boolean): string {
  const peak = changed ? { at: 0.34, spread: 0.13, high: 0.84 } : { at: 0.24, spread: 0.07, high: 1 };
  const bump = changed ? { at: 0.72, spread: 0.14, high: 0.16 } : { at: 0.58, spread: 0.09, high: 0.38 };
  const inset = height * 0.1;
  const points: string[] = [];
  for (let x = 0; x <= width; x += STEP) {
    const along = x / width;
    const lift =
      peak.high * gauss(along - peak.at, peak.spread) + bump.high * gauss(along - bump.at, bump.spread);
    points.push(
      `${points.length === 0 ? 'M' : 'L'}${round(x)} ${round(height - inset - lift * (height - 2 * inset))}`,
    );
  }
  return points.join(' ');
}

// Fixed seed, so the drawing never changes between renders.
export function jitterPath(width: number, height: number, seed: number, stepWidth = 4): string {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const points: string[] = [];
  for (let x = 0; x <= width; x += stepWidth) {
    points.push(`${points.length === 0 ? 'M' : 'L'}${round(x)} ${round(height * (0.15 + 0.7 * next()))}`);
  }
  return points.join(' ');
}
