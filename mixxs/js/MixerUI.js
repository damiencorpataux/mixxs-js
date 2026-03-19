// ═══════════════════════════════════════════════════════════════
//  MixerUI  —  mixer + global UI wiring
//
//  Owns: CUE, crossfader, EQ/filter/vol knobs, header knobs,
//  click track, waveform seek/zoom, export, settings modal.
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
    this._wireExport();
    this._wireSettingsModal();
  }

  // ── CUE buttons ───────────────────────────────────────────────

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

  _wireChannelKnobs() {
    const { mixer } = this;
    [1, 2].forEach(n => {
      // EQ
      [
        { knob: `eqHiKnob${n}`,  range: `eqHi${n}`,  val: `eqHiVal${n}`,  band: 'high' },
        { knob: `eqMidKnob${n}`, range: `eqMid${n}`, val: `eqMidVal${n}`, band: 'mid'  },
        { knob: `eqLowKnob${n}`, range: `eqLow${n}`, val: `eqLowVal${n}`, band: 'low'  },
      ].forEach(({ knob, range, val, band }) => new Knob({
        canvas: el(knob), range: el(range), display: el(val),
        onChange:   v => mixer[`channel${n}`]?.setEq(band, v),
        displayFn:  v => v.toFixed(1),
        internalFn: d => Math.max(-12, Math.min(12, parseFloat(d))),
      }));

      // Filter
      new Knob({
        canvas: el(`filterKnob${n}`), range: el(`filter${n}`), display: el(`filterVal${n}`),
        onChange:   v => mixer[`channel${n}`]?.setFilter(v),
        displayFn:  v => v.toFixed(2),
        internalFn: d => Math.max(-1, Math.min(1, parseFloat(d))),
        color: '#2dd4bf',
      });

      // Volume — 0–100%, audio gets v/100
      new Knob({
        canvas: el(`volKnob${n}`), range: el(`vol${n}`), display: el(`volVal${n}`),
        onChange:   v => mixer[`channel${n}`]?.setVolume(v / 100),
        displayFn:  pctDisplay,
        internalFn: pctInternal,
      });
    });
  }

  // ── Header knobs: click level, master, cue level ─────────────

  _wireHeaderKnobs() {
    const { mixer } = this;
    new Knob({
      canvas: el('clickKnob'), range: el('clickVol'), display: el('clickVolVal'),
      onChange:   v => mixer.clicktrack?.setVolume(v / 100),
      displayFn:  pctDisplay, internalFn: pctInternal,
    });
    new Knob({
      canvas: el('masterKnob'), range: el('masterVol'), display: el('masterVolVal'),
      onChange:   v => { if (mixer.audioEngine.masterGain) mixer.audioEngine.masterGain.gain.value = v / 100; },
      displayFn:  pctDisplay, internalFn: pctInternal,
    });
    new Knob({
      canvas: el('cueKnob'), range: el('cueVol'), display: el('cueVolVal'),
      onChange:   v => mixer.cueBus?.setVolume(v / 100),
      displayFn:  pctDisplay, internalFn: pctInternal,
    });
  }

  // ── Waveform seek + zoom ──────────────────────────────────────

  _wireWaveforms() {
    const { mixer } = this;
    [1, 2].forEach(n => {
      const canvas = el(`waveform${n}`);

      // ── Mouse wheel zoom ──────────────────────────────────────
      canvas.addEventListener('wheel', e => {
        mixer[`waveform${n}`]?.onWheel(e, mixer[`deck${n}`]?.isPlaying ?? false);
        mixer.syncZoom(n);
      }, { passive: false });

      // ── Double-click: seek ────────────────────────────────────
      canvas.addEventListener('dblclick', e => {
        const deck = mixer[`deck${n}`];
        const wf   = mixer[`waveform${n}`];
        if (!deck?.buffer || !wf) return;
        const rect = canvas.getBoundingClientRect();
        deck.seek(wf.getTimeAtX(e.clientX - rect.left, deck.getCurrentTime()));
      });

      // ── Mouse: immediate scratch ──────────────────────────────
      let _lastX = 0, _isDragging = false;
      canvas.addEventListener('mousedown', e => {
        e.preventDefault();
        _lastX = e.clientX; _isDragging = true;
        mixer.scratchStart(n);
        const move = e2 => {
          if (!_isDragging) return;
          const dx = e2.clientX - _lastX;
          if (Math.abs(dx) > 2) mixer.scratch(n, dx, canvas.offsetWidth);
          _lastX = e2.clientX;
        };
        const up = () => {
          if (!_isDragging) return;
          _isDragging = false;
          mixer.scratchEnd(n);
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup',   up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup',   up);
      });

      // ── Touch: delayed scratch start to allow pinch detection ──
      // If a second finger arrives within PINCH_DELAY ms, treat as pinch.
      const PINCH_DELAY = 50; // ms
      let _touches = {}, _pinchDist0 = null, _zoom0 = null, _pinching = false;
      let _touchScratchId = null, _scratchTimer = null, _touchLastX = 0;
      let _touchDragging = false;
      let _lastTap = 0; // for double-tap detection

      const _cancelScratchTimer = () => {
        if (_scratchTimer) { clearTimeout(_scratchTimer); _scratchTimer = null; }
      };

      canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.touches)
          _touches[t.identifier] = { x: t.clientX, y: t.clientY };

        if (e.touches.length === 2) {
          // Second finger arrived — cancel any pending scratch, end active scratch
          _cancelScratchTimer();
          if (_touchDragging) { mixer.scratchEnd(n); _touchDragging = false; }
          // Start pinch
          const [a, b] = Object.values(_touches);
          _pinchDist0  = Math.hypot(b.x - a.x, b.y - a.y);
          _zoom0       = mixer[`waveform${n}`]?.zoom ?? 1;
          _pinching    = true;
          _touchScratchId = null;
        } else if (e.touches.length === 1) {
          // One finger — delay before starting scratch
          _pinching = false;
          _touchScratchId = e.touches[0].identifier;
          _touchLastX     = e.touches[0].clientX;
          _cancelScratchTimer();
          _scratchTimer = setTimeout(() => {
            _scratchTimer = null;
            if (!_pinching) {
              _touchDragging = true;
              mixer.scratchStart(n);
            }
          }, PINCH_DELAY);
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches)
          if (_touches[t.identifier]) _touches[t.identifier] = { x: t.clientX, y: t.clientY };

        if (_pinching && e.touches.length === 2 && _pinchDist0 !== null) {
          const wf = mixer[`waveform${n}`]; if (!wf) return;
          const [a, b] = Object.values(_touches);
          const dist   = Math.hypot(b.x - a.x, b.y - a.y);
          wf.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, _zoom0 * (dist / _pinchDist0)));
          mixer.syncZoom(n);
        } else if (_touchDragging && e.touches.length === 1) {
          const t = [...e.changedTouches].find(t => t.identifier === _touchScratchId);
          if (!t) return;
          const dx = t.clientX - _touchLastX;
          if (Math.abs(dx) > 2) mixer.scratch(n, dx, canvas.offsetWidth);
          _touchLastX = t.clientX;
        }
      }, { passive: false });

      canvas.addEventListener('touchend', e => {
        for (const t of e.changedTouches) delete _touches[t.identifier];
        if (e.touches.length < 2) { _pinchDist0 = null; _pinching = false; }
        if (e.touches.length === 0) {
          _cancelScratchTimer();
          if (_touchDragging) { mixer.scratchEnd(n); _touchDragging = false; }

          // Double-tap → seek
          const now = Date.now();
          if (now - _lastTap < 300 && e.changedTouches.length === 1) {
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
        _cancelScratchTimer();
        _touches = {}; _pinchDist0 = null; _pinching = false;
        if (_touchDragging) { mixer.scratchEnd(n); _touchDragging = false; }
      });
    });
  }

  // ── Click track ───────────────────────────────────────────────

  _wireClickTrack() {
    el('btnClick').addEventListener('click', e => {
      this.mixer._init();
      this.mixer.toggleClick(e.currentTarget);
    });
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

  // ── Settings modal ────────────────────────────────────────────

  _wireSettingsModal() {
    const { mixer } = this;
    const modal = el('modalOverlay');

    el('btnSettings').addEventListener('click', async () => {
      mixer._init();
      const outputs = await mixer.audioEngine.enumerateOutputs();
      ['masterDevice', 'cueDevice'].forEach(id => {
        const sel = el(id);
        sel.innerHTML = '<option value="">Default Output</option>';
        outputs.forEach(d => {
          const opt = document.createElement('option');
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
          ?.textContent?.split('(')[0].trim() || 'DEFAULT';
      el('statusCue').textContent =
        document.querySelector(`#cueDevice option[value="${cueId}"]`)
          ?.textContent?.split('(')[0].trim() || 'DEFAULT';
      modal.classList.remove('open');
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
}
