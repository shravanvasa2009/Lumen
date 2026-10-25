// The live view sits above the timer ring and the body scrolls. Short screens (360x640 dp) shrink the
// view and drop extras so the Checking panel stays above Stop.
import { CAPTION_ROW, LIVE_RING_GAP, LIVE_RING_WIDTH } from '@/features/onboarding/practiceParts';

const HEADER_AND_STATUS = 44 + 26;
const MESSAGE = 22;
const WAVEFORM_HEIGHT = 96;
const PANEL_ROW_DP = 100;
const PANEL_STACKED_DP = 150;

const FULL_PREVIEW = 176;
// Includes the tick band, so the ring inside stays 150 dp.
const FULL_RING = 168;
// Ring stroke and gap on both sides, plus the caption row and its gap.
const CAPTION_GAP = 8;
const LIVE_FRAME = 2 * (LIVE_RING_WIDTH + LIVE_RING_GAP) + CAPTION_GAP + CAPTION_ROW;

const TIGHT_BELOW_VIEWPORT = 600;
const TIGHT_WAVEFORM_HEIGHT = 40;
const TIGHT_CARD_CHROME = 38;
// Raw-signal caption, its 24 dp trace, and the gaps between the two trace rows.
const TIGHT_RAW_TRACE = 48;
const TIGHT_ROW_GAP = 8;
const TIGHT_ROWS = 5;
const MIN_TIGHT_PREVIEW = 88;
const MAX_TIGHT_PREVIEW = 140;
// Two text lines (count and "of 90 clean s") must fit inside the ring.
const TIGHT_RING = 104;

export type CaptureSizes = {
  // The pill and coaching line already say what the Finger/Still/Pressure labels say.
  tight: boolean;
  preview: number;
  ring: number;
  waveformHeight: number;
};

// 0 until the scroll body has been measured.
export function captureSizes(viewport: number, stackedChecks: boolean): CaptureSizes {
  if (viewport === 0 || viewport >= TIGHT_BELOW_VIEWPORT) {
    return { tight: false, preview: FULL_PREVIEW, ring: FULL_RING, waveformHeight: WAVEFORM_HEIGHT };
  }
  const panel = stackedChecks ? PANEL_STACKED_DP : PANEL_ROW_DP;
  const rest =
    HEADER_AND_STATUS +
    MESSAGE +
    TIGHT_CARD_CHROME +
    TIGHT_WAVEFORM_HEIGHT +
    TIGHT_RAW_TRACE +
    panel +
    TIGHT_ROW_GAP * TIGHT_ROWS +
    TIGHT_RING +
    LIVE_FRAME;
  return {
    tight: true,
    preview: Math.min(MAX_TIGHT_PREVIEW, Math.max(MIN_TIGHT_PREVIEW, Math.floor(viewport - rest))),
    ring: TIGHT_RING,
    waveformHeight: TIGHT_WAVEFORM_HEIGHT,
  };
}
