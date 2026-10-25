import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { NavButton } from '@/ui/components/NavButton';
import { Reveal, Settle } from '@/ui/components/Reveal';
import { Screen } from '@/ui/components/Screen';
import { useDemoActive } from '@/features/demo/demoSession';
import { ChecksSection } from '@/features/home/ChecksSection';
import { MeasureButton } from '@/features/home/MeasureButton';
import { ModePill } from '@/features/home/ModePill';
import { LatestReading } from '@/features/home/LatestReading';
import { dateLine, dayPeriod } from '@/features/home/moment';
import { latestReading } from '@/features/home/readings';
import { SectionTitle } from '@/features/home/SectionTitle';
import { WidgetPromo } from '@/features/home/WidgetPromo';
import { durationLabel } from '@/features/measure/durationLabel';
import { DEFAULT_MODE, MODES } from '@/features/measure/mode';
import { useProfileName } from '@/data/profile/profileName';
import { useOnboardingState } from '@/data/profile/onboarding';
import { useStoredReadings } from '@/data/store/useStoredReadings';
import { useTheme } from '@/ui/theme';

// A fresh install opens on Welcome. Demo mode skips the gate without marking onboarding done.
// Only the launch screen is gated; deep links open their own screen directly.
export default function HomeScreen() {
  const demo = useDemoActive();
  const onboarding = useOnboardingState();
  if (!demo) {
    if (onboarding === 'loading') return null;
    if (onboarding === 'needed') return <Redirect href="/welcome" />;
  }
  return <Home />;
}

// Below this height (360 x 640 phones) the date line goes and Measure shrinks to keep the checks in view.
const COMPACT_HEIGHT = 700;
const MEASURE_SIZE = 320;
const COMPACT_GREETING = { size: 26, lineHeight: 30 };
// The mode pill tucks under the Measure halo, which is transparent at its edge.
const COMPACT_PILL_OVERLAP = 28;
const PILL_OVERLAP = 12;
const MEASURE_SIZE_COMPACT = 164;

function Home() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const readings = useStoredReadings();
  const newest = latestReading(readings);
  const { name } = useProfileName();
  const { spacing } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const [promoDismissed, setPromoDismissed] = useState(false);
  const now = new Date();
  const greetings = {
    morning: t('home.greetingMorning'),
    afternoon: t('home.greetingAfternoon'),
    evening: t('home.greetingEvening'),
  };
  const greeting = greetings[dayPeriod(now.getHours())];
  const modeNames = { quick: t('mode.quick'), full: t('mode.full') };
  const modeLabel = t('home.modeLine', {
    mode: modeNames[DEFAULT_MODE],
    seconds: durationLabel(t, MODES[DEFAULT_MODE].duration),
  });

  return (
    <Screen headerless tight>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          gap: spacing.md,
          paddingBottom: compact ? 0 : spacing.lg,
        }}
      >
        <Reveal>
          {compact ? null : <AppText tone="textDim">{dateLine(now, i18n.language)}</AppText>}
          <AppText
            variant="display"
            accessibilityRole="header"
            style={
              compact
                ? { fontSize: COMPACT_GREETING.size, lineHeight: COMPACT_GREETING.lineHeight }
                : undefined
            }
          >
            {name ? t('home.greetingNamed', { greeting, name }) : greeting}
          </AppText>
        </Reveal>
        <Reveal index={1} style={{ alignItems: 'center' }}>
          <MeasureButton
            label={t('home.measure')}
            modeLabel={modeLabel}
            size={compact ? MEASURE_SIZE_COMPACT : MEASURE_SIZE}
            onPress={() => router.push('/measure/mode')}
          />
          <View style={{ marginTop: -(compact ? COMPACT_PILL_OVERLAP : PILL_OVERLAP) }}>
            <ModePill mode={modeNames[DEFAULT_MODE]} />
          </View>
        </Reveal>
        {newest ? (
          <Reveal index={2} style={{ gap: spacing.sm }}>
            <SectionTitle>{t('home.latestTitle')}</SectionTitle>
            <LatestReading reading={newest} now={now} />
          </Reveal>
        ) : null}
        <Reveal index={3} style={{ gap: spacing.sm }}>
          <SectionTitle>{t('home.checksTitle')}</SectionTitle>
          <ChecksSection readings={readings} now={now} />
        </Reveal>
        {promoDismissed ? null : (
          <Reveal index={4} settle>
            <WidgetPromo onDismiss={() => setPromoDismissed(true)} />
          </Reveal>
        )}
        <Settle>
          <NavButton label={t('home.followUp')} href="/follow-up" variant="link" />
        </Settle>
      </ScrollView>
    </Screen>
  );
}
