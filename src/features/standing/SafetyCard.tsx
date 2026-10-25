import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/ui/components/AppText';
import { useTheme } from '@/ui/theme';

type SafetyCardProps = { text: string; title?: string };

// Red alert tokens, as on the other safety cards. The title, when there is one, leads.
export function SafetyCard({ text, title }: SafetyCardProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.alertTint,
        borderRadius: radius.card,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path d="M12 3 22 20H2Z" fill={colors.alertFill} />
        <Path d="M12 9.5v5M12 17v.5" stroke={colors.onAlertFill} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <View style={{ flex: 1 }}>
        {title ? (
          <AppText variant="headline" style={{ color: colors.alertText }}>
            {title}
          </AppText>
        ) : null}
        <AppText
          variant={title ? 'caption' : 'headline'}
          style={{ color: title ? colors.textDim : colors.alertText }}
        >
          {text}
        </AppText>
      </View>
    </View>
  );
}
