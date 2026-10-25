import { profileValue, setProfileValues } from '@/data/store/profile';

const ANSWER_KEY = 'followUpAnswer';
const ANSWERED_AT_KEY = 'followUpAnsweredAt';

export type FollowUpAnswer = 'saw' | 'booked' | 'notYet';

// One transaction, so an answer never keeps the previous answer's time.
export async function saveFollowUpAnswer(answer: FollowUpAnswer, now: number): Promise<void> {
  await setProfileValues({ [ANSWER_KEY]: answer, [ANSWERED_AT_KEY]: String(now) });
}

// "Booked" and "Not yet" mean the visit has not happened, so they do not clear the widget status.
export async function followUpAnsweredAt(): Promise<number | null> {
  if ((await profileValue(ANSWER_KEY)) !== 'saw') return null;
  const savedAt = Number(await profileValue(ANSWERED_AT_KEY));
  return Number.isFinite(savedAt) && savedAt > 0 ? savedAt : null;
}
