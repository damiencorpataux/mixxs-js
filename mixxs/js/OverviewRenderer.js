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
    this.beatGrid  = null;
    this.loopActive = false;
    this.loopIn     = 0;
    this.loopOut    = 0;
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
    this._computeSpectrum();
    this.draw(0);
  }

  setBeatGrid(beatGrid) {
    this.beatGrid = beatGrid;
  }

  setLoop(active, loopIn, loopOut) {
    this.loopActive = active;
    this.loopIn     = loopIn;
    this.loopOut    = loopOut;
  }

  draw(currentTime) {
    const canvas = this.canvas;
    const ctx    = this.ctx2d;
    const W = canvas.width, H = canvas.height;
    const amp = H / 2;
    const light = document.documentElement.dataset.theme === 'light';
    const C = {
      bg:       light ? '#e8e8e8' : '#0a0a0a',
      played:   light ? '#b45309' : '#f59e0b',
      unplayed: light ? '#c8b49a' : '#3a2800',
      baseline: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)',
      playhead: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
    };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (!this.peaks || !this.buffer) return;

    const playheadX = Math.floor((currentTime / this.buffer.duration) * W);

    // ── Waveform columns ──────────────────────────────────────
    for (let i = 0; i < W; i++) {
      const { min, max } = this.peaks[i];
      ctx.strokeStyle = i < playheadX ? C.unplayed : C.played;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.9);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.9);
      ctx.stroke();
    }

    // ── Centre baseline ───────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(0, amp); ctx.lineTo(W, amp);
    ctx.strokeStyle = C.baseline;
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Loop region overlay ──────────────────────────────────
    if (this.loopActive && this.buffer) {
      const xIn  = Math.floor((this.loopIn  / this.buffer.duration) * W);
      const xOut = Math.floor((this.loopOut / this.buffer.duration) * W);
      if (xOut > xIn) {
        ctx.fillStyle = 'rgba(34,197,94,0.2)';
        ctx.fillRect(xIn, 0, xOut - xIn, H);
        ctx.strokeStyle = 'rgba(34,197,94,0.9)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(xIn + 0.5, 0);  ctx.lineTo(xIn + 0.5, H);  ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xOut + 0.5, 0); ctx.lineTo(xOut + 0.5, H); ctx.stroke();
      }
    }

    // ── Playhead — extends 4px beyond canvas vertically ──────────
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, 0);
    ctx.lineTo(playheadX + 0.5, H);
    ctx.strokeStyle = C.playhead;
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

  _computeSpectrum() {
    const data = this.buffer.getChannelData(0);
    const sr   = this.buffer.sampleRate;
    const W    = this.canvas.width;
    const step = Math.ceil(data.length / W);

    const alphaLow = 1 - Math.exp(-2 * Math.PI * 200  / sr);
    const alphaMid = 1 - Math.exp(-2 * Math.PI * 2000 / sr);

    let yLow = 0, yMid = 0;
    const bassArr = new Float32Array(W);
    const trebArr = new Float32Array(W);

    for (let i = 0; i < W; i++) {
      let sumBass = 0, sumTreb = 0;
      const base = i * step;
      for (let j = 0; j < step; j++) {
        const x  = data[base + j] || 0;
        yLow     = yLow + alphaLow * (x - yLow);
        yMid     = yMid + alphaMid * (x - yMid);
        const hi = x - yMid;
        sumBass += yLow * yLow;
        sumTreb += hi   * hi;
      }
      bassArr[i] = Math.sqrt(sumBass / step);
      trebArr[i] = Math.sqrt(sumTreb / step);
    }

    let maxBass = 1e-9, maxTreb = 1e-9;
    for (let i = 0; i < W; i++) {
      if (bassArr[i] > maxBass) maxBass = bassArr[i];
      if (trebArr[i] > maxTreb) maxTreb = trebArr[i];
    }

    this.spectrum = new Array(W);
    for (let i = 0; i < W; i++) {
      this.spectrum[i] = { r: bassArr[i] / maxBass, b: trebArr[i] / maxTreb };
    }
  }
}
