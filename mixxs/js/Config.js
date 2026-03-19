// ═══════════════════════════════════════════════════════════════
//  Config  —  single source of truth for all tuneable constants
//
//  All magic numbers live here. Change a value once, it propagates
//  everywhere. Frozen to prevent accidental mutation at runtime.
// ═══════════════════════════════════════════════════════════════
const MIXXS = Object.freeze({

  deck: Object.freeze({
    // Playback speed knob range and default
    speed: Object.freeze({ min: 0, max: 2, step: 0.001, default: 1 }),

    // Momentary pitch-bend amount (4% of current rate per press)
    bendFactor: 0.04,

    // Loop beat counts cycled by arrow keys on the beats input
    loopBeats: Object.freeze([1, 2, 4, 8, 16, 32, 64]),
  }),

  mixer: Object.freeze({
    // Volume knobs — 0–100 % (audio layer receives v / 100)
    volume: Object.freeze({ min: 0, max: 100, step: 1, default: 80 }),

    // 3-band EQ — dB, passed directly to BiquadFilterNode.gain
    eq: Object.freeze({ min: -12, max: 12, step: 0.1, default: 0 }),

    // Filter sweep — -1 = full lowpass, 0 = bypassed, +1 = full highpass
    filter: Object.freeze({ min: -1, max: 1, step: 0.01, default: 0 }),
  }),

  waveform: Object.freeze({
    // Zoom level bounds and per-wheel-tick multiplier
    zoom: Object.freeze({ min: 0.5, max: 64, tickMultiplier: 1.16 }),

    // Number of min/max peak buckets computed per track
    peakResolution: 8192,

    // How long to wait for a second finger before committing to scratch (ms)
    pinchDelayMs: 50,

    // Maximum gap between two taps to count as a double-tap (ms)
    doubleTapMs: 300,
  }),

  knob: Object.freeze({
    // Pixels of vertical drag for a full-range sweep
    dragSensitivity: 150,

    // Maximum gap between two clicks/taps to trigger a reset (ms)
    doubleTapMs: 300,
  }),

});
