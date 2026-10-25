import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { RouteShell } from '@/ui/components/RouteShell';
import { ReadingResults } from '@/features/results/ReadingResults';
import { clearSymptomsAsked } from '@/features/results/symptomsAsked';
import { useResultsReading } from '@/features/results/useResultsReading';

export default function ResultsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useResultsReading(id);
  // The mark belongs only to the visit right after Processing.
  useEffect(() => () => clearSymptomsAsked(id), [id]);
  if (reading === undefined) return <RouteShell title={t('results.title')} />;
  // An id with no stored reading shows no values rather than made-up ones.
  return reading ? (
    <ReadingResults key={reading.id} reading={reading} />
  ) : (
    <RouteShell title={t('results.title')} subtitle={t('result.inconclusive')} />
  );
}
