import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useLoaded } from '@/data/store/useStoredReadings';

import { loadReadProgress, type ReadProgress } from './readProgress';

const NOTHING_READ: ReadProgress = {};

// Re-reads on focus so a chapter just read shows its new share.
export function useReadProgress(): ReadProgress {
  const [progress, load] = useLoaded<ReadProgress>(NOTHING_READ);
  useFocusEffect(useCallback(() => load(loadReadProgress), [load]));
  return progress;
}
