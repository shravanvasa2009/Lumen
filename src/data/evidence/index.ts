import type { EvidenceLabel } from '@/core';

import bundledEvidence from '../../../assets/evidence.json';

export const evidenceMetrics = ['hr', 'rhythm', 'hrv', 'resp', 'diabetes', 'extraBeats'] as const;
export type EvidenceMetric = (typeof evidenceMetrics)[number];
// The questionnaire has no evidence.json entry or accuracy-screen row.
export type EvidenceKey = EvidenceMetric | 'questionnaire';

export type MetricEvidence = {
  label: EvidenceLabel;
  // Only a passed criterion counts as measured; null reads "Not yet tested".
  measured: boolean;
};

const weakest: MetricEvidence = { label: 'experimental', measured: false };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Anything missing, unrecognised, or not passed is Experimental. `measured` follows the shown label so a
// badge never sits next to "Not yet tested".
function readMetric(metric: unknown): MetricEvidence {
  if (!isRecord(metric) || metric.passed !== true) return weakest;
  if (metric.label === 'checked') return { label: 'checked', measured: true };
  if (metric.label === 'public-data') return { label: 'public-data', measured: true };
  return weakest;
}

export function readEvidence(file: unknown): Record<EvidenceMetric, MetricEvidence> {
  const metrics = isRecord(file) && isRecord(file.metrics) ? file.metrics : {};
  return Object.fromEntries(evidenceMetrics.map((metric) => [metric, readMetric(metrics[metric])])) as Record<
    EvidenceMetric,
    MetricEvidence
  >;
}

// Raw record of one metric, ungated; callers decide whether the label matters.
export function metricRecord(file: unknown, metric: EvidenceKey): Record<string, unknown> {
  const metrics = isRecord(file) && isRecord(file.metrics) ? file.metrics : {};
  const record = metrics[metric];
  return isRecord(record) ? record : {};
}

const bundled: Record<EvidenceKey, MetricEvidence> = {
  ...readEvidence(bundledEvidence),
  questionnaire: readMetric(metricRecord(bundledEvidence, 'questionnaire')),
};

export function evidenceFor(metric: EvidenceKey): MetricEvidence {
  return bundled[metric];
}
