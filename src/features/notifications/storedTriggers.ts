import { latestReading, type StoredReading } from '@/features/home/readings';
import { followUpAnsweredAt } from '@/data/profile/followUp';
import { loadDeviceRating } from '@/data/store/deviceRating';
import { listReadings } from '@/data/store/readings';
import { isRegularFullCheck, statusOf } from '@/features/widgets/snapshot';

import type { NotificationTriggers } from './plan';

const refOf = (reading: StoredReading | null) =>
  reading === null ? null : { readingId: reading.id, takenAt: reading.takenAt };

// "Couldn't tell" asks for an immediate retake, not a later confirmation; every other flagged result
// (irregular, slow or fast resting rate, see a doctor) asks for a repeat under the same conditions.
const asksConfirmation = ({ outcome }: StoredReading) => {
  const status = statusOf(outcome);
  return (status === 'see-doctor' || status === 'check-again') && outcome.headlineKey !== 'result.uncertain';
};

// Triggers from stored data. The standing test keeps its state in memory only, so standingStartedAt
// stays null.
export async function storedTriggers(): Promise<NotificationTriggers> {
  const [readings, answeredAt, rating] = await Promise.all([
    listReadings(),
    followUpAnsweredAt(),
    loadDeviceRating(),
  ]);

  const asking = latestReading(readings.filter(asksConfirmation));
  // Only a regular Full Check taken after the result counts as its confirmation reading.
  const confirmed =
    asking !== null &&
    readings.some((reading) => isRegularFullCheck(reading) && reading.takenAt > asking.takenAt);

  const flagged = latestReading(readings.filter(({ outcome }) => statusOf(outcome) === 'see-doctor'));
  const followUpAnswered = flagged !== null && answeredAt !== null && answeredAt > flagged.takenAt;

  return {
    confirmationFor: confirmed ? null : refOf(asking),
    doctorFollowupFor: followUpAnswered ? null : refOf(flagged),
    standingStartedAt: null,
    lastPhoneCheckAt: rating?.testedAt ?? null,
  };
}
