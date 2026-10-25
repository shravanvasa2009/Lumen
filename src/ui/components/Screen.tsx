import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/ui/theme';

type ScreenProps = {
  children: ReactNode;
  // Headerless screens take the status-bar inset here.
  headerless?: boolean;
  footer?: ReactNode;
  // The tab bar sits below, so drop the bottom inset and padding.
  tight?: boolean;
  // Keep padding but drop the bottom inset the tab bar covers.
  aboveTabBar?: boolean;
};

export function Screen({
  children,
  headerless = false,
  footer,
  tight = false,
  aboveTabBar = false,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const belowIsTabBar = tight || aboveTabBar;
  return (
    <SafeAreaView
      edges={
        headerless
          ? ['top', 'left', 'right', ...(belowIsTabBar ? [] : (['bottom'] as const))]
          : ['left', 'right', 'bottom']
      }
      style={[
        styles.screen,
        {
          backgroundColor: colors.bg,
          padding: spacing.screen,
          ...(tight ? { paddingTop: spacing.sm } : null),
          ...(belowIsTabBar ? { paddingBottom: 0 } : null),
        },
      ]}
    >
      <View style={styles.body}>{children}</View>
      {footer ? <View style={{ paddingTop: spacing.lg, gap: spacing.md }}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
});
