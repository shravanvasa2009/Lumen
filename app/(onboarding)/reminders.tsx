import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Icon, type IconName } from '@/ui/components/Icon';
import { LumenAppIcon } from '@/ui/components/LumenLockup';
import { ListRow } from '@/ui/components/ListRow';
import { lockscreenStrings } from '@/ui/i18n/lockscreen';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import type { ClockTime } from '@/features/notifications/localTime';
import { loadNotificationPrefs } from '@/features/notifications/prefs';
import { finishOnboarding } from '@/data/profile/onboarding';
import { askPermission, saveAndSyncNotifications } from '@/features/settings/applyPrefs';
import { TimeRow } from '@/features/settings/TimeRow';
import { Toggle } from '@/features/settings/Toggle';
import { useTheme } from '@/ui/theme';

const DEFAULT_TIME: ClockTime = { hour: 8, minute: 0 };

type Reminder = 'daily' | 'followUp' | 'doctor';

export default function RemindersScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, control } = useTheme();
  const [finishFailed, setFinishFailed] = useState(false);
  const [dailyTime, setDailyTime] = useState(DEFAULT_TIME);
  const [enabled, setEnabled] = useState<Record<Reminder, boolean>>({
    daily: false,
    followUp: true,
    doctor: true,
  });
  // A failed save keeps the person here with a message, or Welcome would silently show again next launch.
  async function openHome() {
    try {
      await finishOnboarding();
    } catch {
      setFinishFailed(true);
      return;
    }
    router.replace('/');
  }

  // The app works without notifications, so a refusal or a failed request still moves on to Home.
  async function askPermissionThenOpenHome() {
    try {
      const permission = await askPermission();
      const saved = loadNotificationPrefs();
      await saveAndSyncNotifications(
        {
          ...saved,
          enabled: {
            ...saved.enabled,
            daily: enabled.daily,
            confirmation: enabled.followUp,
            'doctor-followup': enabled.doctor,
          },
          dailyTime,
        },
        i18n.language,
        permission,
      );
    } catch (error) {
      console.warn(
        `Notification permission request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await openHome();
  }

  const rows: readonly { reminder: Reminder; title: string; icon: IconName }[] = [
    { reminder: 'daily', title: t('notifications.daily'), icon: 'bell' },
    { reminder: 'followUp', title: t('notifications.followUp'), icon: 'refresh' },
    { reminder: 'doctor', title: t('notifications.doctor'), icon: 'stethoscope' },
  ];
  return (
    <OnboardingFrame
      step={6}
      title={t('reminders.title')}
      subtitle={t('reminders.subtitle')}
      footer={
        <>
          <Button label={t('reminders.turnOn')} onPress={() => void askPermissionThenOpenHome()} />
          <Button label={t('reminders.notNow')} variant="link" onPress={() => void openHome()} />
        </>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <View
          accessible
          accessibilityLabel={t('reminders.previewLabel')}
          style={{
            height: 164,
            borderRadius: radius.sheet,
            backgroundColor: colors.plotPanel,
            overflow: 'hidden',
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Icon name="lock" size={18} color={colors.onPlot} />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.sheet - 2,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ width: 38, height: 38 }}>
              <LumenAppIcon size={38} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="headline" style={{ fontSize: 15 }}>
                  {t('app.name')}
                </AppText>
                <AppText variant="caption" tone="textDim">
                  {t('reminders.previewNow')}
                </AppText>
              </View>
              <AppText style={{ fontSize: 15, lineHeight: 20 }}>
                {lockscreenStrings(i18n.language)['notif.daily']}
              </AppText>
            </View>
          </View>
        </View>
        <AppText variant="caption" tone="textDim" style={{ textAlign: 'center' }}>
          {t('reminders.previewNote')}
        </AppText>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Card flush>
          {rows.map(({ reminder, title, icon }, index) => (
            <Fragment key={reminder}>
              <ListRow
                title={title}
                last={index === rows.length - 1}
                leading={<Icon name={icon} size={control.chevronSize} color={colors.accent} />}
                trailing={
                  <Toggle
                    label={title}
                    value={enabled[reminder]}
                    onValueChange={(value) => setEnabled({ ...enabled, [reminder]: value })}
                  />
                }
              />
              {reminder === 'daily' ? (
                <TimeRow
                  title={t('notifications.dailyTime')}
                  time={dailyTime}
                  languageTag={i18n.language}
                  leading={<Icon name="alarm" size={control.chevronSize} color={colors.accent} />}
                  onChange={setDailyTime}
                />
              ) : null}
            </Fragment>
          ))}
        </Card>
        <AppText variant="caption" tone="textDim">
          {t('reminders.localOnly')}
        </AppText>
        {finishFailed ? (
          <AppText variant="caption" tone="textDim" accessibilityRole="alert">
            {t('reminders.finishFailed')}
          </AppText>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}
