import { useLocalSearchParams } from 'expo-router';

import { FixTechniqueView } from '@/features/fix/FixTechniqueView';
import { parseCause } from '@/features/fix/causes';
import { parseMode } from '@/features/measure/mode';

export default function FixTechniqueScreen() {
  const params = useLocalSearchParams<{ mode?: string; cause?: string }>();
  return <FixTechniqueView mode={parseMode(params.mode)} cause={parseCause(params.cause)} />;
}
