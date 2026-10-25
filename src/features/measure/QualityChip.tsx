import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { AppText } from '@/ui/components/AppText';
import { ValueSettle } from '@/ui/components/Reveal';
import { labelAt } from '@/features/onboarding/practiceParts';
import { useTheme } from '@/ui/theme';
import { enterTransition, glideConfig, StillMotion, useReduceMotion } from '@/ui/theme/motion';

const BAR_WIDTH = 4;
const BAR_HEIGHT = 11;
const DIM_OPACITY = 0.3;
const BARS = { weak: 1, ok: 2, strong: 3 } as const;

function QualityBar({ lit }: { lit: boolean }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const still = useContext(StillMotion);
  const glide = glideConfig(reduceMotion || still);
  const barStyle = useAnimatedStyle(() => ({ opacity: withTiming(lit ? 1 : DIM_OPACITY, glide) }));
  return (
    <Animated.View
      style={[
        { width: BAR_WIDTH, height: BAR_HEIGHT, borderRadius: 1, backgroundColor: colors.badgeCheckedFg },
        barStyle,
      ]}
    />
  );
}

// With `checking` and no level it reads "Checking" with no bar lit, rather than an unmeasured level.
// `compact` hides the word "Quality" (still read aloud) so the title fits on a 360 dp phone.
export function QualityChip({
  level,
  checking = false,
  compact = false,
  onLayout,
}: {
  level: number | null;
  checking?: boolean;
  compact?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const still = useContext(StillMotion);
  const band = labelAt(level);
  if (band === null && !checking) return null;
  const word =
    band === null
      ? t('capture.qualityChecking')
      : { weak: t('signal.weak'), ok: t('signal.ok'), strong: t('capture.qualityGood') }[band];
  return (
    <Animated.View
      entering={still ? undefined : enterTransition(reduceMotion)}
      accessible
      accessibilityLabel={`${t('capture.quality')} ${word}`}
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: compact ? spacing.sm : spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.pill,
        backgroundColor: colors.badgeCheckedBg,
      }}
    >
      {compact ? null : (
        <AppText variant="caption" style={{ fontWeight: '600', color: colors.badgeCheckedFg }}>
          {t('capture.quality')}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }} accessibilityElementsHidden>
        {[1, 2, 3].map((barNumber) => (
          <QualityBar key={barNumber} lit={band !== null && barNumber <= BARS[band]} />
        ))}
      </View>
      <ValueSettle value={word}>
        <AppText variant="caption" style={{ fontWeight: '600', color: colors.badgeCheckedFg }}>
          {word}
        </AppText>
      </ValueSettle>
    </Animated.View>
  );
}
