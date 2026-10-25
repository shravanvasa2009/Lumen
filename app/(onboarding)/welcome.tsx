import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { LumenLockup } from '@/ui/components/LumenLockup';
import { NavButton } from '@/ui/components/NavButton';
import { Screen } from '@/ui/components/Screen';
import { useStartDemo } from '@/features/demo/useStartDemo';
import { FourChecks } from '@/features/onboarding/FourChecks';
import { LanguagePill } from '@/features/onboarding/LanguagePill';
import { useTheme } from '@/ui/theme';

const LOCKUP_WIDTH = 150;
// Below this height (360 x 640 phones) the lockup shrinks and the rows tighten; text keeps its size.
const COMPACT_HEIGHT = 700;
const COMPACT_LOCKUP_WIDTH = 110;
const TAGLINE_MAX_WIDTH = 300;

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const startDemo = useStartDemo();
  const compact = screenHeight < COMPACT_HEIGHT;
  return (
    <Screen
      headerless
      footer={
        <>
          <NavButton label={t('welcome.getStarted')} href="/consent" />
          <Button variant="link" label={t('welcome.tryDemo')} onPress={startDemo} />
          <AppText variant="caption" tone="textDim" style={styles.centeredText}>
            {t('welcome.footer')}
          </AppText>
        </>
      }
    >
      <LanguagePill />
      <ScrollView
        contentContainerStyle={[styles.body, { gap: compact ? spacing.md : spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.group, { gap: spacing.md }]}>
          <LumenLockup stacked width={compact ? COMPACT_LOCKUP_WIDTH : LOCKUP_WIDTH} />
          <AppText accessibilityRole="header" style={styles.screenReaderOnly}>
            {t('app.name')}
          </AppText>
          <AppText variant="headline" tone="textDim" style={[styles.centeredText, styles.tagline]}>
            {t('app.tagline')}
          </AppText>
        </View>
        <FourChecks compact={compact} />
      </ScrollView>
    </Screen>
  );
}

// The lockup is a drawing, so the app name is also given to screen readers as the screen heading.
const styles = StyleSheet.create({
  screenReaderOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  body: { flexGrow: 1, justifyContent: 'center' },
  group: { alignItems: 'center' },
  centeredText: { textAlign: 'center' },
  tagline: { fontWeight: '400', fontSize: 20, lineHeight: 28, maxWidth: TAGLINE_MAX_WIDTH },
});
