import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RouteShell } from '@/ui/components/RouteShell';
import { BeatByBeatView } from '@/features/results/BeatByBeatView';
import { useResultsReading } from '@/features/results/useResultsReading';

export default function BeatsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useResultsReading(id);
  if (!reading) return <RouteShell title={t('results.title')} />;
  return <BeatByBeatView reading={reading} />;
}
