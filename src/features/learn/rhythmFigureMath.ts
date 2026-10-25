// Illustrative rhythm shapes from fixed numbers, not measurements.

export type BeatShape = {
  baseline: number;
  // Drawing units.
  peak: number;
  bump: number;
  // Drawing units; widths are standard deviations.
  bumpOffset: number;
  peakWidth: number;
  bumpWidth: number;
};

const gauss = (distance: number, width: number) => Math.exp(-(distance * distance) / (2 * width * width));

export function pulsePath(peakXs: readonly number[], shape: BeatShape, width: number, step: number): string {
  const points: string[] = [];
  for (let x = 0; x <= width + 1e-6; x += step) {
    let lift = 0;
    for (const peakX of peakXs) {
      lift +=
        shape.peak * gauss(x - peakX, shape.peakWidth) +
        shape.bump * gauss(x - peakX - shape.bumpOffset, shape.bumpWidth);
    }
    points.push(`${points.length === 0 ? 'M' : 'L'}${x.toFixed(2)} ${(shape.baseline - lift).toFixed(2)}`);
  }
  return points.join(' ');
}

export function peakPositions(gapsMs: readonly number[], firstX: number, pxPerMs: number): number[] {
  const xs = [firstX];
  for (const gap of gapsMs) xs.push(xs[xs.length - 1]! + gap * pxPerMs);
  return xs;
}

export const steadyGapsMs = [935, 948, 922, 940, 931, 952] as const;
export const irregularGapsMs = [640, 1120, 780, 1010, 590, 1180] as const;

// Each dot pairs one gap with the next.
export function gapPairs(gapsMs: readonly number[]): (readonly [number, number])[] {
  return gapsMs.slice(0, -1).map((gap, index) => [gap, gapsMs[index + 1]!] as const);
}

export const steadyMapGapsMs = [935, 948, 922, 940, 931, 952, 938, 927, 945, 933, 941, 929, 950] as const;
export const irregularMapGapsMs = [
  640, 1120, 780, 1010, 590, 1180, 860, 700, 1040, 620, 1150, 820, 960,
] as const;
// One early beat: a short gap, then a long one, then it settles.
export const extraBeatMapGapsMs = [935, 940, 600, 1270, 930, 945, 938, 590, 1285, 935, 942, 928] as const;

export function mapAxis(gapMs: number, lowMs: number, highMs: number, size: number, inset: number): number {
  return inset + ((gapMs - lowMs) / (highMs - lowMs)) * (size - 2 * inset);
}
