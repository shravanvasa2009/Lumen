import type { Profile } from '@/core';

import { isDemoActive } from '@/features/demo/demoSession';

import type { RiskDraft, Sex } from '@/data/profile/diabetesRisk';

import { lumenDatabase } from './database';

export async function profileValue(key: string): Promise<string | null> {
  const database = await lumenDatabase();
  const row = await database.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM profile WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

const UPSERT =
  'INSERT INTO profile (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

// Demo mode writes nothing.
export async function setProfileValue(key: string, value: string): Promise<void> {
  if (isDemoActive()) return;
  const database = await lumenDatabase();
  await database.runAsync(UPSERT, [key, value]);
}

// All or none.
export async function setProfileValues(entries: Record<string, string>): Promise<void> {
  if (isDemoActive()) return;
  const database = await lumenDatabase();
  await database.withTransactionAsync(async () => {
    for (const [key, value] of Object.entries(entries)) await database.runAsync(UPSERT, [key, value]);
  });
}

const HEALTH_NOTES = [
  'athlete',
  'betaBlocker',
  'pacemaker',
  'knownAf',
] as const satisfies readonly (keyof Profile)[];
export type HealthNote = (typeof HEALTH_NOTES)[number];

// Unanswered means not set.
export async function loadProfile(): Promise<Profile> {
  const answers = await Promise.all(HEALTH_NOTES.map(async (note) => (await profileValue(note)) === 'true'));
  const [athlete, betaBlocker, pacemaker, knownAf] = answers as [boolean, boolean, boolean, boolean];
  return { athlete, betaBlocker, pacemaker, knownAf };
}

export function saveHealthNote(note: HealthNote, value: boolean): Promise<void> {
  return setProfileValue(note, String(value));
}

const SEXES: readonly Sex[] = ['female', 'male', 'preferNot'];

// Age keeps its original key name.
const NUMBER_KEYS = { ageYears: 'age', heightCm: 'heightCm', weightKg: 'weightKg' } as const;
const FLAG_KEYS = {
  familyHistory: 'familyHistory',
  hypertension: 'hypertension',
  physicallyActive: 'physicallyActive',
  gestationalDiabetes: 'gestationalDiabetes',
} as const;
const SEX_KEY = 'sex';

// Number() reads '' as 0 and accepts ' 5' or '1e2', so only plain non-negative decimals count.
const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

async function storedNumber(key: string): Promise<number | null> {
  const text = await profileValue(key);
  if (text === null || !PLAIN_NUMBER.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

async function storedFlag(key: string): Promise<boolean | null> {
  const text = await profileValue(key);
  return text === 'true' ? true : text === 'false' ? false : null;
}

// Unanswered loads as null, never as "No".
export async function loadRiskDraft(): Promise<RiskDraft> {
  const [sexText, ageYears, heightCm, weightKg, familyHistory, hypertension, physicallyActive, gestational] =
    await Promise.all([
      profileValue(SEX_KEY),
      storedNumber(NUMBER_KEYS.ageYears),
      storedNumber(NUMBER_KEYS.heightCm),
      storedNumber(NUMBER_KEYS.weightKg),
      storedFlag(FLAG_KEYS.familyHistory),
      storedFlag(FLAG_KEYS.hypertension),
      storedFlag(FLAG_KEYS.physicallyActive),
      storedFlag(FLAG_KEYS.gestationalDiabetes),
    ]);
  return {
    ageYears,
    sex: SEXES.find((sex) => sex === sexText) ?? null,
    heightCm,
    weightKg,
    familyHistory,
    hypertension,
    physicallyActive,
    gestationalDiabetes: gestational,
  };
}

export type RiskScope = 'basics' | 'questions' | 'all';

// Each screen saves only its own scope so neither overwrites the other from a stale copy. One
// transaction; null answers are deleted. Demo mode writes nothing.
export async function saveRiskDraft(draft: RiskDraft, scope: RiskScope = 'all'): Promise<void> {
  if (isDemoActive()) return;
  const basics: (readonly [string, string | null])[] = [
    [SEX_KEY, draft.sex],
    ...(Object.keys(NUMBER_KEYS) as (keyof typeof NUMBER_KEYS)[]).map(
      (field) => [NUMBER_KEYS[field], draft[field] === null ? null : String(draft[field])] as const,
    ),
  ];
  // Changing sex away from Female removes any pregnancy answer.
  if (draft.sex !== 'female' && scope === 'basics') basics.push([FLAG_KEYS.gestationalDiabetes, null]);
  const questions = (Object.keys(FLAG_KEYS) as (keyof typeof FLAG_KEYS)[]).map(
    (field) => [FLAG_KEYS[field], draft[field] === null ? null : String(draft[field])] as const,
  );
  const entries = scope === 'basics' ? basics : scope === 'questions' ? questions : [...basics, ...questions];
  const database = await lumenDatabase();
  await database.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      if (value === null) await database.runAsync('DELETE FROM profile WHERE key = ?', [key]);
      else await database.runAsync(UPSERT, [key, value]);
    }
  });
}
