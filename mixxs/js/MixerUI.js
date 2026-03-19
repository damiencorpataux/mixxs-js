// ═══════════════════════════════════════════════════════════════
//  MixerUI  —  mixer panel + global UI wiring
//
//  Owns: CUE buttons, crossfader, EQ/filter/volume knobs,
//  header knobs (master/cue/click), waveform gestures,
//  click track toggle, settings modal.
// ═══════════════════════════════════════════════════════════════
class MixerUI {
  constructor(mixer) {
    this.mixer = mixer;
    this._wireCue();
    this._wireCrossfader();
    this._wireChannelKnobs();
    this._wireHeaderKnobs();
    this._wireWaveforms();
    this._wireClickTrack();
    this._wireSettingsModal();
  }

  // ── CUE ───────────────────────────────────────────────────────

  _wireCue() {
    [1, 2].forEach(n =>
      el(`cue${n}`).addEventListener('click', () => {
        this.mixer._init();
        this.mixer.toggleCue(n);
      }));
  }

  // ── Crossfader ────────────────────────────────────────────────

  _wireCrossfader() {
    el('crossfader').addEventListener('input', e =>
      this.mixer.crossfader?.setValue(parseFloat(e.target.value)));
  }

  // ── Per-channel knobs: EQ, filter, volume ─────────────────────
  //
  //  internalFn only needs to parse — Knob.clamp() handles bounds
  //  using the range element's own min/max attributes.

  _wireChannelKnobs() {
    const { mixer }              = this;
    const { eq, filter, volume } = MIXXS.mixer;

    [1, 2].forEach(n => {

      // EQ — dB, passed directly to BiquadFilterNode.gain
      [
        { knob: `eqHiKnob${n}`,  range: `eqHi${n}`,  val: `eqHiVal${n}`,  band: 'high' },
        { knob: `eqMidKnob${n}`, range: `eqMid${n}`, val: `eqMidVal${n}`, band: 'mid'  },
        { knob: `eqLowKnob${n}`, range: `eqLow${n}`, val: `eqLowVal${n}`, band: 'low'  },
      ].forEach(({ knob, range, val, band }) => {
        initRange(el(range), eq);
        new Knob({
          canvas:     el(knob), range: el(range), display: el(val),
          onChange:   v  => mixer[`channel${n}`]?.setEq(band, v),
          displayFn:  v  => v.toFixed(1),
          internalFn: d  => parseFloat(d),
        });
      });

      // Filter — -1 = lowpass, 0 = bypassed, +1 = highpass
      // Arc color set via CSS: .filter-knob { --knob-arc: var(--teal) }
      initRange(el(`filter${n}`), filter);
      new Knob({
        canvas:     el(`filterKnob${n}`), range: el(`filter${n}`), display: el(`filterVal${n}`),
        onChange:   v  => mixer[`channel${n}`]?.setFilter(v),
        displayFn:  v  => v.toFixed(2),
        internalFn: d  => parseFloat(d),
      });

      // Volume — 0–100 %; audio layer receives v / 100 (0.0–1.0)
      initRange(el(`vol${n}`), volume);
      new Knob({
        canvas:     el(`volKnob${n}`), range: el(`vol${n}`), display: el(`volVal${n}`),
        onChange:   v  => mixer[`channel${n}`]?.setVolume(v / 100),
        displayFn:  v  => Math.round(v).toString(),
        internalFn: d  => parseFloat(d),
      });
    });
  }

  // ── Header knobs: master, CUE monitor, click track ────────────

  _wireHeaderKnobs() {
    const { mixer }  = this;
    const { volume } = MIXXS.mixer;

    [
      { canvas: 'masterKnob', range: 'masterVol', display: 'masterVolVal',
        onChange: v => { if (mixer.audioEngine.masterGain) mixer.audioEngine.masterGain.gain.value = v / 100; } },
      { canvas: 'cueKnob',   range: 'cueVol',    display: 'cueVolVal',
        onChange: v => mixer.cueBus?.setVolume(v / 100) },
      { canvas: 'clickKnob', range: 'clickVol',  display: 'clickVolVal',
        onChange: v => mixer.clicktrack?.setVolume(v / 100) },
    ].forEach(({ canvas, range, display, onChange }) => {
      initRange(el(range), volume);
      new Knob({
        canvas: el(canvas), range: el(range), display: el(display),
        onChange,
        displayFn:  v => Math.round(v).toString(),
        internalFn: d => parseFloat(d),
      });
    });
  }

