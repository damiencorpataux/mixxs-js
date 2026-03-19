// ═══════════════════════════════════════════════════════════════
//  Knob  —  reusable rotary knob widget
//
//  Wraps three DOM elements into a single interactive control:
//    canvas  — the visual rotary knob (drawn by Knob.draw)
//    range   — hidden <input type="range"> that owns min/max/default
//    display — <input type="number"> for reading and typing values
//
//  The range element is the single source of truth for bounds:
//    min, max, step, and defaultValue all come from its attributes.
//
//  Constructor options:
//    canvas, range, display  — DOM elements (required)
//    onChange(internalVal)   — called whenever the value changes
//    displayFn(internalVal)  — converts internal value → display string
//    internalFn(displayStr)  — converts display string → internal value
//                              (clamping is handled automatically by Knob,
//                               so this only needs to parse the string)
//    color                   — arc color, default amber
//
//  Public API:
//    knob.setValue(v)  — programmatically set value and redraw
// ═══════════════════════════════════════════════════════════════
class Knob {
  constructor({ canvas, range, display, onChange,
                displayFn, internalFn, color = '#f59e0b' }) {
    this.canvas     = canvas;
    this.range      = range;
    this.display    = display;
    this.onChange   = onChange;
    this.displayFn  = displayFn  ?? (v => v.toFixed(2));
    this.internalFn = internalFn ?? (d => parseFloat(d));
    this.color      = color;

    this._editSnapshot = null;
    this._arrowActive  = false;

    // Register for theme-aware redraws (see applyTheme in main.js)
    Knob._instances.push(this);

    this._wire();
    this.setValue(parseFloat(range.value)); // initial draw
  }

  // ── Static registry (used by applyTheme to redraw all knobs) ──

  static _instances = [];

  static redrawAll() {
    Knob._instances.forEach(k =>
      Knob.draw(k.canvas, parseFloat(k.range.value), k.min, k.max, k.color));
  }

  // ── Public ───────────────────────────────────────────────────

  get min() { return parseFloat(this.range.min); }
  get max() { return parseFloat(this.range.max); }

  clamp(v) { return Math.max(this.min, Math.min(this.max, v)); }

  setValue(internalVal) {
    if (!Number.isFinite(internalVal)) return;
    const v = this.clamp(internalVal);
    this.range.value   = v;
    this.display.value = this.displayFn(v);
    Knob.draw(this.canvas, v, this.min, this.max, this.color);
    this.onChange(v);
  }

  // ── Static draw ───────────────────────────────────────────────

  static draw(canvas, value, min, max, color = '#f59e0b') {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) / 2 - 3;

    // 270° arc from 7:30 to 4:30 (clockwise)
    const startAngle = 0.75 * Math.PI;
    const sweepAngle = 1.5  * Math.PI;
    const valueAngle = startAngle + ((value - min) / (max - min)) * sweepAngle;
    const midAngle   = startAngle + 0.5 * sweepAngle; // 12 o'clock

    const light = document.documentElement.dataset.theme === 'light';

    ctx.clearRect(0, 0, W, H);

    // Body
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = light ? '#b8b8b8' : '#161616';
    ctx.fill();
    ctx.strokeStyle = light ? '#999999' : '#303030';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Full-range track (dim background arc)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startAngle, startAngle + sweepAngle, false);
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Neutral mark at 12 o'clock
    ctx.beginPath();
    ctx.arc(cx + Math.cos(midAngle) * (r - 3),
            cy + Math.sin(midAngle) * (r - 3), 1.5, 0, Math.PI * 2);
    ctx.fillStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
    ctx.fill();

    // Value arc (colored)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startAngle, valueAngle, false);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Indicator line (pointer)
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(valueAngle) * 4,       cy + Math.sin(valueAngle) * 4);
    ctx.lineTo(cx + Math.cos(valueAngle) * (r - 9), cy + Math.sin(valueAngle) * (r - 9));
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.lineCap     = 'butt';
  }

  // ── Private ───────────────────────────────────────────────────

  _wire() {
    const { dragSensitivity, doubleTapMs } = MIXXS.knob;

    // ── Drag to adjust value ─────────────────────────────────────
    // Uses absolute start position for smooth, drift-free dragging.
    let _dragStartY = 0, _dragStartVal = 0;
    pointerDrag(
      this.canvas,
      (_x, y) => {
        _dragStartY   = y;
        const n       = this.range.valueAsNumber;
        _dragStartVal = Number.isFinite(n) ? n : this.min;
      },
      (_x, y) => {
        const delta = -((y - _dragStartY) / dragSensitivity) * (this.max - this.min);
        this.setValue(_dragStartVal + delta);
      },
      () => {}
    );

    // ── Double-click / double-tap to reset to default ────────────
    const defaultVal = parseFloat(this.range.defaultValue ?? this.range.value);
    this.canvas.addEventListener('dblclick', () => this.setValue(defaultVal));
    let _lastTap = 0;
    this.canvas.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - _lastTap < doubleTapMs) { e.preventDefault(); this.setValue(defaultVal); }
      _lastTap = now;
    });

    // ── Typed input editing ──────────────────────────────────────
    // Focus → select all. Enter → commit and stay focused.
    // Escape → revert. Blur → commit. Arrow keys → live update.
    this.display.addEventListener('focus', () => {
      this._editSnapshot = parseFloat(this.range.value);
      this.display.select();
    });

    const commit = () => {
      const v = parseFloat(this.display.value);
      if (isNaN(v)) { this._cancelEdit(); return; }
      this.setValue(this.clamp(this.internalFn(this.display.value)));
      this._editSnapshot = null;
    };

    this.display.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this._arrowActive = true;
      if (e.key === 'Enter')  {
        commit();
        this._editSnapshot = parseFloat(this.range.value); // re-snapshot so blur is no-op
        this.display.select();
      }
      if (e.key === 'Escape') this._cancelEdit();
    });

    this.display.addEventListener('input', () => {
      if (!this._arrowActive) return;
      this._arrowActive = false;
      const v = parseFloat(this.display.value);
      if (!isNaN(v)) this.setValue(this.clamp(this.internalFn(this.display.value)));
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
