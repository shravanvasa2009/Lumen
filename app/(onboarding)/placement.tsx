import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Icon, type IconName } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import { NavButton } from '@/ui/components/NavButton';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { placementCopy, usePhoneBackLayout } from '@/features/onboarding/phoneBackLayouts';
import { PlacementFigure } from '@/features/onboarding/PlacementFigure';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { useTheme } from '@/ui/theme';

export default function PlacementScreen() {
  const { t } = useTranslation();
  const phoneBackLayout = usePhoneBackLayout();
  const { colors, spacing, radius, control } = useTheme();
  const tips: { icon: IconName; label: string }[] = [
    { icon: 'hint', label: t('placement.tipCover') },
    { icon: 'phone', label: t('placement.tipCase') },
    { icon: 'lens', label: t('placement.tipWipe') },
    { icon: 'elbow', label: t('placement.tipPosture') },
  ];
  return (
    <OnboardingFrame
      step={3}
      title={t('placement.title')}
      subtitle={t('placement.subtitle')}
      footer={<NavButton label={t('placement.start')} href="/practice" />}
    >
      <PlacementFigure />
      <View
        testID="placement-instruction"
        style={{
          backgroundColor: colors.badgeCheckedBg,
          borderRadius: radius.card,
          padding: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Icon name="finger" size={control.chevronSize} color={colors.accent} />
        <AppText variant="headline" style={{ flex: 1 }}>
          {placementCopy(t, phoneBackLayout.model).instruction}
        </AppText>
      </View>
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('placement.tipsHeading')}</SectionLabel>
        <Card flush>
          {tips.map(({ icon, label }, index) => (
            <ListRow
              key={label}
              title={label}
              last={index === tips.length - 1}
              leading={<Icon name={icon} size={control.chevronSize} color={colors.accent} />}
            />
          ))}
        </Card>
        <AppText variant="caption" tone="textDim">
          {t('placement.tipWarm')}
        </AppText>
      </View>
    </OnboardingFrame>
  );
}
