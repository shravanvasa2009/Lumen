import i18next from 'i18next';
import { useEffect } from 'react';

import { resyncNotifications } from '@/features/settings/applyPrefs';
import { profileValue, setProfileValue } from '@/data/store/profile';
import { publishWidgetCopy } from '@/features/widgets/publish';

const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

const PROFILE_KEY = 'language';

const isLanguage = (value: string | null): value is Language => LANGUAGES.some((code) => code === value);

// Applies at once; the caller reports a failed save. Demo mode writes nothing.
export async function chooseLanguage(code: Language): Promise<void> {
  await i18next.changeLanguage(code);
  await setProfileValue(PROFILE_KEY, code);
}

// The device language holds until a choice is saved or when the read fails. Reminders and widget copy
// re-sync afterwards, which also repairs a sync missed in the background.
export function useSavedLanguage(): void {
  useEffect(() => {
    void profileValue(PROFILE_KEY)
      .then((saved) => (isLanguage(saved) ? i18next.changeLanguage(saved) : undefined))
      .catch(() => undefined)
      .then(() => {
        void resyncNotifications();
        // On failure the widgets keep their copy.
        publishWidgetCopy().catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`Widget copy update failed: ${reason}`);
        });
      });
  }, []);
}
