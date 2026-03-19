// ═══════════════════════════════════════════════════════════════
//  main.js  —  UI wiring entry point
// ═══════════════════════════════════════════════════════════════

// ── Utilities ─────────────────────────────────────────────────

function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Knob drawing ──────────────────────────────────────────────

/**
 * Draw a rotary knob on a canvas.
 * value/min/max define current position.
 * Sweep: 270° from 7:30 (min) clockwise to 4:30 (max), 12 o'clock = centre.
 */
function drawKnob(canvas, value, min, max, color = '#f59e0b') {
  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r  = Math.min(W, H) / 2 - 3;

  // Angle mapping in canvas space (0 = east = 3 o'clock, clockwise positive)
  // 7:30 position = 135° in canvas = 3π/4
  const startA = 0.75 * Math.PI;
  const sweep  = 1.5  * Math.PI; // 270°
  const norm   = (value - min) / (max - min);
  const angle  = startA + norm * sweep;

  ctx.clearRect(0, 0, W, H);

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#161616';
  ctx.fill();
  ctx.strokeStyle = '#303030';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Track (full range, dim)
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, startA, startA + sweep, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Centre mark (12 o'clock = neutral)
  const midA = startA + 0.5 * sweep;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(midA) * (r - 3), cy + Math.sin(midA) * (r - 3), 1.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, startA, angle, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Indicator line
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(angle) * 4, cy + Math.sin(angle) * 4);
  ctx.lineTo(cx + Math.cos(angle) * (r - 9), cy + Math.sin(angle) * (r - 9));
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/**
 * Wire a knob canvas to a hidden range input + an editable display input.
 *
 * displayFn(v)  — converts internal range value → display number (e.g. v*100)
 * internalFn(d) — converts display number → internal range value (e.g. d/100)
 * Defaults to identity (display = internal value).
 *
 * Display input behaviour:
 *   - Click to focus and type a value
 *   - Enter or focusout → apply
 *   - Escape → cancel (restore previous value)
 */
function setupKnob(canvas, rangeInput, displayInput, onChange, displayFn, internalFn, color = '#f59e0b') {
  displayFn   = displayFn   || (v => Math.round(v * 100));
  internalFn  = internalFn  || (d => d / 100);

  let dragging = false, startY = 0, startVal = 0;
  let editSnapshot = null; // saved before editing starts

  const clamp = v => Math.max(parseFloat(rangeInput.min), Math.min(parseFloat(rangeInput.max), v));

  const apply = (internalVal) => {
    const v = clamp(internalVal);
    rangeInput.value        = v;
    displayInput.value      = displayFn(v);
    drawKnob(canvas, v, parseFloat(rangeInput.min), parseFloat(rangeInput.max), color);
    onChange(v);
  };

  // Initial draw
  apply(parseFloat(rangeInput.value));

  // ── Drag ──────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    dragging = true;
    startY   = e.clientY;
    startVal = parseFloat(rangeInput.value);
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const span  = parseFloat(rangeInput.max) - parseFloat(rangeInput.min);
    const delta = -((e.clientY - startY) / 150) * span;
    apply(startVal + delta);
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // ── Double-click reset ────────────────────────────────────────
  const defaultVal = parseFloat(rangeInput.defaultValue ?? rangeInput.value);
  canvas.addEventListener('dblclick', () => apply(defaultVal));

  // ── Editable display input ────────────────────────────────────
  displayInput.addEventListener('focus', () => {
    editSnapshot = parseFloat(rangeInput.value);
    displayInput.select();
  });

  const commit = () => {
    const raw = displayInput.value;
    if (raw === '-∞' || raw === '-Infinity') { apply(parseFloat(rangeInput.min)); editSnapshot = null; return; }
    const displayVal  = parseFloat(raw);
    if (isNaN(displayVal)) { cancel(); return; }
    apply(clamp(internalFn(displayVal)));
    editSnapshot = null;
  };

  const cancel = () => {
    if (editSnapshot !== null) {
      apply(editSnapshot);
      editSnapshot = null;
    }
    displayInput.blur();
  };

  // Arrow keys on number inputs: apply immediately only when triggered by arrows
  let _arrowActive = false;
  displayInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _arrowActive = true;
    if (e.key === 'Enter')  { commit(); displayInput.blur(); }
    if (e.key === 'Escape') { cancel(); }
  });
  displayInput.addEventListener('input', () => {
    if (!_arrowActive) return;
    _arrowActive = false;
    const raw = displayInput.value;
    if (raw === '-∞' || raw === '-Infinity') return;
    const displayVal = parseFloat(raw);
    if (!isNaN(displayVal)) apply(clamp(internalFn(displayVal)));
  });

  displayInput.addEventListener('blur', () => {
    if (editSnapshot !== null) commit();
  });
}

