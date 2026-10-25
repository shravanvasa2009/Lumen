import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type ListRowProps = {
  title: string;
  leading?: ReactNode;
  subtitle?: string;
  trailing?: ReactNode;
  last?: boolean;
  chevron?: boolean;
  // Announced but ignores presses while its action runs.
  disabled?: boolean;
  // For rows that expand content, so screen readers hear the state.
  expanded?: boolean;
  onPress?: () => void;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  last = false,
  chevron = false,
  disabled = false,
  expanded,
  onPress,
}: ListRowProps) {
  const { colors, spacing, control } = useTheme();
  return (
    <PressableScale
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress || disabled}
      accessibilityState={{ disabled, expanded }}
      onPress={onPress}
      style={[styles.row, { paddingLeft: spacing.lg, opacity: disabled ? 0.5 : 1 }]}
    >
      {leading ? (
        <View style={{ width: 28, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center' }}>
          {leading}
        </View>
      ) : null}
      {/* The divider starts under the text, not under the icon. */}
      <View
        style={[
          styles.body,
          {
            minHeight: control.minTarget,
            paddingVertical: subtitle ? 9 : spacing.sm,
            paddingRight: spacing.lg,
            gap: spacing.md,
            borderBottomColor: colors.line,
            borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.text}>
          <AppText>{title}</AppText>
          {subtitle ? (
            <AppText variant="subheadline" tone="textDim">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {trailing}
        {chevron ? <Icon name="chevron" size={control.chevronSize} color={colors.glyph} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
