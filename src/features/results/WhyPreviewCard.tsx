import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { RhythmMetric } from '@/core';

import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Icon } from '@/ui/components/Icon';
import { PressableScale } from '@/ui/components/PressableScale';
import { useTheme } from '@/ui/theme';

import { intervalAxis } from './axis';
import { BeatStrip } from './BeatStrip';
import { PoincarePlot } from './PoincarePlot';
import { whyCopy } from './whyCopy';

const PREVIEW_GAPS = 5;
const MAP_SIZE = 96;

type WhyPreviewCardProps = { readingId: string; rhythm: RhythmMetric; intervalsMs: readonly number[] };

// The "Why regular?" card on Results, with two small pictures drawn from the reading's own beat intervals.
export function WhyPreviewCard({ readingId, rhythm, intervalsMs }: WhyPreviewCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { title, explain } = whyCopy(t, rhythm);
  const seriesColor = rhythm.flag ? colors.flag : colors.accent;
  const plotColor = rhythm.flag ? colors.flag : colors.accentFill;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title} ${explain} ${t('results.showWhy')}`}
      onPress={() => router.push(`/results/${readingId}/why`)}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="title3" style={{ flex: 1 }}>
            {title}
          </AppText>
          <Icon name="chevron" size={20} color={colors.textFaint} />
        </View>
        <AppText tone="textDim">{explain}</AppText>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, paddingTop: spacing.sm }}
        >
          <View style={{ flex: 1, gap: spacing.xs }}>
            <BeatStrip intervalsMs={intervalsMs.slice(0, PREVIEW_GAPS)} color={seriesColor} />
            <AppText variant="caption1" tone="textDim">
              {t('why.intervals')}
            </AppText>
          </View>
          <View style={{ width: MAP_SIZE, gap: spacing.xs }}>
            <PoincarePlot
              intervalsMs={intervalsMs}
              axis={intervalAxis(intervalsMs)}
              color={plotColor}
              label={t('why.rhythmMap')}
            />
            <AppText variant="caption1" tone="textDim">
              {t('why.rhythmMap')}
            </AppText>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}
