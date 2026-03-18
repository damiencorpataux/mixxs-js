// ═══════════════════════════════════════════════════════════════
//  Deck  —  audio source + transport controls
//
//  AudioBufferSourceNode is single-use by Web Audio API design.
//  It is recreated transparently on every play() call.
//  The current playback position is tracked manually via
//  AudioContext.currentTime deltas.
//
//  beatGrid: { bpm, offset } — set by BeatAnalyzer after file load.
//  Used by MixerController for phase-aligned sync.
// ═══════════════════════════════════════════════════════════════
class Deck {
  constructor(ctx, channelController) {
    this.ctx          = ctx;
    this.channel      = channelController;
    this.buffer       = null;
    this.source       = null;
    this.startCtxTime = 0;    // ctx.currentTime recorded at last play()
    this.startOffset  = 0;    // buffer position at last play()
    this.isPlaying    = false;
    this.playbackRate = 1.0;
    this.bpm          = 120;
    this.beatGrid     = null; // { bpm, offset } — populated by BeatAnalyzer
    this.onEnded      = null; // optional UI callback
    // Loop
    this.loop         = false;
    this.loopIn       = 0;
    this.loopBeats    = 4;
  }

  load(audioBuffer) {
    if (this.isPlaying) this.stop();
    this.buffer      = audioBuffer;
    this.startOffset = 0;
    this.beatGrid    = null;  // cleared until BeatAnalyzer populates it
  }

  /** Returns the index of the nearest beat at the current playback position. */
  getCurrentBeatIndex() {
    if (!this.beatGrid) return null;
    return BeatAnalyzer.nearestBeatIndex(
      this.getCurrentTime(), this.beatGrid.bpm, this.beatGrid.offset
    );
  }

  /** Seek forward or backward by `beats` beats (e.g. +1 or -1). */
  nudge(beats) {
    if (!this.buffer) return;
    const beatDuration = this.beatGrid
      ? 60 / this.beatGrid.bpm
      : 60 / this.bpm;
    this.seek(this.getCurrentTime() + beats * beatDuration);
  }

  play() {
    if (!this.buffer || this.isPlaying) return;
    this.ctx.resume();
    this._createSource();
    this.source.start(0, this.startOffset);
    this.startCtxTime = this.ctx.currentTime;
    this.isPlaying    = true;
  }

  pause() {
    if (!this.isPlaying) return;
    const pos = this.getCurrentTime();
    this._stopSource();
    this.startOffset = Math.min(pos, this.buffer.duration - 0.001);
    this.isPlaying   = false;
  }

  stop() {
    this._stopSource();
    this.startOffset = 0;
    this.isPlaying   = false;
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    this._stopSource();
    this.isPlaying   = false;
    this.startOffset = Math.max(0, Math.min(time, this.buffer.duration - 0.001));
    if (wasPlaying) this.play();
  }

  getCurrentTime() {
    if (!this.buffer) return 0;
    if (!this.isPlaying) return this.startOffset;
    const elapsed = (this.ctx.currentTime - this.startCtxTime) * this.playbackRate;
    return Math.min(this.startOffset + elapsed, this.buffer.duration);
  }

  /** Wall-clock seconds elapsed — current track position adjusted for playback rate. */
  getRealCurrentTime() {
    return this.getCurrentTime() / this.playbackRate;
  }

  /** Wall-clock duration — how long the track takes to play at current speed. */
  getRealDuration() {
    if (!this.buffer) return 0;
    return this.buffer.duration / this.playbackRate;
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.source) this.source.playbackRate.value = rate;
  }

  /** Activate loop: snap loopIn to nearest beat, compute loopOut. */
  startLoop(beats) {
    if (!this.buffer) return;
    this.loopBeats = beats;
    const beatDur  = this.beatGrid ? 60 / this.beatGrid.bpm : 60 / this.bpm;
    const offset   = this.beatGrid?.offset ?? 0;
    const t        = this.getCurrentTime();
    // Nearest beat index
    const n        = Math.round((t - offset) / beatDur);
    this.loopIn    = Math.max(0, offset + n * beatDur);
    this.loop      = true;
  }

  stopLoop() {
    this.loop = false;
  }

  /**
   * Called every RAF frame. If looping and playhead has passed loopOut,
   * seek back to loopIn.
   */
  checkLoop() {
    if (!this.loop || !this.isPlaying) return;
    const beatDur = this.beatGrid ? 60 / this.beatGrid.bpm : 60 / this.bpm;
    const loopOut = this.loopIn + this.loopBeats * beatDur;
    if (this.getCurrentTime() >= loopOut) {
      this.seek(this.loopIn);
    }
  }

  // ── Private ──────────────────────────────────────────────────

  _createSource() {
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    this.source.connect(this.channel.input);
    this.source.onended = () => {
      // Only fire naturally — not on manual stop/pause
      if (this.isPlaying) {
        this.isPlaying   = false;
        this.startOffset = 0;
        if (this.onEnded) this.onEnded();
      }
    };
  }

  _stopSource() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch (_) {}
      this.source = null;
    }
  }
}
