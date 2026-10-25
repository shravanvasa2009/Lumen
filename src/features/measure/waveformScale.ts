// Quantile range, so one spike (finger shift, exposure step) cannot flatten the trace.
export function quantileRange(
  values: readonly number[],
  lowShare: number,
  highShare: number,
): { low: number; high: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))]!;
  return { low: at(lowShare), high: at(highShare) };
}
