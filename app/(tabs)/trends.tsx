import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { RouteShell } from '@/ui/components/RouteShell';
import { useDemoActive } from '@/features/demo/demoSession';
import { useStoredReadings } from '@/data/store/useStoredReadings';
import { demoHistory, demoNow } from '@/features/trends/demoHistory';
import { historyFromStored } from '@/features/trends/storedHistory';
import { TrendsView } from '@/features/trends/TrendsView';

// Demo mode shows the sample history; otherwise only readings saved on this phone.
export default function TrendsScreen() {
  const { t } = useTranslation();
  const demo = useDemoActive();
  const stored = useStoredReadings();
  const saved = useMemo(() => historyFromStored(stored), [stored]);
  return (
    <RouteShell tabRoot title={t('trends.title')}>
      <TrendsView readings={demo ? demoHistory : saved} now={demo ? demoNow : new Date()} demo={demo} />
    </RouteShell>
  );
}
