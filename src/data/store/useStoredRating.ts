import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { loadDeviceRating, type StoredRating } from './deviceRating';
import { useLoaded } from './useStoredReadings';

// undefined while loading, null when unrated. Rereads on focus since tabs stay mounted across a re-test.
export function useStoredRating(): StoredRating | null | undefined {
  const [rating, load] = useLoaded<StoredRating | null | undefined>(undefined);
  useFocusEffect(useCallback(() => load(loadDeviceRating), [load]));
  return rating;
}
