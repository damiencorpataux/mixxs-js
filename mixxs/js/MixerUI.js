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
        internalFn: d => parseFloat(d),
      }));

      // Filter
      new Knob({
        canvas: el(`filterKnob${n}`), range: el(`filter${n}`), display: el(`filterVal${n}`),
        onChange:   v => mixer[`channel${n}`]?.setFilter(v),
        displayFn:  v => v.toFixed(2),
        internalFn: d => Math.max(-1, Math.min(1, parseFloat(d))),
        color: '#2dd4bf',
      });

      // Volume
      new Knob({
        canvas: el(`volKnob${n}`), range: el(`vol${n}`), display: el(`volVal${n}`),
        onChange:   v => mixer[`channel${n}`]?.setVolume(v),
        displayFn:  linearToDb,
        internalFn: dbToLinear,
      });
    });
  }

  // ── Header knobs: click level, master, cue level ─────────────

  _wireHeaderKnobs() {
    const { mixer } = this;
    new Knob({
      canvas: el('clickKnob'), range: el('clickVol'), display: el('clickVolVal'),
      onChange:   v => mixer.clicktrack?.setVolume(v),
      displayFn:  linearToDb, internalFn: dbToLinear,
    });
    new Knob({
      canvas: el('masterKnob'), range: el('masterVol'), display: el('masterVolVal'),
      onChange:   v => { if (mixer.audioEngine.masterGain) mixer.audioEngine.masterGain.gain.value = v; },
      displayFn:  linearToDb, internalFn: dbToLinear,
    });
    new Knob({
      canvas: el('cueKnob'), range: el('cueVol'), display: el('cueVolVal'),
      onChange:   v => mixer.cueBus?.setVolume(v),
      displayFn:  linearToDb, internalFn: dbToLinear,
    });
  }

  // ── Waveform seek + zoom ──────────────────────────────────────

  _wireWaveforms() {
    const { mixer } = this;
    [1, 2].forEach(n => {
      el(`waveform${n}`).addEventListener('click', e => mixer.seekOnCanvas(n, e));
      el(`waveform${n}`).addEventListener('wheel', e => {
        mixer[`waveform${n}`]?.onWheel(e, mixer[`deck${n}`]?.isPlaying ?? false);
        mixer.syncZoom(n);
      }, { passive: false });
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
