// ═══════════════════════════════════════════════════════════════
//  main.js  —  shared utilities + bootstrap
// ═══════════════════════════════════════════════════════════════

// ── DOM utilities ─────────────────────────────────────────────

/** Shorthand for document.getElementById */
const el = id => document.getElementById(id);

/**
 * Initialise a range input's min/max/value/defaultValue from a Config entry.
 * Call this before constructing a Knob so the range is the single source of
 * truth — the HTML element carries no hardcoded numeric attributes.
 *
 * @param {HTMLInputElement} range  — the <input type="range"> element
 * @param {object}           cfg    — a MIXXS config object with min/max/default
 */
function initRange(range, cfg) {
  range.min          = cfg.min;
  range.max          = cfg.max;
  range.value        = cfg.default;
  range.defaultValue = cfg.default;
}

/** Format seconds as m:ss */
function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Sync a toggle button's .active class to a boolean state */
function syncToggleBtn(id, active) {
  document.getElementById(id)?.classList.toggle('active', active);
}

// ── pointerDrag ───────────────────────────────────────────────
//
//  Unified mouse + touch drag helper.
//  Attaches to `element`; tracks moves on `window` to handle
//  fast drags that leave the element bounds.
//
//  onStart(x, y)        — pointer down
//  onMove(x, y)         — pointer moved
//  onEnd()              — pointer released / cancelled

function pointerDrag(element, onStart, onMove, onEnd) {
  // Mouse
  element.addEventListener('mousedown', e => {
    e.preventDefault();
    onStart(e.clientX, e.clientY);
    const move = e2 => onMove(e2.clientX, e2.clientY);
    const up   = ()  => {
      onEnd();
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  });

  // Touch (single finger only — multi-finger handled separately where needed)
  element.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t0 = e.touches[0];
    let lastX = t0.clientX, lastY = t0.clientY;
    onStart(lastX, lastY);

    const move = e2 => {
      const t = [...e2.changedTouches].find(t => t.identifier === t0.identifier);
      if (!t) return;
      onMove(t.clientX, t.clientY);
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
  try { localStorage.setItem('mixxs-theme', light ? 'light' : 'dark'); } catch (_) {}
  // Repaint knob canvases — CSS variables update automatically,
  // but canvas pixels need an explicit redraw.
  Knob.redrawAll();
};

try   { applyTheme(localStorage.getItem('mixxs-theme') === 'light'); }
catch (_) { applyTheme(false); }
el('btnTheme').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme !== 'light'));

// ── Misc ───────────────────────────────────────────────────────

// Warn when running from file:// (audio device enumeration is restricted)
if (window.location.protocol === 'file:')
  el('fileProtocolWarning').style.display = 'block';

// Prevent the browser from navigating away if a file is dropped outside a deck
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop',     e => e.preventDefault());

// ── Bootstrap ─────────────────────────────────────────────────

const mixer   = new MixerController();
const mixerUI = new MixerUI(mixer);
const deck1UI = new DeckUI(1, mixer);
const deck2UI = new DeckUI(2, mixer);
