import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { handOverInconclusive } from '@/features/measure/inconclusiveHandoff';
import { parseMode } from '@/features/measure/mode';
import { ProcessingView } from '@/features/measure/ProcessingView';
import { useReadingAnalysis } from '@/features/measure/useReadingAnalysis';
import { SafetySheet } from '@/features/results/SafetySheet';
import { markSymptomsAsked } from '@/features/results/symptomsAsked';

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; restDone?: string; context?: string }>();
  const mode = parseMode(params.mode);
  const analysis = useReadingAnalysis({
    mode,
    restTimerDone: params.restDone === 'true',
  });
  const [symptomsAnswered, setSymptomsAnswered] = useState(false);

  // Urgent rate flags win over the outcome, so even a refused capture can open Emergency. A rate under 40
  // asks the symptom question first.
  const urgent =
    analysis.phase === 'done' || analysis.phase === 'failed' || analysis.phase === 'running'
      ? analysis.urgent
      : analysis.phase === 'inconclusive'
        ? (analysis.outcome?.urgent ?? null)
        : null;

  // Only this screen routes on an urgent rate, so it cannot be left until the rules have run. Header back
  // and swipe-back are off in the root layout; toggling them here crashed Android. The effect below blocks
  // the Android back press only while analysing.
  const analysing = analysis.phase === 'running' && urgent === undefined;
  useEffect(() => {
    if (!analysing) return;
    const block = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => block.remove();
  }, [analysing]);
  const emergencyNow = urgent?.fastSustained === true;
  const askSymptoms = !emergencyNow && urgent?.slowBelow40 === true && !symptomsAnswered;
  useEffect(() => {
    if (emergencyNow) router.replace('/emergency');
  }, [emergencyNow, router]);

  const mayContinue = !emergencyNow && !askSymptoms;
  const askedHere = urgent?.slowBelow40 === true && symptomsAnswered;

  const readingId = analysis.phase === 'done' ? analysis.readingId : null;
  useEffect(() => {
    if (readingId === null || !mayContinue) return;
    // So Results doesn't ask the same question again.
    if (askedHere) markSymptomsAsked(readingId);
    router.replace(`/results/${readingId}`);
  }, [readingId, mayContinue, askedHere, router]);

  const { context } = params;
  const refused = analysis.phase === 'inconclusive';
  const outcome = analysis.phase === 'inconclusive' ? analysis.outcome : null;
  useEffect(() => {
    if (!refused || !mayContinue) return;
    handOverInconclusive(outcome);
    const forwarded = new URLSearchParams({ mode });
    if (context !== undefined) forwarded.set('context', context);
    router.replace(`/measure/inconclusive?${forwarded.toString()}`);
  }, [refused, mayContinue, outcome, mode, context, router]);

  return (
    <>
      <ProcessingView analysis={analysis} mode={mode} />
      <SafetySheet
        visible={askSymptoms}
        onNo={() => setSymptomsAnswered(true)}
        onYes={() => router.replace('/emergency')}
      />
    </>
  );
}
