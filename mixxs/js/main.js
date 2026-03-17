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

function panLabel(v) {
  if (Math.abs(v) < 0.02) return 'C';
  return v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`;
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

// ── Waveform seek ─────────────────────────────────────────────────

document.getElementById('waveform1').addEventListener('click', e => mixer.seekOnCanvas(1, e));
document.getElementById('waveform2').addEventListener('click', e => mixer.seekOnCanvas(2, e));

// ── Per-deck controls ─────────────────────────────────────────────

[1, 2].forEach(n => {
  document.getElementById(`vol${n}`).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    mixer[`channel${n}`]?.setVolume(v);
    document.getElementById(`volVal${n}`).textContent = Math.round(v * 100) + '%';
  });

  document.getElementById(`pan${n}`).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    mixer[`channel${n}`]?.setPan(v);
    document.getElementById(`panVal${n}`).textContent = panLabel(v);
  });

  document.getElementById(`speed${n}`).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    mixer[`deck${n}`]?.setPlaybackRate(v);
    document.getElementById(`speedVal${n}`).textContent = v.toFixed(2) + '×';
  });

  document.getElementById(`bpm${n}`).addEventListener('change', e => {
    if (mixer[`deck${n}`]) mixer[`deck${n}`].bpm = parseFloat(e.target.value);
  });
});

// ── BPM sync ──────────────────────────────────────────────────────

document.getElementById('syncFrom1').addEventListener('click', () => {
  mixer._init();
  mixer.deck1.bpm = parseFloat(document.getElementById('bpm1').value);
  mixer.deck2.bpm = parseFloat(document.getElementById('bpm2').value);
  mixer.syncBpm(1);
});

document.getElementById('syncFrom2').addEventListener('click', () => {
  mixer._init();
  mixer.deck1.bpm = parseFloat(document.getElementById('bpm1').value);
  mixer.deck2.bpm = parseFloat(document.getElementById('bpm2').value);
  mixer.syncBpm(2);
});

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