  // ── Waveform gestures ─────────────────────────────────────────
  //
  //  Per waveform canvas:
  //    Mouse wheel           → zoom
  //    Mouse drag            → scratch (mute + seek)
  //    Mouse double-click    → seek
  //    Touch single finger   → scratch (delayed PINCH_DELAY ms)
  //    Touch two fingers     → pinch-to-zoom
  //    Touch double-tap      → seek

  _wireWaveforms() {
    const { mixer } = this;
    const { zoom, pinchDelayMs, doubleTapMs } = MIXXS.waveform;

    [1, 2].forEach(n => {
      const canvas = el(`waveform${n}`);

      // Prevent right-click context menu on waveform
      canvas.addEventListener('contextmenu', e => e.preventDefault());

      // ── Scroll wheel zoom ─────────────────────────────────────
      canvas.addEventListener('wheel', e => {
        mixer[`waveform${n}`]?.onWheel(e, mixer[`deck${n}`]?.isPlaying ?? false);
        mixer.syncZoom(n);
      }, { passive: false });

      // ── Mouse double-click seek ───────────────────────────────
      canvas.addEventListener('dblclick', e => {
        const deck = mixer[`deck${n}`];
        const wf   = mixer[`waveform${n}`];
        if (!deck?.buffer || !wf) return;
        const rect = canvas.getBoundingClientRect();
        deck.seek(wf.getTimeAtX(e.clientX - rect.left, deck.getCurrentTime()));
      });

      // ── Mouse scratch ─────────────────────────────────────────
      let _mouseLastX = 0, _mouseActive = false;
      canvas.addEventListener('mousedown', e => {
        e.preventDefault();
        _mouseLastX = e.clientX;
        _mouseActive = true;
        mixer.scratchStart(n);

        const onMove = e2 => {
          if (!_mouseActive) return;
          const dx = e2.clientX - _mouseLastX;
          if (Math.abs(dx) > 2) mixer.scratch(n, dx, canvas.offsetWidth);
          _mouseLastX = e2.clientX;
        };
        const onUp = () => {
          if (!_mouseActive) return;
          _mouseActive = false;
          mixer.scratchEnd(n);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup',   onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
      });

      // ── Touch scratch + pinch-to-zoom ─────────────────────────
      //
      // Problem: the first finger of a pinch arrives before the second.
      // Solution: delay scratchStart by PINCH_DELAY ms — if a second
      // finger arrives in that window, cancel scratch and start pinch.

      let _touches      = {};        // identifier → {x, y}
      let _scratchTimer = null;
      let _scratchId    = null;      // touch identifier for the scratch finger
      let _scratchLastX = 0;
      let _scratchActive = false;
      let _pinchActive  = false;
      let _pinchDist0   = null;
      let _zoom0        = null;
      let _lastTap      = 0;

      const cancelScratchTimer = () => {
        if (_scratchTimer) { clearTimeout(_scratchTimer); _scratchTimer = null; }
      };

      canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.touches)
          _touches[t.identifier] = { x: t.clientX, y: t.clientY };

        if (e.touches.length === 2) {
          // Second finger: cancel pending/active scratch, start pinch
          cancelScratchTimer();
          if (_scratchActive) { mixer.scratchEnd(n); _scratchActive = false; }
          const [a, b] = Object.values(_touches);
          _pinchDist0  = Math.hypot(b.x - a.x, b.y - a.y);
          _zoom0       = mixer[`waveform${n}`]?.zoom ?? 1;
          _pinchActive = true;
          _scratchId   = null;
        } else if (e.touches.length === 1) {
          // First finger: wait to see if a second arrives
          _pinchActive  = false;
          _scratchId    = e.touches[0].identifier;
          _scratchLastX = e.touches[0].clientX;
          cancelScratchTimer();
          _scratchTimer = setTimeout(() => {
            _scratchTimer = null;
            if (!_pinchActive) {
              _scratchActive = true;
              mixer.scratchStart(n);
            }
          }, pinchDelayMs);
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches)
          if (_touches[t.identifier])
            _touches[t.identifier] = { x: t.clientX, y: t.clientY };

        if (_pinchActive && e.touches.length === 2 && _pinchDist0 !== null) {
          const wf = mixer[`waveform${n}`]; if (!wf) return;
          const [a, b] = Object.values(_touches);
          const dist   = Math.hypot(b.x - a.x, b.y - a.y);
          wf.zoom = Math.max(zoom.min, Math.min(zoom.max, _zoom0 * (dist / _pinchDist0)));
          mixer.syncZoom(n);
        } else if (_scratchActive && e.touches.length === 1) {
          const t = [...e.changedTouches].find(t => t.identifier === _scratchId);
          if (!t) return;
          const dx = t.clientX - _scratchLastX;
          if (Math.abs(dx) > 2) mixer.scratch(n, dx, canvas.offsetWidth);
          _scratchLastX = t.clientX;
        }
      }, { passive: false });

      canvas.addEventListener('touchend', e => {
        for (const t of e.changedTouches) delete _touches[t.identifier];
        if (e.touches.length < 2) { _pinchDist0 = null; _pinchActive = false; }
        if (e.touches.length === 0) {
          cancelScratchTimer();
          if (_scratchActive) { mixer.scratchEnd(n); _scratchActive = false; }

          // Double-tap seek
          const now = Date.now();
          if (now - _lastTap < doubleTapMs && e.changedTouches.length === 1) {
            const t    = e.changedTouches[0];
            const deck = mixer[`deck${n}`];
            const wf   = mixer[`waveform${n}`];
            if (deck?.buffer && wf) {
              const rect = canvas.getBoundingClientRect();
              deck.seek(wf.getTimeAtX(t.clientX - rect.left, deck.getCurrentTime()));
            }
          }
          _lastTap = now;
        }
      });

      canvas.addEventListener('touchcancel', () => {
        cancelScratchTimer();
        _touches = {}; _pinchDist0 = null; _pinchActive = false;
        if (_scratchActive) { mixer.scratchEnd(n); _scratchActive = false; }
      });
    });
  }

  // ── Click track ───────────────────────────────────────────────

  _wireClickTrack() {
    el('btnClick').addEventListener('click', () => {
      this.mixer._init();
      this.mixer.toggleClick();
    });
    document.addEventListener('mixxs:clickstate', e =>
      syncToggleBtn('btnClick', e.detail.active));
  }

  // ── Export ────────────────────────────────────────────────────

  _wireExport() {
    el('btnExport').addEventListener('click', () => this.mixer.exportMix());
    document.addEventListener('mixxs:exportstate', e => {
      const btn = el('btnExport');
      btn.disabled    = e.detail.busy;
      btn.textContent = e.detail.busy ? '⏳ RENDERING…' : '⬇ EXPORT MIX';
    });
  }

  // ── Audio device settings modal ───────────────────────────────

  _wireSettingsModal() {
    const { mixer } = this;
    const modal     = el('modalOverlay');

    el('btnSettings').addEventListener('click', async () => {
      mixer._init();
      const outputs = await mixer.audioEngine.enumerateOutputs();

      ['masterDevice', 'cueDevice'].forEach(id => {
        const sel = el(id);
        sel.innerHTML = '<option value="">Default Output</option>';
        outputs.forEach(d => {
          const opt       = document.createElement('option');
          opt.value       = d.deviceId;
          opt.textContent = d.label || `Output ${d.deviceId.slice(0, 8)}`;
          sel.appendChild(opt);
        });
      });
      modal.classList.add('open');
    });

    el('btnModalClose').addEventListener('click', () => modal.classList.remove('open'));

    el('btnModalApply').addEventListener('click', async () => {
      const masterId = el('masterDevice').value;
      const cueId    = el('cueDevice').value;
      await mixer.audioEngine.setMasterDevice(masterId);
      await mixer.audioEngine.setCueDevice(cueId);
      el('statusMaster').textContent =
        document.querySelector(`#masterDevice option[value="${masterId}"]`)
          ?.textContent?.split('(')[0].trim() ?? 'DEFAULT';
      el('statusCue').textContent =
        document.querySelector(`#cueDevice option[value="${cueId}"]`)
          ?.textContent?.split('(')[0].trim() ?? 'DEFAULT';
      modal.classList.remove('open');
    });

    // Click outside modal to dismiss
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
}
