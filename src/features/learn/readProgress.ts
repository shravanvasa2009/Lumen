import { lumenDatabase } from '@/data/store/database';
import { profileValue, setProfileValue } from '@/data/store/profile';

const KEY_PREFIX = 'learn.read.';

export type ReadProgress = Readonly<Record<string, number>>;

// Stored in the profile table, which Delete all data already empties.
export async function loadReadProgress(): Promise<ReadProgress> {
  const database = await lumenDatabase();
  const rows = await database.getAllAsync<{ key: string; value: string | null }>(
    'SELECT key, value FROM profile WHERE key LIKE ?',
    [`${KEY_PREFIX}%`],
  );
  return Object.fromEntries(rows.map(({ key, value }) => [key.slice(KEY_PREFIX.length), Number(value) || 0]));
}

// Only moves forward, so scrolling back up does not lose progress.
export async function saveReadProgress(slug: string, percent: number): Promise<void> {
  const stored = Number(await profileValue(`${KEY_PREFIX}${slug}`)) || 0;
  if (percent > stored) await setProfileValue(`${KEY_PREFIX}${slug}`, String(percent));
}
