// ═══════════════════════════════════════════════════════════════
//  DeckUI  —  per-deck DOM wiring + mixxs:* event listeners
//
//  Each deck has two sets of controls:
//    Desktop: #play1, #nudgeBack1, etc.
//    Mobile:  #mPlay1, #mNudgeBack1, etc. (portrait only, CSS-toggled)
//
//  Both sets share the same audio actions. State events (play,
//  loop, cue) are reflected into both sets simultaneously.
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

  // ── Helpers ───────────────────────────────────────────────────

  get deck() { return this.mixer[`deck${this.n}`]; }

  /** Desktop element: _el('play') → #play1 */
  _el(id)  { return document.getElementById(`${id}${this.n}`); }

  /** Mobile element: _mel('play') → #mPlay1 */
  _mel(id) { return document.getElementById(`m${id.charAt(0).toUpperCase()}${id.slice(1)}${this.n}`); }

  /** Wire a click on both desktop and mobile elements */
  _on(id, fn) {
    this._el(id)?.addEventListener('click',  fn);
    this._mel(id)?.addEventListener('click', fn);
  }

  // ── File loading + drag-drop ──────────────────────────────────

  _wireFileLoad() {
    const { n, mixer } = this;

    this._el('btnLoad').addEventListener('click', () => this._el('file').click());
    this._el('file').addEventListener('change', e => {
      if (e.target.files[0]) mixer.loadFile(n, e.target.files[0]);
      e.target.value = '';
    });

    // Click on waveform opens file picker when no track is loaded
    document.getElementById(`waveWrap${n}`)
      .addEventListener('click', () => {
        if (!this.deck?.buffer) this._el('file').click();
      });

    [
      document.getElementById(`waveWrap${n}`),
      document.getElementById(`waveformRow${n}`),
      document.getElementById(`deckPanel${n}`),
    ].filter(Boolean).forEach(target => {
      target.addEventListener('dragover',  e => { e.preventDefault(); target.classList.add('drag-over'); });
      target.addEventListener('dragleave', e => { if (!target.contains(e.relatedTarget)) target.classList.remove('drag-over'); });
      target.addEventListener('drop', e => {
        e.preventDefault();
        target.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) mixer.loadFile(n, file);
      });
    });
  }

  // ── Transport ─────────────────────────────────────────────────

  _wireTransport() {
    const { n, mixer } = this;
    this._on('play',      () => mixer.togglePlay(n));
    this._on('nudgeBack', () => this.deck?.nudge(-1));
    this._on('nudgeFwd',  () => this.deck?.nudge(+1));
    this._on('syncFrom',  () => { mixer._init(); mixer.sync(n); });
  }

  // ── Pitch bend (hold to bend) ─────────────────────────────────

  _wireBend() {
    const { bendFactor, speed } = MIXXS.deck;

    [{ desktop: `bendDown${this.n}`, mobile: `mBendDown${this.n}`, dir: -1 },
     { desktop: `bendUp${this.n}`,   mobile: `mBendUp${this.n}`,   dir: +1 }]
      .forEach(({ desktop, mobile, dir }) => {
        [desktop, mobile].forEach(id => {
          const btn = document.getElementById(id);
          if (!btn) return;
          let savedRate = null;

          const onPress = () => {
            const deck = this.deck; if (!deck) return;
            savedRate = deck.playbackRate;
            if (deck.isPlaying) {
              deck.startOffset  = deck.getCurrentTime();
              deck.startCtxTime = deck.ctx.currentTime;
            }
            const bent = savedRate * (1 + dir * bendFactor);
            deck.setPlaybackRate(Math.max(speed.min, Math.min(speed.max, bent)));
            btn.classList.add('active');
          };
          const onRelease = () => {
            const deck = this.deck; if (!deck || savedRate === null) return;
            if (deck.isPlaying) {
              deck.startOffset  = deck.getCurrentTime();
              deck.startCtxTime = deck.ctx.currentTime;
            }
            deck.setPlaybackRate(savedRate);
            savedRate = null;
            btn.classList.remove('active');
          };
          pointerDrag(btn, onPress, () => {}, onRelease);
        });
      });
  }

  // ── Speed knob + BPM/speed inputs ────────────────────────────

  _wireSpeed() {
    const { n, mixer } = this;
    const { speed }    = MIXXS.deck;
    const spdRange     = this._el('speed');
    const spdInput     = this._el('speedVal');
    const bpmInput     = this._el('currentBpm');

    const applySpeed = (rate) => this._speedKnob?.setValue(rate);
    this.applySpeed  = applySpeed;

    initRange(spdRange, speed);

    // ── Desktop knob ────────────────────────────────────────────
    this._speedKnob = new Knob({
      canvas:     document.getElementById(`speedKnob${n}`),
      range:      spdRange,
      display:    spdInput,
      onChange:   rate => {
        mixer[`deck${n}`]?.setPlaybackRate(rate);
        const bpm = mixer[`deck${n}`]?.bpm;
        if (bpm) bpmInput.value = (bpm * rate).toFixed(1);
        this._syncMobileSpeedDisplay(rate);
      },
      displayFn:  rate => rate.toFixed(3),
      internalFn: d    => parseFloat(d),
    });

    // Desktop currentBpm input → back-calculates speed
    bpmInput.addEventListener('focus', () => bpmInput.select());
    let _arrowActive = false;
    bpmInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _arrowActive = true;
      if (e.key === 'Enter')  { this._applyBpmInput(); bpmInput.select(); }
      if (e.key === 'Escape') { this._syncBpmDisplay(); bpmInput.blur(); }
    });
    bpmInput.addEventListener('input', () => {
      if (!_arrowActive) return;
      _arrowActive = false;
      this._applyBpmInput();
    });
    bpmInput.addEventListener('blur', () => this._applyBpmInput());

    // Desktop speedVal input → direct rate
    spdInput.addEventListener('blur', () => {
      const v = parseFloat(spdInput.value);
      if (Number.isFinite(v)) applySpeed(v);
    });

    // ── Mobile knob ─────────────────────────────────────────────
    const mCanvas = document.getElementById(`mSpeedKnob${n}`);
    if (mCanvas) {
      const mDisplay = document.createElement('input');
      this._mSpeedKnob = new Knob({
        canvas:     mCanvas,
        range:      spdRange,
        display:    mDisplay,
        onChange:   rate => {
          mixer[`deck${n}`]?.setPlaybackRate(rate);
          this._syncAllSpeedDisplays(rate);
        },
        displayFn:  rate => rate.toFixed(3),
        internalFn: d    => parseFloat(d),
      });
    }

    // ── Mobile ±0.001 speed buttons ─────────────────────────────
    const STEP = 0.001;
    document.getElementById(`mSpeedDown${n}`)?.addEventListener('click', () => {
      const rate = Math.max(speed.min, (this.deck?.playbackRate ?? 1) - STEP);
      applySpeed(rate);
    });
    document.getElementById(`mSpeedUp${n}`)?.addEventListener('click', () => {
      const rate = Math.min(speed.max, (this.deck?.playbackRate ?? 1) + STEP);
      applySpeed(rate);
    });

    // ── Mobile currentBpm input ──────────────────────────────────
    const mBpmInput = document.getElementById(`mCurrentBpm${n}`);
    if (mBpmInput) {
      mBpmInput.addEventListener('focus', () => mBpmInput.select());
      mBpmInput.addEventListener('blur', () => {
        const typed = parseFloat(mBpmInput.value);
        const bpm   = mixer[`deck${n}`]?.bpm;
        if (!isNaN(typed) && bpm) applySpeed(typed / bpm);
        else this._syncAllSpeedDisplays(this.deck?.playbackRate ?? 1);
      });
    }

    // ── Mobile speedVal input ────────────────────────────────────
    const mSpdInput = document.getElementById(`mSpeedVal${n}`);
    if (mSpdInput) {
      mSpdInput.addEventListener('focus', () => mSpdInput.select());
      mSpdInput.addEventListener('blur', () => {
        const v = parseFloat(mSpdInput.value);
        if (Number.isFinite(v)) applySpeed(v);
      });
    }
  }

  _applyBpmInput() {
    const { n, mixer } = this;
    const typedBpm     = parseFloat(this._el('currentBpm').value);
    const detectedBpm  = mixer[`deck${n}`]?.bpm;
    if (!isNaN(typedBpm) && detectedBpm) this.applySpeed(typedBpm / detectedBpm);
    else this._syncBpmDisplay();
  }

  _syncBpmDisplay() {
    const { n, mixer } = this;
    const detectedBpm  = mixer[`deck${n}`]?.bpm;
    const rate         = parseFloat(this._el('speed').value);
    if (detectedBpm) this._el('currentBpm').value = (detectedBpm * rate).toFixed(1);
  }

  /** Update all mobile speed display inputs to match the current rate */
  _syncMobileSpeedDisplay(rate) {
    const { n, mixer }  = this;
    const mSpdInput     = document.getElementById(`mSpeedVal${n}`);
    const mBpmInput     = document.getElementById(`mCurrentBpm${n}`);
    const detectedBpm   = mixer[`deck${n}`]?.bpm;
    if (mSpdInput) mSpdInput.value = rate.toFixed(3);
    if (mBpmInput && detectedBpm) mBpmInput.value = (detectedBpm * rate).toFixed(1);
  }

  /** Sync all speed displays (desktop + mobile) to a given rate */
  _syncAllSpeedDisplays(rate) {
    const { n, mixer } = this;
    const bpm          = mixer[`deck${n}`]?.bpm;
    const spdInput     = this._el('speedVal');
    const bpmInput     = this._el('currentBpm');
    if (spdInput) spdInput.value = rate.toFixed(3);
    if (bpmInput && bpm) bpmInput.value = (bpm * rate).toFixed(1);
    this._syncMobileSpeedDisplay(rate);
  }

  // ── Loop ──────────────────────────────────────────────────────

  _wireLoop() {
    const { n, mixer }         = this;
    const { loopBeats: STEPS } = MIXXS.deck;

    const toggleLoop = () => {
      const beats = parseInt(this._el('loopBeats').value)
                 || parseInt(this._mel('loopBeats')?.value)
                 || STEPS[2];
      mixer.toggleLoop(n, beats);
    };
    this._el('loop')?.addEventListener('click',  toggleLoop);
    this._mel('loop')?.addEventListener('click', toggleLoop);

    const nudgeLoop = (dir) => {
      const deck = this.deck; if (!deck?.loop) return;
      const beatDur = 60 / (deck.beatGrid?.bpm ?? deck.bpm);
      deck.loopIn = Math.max(0, Math.min(deck.buffer.duration, deck.loopIn + dir * beatDur));
    };
    this._el('loopNudgeBack')?.addEventListener('click',  () => nudgeLoop(-1));
    this._el('loopNudgeFwd')?.addEventListener('click',   () => nudgeLoop(+1));
    this._mel('loopNudgeBack')?.addEventListener('click', () => nudgeLoop(-1));
    this._mel('loopNudgeFwd')?.addEventListener('click',  () => nudgeLoop(+1));

    [this._el('loopBeats'), this._mel('loopBeats')].forEach(input => {
      if (!input) return;
      input.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const cur = parseInt(input.value) || STEPS[2];
        const idx = STEPS.indexOf(cur);
        if (e.key === 'ArrowUp')
          input.value = STEPS[Math.min((idx === -1 ? 0 : idx) + 1, STEPS.length - 1)];
        else if (idx > 0)
          input.value = STEPS[idx - 1];
        if (this.deck?.loop) this.deck.loopBeats = parseInt(input.value);
      });
    });
  }

  // ── mixxs:* event listeners ───────────────────────────────────

  _listenEvents() {
    const { n } = this;

    const on = (type, fn) =>
      document.addEventListener(type, e => {
        if (e.detail.deckNum === n) fn(e.detail);
      });

    on('mixxs:playstate', ({ isPlaying }) => {
      const icon = isPlaying ? '⏸' : '▶';
      this._el('play').textContent  = icon;
      this._mel('play').textContent = icon;
      syncToggleBtn(`play${n}`,  isPlaying);
      syncToggleBtn(`mPlay${n}`, isPlaying);
    });

    on('mixxs:timeupdate', ({ current, duration }) => {
      const remaining = duration - current;
      const elEl = document.getElementById(`timeElapsed${n}`);
      const reEl = document.getElementById(`timeRemaining${n}`);
      const toEl = document.getElementById(`timeTotal${n}`);
      if (elEl) elEl.textContent = fmtElapsed(current);
      if (reEl) reEl.textContent = fmtTime(remaining);
      if (toEl) toEl.textContent = fmtTime(duration);
    });

    on('mixxs:bpmupdate', ({ bpm, currentBpm }) => {
      // Update desktop currentBpm input
      const curEl = this._el('currentBpm');
      if (curEl) curEl.value = currentBpm;
      // Update mobile displays
      this._syncMobileSpeedDisplay(parseFloat(this._el('speed').value));
    });

    on('mixxs:speedupdate', ({ rate }) => {
      this._speedKnob?.setValue(rate);
      this._mSpeedKnob?.setValue(rate);
      this._syncAllSpeedDisplays(rate);
    });

    on('mixxs:loopstate', ({ active }) => {
      syncToggleBtn(`loop${n}`,  active);
      syncToggleBtn(`mLoop${n}`, active);
    });

    on('mixxs:cuestate', ({ active }) => syncToggleBtn(`cue${n}`, active));

    on('mixxs:loadprogress', ({ label, active, onCancel }) => {
      const overlay   = document.getElementById(`loading${n}`);
      const labelEl   = overlay?.querySelector('span');
      const cancelBtn = document.getElementById(`cancelLoad${n}`);
      if (!overlay) return;
      overlay.classList.toggle('active', active);
      if (labelEl && label)      labelEl.textContent = label;
      if (cancelBtn && onCancel) cancelBtn.onclick   = onCancel;
    });

    on('mixxs:loadend', ({ filename }) => {
      ['waveEmpty', 'overviewEmpty'].forEach(id => {
        const el = document.getElementById(`${id}${n}`);
        if (el) el.style.display = 'none';
      });
      ['trackName', 'deckFilename'].forEach(id => {
        const el = document.getElementById(`${id}${n}`);
        if (el) el.textContent = filename;
      });
    });
  }
}
