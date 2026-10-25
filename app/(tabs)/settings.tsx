import Constants from 'expo-constants';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import type { IconName } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import { RouteShell } from '@/ui/components/RouteShell';
import { useDemoActive } from '@/features/demo/demoSession';
import { useStartDemo } from '@/features/demo/useStartDemo';
import { shareReadingsCsv } from '@/features/export/shareReadings';
import { tierLabel } from '@/features/rating/labels';
import { AboutCard } from '@/features/settings/AboutCard';
import { GroupLabel } from '@/features/settings/GroupLabel';
import { IconTile } from '@/features/settings/IconTile';
import { LanguagePicker } from '@/features/settings/LanguagePicker';
import { deleteAllData } from '@/data/store/deleteAllData';
import { useStoredRating } from '@/data/store/useStoredRating';
import { usePreferences } from '@/ui/theme/preferences';

type SettingsRow = {
  title: string;
  icon: IconName;
  neutralIcon?: boolean;
  value?: string;
  href?: Href;
  onPress?: () => void;
  expanded?: boolean;
  busy?: boolean;
};

type DeleteStep = 'idle' | 'confirming' | 'deleting' | 'failed';
type ExportStep = 'idle' | 'busy' | 'empty' | 'unavailable' | 'failed';
type OpenPanel = 'language' | 'about' | null;

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { appearance } = usePreferences();
  const rating = useStoredRating();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [exportStep, setExportStep] = useState<ExportStep>('idle');
  const [panel, setPanel] = useState<OpenPanel>(null);
  const startDemo = useStartDemo();
  const exportMessages = {
    empty: t('settings.exportEmpty'),
    unavailable: t('settings.exportUnavailable'),
    failed: t('settings.exportFailed'),
  };

  const appearanceNames = {
    system: t('appearance.segmentSystem'),
    light: t('appearance.light'),
    dark: t('appearance.dark'),
  };
  const personalRows: readonly SettingsRow[] = [
    { title: t('settings.profile'), icon: 'standing', href: '/profile' },
    { title: t('profile.diabetesRisk'), icon: 'drop', href: '/settings/profile' },
  ];
  const displayRows: readonly SettingsRow[] = [
    {
      title: t('notifications.title'),
      icon: 'clock',
      value: t('settings.notActiveYet'),
      href: '/settings/notifications',
    },
    { title: t('appearance.title'), icon: 'settings', value: appearanceNames[appearance], href: '/settings/appearance' },
    {
      title: t('settings.language'),
      icon: 'lens',
      value: i18n.language === 'es' ? t('language.es') : t('language.en'),
      expanded: panel === 'language',
      onPress: () => setPanel(panel === 'language' ? null : 'language'),
    },
    { title: t('settings.widgets'), icon: 'bars', href: '/settings/widgets' },
  ];
  const accuracyRows: readonly SettingsRow[] = [
    { title: t('settings.accuracy'), icon: 'check', href: '/settings/accuracy' },
  ];
  const demo = useDemoActive();
  const phoneRows: readonly SettingsRow[] = [
    {
      title: t('settings.phone'),
      icon: 'phone',
      value:
        rating === undefined
          ? undefined
          : rating === null
            ? t('settings.phoneNotTested')
            : t('settings.phoneRated', { tier: tierLabel(t, rating.tier), score: rating.score }),
      href: '/settings/phone',
    },
    // Onboarding cannot finish in demo, so Replay tutorial would be a dead end there.
    ...(demo ? [] : [{ title: t('settings.replayTutorial'), icon: 'refresh' as const, href: '/welcome' as const }]),
    // Already in a demo, so the row would only restart it.
    ...(demo ? [] : [{ title: t('settings.demoMode'), icon: 'pulse' as const, onPress: startDemo }]),
  ];
  const dataRows: readonly SettingsRow[] = [
    {
      title: t('settings.export'),
      icon: 'share',
      busy: exportStep === 'busy',
      onPress: () => void exportReadings(),
    },
    {
      title: t('settings.delete'),
      icon: 'close',
      neutralIcon: true,
      expanded: deleteStep !== 'idle',
      busy: deleteStep === 'deleting',
      onPress: () => setDeleteStep(deleteStep === 'idle' ? 'confirming' : 'idle'),
    },
    {
      title: t('settings.about'),
      icon: 'hint',
      expanded: panel === 'about',
      onPress: () => setPanel(panel === 'about' ? null : 'about'),
    },
  ];

  // Lumen sends nothing itself. Closing the share sheet without sending is not an error.
  async function exportReadings() {
    setExportStep('busy');
    try {
      const outcome = await shareReadingsCsv();
      setExportStep(outcome === 'shared' ? 'idle' : outcome);
    } catch {
      setExportStep('failed');
    }
  }

  // A failure is always shown; the person has to know whether their data is gone.
  async function deleteEverything() {
    setDeleteStep('deleting');
    try {
      await deleteAllData(i18n.language);
    } catch {
      setDeleteStep('failed');
      return;
    }
    router.replace('/welcome');
  }

  function renderRows(rows: readonly SettingsRow[]) {
    return rows.map(({ title, icon, neutralIcon, value, href, onPress, expanded, busy }, index) => {
      return (
        <ListRow
          key={title}
          title={title}
          leading={<IconTile name={icon} neutral={neutralIcon} />}
          last={index === rows.length - 1}
          chevron={href !== undefined}
          disabled={busy}
          expanded={expanded}
          trailing={value ? <AppText tone="textDim">{value}</AppText> : undefined}
          onPress={onPress ?? (href === undefined ? undefined : () => router.push(href))}
        />
      );
    });
  }

  return (
    <RouteShell tabRoot title={t('settings.title')}>
      <Card flush>{renderRows(personalRows)}</Card>
      <GroupLabel>{t('settings.groupDisplay')}</GroupLabel>
      <Card flush>{renderRows(displayRows)}</Card>
      {panel === 'language' ? <LanguagePicker /> : null}
      <GroupLabel>{t('settings.groupPhone')}</GroupLabel>
      <Card flush>{renderRows(phoneRows)}</Card>
      <Card flush>{renderRows(accuracyRows)}</Card>
      <GroupLabel>{t('settings.groupData')}</GroupLabel>
      <Card flush>{renderRows(dataRows)}</Card>
      {exportStep === 'idle' || exportStep === 'busy' ? null : (
        <AppText accessibilityRole="alert" tone="textDim">
          {exportMessages[exportStep]}
        </AppText>
      )}
      {panel === 'about' ? <AboutCard /> : null}
      {deleteStep === 'idle' ? null : (
        <Card>
          <AppText variant="headline">{t('settings.deleteConfirmTitle')}</AppText>
          <AppText tone="textDim">{t('settings.deleteConfirmBody')}</AppText>
          {deleteStep === 'failed' ? (
            <AppText accessibilityRole="alert">{t('settings.deleteFailed')}</AppText>
          ) : null}
          <Button
            label={deleteStep === 'deleting' ? t('settings.deleting') : t('settings.deleteConfirm')}
            disabled={deleteStep === 'deleting'}
            onPress={() => void deleteEverything()}
          />
          <Button
            label={t('settings.deleteCancel')}
            variant="link"
            disabled={deleteStep === 'deleting'}
            onPress={() => setDeleteStep('idle')}
          />
        </Card>
      )}
      <AppText variant="caption" tone="textFaint" style={{ textAlign: 'center' }}>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '' })}
      </AppText>
    </RouteShell>
  );
}
