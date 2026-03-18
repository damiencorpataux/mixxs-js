// ═══════════════════════════════════════════════════════════════
//  Clicktrack  —  beat-synced metronome click
//
//  Fires a short synthesized click at each beat grid crossing.
//  Uses AudioContext scheduling for sample-accurate timing.
//  Follows whichever deck is designated as master.
// ═══════════════════════════════════════════════════════════════
class Clicktrack {
  constructor(audioContext) {
    this.ctx        = audioContext;
    this.gainNode   = audioContext.createGain();
    this.gainNode.gain.value = 0.5;
    this.gainNode.connect(audioContext.destination);
    this.enabled    = false;
    this._lastBeat  = -1; // last beat index fired, to avoid double-triggers
  }

  setVolume(v) {
    this.gainNode.gain.value = v;
  }

  enable()  { this.enabled = true; this._firstTick = true; }
  disable() { this.enabled = false; }

  /**
   * Called every RAF frame. Fires a click if the playhead has crossed
   * a new beat since the last frame.
   *
   * @param {Deck} deck  — the reference deck
   */
  tick(deck) {
    if (!this.enabled || !deck?.isPlaying || !deck?.beatGrid) return;

    const { bpm, offset } = deck.beatGrid;
    const beatDur   = 60 / bpm;
    const t         = deck.getCurrentTime();
    const beatIndex = Math.floor((t - offset) / beatDur);

    if (beatIndex !== this._lastBeat && beatIndex >= 0) {
      this._lastBeat = beatIndex;
      if (this._firstTick) { this._firstTick = false; return; }
      this._fireClick();
    }
  }

  _fireClick() {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Short sine burst with exponential decay — classic "tick" sound
    const osc  = ctx.createOscillator();
    const env  = ctx.createGain();

    osc.frequency.value  = 1000; // Hz
    osc.type             = 'sine';
    env.gain.setValueAtTime(1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.04); // 40ms decay

    osc.connect(env);
    env.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.04);
  }
}
