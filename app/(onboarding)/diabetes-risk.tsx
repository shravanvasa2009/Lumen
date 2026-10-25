import { useTranslation } from 'react-i18next';

import { AppText } from '@/ui/components/AppText';
import { NavButton } from '@/ui/components/NavButton';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { DiabetesRiskForm } from '@/data/profile/DiabetesRiskForm';
import { useRiskDraft } from '@/data/profile/useRiskDraft';

export default function DiabetesRiskScreen() {
  const { t } = useTranslation();
  const risk = useRiskDraft('questions');
  // Every tap is stored at once, so Back and a restart keep the answers given so far.
  function answer(field: Parameters<typeof risk.change>[0], value: boolean) {
    risk.change(field, value);
    void risk.persist();
  }
  return (
    <OnboardingFrame
      step={2}
      eyebrow={t('dr.stepOf', { a: 2, b: 2 })}
      title={t('dr.title')}
      subtitle={t('dr.intro')}
      footer={<NavButton label={t('common.continue')} href="/phone-check" />}
    >
      {risk.loaded ? <DiabetesRiskForm draft={risk.draft} onAnswer={answer} /> : null}
      {risk.loadFailed ? (
        <AppText variant="caption" tone="textDim" accessibilityRole="alert">
          {t('profile.loadFailed')}
        </AppText>
      ) : null}
      {risk.saveFailed ? (
        <AppText variant="caption" tone="textDim" accessibilityRole="alert">
          {t('profile.saveFailed')}
        </AppText>
      ) : null}
    </OnboardingFrame>
  );
}
