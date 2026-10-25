import { useEffect, useSyncExternalStore } from 'react';

import { profileValue, setProfileValue } from '@/data/store/profile';

const NAME_KEY = 'name';
export const NAME_MAX_LENGTH = 40;

type Problem = 'load' | 'save' | null;
type NameState = { name: string | null; problem: Problem };

let current: NameState = { name: null, problem: null };
// A late load must not overwrite a name typed meanwhile.
let changedBeforeLoad = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: NameState) {
  current = next;
  listeners.forEach((listener) => listener());
}

// The profile table holds text only, so a cleared name is ''.
function loadOnce() {
  loading ??= profileValue(NAME_KEY).then(
    (saved) => {
      if (!changedBeforeLoad) publish({ name: saved === null || saved === '' ? null : saved, problem: null });
    },
    () => {
      loading = null;
      publish({ ...current, problem: 'load' });
    },
  );
}

// After a wipe, a read still in flight may carry the old name, so it must not publish.
export function resetProfileName() {
  changedBeforeLoad = true;
  loading = null;
  publish({ name: null, problem: null });
}

function setName(text: string) {
  const name = text.trim().slice(0, NAME_MAX_LENGTH);
  changedBeforeLoad = true;
  publish({ name: name === '' ? null : name, problem: null });
  setProfileValue(NAME_KEY, name).catch(() => publish({ ...current, problem: 'save' }));
}

// Optional first name from About you. `problem` is set when it could not be read or saved.
export function useProfileName(): { name: string | null; problem: Problem; setName(text: string): void } {
  const { name, problem } = useSyncExternalStore(subscribe, () => current);
  useEffect(loadOnce, []);
  return { name, problem, setName };
}