// ── Prevent browser from navigating when a file is dropped outside a drop zone
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop',     e => e.preventDefault());

// ── Theme toggle ──────────────────────────────────────────────
const themeBtn = document.getElementById('btnTheme');
const applyTheme = (light) => {
  document.documentElement.dataset.theme = light ? 'light' : '';
  themeBtn.textContent = light ? '🌙' : '☀';
  try { localStorage.setItem('mixxs-theme', light ? 'light' : 'dark'); } catch(_) {}
};
// Restore saved preference
try {
  applyTheme(localStorage.getItem('mixxs-theme') === 'light');
} catch(_) { applyTheme(false); }

themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme !== 'light');
});

// ── file:// warning ───────────────────────────────────────────
if (window.location.protocol === 'file:') {
  document.getElementById('fileProtocolWarning').style.display = 'block';
}

// ── Bootstrap ─────────────────────────────────────────────────
const mixer = new MixerController();

// ── File loading ──────────────────────────────────────────────
[1, 2].forEach(n => {
  document.getElementById(`btnLoad${n}`).addEventListener('click', () => {
    document.getElementById(`file${n}`).click();
  });
  document.getElementById(`file${n}`).addEventListener('change', e => {
    if (e.target.files[0]) mixer.loadFile(n, e.target.files[0]);
    e.target.value = '';
  });

  // All droppable surfaces for this deck
  const dropTargets = [
    document.getElementById(`waveWrap${n}`),
    document.getElementById(`waveformRow${n}`),
    document.getElementById(`deckPanel${n}`),
  ];

  dropTargets.forEach(el => {
    el.addEventListener('dragover', e => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', e => {
      // Only clear if leaving the element itself (not a child)
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) mixer.loadFile(n, file);
    });
  });
});

// ── Transport ─────────────────────────────────────────────────
document.getElementById('play1').addEventListener('click', () => mixer.togglePlay(1));
document.getElementById('play2').addEventListener('click', () => mixer.togglePlay(2));
document.getElementById('stop1').addEventListener('click', () => mixer.stopDeck(1));
document.getElementById('stop2').addEventListener('click', () => mixer.stopDeck(2));

// ── CUE ───────────────────────────────────────────────────────
document.getElementById('cue1').addEventListener('click', () => mixer.toggleCue(1));
document.getElementById('cue2').addEventListener('click', () => mixer.toggleCue(2));

// ── Waveform seek + zoom ──────────────────────────────────────
document.getElementById('waveform1').addEventListener('click', e => mixer.seekOnCanvas(1, e));
document.getElementById('waveform2').addEventListener('click', e => mixer.seekOnCanvas(2, e));

document.getElementById('waveform1').addEventListener('wheel', e => {
  mixer.waveform1?.onWheel(e, mixer.deck1?.isPlaying ?? false);
  mixer.syncZoom(1);
}, { passive: false });
document.getElementById('waveform2').addEventListener('wheel', e => {
  mixer.waveform2?.onWheel(e, mixer.deck2?.isPlaying ?? false);
  mixer.syncZoom(2);
}, { passive: false });

