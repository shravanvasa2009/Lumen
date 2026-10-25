import { CHECK_IDS, type CheckId, checkCell, type PlanPhone } from '@/features/checks/checkPlan';

import type { MeasureMode } from './mode';

// 'off' is a check this mode never runs ("Not in this scan").
type CheckState = 'ready' | 'checking' | 'unavailable' | 'off';
export type CheckingItem = { id: CheckId; state: CheckState };

// checkCell is the same table the pre-check and Processing screens read.
export function checkingItems(
  mode: MeasureMode,
  cleanSeconds: number | null,
  phone: PlanPhone,
): CheckingItem[] {
  return CHECK_IDS.map((id): CheckingItem => {
    const cell = checkCell(mode, id, phone);
    if (cell.state === 'notInScan') return { id, state: 'off' };
    if (cell.state === 'locked') return { id, state: 'unavailable' };
    const ready = cell.cleanSeconds !== null && cleanSeconds !== null && cleanSeconds >= cell.cleanSeconds;
    return { id, state: ready ? 'ready' : 'checking' };
  });
}
