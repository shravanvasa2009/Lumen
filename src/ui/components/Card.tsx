import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/ui/theme';

// Flush cards hold rows with their own padding and dividers. Dense cards are for small screens.
export function Card({
  children,
  flush = false,
  dense = false,
}: {
  children: ReactNode;
  flush?: boolean;
  dense?: boolean;
}) {
  const { colors, radius, spacing, shadow } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.sheet,
        // Overflow clipping would cut the shadow, so only flush cards clip.
        ...(flush ? { overflow: 'hidden' as const } : shadow.raised),
        padding: flush ? 0 : dense ? spacing.sm : spacing.lg,
        gap: dense ? 0 : spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
