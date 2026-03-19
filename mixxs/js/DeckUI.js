// ═══════════════════════════════════════════════════════════════
//  DeckUI  —  per-deck DOM wiring + mixxs:* event listeners
//
//  Wires all user interactions for one deck and reflects
//  MixerController state changes back into the DOM.
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

  /** Deck audio object from MixerController */
  get deck() { return this.mixer[`deck${this.n}`]; }

  /** Get a deck-scoped DOM element by un-suffixed id, e.g. _el('play') → #play1 */
  _el(id) { return document.getElementById(`${id}${this.n}`); }

  // ── File loading + drag-drop ──────────────────────────────────

  _wireFileLoad() {
    const { n, mixer } = this;

    this._el('btnLoad').addEventListener('click', () => this._el('file').click());
    this._el('file').addEventListener('change', e => {
      if (e.target.files[0]) mixer.loadFile(n, e.target.files[0]);
      e.target.value = ''; // allow re-selecting the same file
    });

    // Accept drops on the deck panel, waveform area, or waveform row
    const dropTargets = [
      document.getElementById(`waveWrap${n}`),
      document.getElementById(`waveformRow${n}`),
      document.getElementById(`deckPanel${n}`),
    ].filter(Boolean);

    dropTargets.forEach(target => {
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
    this._el('play').addEventListener('click',      () => mixer.togglePlay(n));
    this._el('nudgeBack').addEventListener('click', () => this.deck?.nudge(-1));
    this._el('nudgeFwd').addEventListener('click',  () => this.deck?.nudge(+1));
    this._el('syncFrom').addEventListener('click',  () => { mixer._init(); mixer.sync(n); });
  }

  // ── Pitch bend (momentary rate shift, hold to bend) ───────────

  _wireBend() {
    const { bendFactor } = MIXXS.deck;
    const { speed }      = MIXXS.deck;

    [{ id: `bendDown${this.n}`, dir: -1 },
     { id: `bendUp${this.n}`,   dir: +1 }]
      .forEach(({ id, dir }) => {
        const btn = document.getElementById(id);
        let savedRate = null;

        const onPress = () => {
          const deck = this.deck; if (!deck) return;
          savedRate = deck.playbackRate;
          // Re-anchor position so the seek doesn't jump when rate changes
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
  }

  // ── Speed knob + BPM display ──────────────────────────────────

  _wireSpeed() {
    const { n, mixer } = this;
    const { speed }    = MIXXS.deck;
    const spdRange     = this._el('speed');
    const spdInput     = this._el('speedVal');
    const bpmInput     = this._el('currentBpm');

    // applySpeed is also called by the sync event listener below
    const applySpeed = (rate) => this._speedKnob?.setValue(rate);
    this.applySpeed  = applySpeed;

    initRange(spdRange, speed);

    this._speedKnob = new Knob({
      canvas:     document.getElementById(`speedKnob${n}`),
      range:      spdRange,
      display:    spdInput,
      onChange:   rate => {
        mixer[`deck${n}`]?.setPlaybackRate(rate);
        const detectedBpm = mixer[`deck${n}`]?.bpm;
        if (detectedBpm) bpmInput.value = (detectedBpm * rate).toFixed(1);
      },
      displayFn:  rate => rate.toFixed(3),
      internalFn: d    => parseFloat(d), // range min/max handles clamping
    });

    // Typing in the BPM field back-calculates the required speed
    bpmInput.addEventListener('focus', () => bpmInput.select());

    let _arrowActive = false;
    bpmInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') _arrowActive = true;
      if (e.key === 'Enter') {
        this._applyBpmInput();
        bpmInput.select();
      }
      if (e.key === 'Escape') {
        this._syncBpmDisplay();
        bpmInput.blur();
      }
    });
    bpmInput.addEventListener('input', () => {
      if (!_arrowActive) return;
      _arrowActive = false;
      this._applyBpmInput();
    });
    bpmInput.addEventListener('blur', () => this._applyBpmInput());
  }

  /** Convert the typed BPM value to a playback rate and apply it */
  _applyBpmInput() {
    const { n, mixer } = this;
    const typedBpm     = parseFloat(this._el('currentBpm').value);
    const detectedBpm  = mixer[`deck${n}`]?.bpm;
    if (!isNaN(typedBpm) && detectedBpm) {
      this.applySpeed(typedBpm / detectedBpm);
    } else {
      this._syncBpmDisplay();
    }
  }

  /** Recompute and display the current BPM from detected BPM × speed */
  _syncBpmDisplay() {
    const { n, mixer } = this;
    const detectedBpm  = mixer[`deck${n}`]?.bpm;
    const rate         = parseFloat(this._el('speed').value);
    if (detectedBpm) this._el('currentBpm').value = (detectedBpm * rate).toFixed(1);
  }

  // ── Loop ──────────────────────────────────────────────────────

  _wireLoop() {
    const { n, mixer }       = this;
    const { loopBeats: STEPS } = MIXXS.deck;
    const beatsInput           = this._el('loopBeats');

    // Arrow keys step through the allowed beat counts
    beatsInput.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const cur = parseInt(beatsInput.value) || STEPS[2]; // default 4
      const idx = STEPS.indexOf(cur);
      if (e.key === 'ArrowUp')
        beatsInput.value = STEPS[Math.min((idx === -1 ? 0 : idx) + 1, STEPS.length - 1)];
      else if (idx > 0)
        beatsInput.value = STEPS[idx - 1];
      if (this.deck?.loop) this.deck.loopBeats = parseInt(beatsInput.value);
    });

    this._el('loop').addEventListener('click', () =>
      mixer.toggleLoop(n, parseInt(beatsInput.value) || STEPS[2]));

    const nudgeLoop = (dir) => {
      const deck = this.deck; if (!deck?.loop) return;
      const beatDur = 60 / (deck.beatGrid?.bpm ?? deck.bpm);
      deck.loopIn = Math.max(0,
        Math.min(deck.buffer.duration, deck.loopIn + dir * beatDur));
    };
    this._el('loopNudgeBack').addEventListener('click', () => nudgeLoop(-1));
    this._el('loopNudgeFwd').addEventListener('click',  () => nudgeLoop(+1));
  }

  // ── mixxs:* event listeners (MixerController → DOM) ──────────

  _listenEvents() {
    const { n } = this;

    // Helper: subscribe to a mixxs:* event filtered to this deck number
    const on = (type, fn) =>
      document.addEventListener(type, e => {
        if (e.detail.deckNum === n) fn(e.detail);
      });

    on('mixxs:playstate', ({ isPlaying }) => {
      this._el('play').textContent = isPlaying ? '⏸' : '▶';
      syncToggleBtn(`play${n}`, isPlaying);
    });

    on('mixxs:timeupdate', ({ current, duration }) => {
      const el = this._el('time');
      if (!el) return;
      const remaining = duration - current;
      el.textContent = `${fmtElapsed(current)} / ${fmtTime(remaining)} / ${fmtTime(duration)}`;
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
      if (bpm) this._el('currentBpm').value = (bpm * rate).toFixed(1);
    });

    on('mixxs:loopstate', ({ active }) => syncToggleBtn(`loop${n}`, active));
    on('mixxs:cuestate',  ({ active }) => syncToggleBtn(`cue${n}`,  active));

    on('mixxs:loadprogress', ({ label, active, onCancel }) => {
      const overlay   = document.getElementById(`loading${n}`);
      const labelEl   = overlay?.querySelector('span');
      const cancelBtn = document.getElementById(`cancelLoad${n}`);
      if (!overlay) return;
      overlay.classList.toggle('active', active);
      if (labelEl && label)   labelEl.textContent = label;
      if (cancelBtn && onCancel) cancelBtn.onclick = onCancel;
    });

    on('mixxs:loadend', ({ filename }) => {
      const hide = id => {
        const el = document.getElementById(`${id}${n}`);
        if (el) el.style.display = 'none';
      };
      hide('waveEmpty');
      hide('overviewEmpty');
      const setName = id => {
        const el = document.getElementById(`${id}${n}`);
        if (el) el.textContent = filename;
      };
      setName('trackName');
      setName('deckFilename');
    });
  }
}
