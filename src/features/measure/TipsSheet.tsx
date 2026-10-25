import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { BottomSheet } from '@/ui/components/BottomSheet';
import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme';

import { ReminderRows } from './reminders';

type TipsSheetProps = { visible: boolean; onDismiss: () => void };

// The reading keeps running behind it.
export function TipsSheet({ visible, onDismiss }: TipsSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissLabel={t('safety.dismiss')}>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.lg }}>
        <AppText variant="title" accessibilityRole="header">
          {t('precheck.reminders')}
        </AppText>
        <ReminderRows />
      </ScrollView>
      <Button label={t('safety.dismiss')} variant="secondary" onPress={onDismiss} />
    </BottomSheet>
  );
}
