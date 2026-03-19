// ═══════════════════════════════════════════════════════════════
//  WaveformRenderer.js  —  all waveform rendering
//
//  WaveformBase     — shared state, analysis, draw primitives
//  WaveformView     — CDJ-style zoomable centered-playhead view
//  WaveformOverview — full-track strip with moving playhead
// ═══════════════════════════════════════════════════════════════

// Waveform rendering constants — sourced from MIXXS config
const PEAK_RESOLUTION = MIXXS.waveform.peakResolution;
const ZOOM_MIN        = MIXXS.waveform.zoom.min;
const ZOOM_MAX        = MIXXS.waveform.zoom.max;
const ZOOM_STEP       = MIXXS.waveform.zoom.tickMultiplier;

// ═══════════════════════════════════════════════════════════════
//  WaveformBase  —  internal base class (not used directly)
// ═══════════════════════════════════════════════════════════════
class WaveformBase {
  constructor(canvas) {
    this.canvas     = canvas;
    this.ctx2d      = canvas.getContext('2d');
    this.buffer     = null;
    this.peaks      = null;
    this.spectrum   = null;
    this.beatGrid   = null;
    this.loopActive = false;
    this.loopIn     = 0;
    this.loopOut    = 0;
  }

  setBeatGrid(beatGrid) { this.beatGrid = beatGrid; }

  setLoop(active, loopIn, loopOut) {
    this.loopActive = active;
    this.loopIn     = loopIn;
    this.loopOut    = loopOut;
  }

  // ── Analysis ─────────────────────────────────────────────────

