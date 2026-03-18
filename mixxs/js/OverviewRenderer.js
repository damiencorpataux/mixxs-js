// ═══════════════════════════════════════════════════════════════
//  OverviewRenderer  —  full-track waveform with moving playhead
//
//  Always shows the entire track. No zoom, no scroll.
//  Click to seek (via onSeek callback).
//  Beat markers drawn if beatGrid is set.
// ═══════════════════════════════════════════════════════════════
class OverviewRenderer {
  constructor(canvas, onSeek) {
    this.canvas   = canvas;
    this.ctx2d    = canvas.getContext('2d');
    this.buffer   = null;
    this.peaks    = null;
    this.beatGrid = null;
    this.onSeek   = onSeek || null;

    canvas.addEventListener('click', e => {
      if (!this.buffer || !this.onSeek) return;
      const rect  = canvas.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      this.onSeek(Math.max(0, Math.min(1, ratio)) * this.buffer.duration);
    });
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    this._fitCanvas();
    this._computePeaks();
    this.draw(0);
  }

  setBeatGrid(beatGrid) {
    this.beatGrid = beatGrid;
  }

  draw(currentTime) {
    const canvas = this.canvas;
    const ctx    = this.ctx2d;
    const W = canvas.width, H = canvas.height;
    const amp = H / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    if (!this.peaks || !this.buffer) return;

    const playheadX = Math.floor((currentTime / this.buffer.duration) * W);

    // ── Waveform columns ──────────────────────────────────────
    for (let i = 0; i < W; i++) {
      const { min, max } = this.peaks[i];
      ctx.strokeStyle = i < playheadX ? '#f59e0b' : '#3a2800';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.9);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.9);
      ctx.stroke();
    }

    // ── Centre baseline ───────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(0, amp); ctx.lineTo(W, amp);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Playhead ──────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, 0);
    ctx.lineTo(playheadX + 0.5, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  // ── Private ───────────────────────────────────────────────────
  _fitCanvas() {
    this.canvas.width  = this.canvas.offsetWidth  || 400;
    this.canvas.height = this.canvas.offsetHeight || 40;
  }

  _computePeaks() {
    const data  = this.buffer.getChannelData(0);
    const W     = this.canvas.width;
    const step  = Math.ceil(data.length / W);
    this.peaks  = [];
    for (let i = 0; i < W; i++) {
      let min = 0, max = 0;
      const base = i * step;
      for (let j = 0; j < step; j++) {
        const v = data[base + j] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      this.peaks.push({ min, max });
    }
  }
}
