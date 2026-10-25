import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { QualityReason, ReadingResult } from '@/core';

import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ListRow } from '@/ui/components/ListRow';
import { formatNumber } from '@/ui/i18n/formatNumber';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { useTheme } from '@/ui/theme';

import { LowerQualityTag } from './LowerQualityTag';

type ExperimentalCardProps = {
  experimental: ReadingResult['experimental'];
  lowQualityReasons: readonly QualityReason[] | null;
  // Opens the extra-beats page; absent when the reading kept no beat intervals to draw it from.
  onOpenExtraBeats?: () => void;
  // The pulse-pattern row, when this reading has one.
  pulseRow?: ReactNode;
};

// No flags and no accuracy claims. The group's own heading says these are experimental.
export function ExperimentalCard({
  experimental,
  lowQualityReasons,
  onOpenExtraBeats,
  pulseRow,
}: ExperimentalCardProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{t('results.experimentalHeading')}</SectionLabel>
      {lowQualityReasons ? <LowerQualityTag small reasons={lowQualityReasons} /> : null}
      <Card flush>
        <ListRow
          title={t('why.extraBeats')}
          trailing={
            <AppText variant="headline">
              {t('results.perMinute', { rate: formatNumber(experimental.extraBeatsPerMin, i18n.language) })}
            </AppText>
          }
          chevron={onOpenExtraBeats !== undefined}
          onPress={onOpenExtraBeats}
        />
        <ListRow
          title={t('results.pulseShape')}
          trailing={
            <AppText variant="headline">
              {experimental.pulseShape.available ? t('results.shapeRecorded') : t('results.shapeNotRecorded')}
            </AppText>
          }
          last={pulseRow === undefined}
        />
        {pulseRow}
      </Card>
      <AppText variant="caption" tone="textDim">
        {t('results.notHealthMeasurement')}.
      </AppText>
    </View>
  );
}
