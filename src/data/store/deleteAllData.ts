import { Directory, File, Paths } from 'expo-file-system';
import { cancelAllScheduledNotificationsAsync } from 'expo-notifications';

import { clearDemoReadings } from '@/features/demo/demoReadings';
import { exitDemo } from '@/features/demo/demoSession';
import { removeExportFile } from '@/features/export/exportFile';
import { keepCapture } from '@/features/measure/keptCapture';
import type { NotificationPrefs, NotificationTriggers } from '@/features/notifications/plan';
import { syncNotifications } from '@/features/notifications/scheduler';
import { resetDoctorPhone } from '@/data/profile/doctorPhone';
import { resetProfileName } from '@/data/profile/profileName';
import { currentPreferences, resetPreferences } from '@/ui/theme/preferences';
import { publishWidgets } from '@/features/widgets/publish';

import { lumenDatabase } from './database';

// File names owned by src/notifications.
const NOTIFICATION_FILES = ['notification-prefs.json', 'notification-schedule.json'];

const NOTHING_ENABLED: NotificationPrefs = {
  enabled: { daily: false, confirmation: false, 'doctor-followup': false, standing: false, retest: false },
  dailyTime: { hour: 8, minute: 0 },
  quietHours: { start: { hour: 21, minute: 0 }, end: { hour: 7, minute: 0 } },
};

const NO_TRIGGERS: NotificationTriggers = {
  confirmationFor: null,
  doctorFollowupFor: null,
  standingStartedAt: null,
  lastPhoneCheckAt: null,
};

// expo-print writes its PDFs to <cache>/Print.
const PRINT_FOLDER = 'Print';

// secure_delete and VACUUM keep deleted values out of free pages; VACUUM cannot run in a transaction.
// Tables come from the schema, so new ones are wiped too.
async function emptyEveryTable(): Promise<void> {
  const database = await lumenDatabase();
  await database.execAsync('PRAGMA secure_delete = ON');
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  await database.withTransactionAsync(async () => {
    for (const { name } of tables) await database.runAsync(`DELETE FROM "${name}"`);
  });
  await database.execAsync('VACUUM');
}

// Sync with every reminder off first so a running sync finishes before deletion and nothing re-plans.
// Captures live in memory only, and models are not personal data. Rerunning after any failure finishes
// the job.
// expo-notifications 57: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
// expo-file-system 57: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
export async function deleteAllData(languageTag: string): Promise<void> {
  await syncNotifications(
    {
      prefs: NOTHING_ENABLED,
      triggers: NO_TRIGGERS,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    languageTag,
  );
  await cancelAllScheduledNotificationsAsync();
  await emptyEveryTable();
  for (const name of NOTIFICATION_FILES) {
    const file = new File(Paths.document, name);
    if (file.exists) file.delete();
  }
  const printed = new Directory(Paths.cache, PRINT_FOLDER);
  if (printed.exists) printed.delete();
  removeExportFile();
  keepCapture(null);
  clearDemoReadings();
  resetPreferences();
  resetDoctorPhone();
  resetProfileName();
  exitDemo();
  // The widget snapshot lives outside SQLite; with empty tables this publishes the empty state.
  await publishWidgets(currentPreferences());
}
