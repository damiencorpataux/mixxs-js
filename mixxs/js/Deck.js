// ═══════════════════════════════════════════════════════════════
//  Deck  —  audio source + transport controls
//
//  AudioBufferSourceNode is single-use by Web Audio API design.
//  It is recreated transparently on every play() call.
//  The current playback position is tracked manually via
//  AudioContext.currentTime deltas.
//
//  A persistent _declick GainNode lives between every source and
//  the channel input. It ramps 0→1 on play and 1→0 before stop,
//  eliminating audible clicks on all transport operations.
//
//  beatGrid: { bpm, offset } — set by BeatAnalyzer after file load.
// ═══════════════════════════════════════════════════════════════

const DECLICK_S = 0.005; // 5 ms — inaudible as a fade, eliminates click

class Deck {
  constructor(ctx, channelController) {
    this.ctx          = ctx;
    this.channel      = channelController;
    this.buffer       = null;
    this.source       = null;
    this.startCtxTime = 0;    // ctx.currentTime at last play()
    this.startOffset  = 0;    // buffer position at last play()
    this.isPlaying    = false;
    this.playbackRate = 1.0;
    this.bpm          = 120;
    this.beatGrid     = null; // { bpm, offset } — populated by BeatAnalyzer
    this.onEnded      = null; // optional callback when track ends naturally
    this.loop         = false;
    this.loopIn       = 0;
    this.loopBeats    = 4;

    // Persistent declick node — survives source recreation between plays
    this._declick            = ctx.createGain();
    this._declick.gain.value = 1;
    this._declick.connect(channelController.input);
  }

  load(audioBuffer) {
    if (this.isPlaying) this.stop();
    this.buffer      = audioBuffer;
    this.startOffset = 0;
    this.beatGrid    = null;
  }

  getCurrentBeatIndex() {
    if (!this.beatGrid) return null;
    return BeatAnalyzer.nearestBeatIndex(
      this.getCurrentTime(), this.beatGrid.bpm, this.beatGrid.offset
    );
  }

  nudge(beats) {
    if (!this.buffer) return;
    const beatDur = this.beatGrid ? 60 / this.beatGrid.bpm : 60 / this.bpm;
    this.seek(this.getCurrentTime() + beats * beatDur);
  }

  play() {
    if (!this.buffer || this.isPlaying) return;
    this.ctx.resume();
    this._createSource();
    this.source.start(0, this.startOffset);
    this.startCtxTime = this.ctx.currentTime;
    this.isPlaying    = true;
    this._fadeIn();
  }

  pause() {
    if (!this.isPlaying) return;
    // Capture position now — it drifts while audio is still fading out
    const pos      = this.getCurrentTime();
    this.isPlaying = false;
    this._fadeOut(() => {
      this._stopSource();
      this.startOffset         = Math.min(pos, this.buffer.duration - 0.001);
      this._declick.gain.value = 1; // reset for next play()
    });
  }

  stop() {
    if (!this.isPlaying) { this._stopSource(); this.startOffset = 0; return; }
    this.isPlaying = false;
    this._fadeOut(() => {
      this._stopSource();
      this.startOffset         = 0;
      this._declick.gain.value = 1;
    });
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.isPlaying = false;
      this._fadeOut(() => {
        this._stopSource();
        this.startOffset         = Math.max(0, Math.min(time, this.buffer.duration - 0.001));
        this._declick.gain.value = 1;
        this.play(); // play() calls _fadeIn()
      });
    } else {
      this._stopSource();
      this.startOffset = Math.max(0, Math.min(time, this.buffer.duration - 0.001));
    }
  }

  getCurrentTime() {
    if (!this.buffer) return 0;
    if (!this.isPlaying) return this.startOffset;
    const elapsed = (this.ctx.currentTime - this.startCtxTime) * this.playbackRate;
    return Math.min(this.startOffset + elapsed, this.buffer.duration);
  }

  getRealCurrentTime() { return this.getCurrentTime() / this.playbackRate; }

  getRealDuration() {
    if (!this.buffer) return 0;
    return this.buffer.duration / this.playbackRate;
  }

  setPlaybackRate(rate) {
    if (this.isPlaying) {
      // Re-anchor position before changing rate — getCurrentTime() uses
      // startOffset + elapsed * rate, so any pending elapsed time must be
      // committed at the OLD rate before the new one takes effect.
      this.startOffset  = this.getCurrentTime();
      this.startCtxTime = this.ctx.currentTime;
    }
    this.playbackRate = rate;
    if (this.source) this.source.playbackRate.value = rate;
  }

  startLoop(beats) {
    if (!this.buffer) return;
    this.loopBeats  = beats;
    const beatDur   = this.beatGrid ? 60 / this.beatGrid.bpm : 60 / this.bpm;
    const offset    = this.beatGrid?.offset ?? 0;
    const n         = Math.round((this.getCurrentTime() - offset) / beatDur);
    this.loopIn     = Math.max(0, offset + n * beatDur);
    this.loop       = true;
  }

  stopLoop() { this.loop = false; }

  checkLoop() {
    if (!this.loop || !this.isPlaying) return;
    const beatDur = this.beatGrid ? 60 / this.beatGrid.bpm : 60 / this.bpm;
    if (this.getCurrentTime() >= this.loopIn + this.loopBeats * beatDur)
      this.seek(this.loopIn);
  }

  // ── Private ──────────────────────────────────────────────────

  _fadeIn() {
    const g = this._declick.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(1, now + DECLICK_S);
  }

  // Ramp to silence, then call onDone after the ramp completes.
  _fadeOut(onDone) {
    const g = this._declick.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + DECLICK_S);
    setTimeout(onDone, DECLICK_S * 1000 + 2);
  }

  _createSource() {
    this.source                    = this.ctx.createBufferSource();
    this.source.buffer             = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    this.source.connect(this._declick); // _declick → channel.input
    this.source.onended = () => {
      // Only fires on natural end — not on manual stop/pause
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