// ── dB utilities ──────────────────────────────────────────────
const linearToDb = v => v <= 0 ? '-∞' : (20 * Math.log10(v)).toFixed(1);
const dbToLinear = db => {
  const v = Math.pow(10, parseFloat(db) / 20);
  return Math.max(0, Math.min(1, v));
};

// ── EQ knobs ──────────────────────────────────────────────────
// Gain in dB: -12 to +12, display as dB value, double-click resets to 0
[1, 2].forEach(n => {
  [
    { id: `eqHiKnob${n}`,  range: `eqHi${n}`,  val: `eqHiVal${n}`,  band: 'high' },
    { id: `eqMidKnob${n}`, range: `eqMid${n}`, val: `eqMidVal${n}`, band: 'mid'  },
    { id: `eqLowKnob${n}`, range: `eqLow${n}`, val: `eqLowVal${n}`, band: 'low'  },
  ].forEach(({ id, range, val, band }) => {
    setupKnob(
      document.getElementById(id),
      document.getElementById(range),
      document.getElementById(val),
      v => mixer[`channel${n}`]?.setEq(band, v),
      v => v.toFixed(1),   // display in dB with 1 decimal
      d => parseFloat(d)   // input is already in dB
    );
  });
});
// ── Filter effect knobs ───────────────────────────────────────
const FILTER_COLOR = '#2dd4bf';
[1, 2].forEach(n => {
  setupKnob(
    document.getElementById(`filterKnob${n}`),
    document.getElementById(`filter${n}`),
    document.getElementById(`filterVal${n}`),
    v => mixer[`channel${n}`]?.setFilter(v),
    v => v.toFixed(2),
    d => Math.max(-1, Math.min(1, parseFloat(d))),
    FILTER_COLOR
  );
});

// Volume: internal 0..1, display in dB
setupKnob(
  document.getElementById('volKnob1'),
  document.getElementById('vol1'),
  document.getElementById('volVal1'),
  v => mixer.channel1?.setVolume(v),
  v => linearToDb(v),
  d => dbToLinear(d)
);
setupKnob(
  document.getElementById('volKnob2'),
  document.getElementById('vol2'),
  document.getElementById('volVal2'),
  v => mixer.channel2?.setVolume(v),
  v => linearToDb(v),
  d => dbToLinear(d)
);

// ── Speed sliders + current BPM ───────────────────────────────
[1, 2].forEach(n => {
  const spdSlider    = document.getElementById(`speed${n}`);
  const spdInput     = document.getElementById(`speedVal${n}`);
  const currentBpmEl = document.getElementById(`currentBpm${n}`);

  const applySpeed = (v) => {
    v = Math.max(0.5, Math.min(2, v));
    spdSlider.value = v;
    spdInput.value  = v.toFixed(3);
    mixer[`deck${n}`]?.setPlaybackRate(v);
    // Update current BPM display
    const detectedBpm = mixer[`deck${n}`]?.bpm;
    if (detectedBpm && currentBpmEl) {
      currentBpmEl.value = (detectedBpm * v).toFixed(1);
    }
  };

  spdSlider.addEventListener('input', () => applySpeed(parseFloat(spdSlider.value)));

  let _spdArrow = false;
  spdInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _spdArrow = true;
    if (e.key === 'Enter')  { spdInput.blur(); }
    if (e.key === 'Escape') { spdInput.value = parseFloat(spdSlider.value).toFixed(3); spdInput.blur(); }
  });
  spdInput.addEventListener('input', () => {
    if (!_spdArrow) return;
    _spdArrow = false;
    applySpeed(parseFloat(spdInput.value) || 1);
  });
  spdInput.addEventListener('blur', () => { applySpeed(parseFloat(spdInput.value) || 1); });

  let _bpmArrow = false;
  currentBpmEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _bpmArrow = true;
  });
  currentBpmEl.addEventListener('input', () => {
    if (!_bpmArrow) return;
    _bpmArrow = false;
    const typed = parseFloat(currentBpmEl.value);
    const detectedBpm = mixer[`deck${n}`]?.bpm;
    if (!isNaN(typed) && detectedBpm) applySpeed(typed / detectedBpm);
  });
  currentBpmEl.addEventListener('blur', () => {
    const typed = parseFloat(currentBpmEl.value);
    const detectedBpm = mixer[`deck${n}`]?.bpm;
    if (!isNaN(typed) && detectedBpm) {
      applySpeed(typed / detectedBpm);
    } else {
      const d = mixer[`deck${n}`]?.bpm;
      if (d) currentBpmEl.value = (d * parseFloat(spdSlider.value)).toFixed(1);
    }
  });
  currentBpmEl.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { currentBpmEl.blur(); }
    if (e.key === 'Escape') {
      const d = mixer[`deck${n}`]?.bpm;
      if (d) currentBpmEl.value = (d * parseFloat(spdSlider.value)).toFixed(1);
      currentBpmEl.blur();
    }
  });
});

