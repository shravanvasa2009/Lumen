import type { TFunction } from 'i18next';

import type { CaptureCoaching } from './captureVerdict';

// Literal t() keys so the i18n check can see them.
export function coachingText(t: TFunction): Record<CaptureCoaching, string> {
  return {
    'coach.cover': t('coach.cover'),
    'coach.lighter': t('coach.lighter'),
    'coach.still': t('coach.still'),
    'coach.warm': t('coach.warm'),
    'coach.flat': t('coach.flat'),
    'coach.brightness': t('coach.brightness'),
    'coach.notClean': t('coach.notClean'),
  };
}
