import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'lumen.db';

// Bump on a table change and add the N to N+1 step to `migrate`.
const SCHEMA_VERSION = 2;

const SCHEMA_V1 = `
CREATE TABLE readings (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, mode TEXT NOT NULL,
  app_version TEXT, device_model TEXT, rating_score INTEGER, rating_tier TEXT, lens_id TEXT,
  context_json TEXT, results_json TEXT NOT NULL, quality_json TEXT, models_json TEXT,
  capture_path TEXT, demo INTEGER DEFAULT 0);
CREATE TABLE profile (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE baselines (metric TEXT, computed_at INTEGER, median REAL, iqr REAL, n INTEGER,
  PRIMARY KEY (metric, computed_at));
CREATE TABLE device_rating (id INTEGER PRIMARY KEY, tested_at INTEGER, os_version TEXT,
  app_version TEXT, score INTEGER, tier TEXT, components_json TEXT, lens_id TEXT);
`;

// Version 2 stores accepted beat intervals for the rhythm charts; older readings have NULL and no chart.
const SCHEMA_V2_STEP = 'ALTER TABLE readings ADD COLUMN intervals_json TEXT';

async function migrate(database: SQLiteDatabase): Promise<void> {
  const found = (await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  if (found === undefined) throw new Error('SQLite did not report a schema version');
  // Written by a newer build; older table definitions could lose data.
  if (found > SCHEMA_VERSION)
    throw new Error(`the stored data is schema version ${found}, newer than this app's ${SCHEMA_VERSION}`);
  if (found < SCHEMA_VERSION)
    await database.withTransactionAsync(async () => {
      if (found < 1) await database.execAsync(SCHEMA_V1);
      if (found < 2) await database.execAsync(SCHEMA_V2_STEP);
      await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(DATABASE_NAME);
  await migrate(database);
  return database;
}

let opened: Promise<SQLiteDatabase> | null = null;

// One connection for the app; a failed open is retried on the next call.
export function lumenDatabase(): Promise<SQLiteDatabase> {
  opened ??= openAndMigrate().catch((error: unknown) => {
    opened = null;
    throw error;
  });
  return opened;
}
