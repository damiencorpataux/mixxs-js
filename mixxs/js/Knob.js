// ═══════════════════════════════════════════════════════════════
//  Knob  —  reusable rotary knob widget
//
//  Wraps: canvas (visual) + range input (internal value) + number
//  input (editable display).
//
//  Usage:
//    new Knob({
//      canvas, range, display,       // DOM elements
//      onChange,                      // called with internal value
//      displayFn,                     // internal → display string
//      internalFn,                    // display string → internal
//      color,                         // arc color (default amber)
//    });
//
//  Public methods:
//    knob.setValue(v)  — set internal value and redraw
// ═══════════════════════════════════════════════════════════════
class Knob {
  constructor({ canvas, range, display, onChange,
                displayFn, internalFn, color = '#f59e0b' }) {
    this.canvas     = canvas;
    this.range      = range;
    this.display    = display;
    this.onChange   = onChange;
    this.displayFn  = displayFn  || (v => Math.round(v * 100));
    this.internalFn = internalFn || (d => d / 100);
    this.color      = color;

    this._dragging     = false;
    this._startY       = 0;
    this._startVal     = 0;
    this._editSnapshot = null;
    this._arrowActive  = false;

    this._wire();
    this.setValue(parseFloat(range.value)); // initial draw
  }

  // ── Public ───────────────────────────────────────────────────

  get min() { return parseFloat(this.range.min); }
  get max() { return parseFloat(this.range.max); }

  clamp(v) { return Math.max(this.min, Math.min(this.max, v)); }

  setValue(internalVal) {
    const v = this.clamp(internalVal);
    this.range.value   = v;
    this.display.value = this.displayFn(v);
    Knob.draw(this.canvas, v, this.min, this.max, this.color);
    this.onChange(v);
  }

  // ── Static draw (usable standalone) ──────────────────────────

  static draw(canvas, value, min, max, color = '#f59e0b') {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) / 2 - 3;

    const startA = 0.75 * Math.PI; // 7:30 position
    const sweep  = 1.5  * Math.PI; // 270°
    const norm   = (value - min) / (max - min);
    const angle  = startA + norm * sweep;

    const light = document.documentElement.dataset.theme === 'light';

    ctx.clearRect(0, 0, W, H);

    // Body
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = light ? '#d0d0d0' : '#161616';
    ctx.fill();
    ctx.strokeStyle = light ? '#b0b0b0' : '#303030';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Track (full range, dim)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startA, startA + sweep, false);
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Centre mark (12 o'clock = neutral)
    const midA = startA + 0.5 * sweep;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(midA) * (r - 3), cy + Math.sin(midA) * (r - 3),
            1.5, 0, Math.PI * 2);
    ctx.fillStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
    ctx.fill();

    // Value arc
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startA, angle, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Indicator line
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 4,       cy + Math.sin(angle) * 4);
    ctx.lineTo(cx + Math.cos(angle) * (r - 9), cy + Math.sin(angle) * (r - 9));
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ── Private ───────────────────────────────────────────────────

  _wire() {
    // Drag — unified mouse + touch via pointerDrag utility (defined in main.js)
    let _dragStartY = 0, _dragStartVal = 0;
    pointerDrag(
      this.canvas,
      (_x, y) => { _dragStartY = y; _dragStartVal = parseFloat(this.range.value); },
      (_x,  y) => {
        const span  = this.max - this.min;
        const delta = -(( y - _dragStartY) / 150) * span;
        this.setValue(_dragStartVal + delta);
      },
      () => {}
    );

    // Double-click / double-tap reset
    const defaultVal = parseFloat(this.range.defaultValue ?? this.range.value);
    this.canvas.addEventListener('dblclick', () => this.setValue(defaultVal));
    let _lastTap = 0;
    this.canvas.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - _lastTap < 300) { e.preventDefault(); this.setValue(defaultVal); }
      _lastTap = now;
    });

    // Display input editing
    this.display.addEventListener('focus', () => {
      this._editSnapshot = parseFloat(this.range.value);
      this.display.select();
    });

    const commit = () => {
      const raw = this.display.value;
      if (raw === '-∞' || raw === '-Infinity') {
        this.setValue(this.min); this._editSnapshot = null; return;
      }
      const displayVal = parseFloat(raw);
      if (isNaN(displayVal)) { this._cancelEdit(); return; }
      this.setValue(this.clamp(this.internalFn(displayVal)));
      this._editSnapshot = null;
    };

    this.display.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this._arrowActive = true;
      if (e.key === 'Enter') {
        commit();
        // Stay focused, re-snapshot so next blur is a no-op
        this._editSnapshot = parseFloat(this.range.value);
        this.display.select();
      }
      if (e.key === 'Escape') { this._cancelEdit(); }
    });
    this.display.addEventListener('input', () => {
      if (!this._arrowActive) return;
      this._arrowActive = false;
      const raw = this.display.value;
      if (raw === '-∞' || raw === '-Infinity') return;
      const displayVal = parseFloat(raw);
      if (!isNaN(displayVal)) this.setValue(this.clamp(this.internalFn(displayVal)));
    });
    this.display.addEventListener('blur', () => {
      if (this._editSnapshot !== null) commit();
    });
  }

  _cancelEdit() {
    if (this._editSnapshot !== null) {
      this.setValue(this._editSnapshot);
      this._editSnapshot = null;
    }
    this.display.blur();
  }
}
