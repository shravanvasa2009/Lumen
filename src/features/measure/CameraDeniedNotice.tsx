import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme';

import { phaseCaption } from './phaseCaption';
import type { LiveCapture } from './useLiveCapture';

// Top of the body: on a 360x640 phone it would otherwise be below the fold, and the system may not
// ask again, so Settings is the only way back.
export function CameraDeniedNotice({ live, centered = false }: { live: LiveCapture; centered?: boolean }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  if (live.phase !== 'denied') return null;
  return (
    <View style={{ gap: spacing.md }}>
      <AppText tone="textDim" style={centered ? { textAlign: 'center' } : undefined}>
        {phaseCaption(t, live)}
      </AppText>
      <Button
        variant="secondary"
        label={t('capture.openSettings')}
        onPress={() => void Linking.openSettings()}
      />
    </View>
  );
}
