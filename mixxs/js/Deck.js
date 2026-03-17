// ═══════════════════════════════════════════════════════════════
//  Deck  —  audio source + transport controls
//
//  AudioBufferSourceNode is single-use by Web Audio API design.
//  It is recreated transparently on every play() call.
//  The current playback position is tracked manually via
//  AudioContext.currentTime deltas.
// ═══════════════════════════════════════════════════════════════
class Deck {
  constructor(ctx, channelController) {
    this.ctx      = ctx;
    this.channel  = channelController;
    this.buffer   = null;
    this.source   = null;
    this.startCtxTime = 0;   // ctx.currentTime recorded at last play()
    this.startOffset  = 0;   // buffer position at last play()
    this.isPlaying    = false;
    this.playbackRate = 1.0;
    this.bpm          = 120;
    this.onEnded      = null; // optional UI callback
  }

  load(audioBuffer) {
    if (this.isPlaying) this.stop();
    this.buffer      = audioBuffer;
    this.startOffset = 0;
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

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.source) this.source.playbackRate.value = rate;
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
