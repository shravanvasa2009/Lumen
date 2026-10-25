import {
  createLiveSession,
  displayPulse,
  DSP_CONFIG,
  estimateLiveHeartRate,
  frameProblem,
  type CoachingKey,
  type LiveSession,
  type RejectedSpan,
  type Sample,
  type SqiWindow,
} from '@/core';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  LumenCapture,
  type Capabilities,
  type CaptureConfig,
  type CaptureStatus,
  type LensInfo,
  type LumenCaptureModule,
  type SampleBatch,
} from '../../../modules/lumen-capture/src';
import { scoreSqiWindow, sqiThreshold } from '../../ml/runtime';
import { keepCapture, keepLiveCapture, liveCaptureChanged } from './keptCapture';
import { signalLevel } from './signalLevel';
import { WAVEFORM_WINDOW_NS } from './waveformWindow';

// The spectrum needs the last liveHr.windowS seconds.
const LEVEL_EVERY_NS = 1e9;
// Clean seconds rise in steps, so only two seconds of frame time without a rise means stopped.
const ADVANCE_HOLD_NS = 2e9;
const LEVEL_WINDOW_NS = DSP_CONFIG.liveHr.windowS * 1e9;
// Auto-exposure settles 1 s on the finger before exposure, white balance and focus lock.
const EXPOSURE_SETTLE_MS = 1000;
// Captures run minutes with no touch; a screen timeout would stop the camera.
const KEEP_AWAKE_TAG = 'lumen-capture';

type LivePhase =
  // 'unavailable': capture module not linked (Jest, Expo Go).
  'unavailable' | 'starting' | 'running' | 'denied' | 'failed' | 'stopped';

export interface LiveCapture {
  phase: LivePhase;
  failure: string | null;
  status: CaptureStatus | null;
  // Raw red means of the last 6 s; the screen only scales them.
  recentRed: readonly number[];
  // Same clock as recentWaveform.tS.
  recentRedTS: readonly number[];
  // Display-only pulse of the same 6 s, one smooth bump per beat; empty without a session.
  recentPulse: readonly number[];
  // Frame-clock seconds since the first frame, not a timer.
  elapsedS: number;
  // null while the session is not running.
  cleanSeconds: number | null;
  coachingKey: CoachingKey | null;
  // In seconds from the first frame.
  recentWaveform: { tS: number[]; ppg: number[] };
  rejectedSpans: RejectedSpan[];
  // 0 to 1; null until the session has a pulse window.
  signalLevel: number | null;
  // Native frames only; Replay and Demo have no preview session.
  nativeCamera: boolean;
  // The level can look fine while every frame is rejected (clipped red, settling exposure), so "good"
  // on screen follows this instead.
  advancing: boolean;
  // From finger-on until lockExposure settles (1 to 3 steps on a Galaxy A17, each greying about 1 s).
  adjustingExposure: boolean;
}

type LiveState = Omit<LiveCapture, 'nativeCamera'>;

const idle = (phase: LivePhase): LiveState => ({
  phase,
  failure: null,
  status: null,
  recentRed: [],
  recentRedTS: [],
  recentPulse: [],
  elapsedS: 0,
  cleanSeconds: null,
  coachingKey: null,
  recentWaveform: { tS: [], ppg: [] },
  rejectedSpans: [],
  signalLevel: null,
  advancing: false,
  adjustingExposure: false,
});

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Prefer a wide torch lens. With none, use the default lens and no torch; native rejects a torch
// level on a phone without one.
function chosenLens(capabilities: Capabilities): LensInfo | undefined {
  const lit = capabilities.rearLenses.filter((lens) => lens.torchUsable);
  return lit.find((candidate) => candidate.kind === 'wide') ?? lit[0];
}

// A request only; the session uses the rate start() reports.
const CAPTURE_FPS_CEILING: Record<Capabilities['platform'], number> = { ios: 120, android: 60 };

const captureFpsFor = (platform: Capabilities['platform'], lens: LensInfo): number =>
  Math.min(lens.maxFps, CAPTURE_FPS_CEILING[platform]);

function captureConfig(capabilities: Capabilities, lens: LensInfo | undefined, fps: number): CaptureConfig {
  return {
    ...(lens ? { lensId: lens.id, targetFps: fps } : {}),
    torchLevel: lens && capabilities.torch.available ? 1 : 0,
  };
}

