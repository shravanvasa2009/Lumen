import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { useTheme } from '@/ui/theme';

const METER_HEIGHT = 6;
const BAR_WIDTH = 8;
const BAR_STEP = 3;
const LENS_SIZE = 16;
const MAX_LENS_DOTS = 6;

type PointsMeterProps = {
  // null while not measurable yet; the meter is then a dashed track.
  earned: number | null;
  max: number;
  color: string;
  accessibleLabel: string;
};

export function PointsMeter({ earned, max, color, accessibleLabel }: PointsMeterProps) {
  const { colors, spacing } = useTheme();
  const fill = earned === null || max === 0 ? 0 : Math.min(1, earned / max);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibleLabel}
      accessibilityValue={{ min: 0, max, ...(earned === null ? null : { now: earned }) }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}
    >
      <View
        style={{
          flex: 1,
          height: METER_HEIGHT,
          borderRadius: METER_HEIGHT / 2,
          backgroundColor: earned === null ? 'transparent' : colors.surface3,
          borderWidth: earned === null ? 1 : 0,
          borderStyle: 'dashed',
          borderColor: colors.line2,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${fill * 100}%`, height: METER_HEIGHT, backgroundColor: color }} />
      </View>
      <AppText
        variant="caption"
        style={{
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          color: earned === null ? colors.glyph : color,
        }}
      >
        {earned === null ? `-/${max}` : `${earned}/${max}`}
      </AppText>
    </View>
  );
}

// Four bars for a dimmable torch, one for on/off only.
export function TorchBars({ steps }: { steps: number }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: BAR_STEP,
        marginTop: spacing.sm,
        height: 14,
      }}
    >
      {Array.from({ length: steps }, (_, index) => (
        <View
          key={index}
          style={{
            width: BAR_WIDTH,
            height: 5 + index * 3,
            borderRadius: 2,
            backgroundColor: colors.flag,
          }}
        />
      ))}
    </View>
  );
}

export function LensDots({ count }: { count: number }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.sm }}
    >
      {Array.from({ length: Math.min(count, MAX_LENS_DOTS) }, (_, index) => (
        <View
          key={index}
          style={{
            width: LENS_SIZE,
            height: LENS_SIZE,
            borderRadius: LENS_SIZE / 2,
            borderWidth: 2.5,
            borderColor: colors.line2,
            backgroundColor: colors.illustrationLens,
          }}
        />
      ))}
    </View>
  );
}
