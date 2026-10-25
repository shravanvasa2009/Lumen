import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Icon } from '@/ui/components/Icon';
import { PressableScale } from '@/ui/components/PressableScale';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme';

// Consent, about you, finger placement, practice, rating, reminders.
const ONBOARDING_STEPS = 6;

type HeaderProps = {
  step: number;
  // With a title in the bar the step count sits under it; otherwise the count is centred.
  barTitle?: string;
  trailing?: ReactNode;
};

export function OnboardingHeader({ step, barTitle, trailing }: HeaderProps) {
  const { t } = useTranslation();
  const { colors, control, spacing } = useTheme();
  const router = useRouter();
  const stepText = t('onboarding.step', { step, total: ONBOARDING_STEPS });
  return (
    <View style={{ height: control.minTarget, marginBottom: spacing.xs, justifyContent: 'center' }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        // A deep link can open a step with nothing behind it.
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        style={{
          position: 'absolute',
          left: 0,
          width: control.minTarget,
          height: control.minTarget,
          borderRadius: control.minTarget / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderWidth: 1,
        }}
      >
        <Icon name="back" size={control.chevronSize} color={colors.text} />
      </PressableScale>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={stepText}
        accessibilityValue={{ min: 1, max: ONBOARDING_STEPS, now: step }}
        style={{ alignItems: 'center', marginHorizontal: control.minTarget + spacing.md }}
      >
        {barTitle ? (
          <AppText variant="headline" accessibilityRole="header" numberOfLines={1}>
            {barTitle}
          </AppText>
        ) : null}
        <AppText
          variant="caption"
          tone={barTitle ? 'textFaint' : 'textDim'}
          style={barTitle ? undefined : { fontWeight: '600' }}
        >
          {stepText}
        </AppText>
      </View>
      {trailing ? <View style={{ position: 'absolute', right: 0 }}>{trailing}</View> : null}
    </View>
  );
}

type FrameProps = {
  step: number;
  title: string;
  subtitle?: string;
  // e.g. "Question set 2 of 2".
  eyebrow?: string;
  centered?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
};

// Every onboarding screen except Welcome and Practice.
export function OnboardingFrame({
  step,
  title,
  subtitle,
  eyebrow,
  centered = false,
  children,
  footer,
}: FrameProps) {
  const { spacing } = useTheme();
  return (
    <Screen headerless footer={footer}>
      <OnboardingHeader step={step} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, gap: spacing.lg, paddingBottom: spacing.md }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: spacing.xs, alignItems: centered ? 'center' : 'stretch' }}>
          {eyebrow ? (
            <AppText variant="caption" tone="textFaint">
              {eyebrow}
            </AppText>
          ) : null}
          <AppText
            variant="display"
            accessibilityRole="header"
            style={centered ? { textAlign: 'center' } : undefined}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              tone="textDim"
              style={{ fontSize: 15, lineHeight: 20, textAlign: centered ? 'center' : 'left' }}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </Screen>
  );
}
