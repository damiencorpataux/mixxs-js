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
//
//  Arc color is CSS-driven via --knob-arc (default: var(--amber)).
//  Override per-knob with a class, e.g. .filter-knob { --knob-arc: var(--teal) }
//
//  Public API:
//    knob.setValue(v)  — programmatically set value and redraw
// ═══════════════════════════════════════════════════════════════
class Knob {
  constructor({ canvas, range, display, onChange, displayFn, internalFn }) {
    this.canvas     = canvas;
    this.range      = range;
    this.display    = display;
    this.onChange   = onChange;
    this.displayFn  = displayFn  ?? (v => v.toFixed(2));
    this.internalFn = internalFn ?? (d => parseFloat(d));

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
      Knob.draw(k.canvas, parseFloat(k.range.value), k.min, k.max));
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
    Knob.draw(this.canvas, v, this.min, this.max);
    this.onChange(v);
  }

  // ── Static draw ───────────────────────────────────────────────

  static draw(canvas, value, min, max) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) / 2 - 3;

    const startAngle = 0.75 * Math.PI;
    const sweepAngle = 1.5  * Math.PI;
    const valueAngle = startAngle + ((value - min) / (max - min)) * sweepAngle;
    const midAngle   = startAngle + 0.5 * sweepAngle;

    // All colors from CSS variables — theme and per-knob color via CSS only
    const css         = getComputedStyle(canvas);
    const arcColor    = css.getPropertyValue('--knob-arc').trim();
    const bodyColor   = css.getPropertyValue('--knob-body').trim();
    const borderColor = css.getPropertyValue('--knob-border').trim();
    const trackColor  = css.getPropertyValue('--knob-track').trim();
    const dotColor    = css.getPropertyValue('--knob-neutral-dot').trim();
    const ptrColor    = css.getPropertyValue('--knob-pointer').trim();

    ctx.clearRect(0, 0, W, H);

    // Body
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = bodyColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Full-range track (dim background arc)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startAngle, startAngle + sweepAngle, false);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Neutral mark at 12 o'clock
    ctx.beginPath();
    ctx.arc(cx + Math.cos(midAngle) * (r - 3),
            cy + Math.sin(midAngle) * (r - 3), 1.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Value arc (colored — uses --knob-arc, default amber, overridden by .filter-knob)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, startAngle, valueAngle, false);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Indicator line (pointer)
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(valueAngle) * 4,       cy + Math.sin(valueAngle) * 4);
    ctx.lineTo(cx + Math.cos(valueAngle) * (r - 9), cy + Math.sin(valueAngle) * (r - 9));
    ctx.strokeStyle = ptrColor;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.lineCap     = 'butt';
  }

  // ── Private ───────────────────────────────────────────────────

  _wire() {
    const { dragSensitivity, doubleTapMs } = MIXXS.knob;

    // Prevent right-click context menu which breaks pressed state
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

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
