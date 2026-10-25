import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Icon } from '@/ui/components/Icon';
import { evidenceFor } from '@/data/evidence';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { useTheme } from '@/ui/theme';

import type { FixtureReading } from './fixtures';

// The pulse extra shows only while the diabetes model is Experimental and the reading has an estimate.
export const showsPulseExtra = (reading: FixtureReading) =>
  reading.scan.metrics.diabetes !== null && !evidenceFor('diabetes').measured;

// While its model is Experimental the pulse pattern is an extra under the questionnaire
// result, with no number. It is never flagged. The Experimental pill is shown on the Accuracy screen only.
export function DiabetesCheckCard() {
  const { t } = useTranslation();
  const { colors, radius, spacing, shadow } = useTheme();
  return (
    <View testID="pulse-extra" style={{ gap: spacing.sm }}>
      <SectionLabel>{t('dr.pulseExtra')}</SectionLabel>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.sheet,
          padding: spacing.lg,
          ...shadow.raised,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="drop" size={24} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="title3">{t('results.pulsePattern')}</AppText>
          <AppText variant="subheadline" tone="textDim" style={{ marginTop: 2 }}>
            {t('dm.experimental')} {t('dr.notInScore')}
          </AppText>
        </View>
      </View>
    </View>
  );
}
