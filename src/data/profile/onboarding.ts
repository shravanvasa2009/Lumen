import { useEffect, useState } from 'react';

import { profileValue, setProfileValue } from '@/data/store/profile';

const ONBOARDING_DONE_KEY = 'onboardingDone';

export function finishOnboarding(): Promise<void> {
  return setProfileValue(ONBOARDING_DONE_KEY, 'true');
}

// A failed read throws during render to the ErrorBoundary in app/_layout.tsx; guessing could send a new
// user to Home or a returning one to Welcome.
export function useOnboardingState(): 'loading' | 'needed' | 'done' {
  const [done, setDone] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  if (failure !== null) throw failure;
  useEffect(() => {
    let active = true;
    profileValue(ONBOARDING_DONE_KEY).then(
      (saved) => {
        if (active) setDone(saved === 'true');
      },
      (error: unknown) => {
        if (active) setFailure(error);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  if (done === null) return 'loading';
  return done ? 'done' : 'needed';
}
