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

// ── Theme ──────────────────────────────────────────────────────
const applyTheme = (light) => {
  document.documentElement.dataset.theme = light ? 'light' : '';
  el('btnTheme').textContent = light ? '🌙' : '☀';
  try { localStorage.setItem('mixxs-theme', light ? 'light' : 'dark'); } catch(_) {}
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
