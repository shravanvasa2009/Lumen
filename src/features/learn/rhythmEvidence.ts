import { isRecord, metricRecord } from '@/data/evidence';

import bundledEvidence from '../../../assets/evidence.json';

export type RhythmFigures = {
  // Share of frequent-extra-beat readings the rhythm check marked irregular.
  falseAfRate: number | null;
  readingAbstainRate: number | null;
  // As written in evidence.json; null when the file does not say.
  source: string | null;
};

// A bare rate or `{ estimate, ci95 }`; anything not a share in [0, 1] is treated as untested.
function rateFrom(value: unknown): number | null {
  const rate = isRecord(value) ? value.estimate : value;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
}

// Not gated by `passed`: the development false-AF rate is always stated.
function readRhythmFigures(file: unknown): RhythmFigures {
  const rhythm = metricRecord(file, 'rhythm');
  return {
    falseAfRate: rateFrom(rhythm.falseAfRatePrematureReadings),
    readingAbstainRate: rateFrom(rhythm.readingAbstainRate),
    source: typeof rhythm.source === 'string' && rhythm.source.trim() !== '' ? rhythm.source : null,
  };
}

export const bundledRhythmFigures = readRhythmFigures(bundledEvidence);