// ── Pitch bend (momentary ±4%, Mixxx default) ─────────────────
const BEND_FACTOR = 0.04; // 4%

function wireBend(btnId, deckNum, direction) {
  const btn = document.getElementById(btnId);
  let savedRate = null;

  const start = () => {
    const deck = mixer[`deck${deckNum}`];
    if (!deck) return;
    savedRate = deck.playbackRate;
    // Snapshot position before changing rate so getCurrentTime()
    // stays accurate (it uses startOffset + elapsed * playbackRate)
    if (deck.isPlaying) {
      deck.startOffset  = deck.getCurrentTime();
      deck.startCtxTime = deck.ctx.currentTime;
    }
    const bent = Math.max(0.5, Math.min(2, savedRate * (1 + direction * BEND_FACTOR)));
    deck.setPlaybackRate(bent);
    btn.classList.add('active');
  };

  const stop = () => {
    const deck = mixer[`deck${deckNum}`];
    if (!deck || savedRate === null) return;
    // Snapshot again before restoring rate
    if (deck.isPlaying) {
      deck.startOffset  = deck.getCurrentTime();
      deck.startCtxTime = deck.ctx.currentTime;
    }
    deck.setPlaybackRate(savedRate);
    savedRate = null;
    btn.classList.remove('active');
  };

  btn.addEventListener('mousedown',  start);
  btn.addEventListener('mouseup',    stop);
  btn.addEventListener('mouseleave', stop);
}

wireBend('bendDown1', 1, -1);
wireBend('bendUp1',   1, +1);
wireBend('bendDown2', 2, -1);
wireBend('bendUp2',   2, +1);
document.getElementById('nudgeBack1').addEventListener('click', () => mixer.deck1?.nudge(-1));
document.getElementById('nudgeFwd1').addEventListener('click',  () => mixer.deck1?.nudge(+1));
document.getElementById('nudgeBack2').addEventListener('click', () => mixer.deck2?.nudge(-1));
document.getElementById('nudgeFwd2').addEventListener('click',  () => mixer.deck2?.nudge(+1));

// ── BPM sync ──────────────────────────────────────────────────
document.getElementById('syncFrom1').addEventListener('click', () => { mixer._init(); mixer.sync(1); });
document.getElementById('syncFrom2').addEventListener('click', () => { mixer._init(); mixer.sync(2); });

// ── Crossfader ────────────────────────────────────────────────
document.getElementById('crossfader').addEventListener('input', e => {
  mixer.crossfader?.setValue(parseFloat(e.target.value));
});

// ── Master volume knob ────────────────────────────────────────
setupKnob(
  document.getElementById('masterKnob'),
  document.getElementById('masterVol'),
  document.getElementById('masterVolVal'),
  v => { if (mixer.audioEngine.masterGain) mixer.audioEngine.masterGain.gain.value = v; },
  v => linearToDb(v),
  d => dbToLinear(d)
);

