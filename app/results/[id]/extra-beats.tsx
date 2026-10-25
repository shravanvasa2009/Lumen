import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RouteShell } from '@/ui/components/RouteShell';
import { ExtraBeatsView } from '@/features/results/ExtraBeatsView';
import { useResultsReading } from '@/features/results/useResultsReading';

export default function ExtraBeatsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useResultsReading(id);
  if (!reading) return <RouteShell title={t('results.title')} />;
  return <ExtraBeatsView reading={reading} />;
}
