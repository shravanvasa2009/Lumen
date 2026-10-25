// Mirrors modules/lumen-capture/src/LumenCapture.types.ts; keep both in sync.

// One frame; r, g, b are means over the finger region, 0..1.
export interface Sample {
  tNs: number;
  r: number;
  g: number;
  b: number;
}
export interface FrameStat {
  tNs: number;
  spatialStdR: number;
  clipFrac: number;
  exposureNs: number; // exposure duration of this frame
}
// Emitted every 100 ms.
export interface SampleBatch {
  samples: Sample[];
  stats: FrameStat[];
}
// Emitted at 4 Hz.
export interface CaptureStatus {
  fingerCovered: boolean;
  motionRms: number;
  thermal: 'nominal' | 'fair' | 'serious' | 'critical';
  fps: number;
  droppedFrac: number;
}
