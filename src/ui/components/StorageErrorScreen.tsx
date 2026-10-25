import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/ui/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Screen } from './Screen';

// Neutral on purpose: red is reserved for the emergency screen.
export function StorageErrorScreen({ retry }: { retry: () => Promise<void> }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const router = useRouter();
  // The boundary sits above the navigator and cannot know which screen failed; Home is always reachable.
  const retryAtHome = async () => {
    await retry();
    router.replace('/');
  };
  return (
    <Screen headerless footer={<Button label={t('error.retry')} onPress={() => void retryAtHome()} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          {t('error.title')}
        </AppText>
        <AppText tone="textDim">{t('error.body')}</AppText>
      </View>
    </Screen>
  );
}
