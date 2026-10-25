import { DSP_CONFIG } from './config';

// Timestamps are whole ns, so a gap within half a ns of the limit equals it; seconds arithmetic carries
// up to ~1e-13 s of rounding.
export const HALF_NS_S = 0.5e-9;

// Frames further apart than maxGapS are never interpolated across.
export function isFrameGap(previousS: number, nextS: number): boolean {
  return nextS - previousS > DSP_CONFIG.dsp2.maxGapS + HALF_NS_S;
}

export interface ResampledSegment {
  firstIndex: number; // sample k is at (firstIndex + k) / rate seconds from capture start
  values: Float64Array;
}

// Natural spline second derivatives by the Thomas algorithm (diagonally dominant, no pivoting). Same
// interpolant as scipy.interpolate.CubicSpline(x, y, bc_type='natural').
function naturalSecondDerivatives(x: Float64Array, y: Float64Array): Float64Array {
  const n = x.length;
  const secondDerivatives = new Float64Array(n);
  if (n < 3) return secondDerivatives;
  const superDiagonal = new Float64Array(n);
  const rhs = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const hLeft = x[i]! - x[i - 1]!;
    const hRight = x[i + 1]! - x[i]!;
    const slopeChange = (y[i + 1]! - y[i]!) / hRight - (y[i]! - y[i - 1]!) / hLeft;
    const pivot = 2 * (hLeft + hRight) - hLeft * superDiagonal[i - 1]!;
    superDiagonal[i] = hRight / pivot;
    rhs[i] = (6 * slopeChange - hLeft * rhs[i - 1]!) / pivot;
  }
  for (let i = n - 2; i >= 1; i--) {
    secondDerivatives[i] = rhs[i]! - superDiagonal[i]! * secondDerivatives[i + 1]!;
  }
  return secondDerivatives;
}

function splineOnGrid(x: Float64Array, y: Float64Array, rateHz: number): ResampledSegment | null {
  // One shared grid of k / rate (divide, never step). Python must use ceil(x0*rate), floor(xn*rate),
  // and np.arange(first, last + 1) / rate to match.
  const firstIndex = Math.ceil(x[0]! * rateHz);
  const lastIndex = Math.floor(x[x.length - 1]! * rateHz);
  if (lastIndex < firstIndex) return null;
  const m = naturalSecondDerivatives(x, y);
  const values = new Float64Array(lastIndex - firstIndex + 1);
  let knot = 0;
  for (let k = 0; k < values.length; k++) {
    const t = (firstIndex + k) / rateHz;
    while (knot < x.length - 2 && t > x[knot + 1]!) knot++;
    const h = x[knot + 1]! - x[knot]!;
    const dx = t - x[knot]!;
    const m0 = m[knot]!;
    const m1 = m[knot + 1]!;
    const slope = (y[knot + 1]! - y[knot]!) / h;
    // Power form from the left knot, as scipy's PPoly, so a flat signal stays exact.
    values[k] =
      y[knot]! + dx * (slope - (h * (2 * m0 + m1)) / 6 + dx * (m0 / 2 + (dx * (m1 - m0)) / (6 * h)));
  }
  return { firstIndex, values };
}

/** Natural cubic spline onto a uniform grid, split wherever frames are > 150 ms apart. */
export function resampleCubic(tS: Float64Array, values: Float64Array, rateHz: number): ResampledSegment[] {
  // scipy CubicSpline's refusals, checked on the whole input.
  if (values.length !== tS.length) throw new RangeError(`${tS.length} times but ${values.length} values`);
  for (let i = 0; i < tS.length; i++) {
    if (!Number.isFinite(tS[i]!) || !Number.isFinite(values[i]!))
      throw new RangeError(`frame ${i}: time and value must be finite`);
    if (i > 0 && !(tS[i]! > tS[i - 1]!))
      throw new RangeError(`times must strictly increase; frame ${i} does not`);
  }
  const segments: ResampledSegment[] = [];
  let segmentStart = 0;
  for (let i = 1; i <= tS.length; i++) {
    const endsSegment = i === tS.length || isFrameGap(tS[i - 1]!, tS[i]!);
    if (!endsSegment) continue;
    // A lone frame between two gaps cannot carry a spline.
    if (i - segmentStart >= 2) {
      const segment = splineOnGrid(tS.subarray(segmentStart, i), values.subarray(segmentStart, i), rateHz);
      if (segment) segments.push(segment);
    }
    segmentStart = i;
  }
  return segments;
}
