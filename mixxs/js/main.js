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
function drawKnob(canvas, value, min, max) {
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
  ctx.strokeStyle = '#f59e0b';
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
function setupKnob(canvas, rangeInput, displayInput, onChange, displayFn, internalFn) {
  displayFn   = displayFn   || (v => Math.round(v * 100));
  internalFn  = internalFn  || (d => d / 100);

  let dragging = false, startY = 0, startVal = 0;
  let editSnapshot = null; // saved before editing starts

  const clamp = v => Math.max(parseFloat(rangeInput.min), Math.min(parseFloat(rangeInput.max), v));

  const apply = (internalVal) => {
    const v = clamp(internalVal);
    rangeInput.value        = v;
    displayInput.value      = displayFn(v);
    drawKnob(canvas, v, parseFloat(rangeInput.min), parseFloat(rangeInput.max));
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
    editSnapshot = parseFloat(rangeInput.value); // save for Escape
    displayInput.select();
  });

  const commit = () => {
    const displayVal  = parseFloat(displayInput.value);
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

  displayInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { commit(); displayInput.blur(); }
    if (e.key === 'Escape') { cancel(); }
  });

  displayInput.addEventListener('blur', () => {
    if (editSnapshot !== null) commit();
  });
}

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
}, { passive: false });
document.getElementById('waveform2').addEventListener('wheel', e => {
  mixer.waveform2?.onWheel(e, mixer.deck2?.isPlaying ?? false);
}, { passive: false });

// ── Pan knobs ─────────────────────────────────────────────────
// Pan: internal -1..1, display -100..100
setupKnob(
  document.getElementById('panKnob1'),
  document.getElementById('pan1'),
  document.getElementById('panVal1'),
  v => mixer.channel1?.setPan(v),
  v => Math.round(v * 100),
  d => d / 100
);
setupKnob(
  document.getElementById('panKnob2'),
  document.getElementById('pan2'),
  document.getElementById('panVal2'),
  v => mixer.channel2?.setPan(v),
  v => Math.round(v * 100),
  d => d / 100
);

// ── Volume knobs ──────────────────────────────────────────────
// Volume: internal 0..1, display 0..100
setupKnob(
  document.getElementById('volKnob1'),
  document.getElementById('vol1'),
  document.getElementById('volVal1'),
  v => mixer.channel1?.setVolume(v),
  v => Math.round(v * 100),
  d => d / 100
);
setupKnob(
  document.getElementById('volKnob2'),
  document.getElementById('vol2'),
  document.getElementById('volVal2'),
  v => mixer.channel2?.setVolume(v),
  v => Math.round(v * 100),
  d => d / 100
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
      currentBpmEl.value = (detectedBpm * v).toFixed(2);
    }
  };

  spdSlider.addEventListener('input', () => applySpeed(parseFloat(spdSlider.value)));

  spdInput.addEventListener('blur', () => {
    applySpeed(parseFloat(spdInput.value) || 1);
  });
  spdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { spdInput.blur(); }
    if (e.key === 'Escape') { spdInput.value = parseFloat(spdSlider.value).toFixed(3); spdInput.blur(); }
  });

  // Current BPM input: editing sets speed = typed / detectedBpm
  currentBpmEl.addEventListener('blur', () => {
    const typed       = parseFloat(currentBpmEl.value);
    const detectedBpm = mixer[`deck${n}`]?.bpm;
    if (!isNaN(typed) && detectedBpm) {
      applySpeed(typed / detectedBpm);
    } else {
      // Restore
      const detectedBpm2 = mixer[`deck${n}`]?.bpm;
      if (detectedBpm2) currentBpmEl.value = (detectedBpm2 * parseFloat(spdSlider.value)).toFixed(2);
    }
  });
  currentBpmEl.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { currentBpmEl.blur(); }
    if (e.key === 'Escape') {
      const detectedBpm = mixer[`deck${n}`]?.bpm;
      if (detectedBpm) currentBpmEl.value = (detectedBpm * parseFloat(spdSlider.value)).toFixed(2);
      currentBpmEl.blur();
    }
  });
});

// ── Nudge ─────────────────────────────────────────────────────
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
  v => Math.round(v * 100),
  d => d / 100
);

// ── Export ────────────────────────────────────────────────────
document.getElementById('btnExport').addEventListener('click', () => mixer.exportMix());

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
