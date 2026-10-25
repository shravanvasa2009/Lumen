import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

import { keptCapture } from '@/features/measure/keptCapture';
import { ratePhone } from '@/features/rating/ratePhone';

import { usePhoneProbe } from './usePhoneProbe';

export type PracticeRating = 'waiting' | 'rating' | 'rated' | 'unrated';

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Rates the phone as practice finishes, so the rating is stored before the screen moves on.
export function usePracticeRating(finished: boolean): PracticeRating {
  const { probe } = usePhoneProbe();
  const [outcome, setOutcome] = useState<PracticeRating>('waiting');
  useEffect(() => {
    if (!finished || probe.kind === 'checking') return;
    if (probe.kind === 'unavailable') {
      setOutcome('unrated');
      return;
    }
    let current = true;
    setOutcome('rating');
    ratePhone(probe.capabilities, keptCapture(), Constants.expoConfig?.version ?? null).then(
      (rating) => {
        if (current) setOutcome(rating === null ? 'unrated' : 'rated');
      },
      (error: unknown) => {
        console.warn(`Rating the phone failed: ${reasonOf(error)}`);
        if (current) setOutcome('unrated');
      },
    );
    return () => {
      current = false;
    };
  }, [finished, probe]);
  return outcome;
}
