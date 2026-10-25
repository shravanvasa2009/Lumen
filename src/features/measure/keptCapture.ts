import type { FrameStat, LiveSession, NsSpan, Sample, SqiScores } from '@/core';

// Frames as the module reported them, plus the live session's decisions (LiveSession.readingInput).
export interface KeptCapture {
  captureFps: number;
  // null when the phone has no torch-capable lens.
  lensId: string | null;
  samples: Sample[];
  stats: FrameStat[];
  motionSpans: NsSpan[];
  coldHandsSpans: NsSpan[];
  sqi: SqiScores | null;
  // Demo mode's synthetic recording; never saved.
  demo?: true;
}

export interface LiveCaptureSource {
  captureFps: number;
  lensId: string | null;
  demo?: true;
  readingInput: LiveSession['readingInput'];
}

// In memory only. The snapshot is reused until more frames arrive, so every caller gets the same object
// (one analysis, one save).
let build: (() => KeptCapture) | null = null;
let snapshot: KeptCapture | null = null;

export function keepCapture(capture: KeptCapture | null): void {
  build = capture === null ? null : () => capture;
  snapshot = null;
}

export function keepLiveCapture(source: LiveCaptureSource): void {
  const { captureFps, lensId, demo } = source;
  build = () => {
    const { capture, motionSpans, coldHandsSpans, sqi } = source.readingInput();
    return {
      captureFps,
      lensId,
      samples: capture.samples,
      stats: capture.stats,
      motionSpans,
      coldHandsSpans,
      sqi,
      ...(demo ? { demo: true as const } : {}),
    };
  };
  snapshot = null;
}

export function liveCaptureChanged(): void {
  snapshot = null;
}

export function keptCapture(): KeptCapture | null {
  if (build === null) return null;
  snapshot ??= build();
  return snapshot;
}