// ── Cue level knob ────────────────────────────────────────────
setupKnob(
  document.getElementById('cueKnob'),
  document.getElementById('cueVol'),
  document.getElementById('cueVolVal'),
  v => mixer.cueBus?.setVolume(v),
  v => linearToDb(v),
  d => dbToLinear(d)
);

// ── Loop ──────────────────────────────────────────────────────
const LOOP_STEPS = [1, 2, 4, 8, 16, 32, 64];

[1, 2].forEach(n => {
  const beatsInput = document.getElementById(`loopBeats${n}`);
  const loopBtn    = document.getElementById(`loop${n}`);

  // Power-of-2 stepping with arrow keys
  beatsInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(beatsInput.value) || 4;
      const idx = LOOP_STEPS.indexOf(cur);
      if (e.key === 'ArrowUp'   && idx < LOOP_STEPS.length - 1)
        beatsInput.value = LOOP_STEPS[idx + 1];
      if (e.key === 'ArrowDown' && idx > 0)
        beatsInput.value = LOOP_STEPS[idx - 1];
      if (e.key === 'ArrowUp'   && idx === -1)
        beatsInput.value = LOOP_STEPS[0];
      // If loop is active, restart with new beat count
      const deck = mixer[`deck${n}`];
      if (deck?.loop) {
        deck.loopBeats = parseInt(beatsInput.value);
      }
    }
  });

  loopBtn.addEventListener('click', () => {
    const beats = parseInt(beatsInput.value) || 4;
    mixer.toggleLoop(n, beats);
  });

  // Loop nudge: shift loopIn ±1 beat (loopOut follows)
  const nudgeLoop = (dir) => {
    const deck = mixer[`deck${n}`];
    if (!deck?.loop) return;
    const beatDur = deck.beatGrid ? 60 / deck.beatGrid.bpm : 60 / deck.bpm;
    deck.loopIn = Math.max(0, Math.min(deck.buffer.duration, deck.loopIn + dir * beatDur));
  };
  document.getElementById(`loopNudgeBack${n}`).addEventListener('click', () => nudgeLoop(-1));
  document.getElementById(`loopNudgeFwd${n}`).addEventListener('click',  () => nudgeLoop(+1));
});
document.getElementById('btnExport').addEventListener('click', () => mixer.exportMix());

// ── Click track ───────────────────────────────────────────────
document.getElementById('btnClick').addEventListener('click', e => {
  mixer._init();
  mixer.toggleClick(e.currentTarget);
});

setupKnob(
  document.getElementById('clickKnob'),
  document.getElementById('clickVol'),
  document.getElementById('clickVolVal'),
  v => mixer.clicktrack?.setVolume(v),
  v => linearToDb(v),
  d => dbToLinear(d)
);

// ── Settings modal ────────────────────────────────────────────
const modal = document.getElementById('modalOverlay');
document.getElementById('btnSettings').addEventListener('click', async () => {
  mixer._init();
  const outputs = await mixer.audioEngine.enumerateOutputs();
  ['masterDevice', 'cueDevice'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">Default Output</option>';
    outputs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Output ${d.deviceId.slice(0, 8)}`;
      sel.appendChild(opt);
    });
  });
  modal.classList.add('open');
});
document.getElementById('btnModalClose').addEventListener('click', () => modal.classList.remove('open'));
document.getElementById('btnModalApply').addEventListener('click', async () => {
  const masterId = document.getElementById('masterDevice').value;
  const cueId    = document.getElementById('cueDevice').value;
  await mixer.audioEngine.setMasterDevice(masterId);
  await mixer.audioEngine.setCueDevice(cueId);
  document.getElementById('statusMaster').textContent =
    document.querySelector(`#masterDevice option[value="${masterId}"]`)
      ?.textContent?.split('(')[0].trim() || 'DEFAULT';
  document.getElementById('statusCue').textContent =
    document.querySelector(`#cueDevice option[value="${cueId}"]`)
      ?.textContent?.split('(')[0].trim() || 'DEFAULT';
  modal.classList.remove('open');
});
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
