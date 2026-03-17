// ═══════════════════════════════════════════════════════════════
//  main.js  —  UI wiring entry point
//
//  All DOM event listeners live here.
//  Only touches the DOM and delegates everything to MixerController.
// ═══════════════════════════════════════════════════════════════

// ── Utilities ────────────────────────────────────────────────────

function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── file:// protocol warning ──────────────────────────────────
if (window.location.protocol === 'file:') {
  document.getElementById('fileProtocolWarning').style.display = 'block';
}

// ── Bootstrap ─────────────────────────────────────────────────────

const mixer = new MixerController();

// ── File loading ──────────────────────────────────────────────────

[1, 2].forEach(n => {
  document.getElementById(`btnLoad${n}`).addEventListener('click', () => {
    document.getElementById(`file${n}`).click();
  });

  document.getElementById(`file${n}`).addEventListener('change', e => {
    if (e.target.files[0]) mixer.loadFile(n, e.target.files[0]);
    e.target.value = ''; // allow reloading the same file
  });

  // Drag & drop onto waveform
  const wrap = document.getElementById(`waveWrap${n}`);
  wrap.addEventListener('dragover', e => {
    e.preventDefault();
    wrap.style.borderColor = 'var(--amber)';
  });
  wrap.addEventListener('dragleave', () => {
    wrap.style.borderColor = '';
  });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) mixer.loadFile(n, file);
  });
});

// ── Transport ─────────────────────────────────────────────────────

document.getElementById('play1').addEventListener('click', () => mixer.togglePlay(1));
document.getElementById('play2').addEventListener('click', () => mixer.togglePlay(2));
document.getElementById('stop1').addEventListener('click', () => mixer.stopDeck(1));
document.getElementById('stop2').addEventListener('click', () => mixer.stopDeck(2));

// ── CUE ───────────────────────────────────────────────────────────

document.getElementById('cue1').addEventListener('click', () => mixer.toggleCue(1));
document.getElementById('cue2').addEventListener('click', () => mixer.toggleCue(2));

// ── Waveform seek + zoom ──────────────────────────────────────────

document.getElementById('waveform1').addEventListener('click', e => mixer.seekOnCanvas(1, e));
document.getElementById('waveform2').addEventListener('click', e => mixer.seekOnCanvas(2, e));

// Wheel zoom — passive:false so we can preventDefault (stops page scroll)
document.getElementById('waveform1').addEventListener('wheel', e => {
  mixer.waveform1?.onWheel(e, mixer.deck1?.isPlaying ?? false);
}, { passive: false });
document.getElementById('waveform2').addEventListener('wheel', e => {
  mixer.waveform2?.onWheel(e, mixer.deck2?.isPlaying ?? false);
}, { passive: false });

// ── Per-deck controls (bidirectional slider ↔ number input) ──────

[1, 2].forEach(n => {
  const volSlider  = document.getElementById(`vol${n}`);
  const volInput   = document.getElementById(`volVal${n}`);
  const panSlider  = document.getElementById(`pan${n}`);
  const panInput   = document.getElementById(`panVal${n}`);
  const spdSlider  = document.getElementById(`speed${n}`);
  const spdInput   = document.getElementById(`speedVal${n}`);

  // ── Volume ──
  volSlider.addEventListener('input', () => {
    const v = parseFloat(volSlider.value);
    mixer[`channel${n}`]?.setVolume(v);
    volInput.value = Math.round(v * 100);
  });
  volInput.addEventListener('blur', () => {
    const pct = Math.max(0, Math.min(100, parseFloat(volInput.value) || 0));
    const v   = pct / 100;
    volInput.value   = pct;
    volSlider.value  = v;
    mixer[`channel${n}`]?.setVolume(v);
  });

  // ── Pan ──
  panSlider.addEventListener('input', () => {
    const v = parseFloat(panSlider.value);
    mixer[`channel${n}`]?.setPan(v);
    panInput.value = Math.round(v * 100);
  });
  panInput.addEventListener('blur', () => {
    const pct = Math.max(-100, Math.min(100, parseFloat(panInput.value) || 0));
    const v   = pct / 100;
    panInput.value  = pct;
    panSlider.value = v;
    mixer[`channel${n}`]?.setPan(v);
  });

  // ── Speed ──
  spdSlider.addEventListener('input', () => {
    const v = parseFloat(spdSlider.value);
    mixer[`deck${n}`]?.setPlaybackRate(v);
    spdInput.value = v.toFixed(3);
  });
  spdInput.addEventListener('blur', () => {
    const v = Math.max(0.5, Math.min(2, parseFloat(spdInput.value) || 1));
    spdInput.value  = v.toFixed(3);
    spdSlider.value = v;
    mixer[`deck${n}`]?.setPlaybackRate(v);
  });

  // Enter key triggers blur (applies value without clicking away)
  [volInput, panInput, spdInput].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  });
});

// ── BPM sync (full: tempo + phase) ───────────────────────────────

document.getElementById('syncFrom1').addEventListener('click', () => {
  mixer._init();
  mixer.sync(1);
});

document.getElementById('syncFrom2').addEventListener('click', () => {
  mixer._init();
  mixer.sync(2);
});

// ── Nudge buttons ─────────────────────────────────────────────────

document.getElementById('nudgeBack1').addEventListener('click',  () => mixer.deck1?.nudge(-1));
document.getElementById('nudgeFwd1').addEventListener('click',   () => mixer.deck1?.nudge(+1));
document.getElementById('nudgeBack2').addEventListener('click',  () => mixer.deck2?.nudge(-1));
document.getElementById('nudgeFwd2').addEventListener('click',   () => mixer.deck2?.nudge(+1));

// ── Crossfader ────────────────────────────────────────────────────

document.getElementById('crossfader').addEventListener('input', e => {
  mixer.crossfader?.setValue(parseFloat(e.target.value));
});

// ── Master volume ─────────────────────────────────────────────────

document.getElementById('masterVol').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (mixer.audioEngine.masterGain) mixer.audioEngine.masterGain.gain.value = v;
  document.getElementById('masterVolVal').textContent = Math.round(v * 100) + '%';
});

// ── Export ────────────────────────────────────────────────────────

document.getElementById('btnExport').addEventListener('click', () => mixer.exportMix());

// ── Settings modal ────────────────────────────────────────────────

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

document.getElementById('btnModalClose').addEventListener('click', () => {
  modal.classList.remove('open');
});

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

// Close modal on backdrop click
modal.addEventListener('click', e => {
  if (e.target === modal) modal.classList.remove('open');
});
