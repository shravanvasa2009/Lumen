import { type RatingMeasures, rateDevice } from '@/core';

import type { Capabilities } from '../../../modules/lumen-capture/src';
import type { KeptCapture } from '@/features/measure/keptCapture';
import { resyncNotifications } from '@/features/settings/applyPrefs';
import {
  loadDeviceRating,
  saveDeviceRating,
  type PracticeSummary,
  type StoredRating,
} from '@/data/store/deviceRating';

import { practiceMeasures } from './practiceMeasures';

// With no lens chosen and nothing measured, the rating is the phone check's capability points.
const PROBE_ONLY: RatingMeasures = {
  lensId: null,
  achievedFps: null,
  frameIntervalSdMs: null,
  coupling: null,
};

// Rates and stores this phone from the probe and practice capture. Null when neither decides a tier
// (coupling not measured); nothing is stored then.
export async function ratePhone(
  capabilities: Capabilities,
  practice: KeptCapture | null,
  appVersion: string | null,
): Promise<StoredRating | null> {
  let rating = rateDevice(capabilities, PROBE_ONLY);
  let measured: { lensId: string | null; summary: PracticeSummary | null } = { lensId: null, summary: null };
  if (rating.tier === null) {
    if (practice === null) return null;
    const { measures, summary } = practiceMeasures(practice);
    if (measures.coupling === null) return null;
    rating = rateDevice(capabilities, measures);
    measured = { lensId: measures.lensId, summary };
  }
  await saveDeviceRating(rating, {
    testedAt: Date.now(),
    osVersion: capabilities.osVersion,
    appVersion,
    lensId: measured.lensId,
    practice: measured.summary,
  });
  void resyncNotifications();
  return loadDeviceRating();
}
