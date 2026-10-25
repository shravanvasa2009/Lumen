import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { CHECK_ICON, CHECK_IDS, type CheckId, checkCell, type PlanMode, planPhone } from '@/features/checks/checkPlan';
import { lockText } from '@/features/checks/lockText';
import { Card } from '@/ui/components/Card';
import { Icon, type IconName } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import { NavButton } from '@/ui/components/NavButton';
import { PressableScale } from '@/ui/components/PressableScale';
import { TryDemoButton } from '@/features/demo/TryDemoButton';
import { capabilityRows } from '@/features/onboarding/capabilityRows';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { RatingDial } from '@/features/onboarding/RatingDial';
import { usePhoneProbe } from '@/features/onboarding/usePhoneProbe';
import { tierLabel } from '@/features/rating/labels';
import { useRatingReveal } from '@/features/rating/useRatingReveal';
import { SectionLabel } from '@/features/settings/SectionLabel';
import type { StoredRating } from '@/data/store/deviceRating';
import { useTheme } from '@/ui/theme';

// Each check is listed under the mode that runs it: the Standing test for POTS, a Full Scan for the rest.
const LISTED_MODE: Record<CheckId, PlanMode> = {
  afib: 'full',
  hrv: 'full',
  diabetes: 'full',
  pots: 'standing',
};

const PHONE_CHECK_ICONS: IconName[] = ['camera', 'warm', 'lock'];

// Only the first three capability rows; frame timing and lens count stay on the phone check.
function PhoneCheckGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, control } = useTheme();
  const rows = capabilityRows(usePhoneProbe().probe, t).slice(0, PHONE_CHECK_ICONS.length);
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{t('rating.phoneCheck')}</SectionLabel>
      <Card flush>
        {rows.map(({ title, value }, index) => (
          <ListRow
            key={title}
            title={title}
            last={index === rows.length - 1}
            leading={
              <Icon
                name={PHONE_CHECK_ICONS[index] ?? 'camera'}
                size={control.chevronSize}
                color={colors.accent}
              />
            }
            trailing={<AppText tone="textDim">{value}</AppText>}
          />
        ))}
      </Card>
      <PressableScale
        accessibilityRole="link"
        onPress={() => router.push('/phone-check')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: control.minTarget,
          paddingHorizontal: spacing.lg,
        }}
      >
        <AppText variant="subheadline" tone="accent" style={{ fontWeight: '600' }}>
          {t('rating.fullPhoneCheck')}
        </AppText>
        <Icon name="chevron" size={12} color={colors.accent} />
      </PressableScale>
    </View>
  );
}

function CheckableList({ rating }: { rating: StoredRating }) {
  const { t } = useTranslation();
  const { colors, spacing, control } = useTheme();
  const names: Record<CheckId, string> = {
    afib: t('checks.afib.name'),
    hrv: t('checks.hrv.name'),
    diabetes: t('checks.diabetes.pattern'),
    pots: t('checks.pots.name'),
  };
  const whats: Record<CheckId, string> = {
    afib: t('checks.afib.what'),
    hrv: t('checks.hrv.what'),
    diabetes: t('checks.diabetes.what'),
    pots: t('checks.pots.whatShort'),
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{t('rating.checksHere')}</SectionLabel>
      <Card flush>
        {CHECK_IDS.map((check, index) => {
          const cell = checkCell(LISTED_MODE[check], check, planPhone(rating));
          const lockedWhy = cell.state === 'locked' ? cell.why : null;
          const detail = lockedWhy === null ? whats[check] : lockText(t, lockedWhy);
          return (
            <ListRow
              key={check}
              title={names[check]}
              subtitle={detail}
              last={index === CHECK_IDS.length - 1}
              leading={
                <Icon
                  name={CHECK_ICON[check]}
                  size={control.chevronSize}
                  color={lockedWhy === null ? colors.accent : colors.textFaint}
                />
              }
              trailing={
                <View accessible accessibilityLabel={lockedWhy === null ? t('rating.available') : detail}>
                  <Icon
                    name={lockedWhy === null ? 'check' : 'lock'}
                    size={control.chevronSize}
                    color={lockedWhy === null ? colors.accent : colors.textFaint}
                  />
                </View>
              }
            />
          );
        })}
      </Card>
    </View>
  );
}

// Why the tier is below what the hardware could do, if it is.
function ratingNote(rating: StoredRating, t: TFunction): string | null {
  if (rating.hardFail === 'no-rear-camera') return t('rating.failNoCamera');
  if (rating.hardFail === 'below-24-fps') return t('rating.failFps');
  if (rating.hardFail === 'no-pulse') return t('rating.failNoPulse');
  if (rating.ambient) return t('rating.ambient');
  return rating.tier === 'unsupported' ? t('rating.failScore') : null;
}

export default function RatingScreen() {
  const { t } = useTranslation();
  const reveal = useRatingReveal();
  const rating = reveal.kind === 'rated' ? reveal.rating : null;
  const note = rating === null ? null : ratingNote(rating, t);
  return (
    <OnboardingFrame
      step={5}
      title={t('rating.title')}
      subtitle={t('rating.subtitle')}
      centered
      footer={<NavButton label={t('common.continue')} href="/reminders" />}
    >
      {rating === null ? (
        <>
          <RatingDial
            score={null}
            label={t('phoneRating.noScore')}
            caption={reveal.kind === 'measuring' ? t('rating.measuring') : t('phoneRating.notTested')}
          />
          {reveal.kind === 'unrated' ? (
            <>
              <AppText tone="textDim" style={{ textAlign: 'center' }}>
                {t('rating.pending')}
              </AppText>
              <NavButton label={t('rating.practiceAgain')} href="/practice" variant="secondary" />
            </>
          ) : null}
        </>
      ) : (
        <>
          <RatingDial score={rating.score} label={String(rating.score)} caption={tierLabel(t, rating.tier)} />
          {note === null ? null : (
            <AppText tone="textDim" style={{ textAlign: 'center' }}>
              {note}
            </AppText>
          )}
          <PhoneCheckGroup />
          {rating.tier === 'unsupported' ? (
            <>
              <AppText tone="textDim" style={{ textAlign: 'center' }}>
                {t('rating.demoOffer')}
              </AppText>
              <TryDemoButton />
            </>
          ) : (
            <CheckableList rating={rating} />
          )}
        </>
      )}
    </OnboardingFrame>
  );
}
