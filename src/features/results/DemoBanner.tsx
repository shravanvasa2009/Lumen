import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { useTheme } from '@/ui/theme';

// Every fixture reading says it is sample data. The irregular one also says it is synthetic.
export function DemoBanner({ synthetic }: { synthetic: boolean }) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface3,
        borderColor: colors.line2,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <AppText variant="caption" style={{ fontWeight: '600' }}>
        {t('demo.banner')}
      </AppText>
      {synthetic ? (
        <AppText variant="caption" tone="textDim">
          {t('demo.synthetic')}
        </AppText>
      ) : null}
    </View>
  );
}
