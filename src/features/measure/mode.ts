export type MeasureMode = 'quick' | 'full';

export const DEFAULT_MODE: MeasureMode = 'full';

export type ModeDuration = { amount: number; unit: 'seconds' | 'minutes'; approximate?: true };

// Quick and Full are clean seconds; Deep HRV and Standing are minutes of guided time.
export const MODES = {
  quick: { duration: { amount: 30, unit: 'seconds' } },
  full: { duration: { amount: 90, unit: 'seconds' } },
  deep: { duration: { amount: 5, unit: 'minutes' } },
  standing: { duration: { amount: 12, unit: 'minutes', approximate: true } },
} as const satisfies Record<string, { duration: ModeDuration }>;

// Arrives as a URL param, so anything unknown falls back to Full Scan.
export function parseMode(raw: string | string[] | undefined): MeasureMode {
  return raw === 'quick' ? 'quick' : DEFAULT_MODE;
}

export function cleanSecondsNeeded(mode: MeasureMode): number {
  return MODES[mode].duration.amount;
}

// Only the route strings that are present are passed on.
export function processingHref(mode: MeasureMode, restDone?: string, context?: string): string {
  const params = new URLSearchParams({ mode });
  if (restDone !== undefined) params.set('restDone', restDone);
  if (context !== undefined) params.set('context', context);
  return `/measure/processing?${params.toString()}`;
}
