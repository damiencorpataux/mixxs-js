// ═══════════════════════════════════════════════════════════════
//  WaveformRenderer  —  canvas waveform visualizer
//
//  Peaks are precomputed once from the AudioBuffer on load,
//  then draw() is called every animation frame by MixerController.
// ═══════════════════════════════════════════════════════════════
class WaveformRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx2d  = canvas.getContext('2d');
    this.buffer = null;
    this.peaks  = null; // { min, max }[] — one entry per canvas pixel column
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    this._fitCanvas();
    this._computePeaks();
    this.draw(0);
  }

  draw(currentTime) {
    const canvas = this.canvas;
    const ctx    = this.ctx2d;
    const W = canvas.width;
    const H = canvas.height;
    const amp = H / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    if (!this.peaks) return;

    const playheadX = this.buffer
      ? Math.floor((currentTime / this.buffer.duration) * W)
      : 0;

    // Waveform columns — played section (amber) / unplayed (dark)
    for (let i = 0; i < W; i++) {
      const { min, max } = this.peaks[i];
      ctx.strokeStyle = i < playheadX ? '#f59e0b' : '#3a2800';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.95);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.95);
      ctx.stroke();
    }

    // Centre baseline
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(W, amp);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Playhead
    if (this.buffer && currentTime > 0) {
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  }

  // ── Private ──────────────────────────────────────────────────

  _fitCanvas() {
    this.canvas.width  = this.canvas.offsetWidth  || 600;
    this.canvas.height = this.canvas.offsetHeight || 80;
  }

  _computePeaks() {
    const data  = this.buffer.getChannelData(0);
    const width = this.canvas.width;
    const step  = Math.ceil(data.length / width);
    this.peaks  = [];
    for (let i = 0; i < width; i++) {
      let min = 0, max = 0;
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      this.peaks.push({ min, max });
    }
  }
}
