import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { ReplayCapture } from '../../modules/lumen-capture/src';

import { planPhone } from '@/features/checks/checkPlan';
import { isDemoActive } from '@/features/demo/demoSession';
import { syntheticDemoRecording } from '@/features/demo/syntheticRecording';
import { CaptureView } from '@/features/measure/CaptureView';
import { cleanSecondsNeeded, parseMode, processingHref } from '@/features/measure/mode';
import { useLiveCapture } from '@/features/measure/useLiveCapture';
import { useStoredRating } from '@/data/store/useStoredRating';

const DEMO_LEAD_IN_S = 10;

export default function CaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; restDone?: string; context?: string }>();
  const mode = parseMode(params.mode);
  // Read once so leaving demo mid-capture doesn't swap in the real camera.
  const [demo] = useState(isDemoActive);
  // Demo mode plays a generated recording through the same live session. Extra seconds cover the frames
  // before the first clean second.
  const replay = useMemo(
    () =>
      demo ? new ReplayCapture(syntheticDemoRecording(cleanSecondsNeeded(mode) + DEMO_LEAD_IN_S)) : null,
    [demo, mode],
  );
  const live = useLiveCapture(demo ? replay : undefined, { demo });
  const rating = useStoredRating();

  // Only the clean-seconds count ends a reading, never a timer.
  const complete = live.cleanSeconds !== null && live.cleanSeconds >= cleanSecondsNeeded(mode);
  useEffect(() => {
    if (complete) router.replace(processingHref(mode, params.restDone, params.context));
  }, [complete, router, mode, params.restDone, params.context]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CaptureView
        mode={mode}
        live={live}
        phone={planPhone(rating)}
        onCancel={() => router.replace('/')}
        onStop={() => router.replace(`/measure/inconclusive?mode=${mode}`)}
      />
    </>
  );
}
