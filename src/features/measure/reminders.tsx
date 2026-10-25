import { useTranslation } from 'react-i18next';

import { Card } from '@/ui/components/Card';
import { Icon } from '@/ui/components/Icon';
import { ListRow } from '@/ui/components/ListRow';
import type { StoredReading } from '@/features/home/readings';
import { useTheme } from '@/ui/theme';

// After this many conclusive readings the reminders fold to one row.
export const READINGS_BEFORE_COLLAPSE = 3;

export function conclusiveCount(readings: readonly StoredReading[]): number {
  return readings.filter((reading) => reading.outcome.headlineKey !== 'result.inconclusive').length;
}

// Shared by the pre-check card and the Capture "?" sheet.
export function ReminderRows() {
  const { t } = useTranslation();
  const { colors, control } = useTheme();
  const reminders = [
    { icon: 'finger', color: colors.pulse, text: t('precheck.reminderFlat') },
    { icon: 'elbow', color: colors.accent, text: t('precheck.reminderElbows') },
    { icon: 'warm', color: colors.flag, text: t('precheck.reminderWarm') },
  ] as const;
  return (
    <Card flush>
      {reminders.map(({ icon, color, text }, index) => (
        <ListRow
          key={text}
          title={text}
          last={index === reminders.length - 1}
          leading={<Icon name={icon} size={control.chevronSize} color={color} />}
        />
      ))}
    </Card>
  );
}
