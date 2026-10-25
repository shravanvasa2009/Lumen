import { useCallback, useEffect, useRef, useState } from 'react';

import { loadRiskDraft, type RiskScope, saveRiskDraft } from '@/data/store/profile';

import { EMPTY_RISK_DRAFT, type RiskDraft, storableDraft } from './diabetesRisk';

// Only a save that writes the basics may drop the pregnancy answer, so an unsaved sex never removes it.
function storableForScope(draft: RiskDraft, only: RiskScope): RiskDraft {
  const storable = storableDraft(draft);
  return only === 'questions' ? { ...storable, gestationalDiabetes: draft.gestationalDiabetes } : storable;
}

export type RiskDraftState = {
  draft: RiskDraft;
  // False until read, so stored answers never overwrite typing.
  loaded: boolean;
  loadFailed: boolean;
  saveFailed: boolean;
  change: <Field extends keyof RiskDraft>(field: Field, value: RiskDraft[Field]) => void;
  persist: (only?: RiskScope) => Promise<boolean>;
};

// A screen saves only its own scope; persist(only) overrides it for one save.
export function useRiskDraft(scope: RiskScope = 'all'): RiskDraftState {
  const [draft, setDraft] = useState<RiskDraft>(EMPTY_RISK_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef(EMPTY_RISK_DRAFT);
  // Serialized: two transactions on one connection must not overlap.
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    loadRiskDraft().then(
      (stored) => {
        if (!active) return;
        latest.current = stored;
        setDraft(stored);
        setLoaded(true);
      },
      () => {
        if (!active) return;
        setLoadFailed(true);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const change = useCallback(<Field extends keyof RiskDraft>(field: Field, value: RiskDraft[Field]) => {
    latest.current = { ...latest.current, [field]: value };
    setDraft(latest.current);
  }, []);

  const persist = useCallback(
    (only: RiskScope = scope) => {
      const saving = lastSave.current.then(() => saveRiskDraft(storableForScope(latest.current, only), only));
      lastSave.current = saving.catch(() => undefined);
      return saving.then(
        () => {
          setSaveFailed(false);
          return true;
        },
        () => {
          setSaveFailed(true);
          return false;
        },
      );
    },
    [scope],
  );

  return { draft, loaded, loadFailed, saveFailed, change, persist };
}