  _computePeaks(buckets) {
    const data = this.buffer.getChannelData(0);
    const step = Math.ceil(data.length / buckets);
    this.peaks = [];
    for (let i = 0; i < buckets; i++) {
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

  /**
   * Compute spectral energy per bucket (bass=red, treble=blue).
   * Two single-pole IIR lowpass filters; treble = signal − wide lowpass.
   * Each band normalised to its own max so character is preserved.
   */
  _computeSpectrum(buckets) {
    const data     = this.buffer.getChannelData(0);
    const sr       = this.buffer.sampleRate;
    const step     = Math.ceil(data.length / buckets);
    const alphaLow = 1 - Math.exp(-2 * Math.PI * 200  / sr);
    const alphaMid = 1 - Math.exp(-2 * Math.PI * 2000 / sr);
    let yLow = 0, yMid = 0;
    const bassArr = new Float32Array(buckets);
    const trebArr = new Float32Array(buckets);

    for (let i = 0; i < buckets; i++) {
      let sumBass = 0, sumTreb = 0;
      const base = i * step;
      for (let j = 0; j < step; j++) {
        const x  = data[base + j] || 0;
        yLow     = yLow + alphaLow * (x - yLow);
        yMid     = yMid + alphaMid * (x - yMid);
        sumBass += yLow * yLow;
        sumTreb += (x - yMid) * (x - yMid);
      }
      bassArr[i] = Math.sqrt(sumBass / step);
      trebArr[i] = Math.sqrt(sumTreb / step);
    }

    let maxBass = 1e-9, maxTreb = 1e-9;
    for (let i = 0; i < buckets; i++) {
      if (bassArr[i] > maxBass) maxBass = bassArr[i];
      if (trebArr[i] > maxTreb) maxTreb = trebArr[i];
    }
    this.spectrum = new Array(buckets);
    for (let i = 0; i < buckets; i++)
      this.spectrum[i] = { r: bassArr[i] / maxBass, b: trebArr[i] / maxTreb };
  }

  // ── Shared colors ─────────────────────────────────────────────

  _colors() {
    const light = document.documentElement.dataset.theme === 'light';
    return {
      bg:       light ? '#e8e8e8' : '#0d0d0d',
      played:   light ? '#b45309' : '#f59e0b',
      unplayed: light ? '#c8b49a' : '#3a2800',
      baseline: light ? 'rgba(0,0,0,0.08)'   : 'rgba(255,255,255,0.04)',
      beat:     light ? 'rgba(0,0,0,0.2)'    : 'rgba(255,255,255,0.18)',
      playhead: light ? 'rgba(0,0,0,0.9)'    : 'rgba(255,255,255,0.9)',
      glow:     light ? 'rgba(180,83,9,0.2)' : 'rgba(245,158,11,0.25)',
      zoom:     light ? 'rgba(120,55,5,0.8)' : 'rgba(245,158,11,0.7)',
    };
  }

  // ── Shared draw primitives ────────────────────────────────────

  _drawBaseline(C) {
    const { ctx2d: ctx, canvas } = this;
    const amp = canvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(0, amp); ctx.lineTo(canvas.width, amp);
    ctx.strokeStyle = C.baseline;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  /** toX(time) — converts track time → canvas X pixel */
  _drawLoopOverlay(toX) {
    if (!this.loopActive || !this.buffer) return;
    const ctx = this.ctx2d, H = this.canvas.height;
    const xIn = toX(this.loopIn), xOut = toX(this.loopOut);
    if (xOut <= xIn) return;
    ctx.fillStyle = 'rgba(34,197,94,0.15)';
    ctx.fillRect(xIn, 0, xOut - xIn, H);
    ctx.strokeStyle = 'rgba(34,197,94,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(xIn  + 0.5, 0); ctx.lineTo(xIn  + 0.5, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xOut + 0.5, 0); ctx.lineTo(xOut + 0.5, H); ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
//  WaveformView  —  CDJ-style zoomable centered-playhead view
// ═══════════════════════════════════════════════════════════════
class WaveformView extends WaveformBase {
  constructor(canvas) {
    super(canvas);
    this.zoom      = 1;
    this._hatchPat = null;
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    this.zoom   = 1;
    this._fitCanvas();
    this._computePeaks(PEAK_RESOLUTION);
    this._computeSpectrum(PEAK_RESOLUTION);
    this._buildHatchPattern();
    this.draw(0, false);
  }

  // ── Zoom ──────────────────────────────────────────────────────

  onWheel(e, isPlaying) {
    e.preventDefault();
    if (!this.buffer) return;
    const next = this.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    this.zoom  = next < ZOOM_MIN * 1.15 ? ZOOM_MIN : Math.min(ZOOM_MAX, next);
  }

  getVisibleSec() {
    return this.buffer ? this.buffer.duration / this.zoom : null;
  }

  setVisibleSec(sec) {
    if (!this.buffer || sec <= 0) return;
    const next = this.buffer.duration / sec;
    this.zoom  = next < ZOOM_MIN * 1.15 ? ZOOM_MIN : Math.min(ZOOM_MAX, next);
  }

  getTimeAtX(x, currentTime) {
    if (!this.buffer) return 0;
    const visibleSec = this.buffer.duration / this.zoom;
    return Math.max(0, Math.min(this.buffer.duration,
      currentTime + ((x / this.canvas.width) - 0.5) * visibleSec));
  }

  // ── Draw ──────────────────────────────────────────────────────

  draw(currentTime, isPlaying) {
    const { ctx2d: ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, amp = H / 2;
    const C = this._colors();

    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    if (this._hatchTheme !== theme) this._buildHatchPattern();

    ctx.clearRect(0, 0, W, H);
    if (!this.peaks || !this.buffer) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); return; }

    const visibleSec    = this.buffer.duration / this.zoom;
    const secPerPx      = visibleSec / W;
    const snappedCentre = Math.round(currentTime / secPerPx) * secPerPx;
    const viewStart     = snappedCentre - visibleSec * 0.5;

    // Background: hatch outside track bounds, solid inside
    const startX = Math.max(0, Math.floor(-viewStart / secPerPx));
    const endX   = Math.min(W, Math.ceil((this.buffer.duration - viewStart) / secPerPx));
    if (startX > 0 && this._hatchPat) { ctx.fillStyle = this._hatchPat; ctx.fillRect(0, 0, startX, H); }
    if (endX   < W && this._hatchPat) { ctx.fillStyle = this._hatchPat; ctx.fillRect(endX, 0, W - endX, H); }
    ctx.fillStyle = C.bg;
    ctx.fillRect(Math.max(0, startX), 0, Math.max(0, endX - startX), H);

    // Spectral waveform columns
    for (let i = 0; i < W; i++) {
      const tStart = viewStart + i       * secPerPx;
      const tEnd   = viewStart + (i + 1) * secPerPx;
      if (tEnd < 0 || tStart > this.buffer.duration) continue;

      const r0 = Math.max(0, tStart) / this.buffer.duration * PEAK_RESOLUTION;
      const r1 = Math.min(tEnd, this.buffer.duration) / this.buffer.duration * PEAK_RESOLUTION;
      const i0 = Math.floor(r0), i1 = Math.min(Math.ceil(r1), PEAK_RESOLUTION - 1);

      let min, max;
      if (i1 <= i0 + 1) {
        const a = r0 - i0;
        const p0 = this.peaks[Math.min(i0,     PEAK_RESOLUTION - 1)];
        const p1 = this.peaks[Math.min(i0 + 1, PEAK_RESOLUTION - 1)];
        min = p0.min + (p1.min - p0.min) * a;
        max = p0.max + (p1.max - p0.max) * a;
      } else {
        min = 0; max = 0;
        for (let k = i0; k <= i1; k++) {
          const p = this.peaks[k];
          if (p.min < min) min = p.min;
          if (p.max > max) max = p.max;
        }
      }

      let sr = 0, sb = 0, sc = 0;
      for (let k = i0; k <= i1; k++) {
        const s = this.spectrum[Math.min(k, PEAK_RESOLUTION - 1)];
        sr += s.r; sb += s.b; sc++;
      }
      sr /= sc; sb /= sc;

      const mult = tStart < currentTime ? 192 : 255;
      ctx.strokeStyle = `rgb(${Math.round(sr * mult)},0,${Math.round(sb * mult)})`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.95);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.95);
      ctx.stroke();
    }

    this._drawBaseline(C);

    // Beat markers
    if (this.beatGrid?.beats?.length) {
      const { beats } = this.beatGrid;
      const visEnd = snappedCentre + visibleSec * 0.5;
      let lo = 0, hi = beats.length - 1, si = beats.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] >= viewStart) { si = mid; hi = mid - 1; } else lo = mid + 1;
      }
      ctx.strokeStyle = C.beat; ctx.lineWidth = 1;
      for (let i = si; i < beats.length; i++) {
        const t = beats[i]; if (t > visEnd) break;
        const x = Math.round(((t - snappedCentre) / visibleSec + 0.5) * W);
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
    }

    this._drawLoopOverlay(t => Math.round(((t - snappedCentre) / visibleSec + 0.5) * W));

    // Playhead (glow behind, solid in front)
    const cx = Math.floor(W / 2);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.strokeStyle = C.glow; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.strokeStyle = C.playhead; ctx.lineWidth = 2; ctx.stroke();

    // Zoom indicator
    if (this.zoom > 1) {
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = C.zoom; ctx.textAlign = 'right';
      ctx.fillText(`${this.zoom.toFixed(1)}×`, W - 6, 14);
      ctx.textAlign = 'left';
    }
  }

