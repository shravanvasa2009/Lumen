import type { ReadingAnalysis } from './reading';
import { hrSummary } from './reading-metrics';
import type { ReadingRhythm } from './results';
import { shapeFeatures } from './shape-features';

// Shapes: beat [1, 1, 256], shapeFeatures [1, 12], hrSummary [1, 4]. Nulls get the training median at
// inference.
export interface DiabetesModelInput {
  beat: Float64Array;
  shapeFeatures: (number | null)[];
  hrSummary: (number | null)[];
}

// Gating is buildReadingResult's job. HR and HRV summarise the whole reading, as displayed.
/** Diabetes-net's inputs from a reading and its readingRhythm; null with no averaged beat. */
export function diabetesModelInput(
  analysis: ReadingAnalysis,
  rhythm: ReadingRhythm | null,
): DiabetesModelInput | null {
  // Below its floors the low-quality beat stands in.
  const shape = analysis.pulseShape ?? analysis.lowQuality.pulseShape;
  if (!shape) return null;
  return {
    beat: shape.beat,
    shapeFeatures: shapeFeatures(shape),
    hrSummary: hrSummary(analysis.segments, rhythm, analysis.context.captureFps, analysis.cleanSeconds),
  };
}
