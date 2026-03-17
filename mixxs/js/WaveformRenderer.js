// ═══════════════════════════════════════════════════════════════
//  WaveformRenderer  —  CDJ-style centered playhead waveform
//
//  The playhead is fixed at the horizontal centre of the canvas.
//  The waveform scrolls past it as the track plays.
//  Areas before track start and after track end are shown with a
//  hatched pattern to indicate non-playable space.
//
//  Zoom model:
//    zoom — how many seconds are visible in the full canvas width.
//            Default: full track duration (zoom=1 → whole track fits).
//            Scroll up = zoom in (fewer seconds visible = more detail).
//
//  When paused, mouse wheel pans the view (browse mode).
//  When playing, mouse wheel zooms only (view stays centred).
// ═══════════════════════════════════════════════════════════════

const PEAK_RESOLUTION = 8192;
const ZOOM_MIN        = 0.5; // visible window = 2× track → full track always visible
const ZOOM_MAX        = 32;
const ZOOM_STEP       = 1.16;

class WaveformRenderer {
  constructor(canvas) {
    this.canvas      = canvas;
    this.ctx2d       = canvas.getContext('2d');
    this.buffer      = null;
    this.peaks       = null;
    this.zoom        = 1;
    this._hatchPat   = null;
    this.beatGrid    = null; // { bpm, offset } — set by MixerController after analysis
  }

  setBeatGrid(beatGrid) {
    this.beatGrid = beatGrid;
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    this.zoom   = 1;
    this._fitCanvas();
    this._computePeaks();
    this._buildHatchPattern();
    this.draw(0, false);
  }

  // ── Zoom / pan ────────────────────────────────────────────────

  onWheel(e, isPlaying) {
    e.preventDefault();
    if (!this.buffer) return;
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const next   = this.zoom * factor;
    this.zoom    = next < ZOOM_MIN * 1.15 ? ZOOM_MIN : Math.min(ZOOM_MAX, next);
  }

  // ── Seek helper ───────────────────────────────────────────────

  /**
   * Convert a canvas X pixel to a track time, accounting for current
   * view centre and zoom. Used by MixerController.seekOnCanvas().
   */
  getTimeAtX(x, currentTime) {
    if (!this.buffer) return 0;
    const centre     = this._centreTime(currentTime);
    const visibleSec = this.buffer.duration / this.zoom;
    const time       = centre + ((x / this.canvas.width) - 0.5) * visibleSec;
    return Math.max(0, Math.min(this.buffer.duration, time));
  }

  // ── Draw ──────────────────────────────────────────────────────

  /**
   * @param {number}  currentTime  — current playback position in seconds
   * @param {boolean} isPlaying    — used to reset browseOffset on play
   */
  draw(currentTime, isPlaying) {

    const canvas = this.canvas;
    const ctx    = this.ctx2d;
    const W = canvas.width;
    const H = canvas.height;
    const amp = H / 2;

    ctx.clearRect(0, 0, W, H);

    if (!this.peaks || !this.buffer) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const centre     = this._centreTime(currentTime);
    const visibleSec = this.buffer.duration / this.zoom;
    const secPerPx   = visibleSec / W;

    // Snap the view centre to the nearest pixel boundary.
    // This means the waveform only moves when currentTime crosses a full pixel,
    // eliminating sub-pixel jitter across all zoom levels.
    // The playhead and played/unplayed split still use the real currentTime.
    const snappedCentre = Math.round(centre / secPerPx) * secPerPx;

    // ── Background pass ──────────────────────────────────────────
    const startX = Math.max(0, Math.floor((0 - (snappedCentre - visibleSec * 0.5)) / secPerPx));
    const endX   = Math.min(W, Math.ceil((this.buffer.duration - (snappedCentre - visibleSec * 0.5)) / secPerPx));

    if (startX > 0 && this._hatchPat) {
      ctx.fillStyle = this._hatchPat;
      ctx.fillRect(0, 0, startX, H);
    }
    if (endX < W && this._hatchPat) {
      ctx.fillStyle = this._hatchPat;
      ctx.fillRect(endX, 0, W - endX, H);
    }
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(Math.max(0, startX), 0, Math.max(0, endX - startX), H);

    // ── Waveform columns ──────────────────────────────────────────
    // Geometry uses snappedCentre (stable, pixel-aligned).
    // Played/unplayed colour split uses real currentTime (accurate).
    for (let i = 0; i < W; i++) {
      const tStart = snappedCentre + ((i)     / W - 0.5) * visibleSec;
      const tEnd   = snappedCentre + ((i + 1) / W - 0.5) * visibleSec;
      if (tEnd < 0 || tStart > this.buffer.duration) continue;

      const fracStart = Math.max(0, tStart) / this.buffer.duration;
      const fracEnd   = Math.min(tEnd, this.buffer.duration) / this.buffer.duration;
      const rawStart  = fracStart * PEAK_RESOLUTION;
      const rawEnd    = fracEnd   * PEAK_RESOLUTION;
      const idx0      = Math.floor(rawStart);
      const idx1      = Math.min(Math.ceil(rawEnd), PEAK_RESOLUTION - 1);

      let min, max;
      if (idx1 <= idx0 + 1) {
        // High zoom: pixel covers < 1 bucket → interpolate
        const alpha = rawStart - idx0;
        const p0    = this.peaks[Math.min(idx0,     PEAK_RESOLUTION - 1)];
        const p1    = this.peaks[Math.min(idx0 + 1, PEAK_RESOLUTION - 1)];
        min = p0.min + (p1.min - p0.min) * alpha;
        max = p0.max + (p1.max - p0.max) * alpha;
      } else {
        // Low zoom: pixel covers multiple buckets → aggregate
        min = 0; max = 0;
        for (let k = idx0; k <= idx1; k++) {
          const p = this.peaks[k];
          if (p.min < min) min = p.min;
          if (p.max > max) max = p.max;
        }
      }

      ctx.strokeStyle = tStart < currentTime ? '#f59e0b' : '#3a2800';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, amp + min * amp * 0.95);
      ctx.lineTo(i + 0.5, amp + max * amp * 0.95);
      ctx.stroke();
    }

