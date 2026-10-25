import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ListRow } from '@/ui/components/ListRow';
import { BasicsFields } from '@/data/profile/BasicsFields';
import { basicsAcceptable } from '@/data/profile/diabetesRisk';
import { isValidPhone, useDoctorPhone } from '@/data/profile/doctorPhone';
import { NAME_MAX_LENGTH, useProfileName } from '@/data/profile/profileName';
import { TextFieldGroup } from '@/data/profile/TextFieldGroup';
import { useRiskDraft } from '@/data/profile/useRiskDraft';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { SectionLabel } from '@/features/settings/SectionLabel';
import { Toggle } from '@/features/settings/Toggle';
import { type HealthNote, loadProfile, saveHealthNote } from '@/data/store/profile';
import { useTheme } from '@/ui/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const router = useRouter();
  const risk = useRiskDraft('basics');
  const { phone, problem: phoneProblem, setPhone } = useDoctorPhone();
  const { name, setName } = useProfileName();
  const [nameText, setNameText] = useState(name ?? '');
  const [phoneText, setPhoneText] = useState(phone ?? '');
  const [notes, setNotes] = useState<Record<HealthNote, boolean>>({
    betaBlocker: false,
    pacemaker: false,
    knownAf: false,
    athlete: false,
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Answers given before the saved ones load win over the stored ones.
  const answeredNow = useRef<Partial<Record<HealthNote, boolean>>>({});
  useEffect(() => {
    let active = true;
    loadProfile().then(
      (saved) => {
        if (active) setNotes({ ...saved, ...answeredNow.current });
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  // The saved number fills the field only while nothing has been typed.
  useEffect(() => {
    if (phone !== null) setPhoneText((typed) => (typed === '' ? phone : typed));
  }, [phone]);
  // Same rule for the name.
  useEffect(() => {
    if (name !== null) setNameText((typed) => (typed === '' ? name : typed));
  }, [name]);
  const phoneInvalid = phoneText.trim() !== '' && !isValidPhone(phoneText.trim());
  const noteRows: readonly { note: HealthNote; title: string }[] = [
    { note: 'betaBlocker', title: t('profile.betaBlocker') },
    { note: 'pacemaker', title: t('profile.pacemaker') },
    { note: 'knownAf', title: t('profile.afibReported') },
    { note: 'athlete', title: t('profile.athlete') },
  ];
  function updateName(text: string) {
    setNameText(text);
    setName(text);
  }
  // An empty or invalid field leaves the doctor's phone unset.
  function updateDoctorPhone(text: string) {
    setPhoneText(text);
    const trimmed = text.trim();
    setPhone(isValidPhone(trimmed) ? trimmed : null);
  }
  // The analysis reads these (a pacemaker turns rhythm screening off), so a failed save is shown.
  function saveNote(note: HealthNote, value: boolean) {
    answeredNow.current[note] = value;
    setNotes((current) => ({ ...current, [note]: value }));
    setSaveFailed(false);
    saveHealthNote(note, value).catch(() => setSaveFailed(true));
  }
  // If saving the basics fails, stay here and say so.
  async function saveBasicsAndOpenNextSet() {
    if (await risk.persist()) router.push('/diabetes-risk');
  }
  return (
    <OnboardingFrame
      step={2}
      title={t('profile.title')}
      subtitle={t('profile.subtitle')}
      footer={
        <Button
          label={t('common.continue')}
          disabled={!basicsAcceptable(risk.draft)}
          onPress={() => void saveBasicsAndOpenNextSet()}
        />
      }
    >
      <TextFieldGroup
        heading={t('profile.name')}
        placeholder={t('profile.namePlaceholder')}
        note={t('profile.nameHelp')}
        value={nameText}
        onChangeText={updateName}
        maxLength={NAME_MAX_LENGTH}
      />
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.basics')}</SectionLabel>
        {risk.loaded ? <BasicsFields draft={risk.draft} change={risk.change} /> : null}
      </View>
      <TextFieldGroup
        heading={t('profile.doctorPhone')}
        placeholder={t('profile.doctorPhonePlaceholder')}
        keyboardType="phone-pad"
        maxLength={24}
        value={phoneText}
        onChangeText={updateDoctorPhone}
        problem={
          phoneProblem !== null
            ? phoneProblem === 'load'
              ? t('profile.loadFailed')
              : t('profile.saveFailed')
            : phoneInvalid
              ? t('profile.doctorPhoneInvalid')
              : null
        }
      />
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.healthNotes')}</SectionLabel>
        <Card flush>
          {noteRows.map(({ note, title }, index) => (
            <ListRow
              key={note}
              title={title}
              last={index === noteRows.length - 1}
              trailing={
                <Toggle label={title} value={notes[note]} onValueChange={(value) => saveNote(note, value)} />
              }
            />
          ))}
        </Card>
        <AppText variant="caption" tone="textDim">
          {t('profile.note')}
        </AppText>
        {loadFailed || risk.loadFailed ? (
          <AppText variant="caption" tone="textDim" accessibilityRole="alert">
            {t('profile.loadFailed')}
          </AppText>
        ) : null}
        {saveFailed || risk.saveFailed ? (
          <AppText variant="caption" tone="textDim" accessibilityRole="alert">
            {t('profile.saveFailed')}
          </AppText>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}
