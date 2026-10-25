import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { adaRisk, type AdaAnswers, type AdaRisk } from '@/core';

import { loadRiskDraft } from '@/data/store/profile';

import { assessRisk, type RiskDraft } from './diabetesRisk';

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type RiskScore =
  | { kind: 'notReady' }
  | { kind: 'loadFailed' }
  | { kind: 'under20' }
  | {
      kind: 'scored';
      risk: AdaRisk;
      answers: AdaAnswers;
      sexNotGiven: boolean;
      // Never scored; the card lists it when answered.
      pregnancyAnswered: boolean;
    };

// Only a complete assessment is scored; partial answers would give NaN points.
export function scoreDraft(draft: RiskDraft): RiskScore {
  const assessment = assessRisk(draft);
  if (assessment.status !== 'ready') return { kind: 'notReady' };
  const risk = adaRisk(assessment.answers);
  if (risk === null) return { kind: 'under20' };
  return {
    kind: 'scored',
    risk,
    answers: assessment.answers,
    sexNotGiven: assessment.sexNotGiven,
    pregnancyAnswered: draft.sex === 'female' && draft.gestationalDiabetes !== null,
  };
}

// Null until read. Rereads on focus so edits in Settings > Profile show on return.
export function useStoredRiskScore(): RiskScore | null {
  const [score, setScore] = useState<RiskScore | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRiskDraft().then(
        (stored) => {
          if (active) setScore(scoreDraft(stored));
        },
        // The card reports the failure rather than asking for the answers again.
        (error: unknown) => {
          console.warn(`Diabetes risk answers did not load: ${reasonOf(error)}`);
          if (active) setScore({ kind: 'loadFailed' });
        },
      );
      return () => {
        active = false;
      };
    }, []),
  );
  return score;
}
