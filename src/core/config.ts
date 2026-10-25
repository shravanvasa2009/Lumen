// Pipeline constants, grouped by step.
export const DSP_CONFIG = {
  dsp1: {
    droppedFrameGapRatio: 1.5, // a gap > this x the median frame interval is a dropped frame
  },
  dsp2: {
    modelRateHz: 64, // models, quality, rhythm
    shapeRateHz: 256, // onsets, waveform shape
    maxGapS: 0.15, // never interpolate across a longer gap
  },
  dsp3: {
    dcCutoffHz: 0.3, // DC for the perfusion index keeps only what is below this
    // Zero-phase order 2 (4 in effect) leaks about 6% of a 36 bpm pulse into DC, with less ringing at
    // baseline steps than a higher order.
    dcOrder: 2,
    modelWindowS: 4, // model inputs are z-scored per window (SQI-Net: 256 samples at 64 Hz)
    // Clean seconds outside every scored window before the reading is tagged sqiUnscored. One window,
    // since the last score can still be running at the stop.
    sqiUnscoredMaxS: 4,
    // Share of scored windows that must be flagged to tag the reading sqiFlagged.
    sqiFlaggedTagShare: 0.5,
  },
  // A frame is covered when all four hold. Failing only the clip limit makes a "clipping" span, any
  // other failure a "coverage" span.
  dsp4: {
    minRedRatio: 2, // R / (G + B)
    minRedMean: 0.3, // of full scale
    maxSpatialStdR: 0.1,
    maxClipFrac: 0.05,
  },
  dsp5: {
    exposureChangeArtifactS: 1, // an exposure change marks the following 1 s as artifact
  },
  dsp6: {
    // Prototype order N as in scipy butter(N, ...), so 4 is 8 poles.
    hrOrder: 4,
    // Elgendi et al. 2013 and NeuroKit2: zero-phase butter(2, ...) over 0.5-8 Hz.
    morphologyOrder: 2,
    hrBandHz: [0.6, 3.5],
    morphologyBandHz: [0.5, 8],
  },
  // Elgendi et al. 2013 (PLoS ONE, doi:10.1371/journal.pone.0076585), run on the 64 Hz morphology band.
  dsp7: {
    peakWindowS: 0.111, // W1 for MA_peak; also the minimum block width (THR2)
    beatWindowS: 0.667, // W2 for MA_beat
    beta: 0.02, // THR1 = MA_beat + beta * mean(squared signal)
    // The 64 Hz peak is refined on the 256 Hz band within +/- one 64 Hz sample.
    refineHalfWindowS: 0.015625,
    // Shorter gap-free segments are skipped. 2 s is three W2 windows and one full beat at 40 bpm.
    minSegmentS: 2,
  },
  dsp8: {
    // The beat foot is searched back from the peak over this span, never past the previous peak.
    minimumSearchS: 0.4,
  },
  dsp9: {
    // Not a beat when its max upslope < this x the median upslope. 0.3 removed small premature beats
    // riding on the previous beat's falling side.
    notABeatUpslopeRatio: 0.15,
    artifactIntervalS: [0.25, 2.5], // an interval outside this range makes its ending beat an artifact
    templateCorrelationMin: 0.85, // atypical below this Pearson correlation with the template
    amplitudeRatioRange: [0.5, 2.0], // atypical outside this x the running median amplitude
    templateBeats: 10, // the template is the mean of the last this-many normal beats
    longPauseRatio: 1.6, // long pause when an interval >= this x the median of its neighbours
    // Spans the foot (onsets fall 50-250 ms before the peak) and the systolic top. At 0.3 s it is
    // shorter than the interval at 150 bpm, so the next upstroke rarely enters it.
    templateBeforePeakS: 0.2,
    templateAfterPeakS: 0.1,
    // Running references use the nearest items at odd and at even offsets separately, so bigeminy
    // stays balanced.
    neighbours: 4,
    // Below this many references per parity, the beat gets no amplitude, early, or long-pause judgement.
    minNeighboursPerParity: 2,
    // "Early and small" is atypical: interval < earlyIntervalRatio x the neighbour median and amplitude
    // < earlySmallAmplitudeRatio x the running median. Catches same-shape premature beats.
    earlyIntervalRatio: 0.85,
    earlySmallAmplitudeRatio: 1.0,
  },
  // Pulse-shape view and diabetes-net's averaged beat.
  dsp14: {
    minNormalBeats: 20,
    // Each beat is resampled to one period of this many samples: diabetes-net's [1, 1, 256] input.
    beatSamples: 256,
    // Start this fraction of a period before the onset, keeping the a-wave clear of the Savitzky-Golay
    // edge fit.
    leadFraction: 0.1,
    // a-e are searched up to onset + this fraction of the period. Ejection is about 35-55% of the period;
    // 0.6 left e at the window edge at 72 bpm.
    systoleFraction: 0.7,
    // A beat longer than this x the median normal period most likely hides a missed onset.
    maxPeriodRatio: 1.5,
    savgolWindow: 9,
    savgolOrder: 3,
    minFps: 60,
  },
  // Minimum clean data per output. Clean seconds are reading time not covered by a rejected span.
  dsp10: {
    minCleanS: 30, // perfusion index
  },
  dsp11: {
    minCleanS: 15, // heart rate; the accepted intervals behind the median must span this too
  },
  dsp12: {
    // Compared against the capture format's frame rate; a measured 60 fps can read 59.9.
    minFps: 60,
    // An NN interval > 20% off the median of up to 5 neighbours each side is dropped before RMSSD, SDNN,
    // and pNN50.
    neighbours: 5,
    maxNeighbourDeviation: 0.2,
    pnnThresholdS: 0.05, // pNN50: successive differences strictly greater than 50 ms, as in dsp15
    rmssdMinCleanS: 60,
    rmssdMinIntervals: 50, // NN intervals left after the 20% filter
    sdnnMinCleanS: 300,
  },
  // scipy.signal.welch: periodic Hann, linear detrend, density scaling, one-sided, mean. 32 s segments
  // hold >= 3 cycles at 6 br/min; a 512-point FFT gives 0.47 br/min bins.
  dsp13: {
    seriesRateHz: 4,
    welchSegmentSamples: 128,
    welchOverlapSamples: 64,
    welchFftSamples: 512,
    bandHz: [0.1, 0.5], // 6-30 breaths/min
    maxSpreadBrpm: 4, // report the mean only when max - min of the three estimates is <= this
    minCleanS: 60, // breathing rate
  },
  // diabetes-net's 12 waveform-shape features from the averaged beat.
  diabetesFeatures: {
    // Systolic peak widths at these fractions of peak height above the beat minimum (features 2 and 3).
    widthLevels: [0.5, 0.25],
  },
  dsp15: {
    // Windows are counted in intervals, not seconds, so slow heart rates still fill them.
    windowIntervals: 32,
    windowStep: 16, // 50% overlap
    histogramBins: 16, // equal-width bins over the window's min..max, for the Shannon entropy
    pnnThresholdS: 0.05, // pNN50: successive differences strictly greater than 50 ms
    sampleEntropyM: 2,
    sampleEntropyR: 0.2, // x the window's population SD
    minUsableIntervals: 40, // a reading needs this many intervals that do not span an artifact
    // Fractions of the window's median interval.
    prematureShortFactor: 0.85, // a premature beat ends an interval shorter than this
    pauseLongFactor: 1.1, // and the compensatory pause that follows is longer than this
    trimmedDiffShare: 0.8, // the trimmed RMSSD keeps this share of the smallest |differences|
    largeChangeFactor: 0.1, // a successive difference above this is a large change
  },
  // Standing heart-rate test and its "Large rise on standing" rule.
  dsp16: {
    minAgeYears: 13, // the profile blocks younger ages
    adolescentMaxAgeYears: 19, // whole years, inclusive
    adolescentRiseBpm: 40, // HR - baseline at or above this, ages 13-19
    adultRiseBpm: 30, // HR - baseline at or above this, ages 20 and over
    standingMinutes: [1, 3, 5, 10], // minutes after standing, in protocol order
    consecutiveReadings: 2, // the rise must hold in this many consecutive standing readings
  },
  // Decision rules and clean-data floors that are not a metric's own.
  rules: {
    slowRestingBpm: 50, // HR below this
    slowRestingAdjustedBpm: 40, // for athletes and people on a beta-blocker
    fastRestingBpm: 100, // HR above this
    // Clean seconds per mode; a reading short of its target ends inconclusive. Deep's 5 min is SDNN's floor.
    modeMinCleanS: { quick: 30, full: 90, deep: 300 },
    restingMinCleanS: 30, // slow/fast resting and fast regular rhythm
    fastRegularBpm: [130, 220],
    fastRegularMaxNormalizedRmssd: 0.03, // strictly below
    rhythmMinCleanS: 60, // irregular rhythm; also needs dsp15.minUsableIntervals
    uncertainBelowTopProb: 0.6, // "Couldn't tell, retake"
    // Each window's sinus, af, other must sum to 1 within this; float32 softmax rows are off by ~1e-7.
    rhythmRowSumTolerance: 1e-5,
    possibleAfPositives: 2, // 2 of 3 readings within 24 h
    possibleAfReadings: 3,
    possibleAfWindowHours: 24,
    diabetesMinReadings: 2, // Full Scans on different days
    diabetesMinCleanS: 90, // per reading
    personalBandMinReadings: 7, // the first 7 readings are "learning"
    personalBandIqrs: 1.5, // band = median +/- 1.5 IQR
    // "HR > 150 bpm sustained 60 s at rest, or HR < 40 bpm with symptoms".
    emergency: {
      fastBpm: 150, // rolling HR strictly above this
      // Beat times carry microseconds of error, so a true 150 bpm can measure slightly over.
      fastMarginBpm: 0.01,
      sustainS: 60, // clean seconds, bridged breaks not counted
      // Rolling HR is the larger of the mean rate and median-interval rate over this many clean seconds,
      // the heart rate's reporting floor.
      windowS: 15,
      // A run's first window judges the HR only with this many clean seconds.
      windowMinCleanS: 10,
      // Longest bridged gap between clean intervals. A 5 s rejected span costs one beat each side (< 0.4 s
      // at > 150 bpm) plus the next upstroke (< 0.2 s).
      maxBreakS: 6,
      slowBpm: 40, // the reading's HR strictly below this; the app adds symptoms
      // Same beat-time error as fastMarginBpm; 39.99 bpm stays urgent.
      slowMarginBpm: 0.005,
    },
  },
  // Confidence is the lowest of clean coverage, the SQI and tier caps, and for rhythm the top probability.
  confidence: {
    highCoverage: 0.9, // clean seconds / reading seconds
    moderateCoverage: 0.7,
    highTopProb: 0.8, // rhythm top probability; below rules.uncertainBelowTopProb it is low
  },
  // LiveSession checks. Coverage and exposure use dsp4 and dsp5 so the live counter matches analyzeReading.
  live: {
    // Buffers hold the longest reading (Deep, 5 min) plus a minute without wrapping.
    // Capacity = maxReadingS x fps x (1 + frameMargin); the margin absorbs timing jitter.
    maxReadingS: 360,
    frameMargin: 0.25,
    waveformS: 6, // the live waveform shows the last 6 s
    sqiEveryS: 1, // SQI-Net runs every 1 s on the last dsp3.modelWindowS
    // Exactly equal red this long is a whole beat at 30 bpm, below the HR band, so it holds no beat.
    minFlatS: 2,
    // Model windows with fewer frames per second are rejected. The rating's hard-fail floor.
    minEffectiveFps: 24,
    // Every subWindowS span in a model window must also hold minSubWindowFps x subWindowS frames, so a
    // fast burst cannot carry a sparse rest. 16 is the Nyquist rate for the 8 Hz band top.
    minSubWindowFps: 16,
    subWindowS: 1,
    // Reject when any subWindowS span holds two frame intervals longer than this; one is splined over.
    // 1 / (2.2 x 3.67 Hz) is about 0.124 s for 220 bpm. A 30 fps phone dropping 3 frames in a row trips it.
    maxFrameGapS: 0.12,
    // Reject when any subWindowS span holds this many intervals longer than sparseIntervalS. Sustained
    // ~100 ms spacing aliases the pulse's 2nd harmonic; 4 still stalled ordinary 30 fps phones.
    sparseIntervalS: 0.09,
    maxSparseIntervalsPerS: 5,
    // Every subWindowS span needs this many sample times at least distinctSampleS apart. The 2nd harmonic
    // of 220 bpm is 7.33 Hz (Nyquist 14.7/s). 12 ms merges clumped frames and is under 60 fps spacing.
    distinctSampleS: 0.012,
    minDistinctSamplesPerS: 15,
    // Longest run of sample times more than 68 ms apart; longer runs read 220 bpm as 110.
    maxSparseRunS: 0.5,
    // motionRms has no units from the capture module; assumes gravity-free acceleration RMS in g
    // (CoreMotion userAcceleration). Resting tremor is about 0.01 g.
    motionRmsThreshold: 0.05,
    // Pressing too light leaks ambient light and green rises. A covered frame below this ratio gets
    // coach.flat but is not rejected.
    leakRedRatio: 2.5,
    coldHandsAfterS: 10, // perfusion index below the device floor after 10 s
    // Live PI = 100 x (max - min of the causal morphology band) / mean R over this window.
    perfusionWindowS: 4,
    defaultPerfusionFloorPct: 0.2, // floor for phones without a device-database entry
    // Coaching hysteresis: enter after coachEnterS, show at least coachMinShowS, clear after coachExitS.
    coachEnterS: 0.5,
    coachMinShowS: 2,
    coachExitS: 1,
  },
  // Lab-screen live HR from a spectral scan on the dsp2.modelRateHz grid, not the reading's heart rate.
  liveHr: {
    windowS: 10,
    // >= 5 pulse cycles at 40 bpm and a 0.125 Hz bin spacing.
    minSegmentS: 8,
    detrendHalfWidthS: 1.5, // moving-average detrend over +/- 1.5 s
    scanBandHz: [0.6, 3.5],
    scanStepHz: 0.01,
    minBpm: 40,
    maxBpm: 180,
    minSnrDb: 6, // peak power over the median power of the scanned bins
  },
  // When a standard floor fails, the same math runs on whatever beats exist and the result is tagged
  // lower quality. Each value is the fewest beats its method is defined on.
  lowQuality: {
    hrMinIntervals: 2, // the median of two accepted intervals
    rmssdMinIntervals: 3, // two successive differences
    rhythmMinIntervals: 3, // the turning-point ratio divides by n - 2
    // Shorter AF windows were called regular.
    rhythmClassMinIntervals: 20,
    shapeMinBeats: 1, // one normal onset-to-onset beat
  },
  // Display only, never read by analysis. A zero-phase low-pass just above the beat rate removes the
  // dicrotic wave's harmonics.
  displayPulse: {
    order: 4, // run forward and backward
    // 1.36 is the least that keeps the premature beat of a 0.62 / 1.38 bigeminy at 75 bpm.
    cutoffPerFundamental: 1.4,
    cutoffRangeHz: [0.7, 3], // bounds for a live rate outside its own 40-180 bpm band
    fallbackCutoffHz: 2.2, // no live rate yet
  },
  // Lumen Compatibility Rating: points and tiers.
  rating: {
    // Points of the highest level reached; below the last level is a hard fail.
    fpsLevels: [
      { minFps: 120, points: 30 },
      { minFps: 60, points: 24 },
      { minFps: 30, points: 14 },
      { minFps: 24, points: 6 },
    ],
    // A 60 fps format measures 59.6-60, so a level counts when within this many fps of it.
    achievedFpsToleranceFps: 0.5,
    // couplingPoints x min(1, PI / fullPi) x min(1, SNR / fullSnr), floored.
    couplingPoints: 35,
    couplingFullPiPct: 1.0,
    couplingFullSnrDb: 12,
    ambientBelowCouplingPoints: 10, // ambient-light mode under this many coupling points
    exposureLockPoints: 6,
    whiteBalanceLockPoints: 5,
    focusLockPoints: 4,
    // SD of frame intervals strictly below each limit (ms) scores its points, else 0.
    timingLevels: [
      { belowSdMs: 1, points: 20 },
      { belowSdMs: 3, points: 12 },
      { belowSdMs: 6, points: 6 },
    ],
    fullMinScore: 80,
    fullMinFps: 60,
    basicMinScore: 50,
    basicMinFps: 30,
    limitedMinScore: 25,
  },
};