  // ── Private ───────────────────────────────────────────────────

  _fitCanvas() {
    this.canvas.width  = this.canvas.offsetWidth  || 600;
    this.canvas.height = this.canvas.offsetHeight || 80;
  }

  _buildHatchPattern() {
    const light = document.documentElement.dataset.theme === 'light';
    const size  = 8;
    const off   = document.createElement('canvas');
    off.width = off.height = size;
    const c = off.getContext('2d');
    c.fillStyle   = light ? '#d8d8d8' : '#0a0a0a';
    c.fillRect(0, 0, size, size);
    c.strokeStyle = light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, size);      c.lineTo(size, 0);
    c.moveTo(-size/2, size/2); c.lineTo(size/2, -size/2);
    c.moveTo(size/2, size*1.5); c.lineTo(size*1.5, size/2);
    c.stroke();
    this._hatchPat   = this.ctx2d.createPattern(off, 'repeat');
    this._hatchTheme = light ? 'light' : 'dark';
  }
}

// ═══════════════════════════════════════════════════════════════
//  WaveformOverview  —  full-track strip with moving playhead
// ═══════════════════════════════════════════════════════════════
class WaveformOverview extends WaveformBase {
  constructor(canvas, onSeek) {
    super(canvas);
    this.onSeek = onSeek || null;
    canvas.addEventListener('click', e => {
      if (!this.buffer || !this.onSeek) return;
      const rect = canvas.getBoundingClientRect();
      this.onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * this.buffer.duration);
    });
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    this._fitCanvas();
    this._computePeaks(this.canvas.width);
    this.draw(0);
  }

  draw(currentTime) {
    const { ctx2d: ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, amp = H / 2;
    const C = this._colors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (!this.peaks || !this.buffer) return;

    const playheadX = Math.floor((currentTime / this.buffer.duration) * W);
    const toX = t => Math.floor((t / this.buffer.duration) * W);

    // Monochrome waveform — played = dim, upcoming = bright
    for (let i = 0; i < W; i++) {
      const { min, max } = this.peaks[i];
      ctx.strokeStyle = i < playheadX ? C.unplayed : C.played;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.9);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.9);
      ctx.stroke();
    }

    this._drawBaseline(C);
    this._drawLoopOverlay(toX);

    // Playhead
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, 0); ctx.lineTo(playheadX + 0.5, H);
    ctx.strokeStyle = C.playhead; ctx.lineWidth = 2; ctx.stroke();
  }

  _fitCanvas() {
    this.canvas.width  = this.canvas.offsetWidth  || 400;
    this.canvas.height = this.canvas.offsetHeight || 40;
  }
}
