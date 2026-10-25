export type AnalysisStepId = 'beats' | 'rhythm' | 'breathing' | 'baseline';
export type StepState = 'done' | 'active' | 'pending';

// Beat counts stay null until the beats are cleaned. `outputs` stays null until the reading is built,
// so a check never shows ready just because a step finished.
export type CheckOutputs = { afib: boolean; hrv: boolean; diabetes: boolean };

export type AnalysisProgress = {
  steps: Record<AnalysisStepId, StepState>;
  beats: number | null;
  rejectedBeats: number | null;
  outputs: CheckOutputs | null;
};

export const STEP_ORDER: readonly AnalysisStepId[] = ['beats', 'rhythm', 'breathing', 'baseline'];

export const pendingProgress: AnalysisProgress = {
  steps: { beats: 'pending', rhythm: 'pending', breathing: 'pending', baseline: 'pending' },
  beats: null,
  rejectedBeats: null,
  outputs: null,
};

// Counts finished steps, so the ring only moves when the analysis does.
export function completedPercent(progress: AnalysisProgress): number {
  const done = STEP_ORDER.filter((step) => progress.steps[step] === 'done').length;
  return Math.round((100 * done) / STEP_ORDER.length);
}
