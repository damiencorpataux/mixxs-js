// ═══════════════════════════════════════════════════════════════
//  ChannelController  —  one channel strip: gain, pan, EQ, CUE send
//
//  Signal chain:
//    input → eqLow → eqMid → eqHigh → fader → panner → output
//                                    ↓
//                              (pre-fader tap)
//                                    ↓
//                               cueSend → CueBus
// ═══════════════════════════════════════════════════════════════
class ChannelController {
  constructor(ctx, cueBus) {
    this.ctx = ctx;

    this.input = ctx.createGain();

    // ── EQ stubs ─────────────────────────────────────────────
    // BiquadFilters are in the signal chain and ready to use.
    // TODO: expose frequency/gain controls for full EQ implementation.
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;
    this.eqLow.gain.value = 0;  // 0 dB = pass-through

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3200;
    this.eqHigh.gain.value = 0;

    this.fader  = ctx.createGain();
    this.fader.gain.value = 0.8;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;

    // ── CUE send (pre-fader tap) ──────────────────────────────
    this.cueSend = ctx.createGain();
    this.cueSend.gain.value = 0; // off by default

    // ── Wiring ────────────────────────────────────────────────
    this.input.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.fader);
    this.fader.connect(this.panner);

    this.input.connect(this.cueSend);
    this.cueSend.connect(cueBus.input);

    this.output = this.panner; // downstream nodes connect to this
  }

  setVolume(v) { this.fader.gain.value = v; }
  setPan(v)    { this.panner.pan.value = v; }
  setCue(on)   { this.cueSend.gain.value = on ? 1 : 0; }
}
