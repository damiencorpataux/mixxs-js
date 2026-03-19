// ═══════════════════════════════════════════════════════════════
//  ChannelController  —  one channel strip: gain, pan, EQ, filter, CUE send
//
//  Signal chain:
//    input → eqLow → eqMid → eqHigh → filter → fader → panner → output
//                                    ↓
//                              (pre-fader tap)
//                                    ↓
//                               cueSend → CueBus
// ═══════════════════════════════════════════════════════════════
class ChannelController {
  constructor(ctx, cueBus) {
    this.ctx = ctx;

    this.input = ctx.createGain();

    // ── EQ ───────────────────────────────────────────────────
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;
    this.eqLow.gain.value = 0;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3200;
    this.eqHigh.gain.value = 0;

    // ── Filter effect (LP/HP sweep) ───────────────────────────
    // v = 0   → flat (no filter)
    // v > 0   → highpass, cutting bass (like Mixxx Filter default)
    // v < 0   → lowpass, cutting treble
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 20; // nearly open at rest
    this.filter.Q.value = 0.7;

    this.fader  = ctx.createGain();
    this.fader.gain.value = 0.8;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;

    // ── CUE send (pre-fader tap) ──────────────────────────────
    this.cueSend = ctx.createGain();
    this.cueSend.gain.value = 0;

    // ── Wiring ────────────────────────────────────────────────
    this.input.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.filter);
    this.filter.connect(this.fader);
    this.fader.connect(this.panner);

    this.input.connect(this.cueSend);
    this.cueSend.connect(cueBus.input);

    this.output = this.panner;
  }

  setVolume(v) { this.fader.gain.value = v; }
  setPan(v)    { this.panner.pan.value = v; }
  setCue(on)   { this.cueSend.gain.value = on ? 1 : 0; }

  setEq(band, gainDb) {
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    if (node) node.gain.value = gainDb;
  }

  /**
   * Filter effect — same as Mixxx default Filter.
   * v = 0   : flat
   * v > 0   : highpass, sweeps 20 Hz → 20 kHz (cuts bass)
   * v < 0   : lowpass,  sweeps 20 kHz → 20 Hz (cuts treble)
   *
   * Frequency mapping: exponential, 20 Hz at extreme, 20 kHz at other extreme.
   */
  setFilter(v) {
    // v in range [-1, 1], 0 = center
    if (Math.abs(v) < 0.02) {
      // Dead zone at center — fully open, bypass with allpass trick
      this.filter.type = 'allpass';
      return;
    }
    if (v > 0) {
      // Highpass — sweeps from ~20 Hz (v=0) to ~18 kHz (v=1)
      this.filter.type = 'highpass';
      this.filter.frequency.value = 20 * Math.pow(1000, v); // 20→20000 Hz
    } else {
      // Lowpass — sweeps from ~20 kHz (v=0) to ~20 Hz (v=-1)
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 20000 * Math.pow(0.001, -v); // 20000→20 Hz
    }
    this.filter.Q.value = 0.7 + Math.abs(v) * 1.3; // slight resonance peak at extremes
  }
}

