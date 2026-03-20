// ═══════════════════════════════════════════════════════════════
//  VUMeter  —  LED-segment level meter (horizontal or vertical)
//
//  Color zones (standard convention):
//    green  — nominal signal  (below YELLOW_DB)
//    yellow — loud signal     (YELLOW_DB to RED_DB)
//    red    — clip warning    (above RED_DB)
//
//  Orientation is inferred from canvas dimensions:
//    width > height → horizontal (channel meters in mixer)
//    height > width → vertical   (master/CUE in page header)
//
//  Segment count is read from data-segments attribute (default 12).
//
//  Usage:
//    const meter = new VUMeter(canvas);
//    meter.draw(-18);  // call every RAF frame with current dBFS
// ═══════════════════════════════════════════════════════════════

const VU_SEGMENTS    = 12;    // default if data-segments not set
const VU_MIN_DB      = -48;   // full empty
const VU_MAX_DB      =   0;   // 0 dBFS = full
const VU_YELLOW_DB   = -12;   // green → yellow
const VU_RED_DB      =  -3;   // yellow → red
const VU_GAP_PX      =   1;   // integer gap between segments
const VU_PEAK_HOLD_MS = 1500; // how long the peak segment stays lit

class VUMeter {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.segments = parseInt(canvas.dataset.segments) || VU_SEGMENTS;
    this._peak    = 0;  // peak segment index (1-based, 0 = no peak)
    this._peakTs  = 0;  // timestamp when peak was last exceeded
    this.draw(VU_MIN_DB); // draw at silence immediately — visible before audio starts
  }

  draw(db) {
    const { canvas, ctx, segments } = this;
    const W   = canvas.width, H = canvas.height;
    const now = performance.now();

    const lit = Math.round(
      Math.max(0, Math.min(1, (db - VU_MIN_DB) / (VU_MAX_DB - VU_MIN_DB))) * segments
    );

    // Update peak hold
    if (lit > this._peak) {
      this._peak   = lit;
      this._peakTs = now;
    } else if (now - this._peakTs > VU_PEAK_HOLD_MS) {
      this._peak = lit; // hold expired — snap down to current level
    }
    const peak = this._peak;

    // Colors from CSS variables — theme-aware
    const css    = getComputedStyle(canvas);
    const green  = css.getPropertyValue('--vu-green').trim()  || '#22c55e';
    const yellow = css.getPropertyValue('--vu-yellow').trim() || '#eab308';
    const red    = css.getPropertyValue('--vu-red').trim()    || '#ef4444';
    const dim    = css.getPropertyValue('--vu-dim').trim()    || 'rgba(255,255,255,0.07)';

    ctx.clearRect(0, 0, W, H);

    // Pixel-perfect segments: each boundary computed independently from total
    // fill space so sub-pixel errors never accumulate across segments.
    const horizontal = W >= H;
    const totalGap   = VU_GAP_PX * (segments - 1);
    const totalFill  = (horizontal ? W : H) - totalGap;

    for (let i = 0; i < segments; i++) {
      const fillStart = Math.floor( i      * totalFill / segments);
      const fillEnd   = Math.floor((i + 1) * totalFill / segments);
      const segSize   = fillEnd - fillStart; // always ≥ 1, never fractional
      const segDb     = VU_MIN_DB + ((i + 1) / segments) * (VU_MAX_DB - VU_MIN_DB);

      let color;
      if (i === peak - 1 && peak > lit) {
        // Peak hold segment — show at full zone color even though signal dropped
        color = segDb >= VU_RED_DB ? red : segDb >= VU_YELLOW_DB ? yellow : green;
      } else if (i >= lit) {
        color = dim;
      } else {
        color = segDb >= VU_RED_DB ? red : segDb >= VU_YELLOW_DB ? yellow : green;
      }

      ctx.fillStyle = color;

      if (horizontal) {
        const x = fillStart + i * VU_GAP_PX;
        ctx.fillRect(x, 0, segSize, H);
      } else {
        // Vertical: i=0 = bottom (silence), so flip to canvas coords (y=0 at top)
        const x = fillStart + i * VU_GAP_PX;
        const y = H - x - segSize;
        ctx.fillRect(0, y, W, segSize);
      }
    }
  }
}

/** Compute RMS level in dBFS from an AnalyserNode. Returns dB (≤ 0). */
function analyserToDb(analyser) {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? Math.max(VU_MIN_DB, 20 * Math.log10(rms)) : VU_MIN_DB;
}
