import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { useTheme } from '@/ui/theme';

type LabelChipProps = { word: string; fg: string; bg: string };

// Legend only; the per-check badges are EvidenceBadge.
export function LabelChip({ word, fg, bg }: LabelChipProps) {
  const { radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 3,
      }}
    >
      <AppText variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {word}
      </AppText>
    </View>
  );
}