// Runs the rear camera and torch while mounted and keeps frames for Processing. A stack screen stays
// mounted under the next one, so practice passes `enabled` false when it loses focus.
export function useLiveCapture(
  capture: LumenCaptureModule | null = LumenCapture,
  { demo = false, enabled = true }: { demo?: boolean; enabled?: boolean } = {},
): LiveCapture {
  const [live, setLive] = useState<LiveState>(idle(capture ? 'starting' : 'unavailable'));
  const [permissionGrants, setPermissionGrants] = useState(0);

  // The system may not ask again after a denial. getPermission does not prompt, so the dialog cannot
  // raise another foreground event.
  useEffect(() => {
    if (!capture || live.phase !== 'denied') return;
    let mounted = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      capture
        .getPermission()
        .then((permission) => {
          if (!mounted || !permission.granted) return;
          setLive(idle('starting'));
          setPermissionGrants((count) => count + 1);
        })
        .catch((error: unknown) => console.warn(`Camera permission check failed: ${reasonOf(error)}`));
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [capture, live.phase]);

  useEffect(() => {
    if (!capture) return;
    if (!enabled) {
      // Nothing live may be claimed with the camera off; counted clean seconds stay.
      setLive((previous) =>
        previous.phase === 'running' || previous.phase === 'starting'
          ? { ...idle('stopped'), cleanSeconds: previous.cleanSeconds }
          : previous,
      );
      return;
    }
    // Old numbers must not show while a new capture warms up.
    setLive((previous) => (previous.phase === 'starting' ? previous : idle('starting')));
    let mounted = true;
    let started = false;
    let subscriptions: { remove(): void }[] = [];
    let recent: { tNs: number; r: number }[] = [];
    let levelFrames: Sample[] = [];
    // The filter's step when a finger goes on is not a pulse.
    let coveredSinceNs: number | null = null;
    let levelAtNs = -Infinity;
    let lastCleanS = 0;
    let lastRiseNs: number | null = null;
    let level: number | null = null;
    // null until the spectrum finds a rate.
    let pulseRateBpm: number | null = null;
    let firstNs: number | null = null;
    let session: LiveSession | null = null;
    let captureFps = 0;
    let lensId: string | null = null;
    let keptFrames = false;
    // The cut-off is null while no SQI model ships; a threshold of 0 then rejects nothing.
    const threshold = sqiThreshold();
    let scoredEndS: number | null = null;
    let scoring = false;
    // Ambient (no torch) needs a different exposure plan that is not implemented.
    let lockWanted = false;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let adjusting = false;
    const setAdjusting = (now: boolean) => {
      if (adjusting === now) return;
      adjusting = now;
      setLive((previous) => ({ ...previous, adjustingExposure: now }));
    };

    const cancelLock = () => {
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = null;
    };

    // Each exposure change greys out the next second, so auto-exposure may never count clean time.
    // A finger lifted during the settle restarts the lock.
    const lockAfterSettle = (status: CaptureStatus) => {
      if (!started || !lockWanted) return;
      if (!status.fingerCovered) {
        cancelLock();
        setAdjusting(false);
        return;
      }
      setAdjusting(true);
      lockTimer ??= setTimeout(() => {
        lockTimer = null;
        lockWanted = false;
        capture
          .lockExposure()
          .catch((error: unknown) => console.warn(`Exposure did not lock: ${reasonOf(error)}`))
          .finally(() => {
            if (started) setAdjusting(false);
          });
      }, EXPOSURE_SETTLE_MS);
    };

    const stopCamera = () => {
      cancelLock();
      lockWanted = false;
      adjusting = false;
      subscriptions.forEach((subscription) => subscription.remove());
      subscriptions = [];
      if (started) {
        capture.stop().catch((error: unknown) => console.warn(`Capture did not stop: ${reasonOf(error)}`));
        deactivateKeepAwake(KEEP_AWAKE_TAG).catch((error: unknown) =>
          console.warn(`Screen sleep was not restored: ${reasonOf(error)}`),
        );
      }
      started = false;
      session = null;
    };

    const scoreWindow = async (scored: LiveSession, window: SqiWindow) => {
      scoring = true;
      try {
        const score = await scoreSqiWindow(window.input);
        // The screen closed or the session failed while the model ran.
        if (score.source !== 'model' || scored !== session) return;
        scored.setSqi(window.endS, score.pClean);
        liveCaptureChanged();
      } catch (error) {
        console.warn(`SQI scoring failed: ${reasonOf(error)}`);
      } finally {
        scoring = false;
      }
    };

    // After a refused batch the frames can no longer be trusted to line up, so counting ends.
    const feedSession = (batch: SampleBatch): string | null => {
      if (!session) return null;
      try {
        session.pushSamples(batch);
      } catch (error) {
        session = null;
        level = null;
        pulseRateBpm = null;
        levelAtNs = -Infinity;
        lastRiseNs = null;
        return reasonOf(error);
      }
      if (keptFrames) liveCaptureChanged();
      else {
        const fed = session;
        keepLiveCapture({
          captureFps,
          lensId,
          readingInput: () => fed.readingInput(),
          ...(demo ? { demo: true as const } : {}),
        });
        keptFrames = true;
      }
      const window = session.sqiWindow;
      if (threshold !== null && window && !scoring && window.endS !== scoredEndS) {
        scoredEndS = window.endS;
        void scoreWindow(session, window);
      }
      return null;
    };

    // On Android these can be dark frames from before the torch came on.
    const onSamples = (batch: SampleBatch) => {
      const newest = batch.samples[batch.samples.length - 1];
      if (!started || !newest) return;
      firstNs ??= batch.samples[0]?.tNs ?? newest.tNs;
      const startNs = firstNs;
      recent = [...recent, ...batch.samples.map(({ tNs, r }) => ({ tNs, r }))].filter(
        (sample) => newest.tNs - sample.tNs <= WAVEFORM_WINDOW_NS,
      );
      batch.samples.forEach((sample, index) => {
        const stat = batch.stats[index];
        const covered = stat === undefined || frameProblem(sample, stat) !== 'coverage';
        coveredSinceNs = covered ? (coveredSinceNs ?? sample.tNs) : null;
      });
      levelFrames = [...levelFrames, ...batch.samples].filter(
        (sample) =>
          newest.tNs - sample.tNs <= LEVEL_WINDOW_NS &&
          coveredSinceNs !== null &&
          sample.tNs >= coveredSinceNs,
      );
      const hadSession = session !== null;
      const refusal = feedSession(batch);
      if (session && newest.tNs - levelAtNs >= LEVEL_EVERY_NS) {
        levelAtNs = newest.tNs;
        // The band filter rings for about one window after a finger goes on and reads as a strong pulse,
        // so the level waits for a second window.
        const settled =
          coveredSinceNs !== null &&
          newest.tNs - coveredSinceNs >= 2 * DSP_CONFIG.live.perfusionWindowS * 1e9;
        level = settled ? signalLevel(session.perfusionPct, levelFrames) : null;
        pulseRateBpm = estimateLiveHeartRate(levelFrames)?.bpm ?? null;
      }
      if (session && session.cleanSeconds > lastCleanS) lastRiseNs = newest.tNs;
      lastCleanS = session?.cleanSeconds ?? 0;
      const advancing = lastRiseNs !== null && newest.tNs - lastRiseNs <= ADVANCE_HOLD_NS;
      const waveform = session?.recentWaveform ?? null;
      setLive((previous) => ({
        ...previous,
        advancing: session !== null && advancing,
        recentRed: recent.map((sample) => sample.r),
        recentRedTS: recent.map((sample) => (sample.tNs - startNs) / 1e9),
        elapsedS: (newest.tNs - startNs) / 1e9,
        ...(session && waveform
          ? {
              cleanSeconds: session.cleanSeconds,
              coachingKey: session.coachingKey,
              recentWaveform: waveform,
              recentPulse: displayPulse(waveform.tS, waveform.ppg, pulseRateBpm),
              rejectedSpans: session.rejectedSpans,
              signalLevel: level,
            }
          : hadSession
            ? { cleanSeconds: null, coachingKey: null, signalLevel: null, recentPulse: [], failure: refusal }
            : {}),
      }));
    };

    const begin = async () => {
      try {
        const permission = await capture.requestPermission();
        if (!mounted) return;
        if (!permission.granted) {
          setLive(idle('denied'));
          return;
        }
        const capabilities = await capture.getCapabilities();
        if (!mounted) return;
        const lens = chosenLens(capabilities);
        const requestedFps = lens ? captureFpsFor(capabilities.platform, lens) : 0;
        keepCapture(null);
        subscriptions = [
          capture.addListener('samples', onSamples),
          capture.addListener('status', (status) => {
            session?.pushStatus(status);
            lockAfterSettle(status);
            if (keptFrames) liveCaptureChanged();
            setLive((previous) => ({ ...previous, status }));
          }),
        ];
        const { activeFps } = await capture.start(captureConfig(capabilities, lens, requestedFps));
        started = true;
        activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((error: unknown) =>
          console.warn(`Screen could not be kept awake: ${reasonOf(error)}`),
        );
        // Closed while the camera was starting, so cleanup had nothing to stop.
        if (!mounted) {
          stopCamera();
          return;
        }
        // The live filter is designed for the actual rate, which can be below the request, so the session
        // starts only now. With no torch lens the module runs dark and no session starts.
        if (lens) {
          captureFps = activeFps;
          lensId = lens.id;
          lockWanted = true;
          session = createLiveSession({
            captureFps,
            sqiThreshold: threshold ?? 0,
            perfusionFloorPct: DSP_CONFIG.live.defaultPerfusionFloorPct,
          });
        }
        setLive((previous) => ({ ...previous, phase: 'running' }));
      } catch (error) {
        // A rate the session cannot support only fails after the camera started.
        stopCamera();
        if (mounted) setLive({ ...idle('failed'), failure: reasonOf(error) });
        else console.warn(`Capture failed after the screen closed: ${reasonOf(error)}`);
      }
    };
    begin();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [capture, demo, enabled, permissionGrants]);

  return { ...live, nativeCamera: capture !== null && capture === LumenCapture };
}