    // ── Centre baseline ──
    ctx.beginPath();
    ctx.moveTo(0, amp); ctx.lineTo(W, amp);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Beat markers ──
    if (this.beatGrid?.beats?.length) {
      const { beats, bpm, offset } = this.beatGrid;
      const beatDuration = 60 / bpm;
      const visibleStart = snappedCentre - visibleSec * 0.5;
      const visibleEnd   = snappedCentre + visibleSec * 0.5;

      // Binary search for first beat in visible window
      let lo = 0, hi = beats.length - 1, startIdx = beats.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] >= visibleStart) { startIdx = mid; hi = mid - 1; }
        else lo = mid + 1;
      }

      // Draw detected/extrapolated beats
      const lastBeat = beats[beats.length - 1];
      for (let i = startIdx; i < beats.length; i++) {
        const t = beats[i];
        if (t > visibleEnd) break;
        const x = Math.round(((t - snappedCentre) / visibleSec + 0.5) * W);
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }
    }

    // ── Fixed playhead at centre ──
    const cx = Math.floor(W / 2);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    // Subtle glow
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = 'rgba(245,158,11,0.25)';
    ctx.lineWidth   = 6;
    ctx.stroke();

    // ── Zoom level indicator ──
    if (this.zoom > 1) {
      ctx.font      = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(245,158,11,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.zoom.toFixed(1)}×`, W - 6, 14);
      ctx.textAlign = 'left';
    }

  }

  // ── Private ───────────────────────────────────────────────────

  /** The track time that should appear at the horizontal centre */
  _centreTime(currentTime) {
    return currentTime;
  }

  _fitCanvas() {
    this.canvas.width  = this.canvas.offsetWidth  || 600;
    this.canvas.height = this.canvas.offsetHeight || 80;
  }

  _computePeaks() {
    const data = this.buffer.getChannelData(0);
    const step = Math.ceil(data.length / PEAK_RESOLUTION);
    this.peaks = [];
    for (let i = 0; i < PEAK_RESOLUTION; i++) {
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

  /** Build an offscreen canvas hatch pattern for non-playable regions */
  _buildHatchPattern() {
    const size = 8;
    const off  = document.createElement('canvas');
    off.width  = size;
    off.height = size;
    const c    = off.getContext('2d');

    c.fillStyle = '#0a0a0a';
    c.fillRect(0, 0, size, size);

    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth   = 2;
    // Diagonal lines (top-left → bottom-right)
    c.beginPath();
    c.moveTo(0, size); c.lineTo(size, 0);
    c.moveTo(-size / 2, size / 2); c.lineTo(size / 2, -size / 2);
    c.moveTo(size / 2, size * 1.5); c.lineTo(size * 1.5, size / 2);
    c.stroke();

    this._hatchPat = this.ctx2d.createPattern(off, 'repeat');
  }
}
