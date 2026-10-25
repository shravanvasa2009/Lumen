import { useEffect, useSyncExternalStore } from 'react';

import { profileValue, setProfileValue } from '@/data/store/profile';

// At least one digit, so "()" cannot be saved.
const PHONE_PATTERN = /^[0-9 +\-()]+$/;

export function isValidPhone(text: string): boolean {
  return PHONE_PATTERN.test(text) && /\d/.test(text);
}

const DOCTOR_PHONE_KEY = 'doctorPhone';

type Problem = 'load' | 'save' | null;
type DoctorPhoneState = { phone: string | null; problem: Problem };

let current: DoctorPhoneState = { phone: null, problem: null };
// A late load must not overwrite a number typed meanwhile.
let changedBeforeLoad = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: DoctorPhoneState) {
  current = next;
  listeners.forEach((listener) => listener());
}

// The profile table holds text only, so a cleared number is ''.
function loadOnce() {
  loading ??= profileValue(DOCTOR_PHONE_KEY).then(
    (saved) => {
      if (!changedBeforeLoad) publish({ phone: saved === '' ? null : saved, problem: null });
    },
    () => {
      loading = null;
      publish({ ...current, problem: 'load' });
    },
  );
}

// After a wipe, a read still in flight may carry the old number, so it must not publish.
export function resetDoctorPhone() {
  changedBeforeLoad = true;
  loading = null;
  publish({ phone: null, problem: null });
}

function setPhone(phone: string | null) {
  changedBeforeLoad = true;
  publish({ phone, problem: null });
  setProfileValue(DOCTOR_PHONE_KEY, phone ?? '').catch(() => publish({ ...current, problem: 'save' }));
}

// `problem` is set when the number could not be read or the latest change could not be saved.
export function useDoctorPhone(): {
  phone: string | null;
  problem: Problem;
  setPhone(phone: string | null): void;
} {
  const { phone, problem } = useSyncExternalStore(subscribe, () => current);
  useEffect(loadOnce, []);
  return { phone, problem, setPhone };
}
