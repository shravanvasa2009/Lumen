import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { RouteShell } from '@/ui/components/RouteShell';
import { DiabetesCheckCard, showsPulseExtra } from '@/features/results/DiabetesCheckCard';
import { DiabetesRiskCard } from '@/features/results/DiabetesRiskCard';
import { useResultsReading } from '@/features/results/useResultsReading';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { useTheme } from '@/ui/theme';

// A sample reading isn't the person's, so it says so instead of reading their stored answers.
export default function DiabetesResultScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useResultsReading(id);
  if (reading === undefined) return <RouteShell title={t('results.title')} />;
  // No saved reading, no score.
  if (reading === null) return <RouteShell title={t('results.title')} subtitle={t('result.inconclusive')} />;
  return (
    <RouteShell title="">
      <View style={{ gap: spacing.xl }}>
        <AppText variant="display" accessibilityRole="header">
          {t('dr.rowTitle')}
        </AppText>
        {reading.sample ? <AppText tone="textDim">{t('dr.demoRow')}</AppText> : <DiabetesRiskCard />}
        {showsPulseExtra(reading) ? <DiabetesCheckCard /> : null}
        {reading.mode !== 'full' ? (
          <View style={{ gap: spacing.sm }}>
            <SectionLabel>{t('dr.pulseExtra')}</SectionLabel>
            <AppText tone="textDim">{t('dr.pulseNeedsFull')}</AppText>
          </View>
        ) : null}
      </View>
    </RouteShell>
  );
}
