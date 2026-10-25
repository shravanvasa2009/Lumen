import type { TFunction } from 'i18next';

import type { LiveCapture } from './useLiveCapture';

// undefined once the camera is running.
export function phaseCaption(t: TFunction, live: LiveCapture): string | undefined {
  switch (live.phase) {
    case 'unavailable':
      return t('capture.unavailable');
    case 'starting':
      return t('capture.starting');
    case 'denied':
      return t('capture.denied');
    case 'failed':
      return t('capture.failed', { reason: live.failure });
    case 'running':
    case 'stopped':
      return undefined;
  }
}
