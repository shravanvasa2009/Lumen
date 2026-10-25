import { useLocalSearchParams } from 'expo-router';

import { handedInconclusive } from '@/features/measure/inconclusiveHandoff';
import { parseMode } from '@/features/measure/mode';
import { readingById } from '@/features/results/fixtures';
import { InconclusiveView } from '@/features/results/InconclusiveView';

export default function InconclusiveScreen() {
  const { mode, id, context } = useLocalSearchParams<{ mode?: string; id?: string; context?: string }>();
  return (
    <InconclusiveView
      reading={readingById(id)}
      outcome={handedInconclusive()}
      mode={parseMode(mode)}
      context={context}
    />
  );
}
