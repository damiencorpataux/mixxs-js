// ═══════════════════════════════════════════════════════════════
//  main.js  —  bootstrap only
// ═══════════════════════════════════════════════════════════════

// ── Utilities (shared across UI classes) ─────────────────────
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
const el          = id => document.getElementById(id);
const linearToDb  = v  => v <= 0 ? '-∞' : (20 * Math.log10(v)).toFixed(1);
const dbToLinear  = db => Math.max(0, Math.min(1, Math.pow(10, parseFloat(db) / 20)));

/**
 * pointerDrag — unified mouse + touch drag helper.
 *
 * Attaches mousedown + touchstart to `element`.
 * onStart(x, y)       — pointer down
 * onMove(x, y, dx, dy) — pointer moved
 * onEnd()              — pointer released
 *
 * Mouse moves are tracked on `window` to handle fast drags.
 * Touch moves are tracked on `window` with the same touch identifier.
 */
function pointerDrag(element, onStart, onMove, onEnd) {
  // ── Mouse ──────────────────────────────────────────────────
  element.addEventListener('mousedown', e => {
    e.preventDefault();
    onStart(e.clientX, e.clientY);
    const move = e2 => onMove(e2.clientX, e2.clientY, e2.movementX, e2.movementY);
    const up   = ()  => { onEnd(); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  });

  // ── Touch ──────────────────────────────────────────────────
  element.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t0 = e.touches[0];
    let lastX = t0.clientX, lastY = t0.clientY;
    onStart(lastX, lastY);

    const move = e2 => {
      const t = [...e2.changedTouches].find(t => t.identifier === t0.identifier);
      if (!t) return;
      onMove(t.clientX, t.clientY, t.clientX - lastX, t.clientY - lastY);
      lastX = t.clientX; lastY = t.clientY;
    };
    const end = () => {
      onEnd();
      window.removeEventListener('touchmove',   move);
      window.removeEventListener('touchend',    end);
      window.removeEventListener('touchcancel', end);
    };
    window.addEventListener('touchmove',   move, { passive: false });
    window.addEventListener('touchend',    end);
    window.addEventListener('touchcancel', end);
  }, { passive: false });
}

// ── Theme ──────────────────────────────────────────────────────
const applyTheme = (light) => {
  document.documentElement.dataset.theme = light ? 'light' : '';
  el('btnTheme').textContent = light ? '🌙' : '☀';
  try { localStorage.setItem('mixxs-theme', light ? 'light' : 'dark'); } catch(_) {}
  // Redraw all knob canvases for the new theme
  document.querySelectorAll('canvas.knob-canvas').forEach(c => {
    const range = c.nextElementSibling?.type === 'range' ? c.nextElementSibling
                : c.closest('.knob-widget, .knob-inline')?.querySelector('input[type="range"]');
    if (range) Knob.draw(c, parseFloat(range.value), parseFloat(range.min), parseFloat(range.max));
  });
};
try { applyTheme(localStorage.getItem('mixxs-theme') === 'light'); } catch(_) { applyTheme(false); }
el('btnTheme').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme !== 'light'));

// ── Misc ───────────────────────────────────────────────────────
if (window.location.protocol === 'file:') el('fileProtocolWarning').style.display = 'block';
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop',     e => e.preventDefault());

// ── Bootstrap ─────────────────────────────────────────────────
const mixer    = new MixerController();
const mixerUI  = new MixerUI(mixer);
const deck1UI  = new DeckUI(1, mixer);
const deck2UI  = new DeckUI(2, mixer);
