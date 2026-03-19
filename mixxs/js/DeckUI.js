// ═══════════════════════════════════════════════════════════════
//  DeckUI  —  per-deck DOM wiring + event listener
//
//  Listens to mixxs:* CustomEvents from MixerController and
//  reflects state into the DOM. Also wires all user interactions.
// ═══════════════════════════════════════════════════════════════
class DeckUI {
  constructor(n, mixer) {
    this.n     = n;
    this.mixer = mixer;
    this._wireFileLoad();
    this._wireTransport();
    this._wireBend();
    this._wireSpeed();
    this._wireLoop();
    this._listenEvents();
  }

  // ── Shorthand helpers ─────────────────────────────────────────

  get deck() { return this.mixer[`deck${this.n}`]; }
  _el(id)    { return document.getElementById(`${id}${this.n}`); }

  // ── File loading + drag-drop ──────────────────────────────────

  _wireFileLoad() {
    const { n, mixer } = this;
    this._el('btnLoad').addEventListener('click', () => this._el('file').click());
    this._el('file').addEventListener('change', e => {
      if (e.target.files[0]) mixer.loadFile(n, e.target.files[0]);
      e.target.value = '';
    });

    const dropTargets = [
      document.getElementById(`waveWrap${n}`),
      document.getElementById(`waveformRow${n}`),
      document.getElementById(`deckPanel${n}`),
    ].filter(Boolean);

    dropTargets.forEach(el => {
      el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
      el.addEventListener('drop',      e => {
        e.preventDefault(); el.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) mixer.loadFile(n, file);
      });
    });
  }

  // ── Transport ─────────────────────────────────────────────────

  _wireTransport() {
    const { n, mixer } = this;
    this._el('play').addEventListener('click',     () => mixer.togglePlay(n));
    this._el('stop').addEventListener('click',     () => mixer.stopDeck(n));
    this._el('nudgeBack').addEventListener('click', () => this.deck?.nudge(-1));
    this._el('nudgeFwd').addEventListener('click',  () => this.deck?.nudge(+1));
    this._el('syncFrom').addEventListener('click',  () => { mixer._init(); mixer.sync(n); });
  }

  // ── Pitch bend (momentary ±4%) ────────────────────────────────

  _wireBend() {
    const BEND_FACTOR = 0.04;
    [{ id: `bendDown${this.n}`, dir: -1 }, { id: `bendUp${this.n}`, dir: +1 }]
      .forEach(({ id, dir }) => {
        const btn = document.getElementById(id);
        let savedRate = null;

        const start = () => {
          const deck = this.deck; if (!deck) return;
          savedRate = deck.playbackRate;
          if (deck.isPlaying) {
            deck.startOffset  = deck.getCurrentTime();
            deck.startCtxTime = deck.ctx.currentTime;
          }
          deck.setPlaybackRate(Math.max(0.5, Math.min(2, savedRate * (1 + dir * BEND_FACTOR))));
          btn.classList.add('active');
        };
        const stop = () => {
          const deck = this.deck; if (!deck || savedRate === null) return;
          if (deck.isPlaying) {
            deck.startOffset  = deck.getCurrentTime();
            deck.startCtxTime = deck.ctx.currentTime;
          }
          deck.setPlaybackRate(savedRate);
          savedRate = null;
          btn.classList.remove('active');
        };
        pointerDrag(btn, start, () => {}, stop);
        // Also stop on touchcancel (handled inside pointerDrag as onEnd)
      });
  }

  // ── Speed knob + current BPM inputs ──────────────────────────

  _wireSpeed() {
    const { n, mixer } = this;
    const spdRange      = this._el('speed');
    const spdInput      = this._el('speedVal');
    const currentBpmEl  = this._el('currentBpm');

    // Helper used by sync callbacks and currentBpm input
    const applySpeed = (v) => {
      v = Math.max(0.5, Math.min(2, v));
      this._speedKnob?.setValue(v); // redraws knob, updates display, calls onChange
    };
    this.applySpeed = applySpeed;

    // Speed knob — primary control, drives speedVal display
    this._speedKnob = new Knob({
      canvas:     document.getElementById(`speedKnob${n}`),
      range:      spdRange,
      display:    spdInput,
      onChange:   v => {
        mixer[`deck${n}`]?.setPlaybackRate(v);
        const bpm = mixer[`deck${n}`]?.bpm;
        if (bpm) currentBpmEl.value = (bpm * v).toFixed(1);
      },
      displayFn:  v => v.toFixed(3),
      internalFn: d => Math.max(0.5, Math.min(2, parseFloat(d))),
    });

    // currentBpm input — typing here back-calculates speed
    currentBpmEl.addEventListener('focus', () => currentBpmEl.select());
    let _bpmArrow = false;
    currentBpmEl.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _bpmArrow = true;
      if (e.key === 'Enter') {
        const typed = parseFloat(currentBpmEl.value);
        const bpm   = mixer[`deck${n}`]?.bpm;
        if (!isNaN(typed) && bpm) applySpeed(typed / bpm);
        currentBpmEl.select();
      }
      if (e.key === 'Escape') {
        const bpm = mixer[`deck${n}`]?.bpm;
        if (bpm) currentBpmEl.value = (bpm * parseFloat(spdRange.value)).toFixed(1);
        currentBpmEl.blur();
      }
    });
    currentBpmEl.addEventListener('input', () => {
      if (!_bpmArrow) return; _bpmArrow = false;
      const typed = parseFloat(currentBpmEl.value);
      const bpm   = mixer[`deck${n}`]?.bpm;
      if (!isNaN(typed) && bpm) applySpeed(typed / bpm);
    });
    currentBpmEl.addEventListener('blur', () => {
      const typed = parseFloat(currentBpmEl.value);
      const bpm   = mixer[`deck${n}`]?.bpm;
      if (!isNaN(typed) && bpm) applySpeed(typed / bpm);
      else if (bpm) currentBpmEl.value = (bpm * parseFloat(spdRange.value)).toFixed(1);
    });
  }

  // ── Loop ──────────────────────────────────────────────────────

  _wireLoop() {
    const { n, mixer }  = this;
    const LOOP_STEPS    = [1, 2, 4, 8, 16, 32, 64];
    const beatsInput    = this._el('loopBeats');
    const loopBtn       = this._el('loop');

    beatsInput.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const cur = parseInt(beatsInput.value) || 4;
      const idx = LOOP_STEPS.indexOf(cur);
      if (e.key === 'ArrowUp')
        beatsInput.value = idx === -1 ? LOOP_STEPS[0] : LOOP_STEPS[Math.min(idx + 1, LOOP_STEPS.length - 1)];
      else if (idx > 0)
        beatsInput.value = LOOP_STEPS[idx - 1];
      const deck = mixer[`deck${n}`];
      if (deck?.loop) deck.loopBeats = parseInt(beatsInput.value);
    });

    loopBtn.addEventListener('click', () => mixer.toggleLoop(n, parseInt(beatsInput.value) || 4));

    const nudgeLoop = (dir) => {
      const deck = mixer[`deck${n}`];
      if (!deck?.loop) return;
      const beatDur = deck.beatGrid ? 60 / deck.beatGrid.bpm : 60 / deck.bpm;
      deck.loopIn = Math.max(0, Math.min(deck.buffer.duration, deck.loopIn + dir * beatDur));
    };
    this._el('loopNudgeBack').addEventListener('click', () => nudgeLoop(-1));
    this._el('loopNudgeFwd').addEventListener('click',  () => nudgeLoop(+1));
  }

  // ── Event listeners (MixerController → DOM) ──────────────────

  _listenEvents() {
    const { n } = this;
    const on = (type, fn) => document.addEventListener(type, e => {
      if (e.detail.deckNum === n) fn(e.detail);
    });

    on('mixxs:playstate', ({ isPlaying }) => {
      const btn = this._el('play');
      btn.textContent = isPlaying ? '⏸' : '▶';
      syncToggleBtn(`play${n}`, isPlaying);
    });

    on('mixxs:timeupdate', ({ current, duration }) => {
      const el = this._el('time');
      if (el) el.textContent = `${fmtTime(current)} / ${fmtTime(duration)}`;
    });

    on('mixxs:bpmupdate', ({ bpm, currentBpm }) => {
      const bpmEl = this._el('bpm');
      const curEl = this._el('currentBpm');
      if (bpmEl) bpmEl.value = bpm;
      if (curEl) curEl.value = currentBpm;
    });

    on('mixxs:speedupdate', ({ rate }) => {
      this._speedKnob?.setValue(rate);
      const bpm = this.mixer[`deck${n}`]?.bpm;
      const cur = this._el('currentBpm');
      if (bpm && cur) cur.value = (bpm * rate).toFixed(1);
    });

    on('mixxs:loopstate', ({ active }) => syncToggleBtn(`loop${n}`, active));

    on('mixxs:cuestate', ({ active }) => syncToggleBtn(`cue${n}`, active));

    on('mixxs:loadprogress', ({ label, active, onCancel }) => {
      const loadingEl = document.getElementById(`loading${n}`);
      const labelEl   = loadingEl?.querySelector('span');
      const cancelBtn = document.getElementById(`cancelLoad${n}`);
      if (!loadingEl) return;
      loadingEl.classList.toggle('active', active);
      if (labelEl && label) labelEl.textContent = label;
      if (cancelBtn && onCancel) cancelBtn.onclick = onCancel;
    });

    on('mixxs:loadend', ({ filename }) => {
      const waveEmpty    = document.getElementById(`waveEmpty${n}`);
      const overviewEmpty = document.getElementById(`overviewEmpty${n}`);
      const trackName    = document.getElementById(`trackName${n}`);
      const deckFilename = document.getElementById(`deckFilename${n}`);
      if (waveEmpty)     waveEmpty.style.display    = 'none';
      if (overviewEmpty) overviewEmpty.style.display = 'none';
      if (trackName)     trackName.textContent      = filename;
      if (deckFilename)  deckFilename.textContent   = filename;
    });
  }
}

// ── Utility: sync a toggle button's active class ──────────────
function syncToggleBtn(id, active) {
  document.getElementById(id)?.classList.toggle('active', active);
}
