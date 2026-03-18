// ═══════════════════════════════════════════════════════════════
//  MixerController  —  top-level orchestrator
//
//  Responsibilities:
//    - Lazy-initializes the full audio graph on first user interaction
//    - Wires Deck → ChannelController → CrossfaderController → AudioEngine
//    - Runs the RAF loop that syncs waveform playheads + time displays
//    - Delegates all UI events from main.js
// ═══════════════════════════════════════════════════════════════
class MixerController {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.fileLoader  = null;
    this.cueBus      = null;
    this.channel1    = null;
    this.channel2    = null;
    this.deck1       = null;
    this.deck2       = null;
    this.crossfader  = null;
    this.waveform1   = null;
    this.waveform2   = null;
    this.overview1   = null;
    this.overview2   = null;
    this.exporter    = new Exporter();
    this.initialized = false;
    this.rafId       = null;
  }

  // ── Initialization ────────────────────────────────────────────

  _init() {
    if (this.initialized) return;
    this.audioEngine.init();
    this.fileLoader = new FileLoader(this.audioEngine);
    this.cueBus     = new CueBus(this.audioEngine);
    const ctx       = this.audioEngine.masterContext;

    this.channel1   = new ChannelController(ctx, this.cueBus);
    this.channel2   = new ChannelController(ctx, this.cueBus);
    this.deck1      = new Deck(ctx, this.channel1);
    this.deck2      = new Deck(ctx, this.channel2);
    this.crossfader = new CrossfaderController(
      this.channel1,
      this.channel2,
      this.audioEngine.masterGain
    );

    this.waveform1 = new WaveformRenderer(document.getElementById('waveform1'));
    this.waveform2 = new WaveformRenderer(document.getElementById('waveform2'));
    this.overview1 = new OverviewRenderer(document.getElementById('overview1'), t => this.deck1?.seek(t));
    this.overview2 = new OverviewRenderer(document.getElementById('overview2'), t => this.deck2?.seek(t));

    this.deck1.onEnded = () => this._onDeckEnded(1);
    this.deck2.onEnded = () => this._onDeckEnded(2);

    this._startRAF();
    this.initialized = true;
  }

  // ── File loading ──────────────────────────────────────────────

  async loadFile(deckNum, file) {
    this._init();

    // Cancel any in-progress load for this deck
    this._cancelLoad(deckNum);
    const cancelled = { value: false };
    this[`_loadCancel${deckNum}`] = cancelled;

    const loadingEl  = document.getElementById(`loading${deckNum}`);
    const emptyEl    = document.getElementById(`waveEmpty${deckNum}`);
    const cancelBtn  = document.getElementById(`cancelLoad${deckNum}`);
    const labelEl    = loadingEl.querySelector('span');

    const dismiss = () => {
      loadingEl.classList.remove('active');
      if (labelEl) labelEl.textContent = 'DECODING…';
    };

    if (cancelBtn) cancelBtn.onclick = () => {
      cancelled.value = true;
      dismiss();
    };

    loadingEl.classList.add('active');
    if (labelEl) labelEl.textContent = 'DECODING…';

    try {
      const buffer = await this.fileLoader.load(file);
      if (cancelled.value) return;

      const deck     = deckNum === 1 ? this.deck1     : this.deck2;
      const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
      const overview = deckNum === 1 ? this.overview1 : this.overview2;
      deck.load(buffer);
      deck.setPlaybackRate(1.0);
      document.getElementById(`speed${deckNum}`).value    = 1;
      document.getElementById(`speedVal${deckNum}`).value = '1.000';
      waveform.load(buffer);
      // Sync zoom to the other deck's current visible seconds
      const otherWaveform = deckNum === 1 ? this.waveform2 : this.waveform1;
      const otherSec = otherWaveform?.getVisibleSec();
      if (otherSec !== null && otherSec !== undefined) waveform.setVisibleSec(otherSec);
      overview.load(buffer);

      document.getElementById(`bpm${deckNum}`).value = '';
      document.getElementById(`currentBpm${deckNum}`).value = '';
      emptyEl.style.display = 'none';
      const overviewEmpty = document.getElementById(`overviewEmpty${deckNum}`);
      if (overviewEmpty) overviewEmpty.style.display = 'none';
      document.getElementById(`trackName${deckNum}`).textContent = file.name;
      document.getElementById(`deckFilename${deckNum}`).textContent = file.name;
      this._updateTimeDisplay(deckNum, 0, deck.getRealDuration());

      // ── Auto-analyze BPM ──
      if (labelEl) labelEl.textContent = 'ANALYZING…';
      this.analyzeDeck(deckNum).then(() => {
        if (!cancelled.value) dismiss();
      }).catch(() => {
        if (!cancelled.value) dismiss();
      });
    } catch (err) {
      if (!cancelled.value) {
        dismiss();
        alert(`Failed to decode audio: ${err.message}`);
      }
    }
  }

  _cancelLoad(deckNum) {
    const token = this[`_loadCancel${deckNum}`];
    if (token) token.value = true;
    this[`_loadCancel${deckNum}`] = null;
  }

  // ── Transport ─────────────────────────────────────────────────

  togglePlay(deckNum) {
    this._init();
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    const btn  = document.getElementById(`play${deckNum}`);
    if (deck.isPlaying) {
      deck.pause();
      btn.textContent = '▶';
      btn.classList.remove('active');
    } else {
      deck.play();
      btn.textContent = '⏸';
      btn.classList.add('active');
    }
  }

  stopDeck(deckNum) {
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (!deck) return;
    deck.stop();
    const btn = document.getElementById(`play${deckNum}`);
    btn.textContent = '▶';
    btn.classList.remove('active');
  }

  // ── CUE ───────────────────────────────────────────────────────

  toggleCue(deckNum) {
    const channel = deckNum === 1 ? this.channel1 : this.channel2;
    if (!channel) return;
    const btn = document.getElementById(`cue${deckNum}`);
    const isOn = btn.classList.toggle('active');
    channel.setCue(isOn);
  }

  // ── Waveform seek ─────────────────────────────────────────────

  seekOnCanvas(deckNum, event) {
    const deck     = deckNum === 1 ? this.deck1 : this.deck2;
    const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
    if (!deck?.buffer) return;
    const canvas = event.currentTarget;
    const rect   = canvas.getBoundingClientRect();
    deck.seek(waveform.getTimeAtX(event.clientX - rect.left, deck.getCurrentTime()));
  }

  // ── Zoom sync ─────────────────────────────────────────────────

  /**
   * After a zoom change on one waveform, apply the same visible-seconds
   * window to the other so beat grids stay visually aligned.
   */
  syncZoom(sourceNum) {
    const src  = sourceNum === 1 ? this.waveform1 : this.waveform2;
    const dest = sourceNum === 1 ? this.waveform2 : this.waveform1;
    if (!src || !dest) return;
    const sec = src.getVisibleSec();
    if (sec !== null) dest.setVisibleSec(sec);
  }

  async analyzeDeck(deckNum) {
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (!deck?.buffer) return;
    const analyzer = new BeatAnalyzer();
    const result   = await analyzer.analyze(deck.buffer);
    deck.beatGrid  = result;
    deck.bpm       = result.bpm;  // full precision for sync ratio
    const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
    waveform.setBeatGrid(result);
    const overview = deckNum === 1 ? this.overview1 : this.overview2;
    overview.setBeatGrid(result);
    // Round to 2 decimals for display only — grid uses full float precision
    document.getElementById(`bpm${deckNum}`).value = result.bpm.toFixed(2);
    // Current BPM = detected × current speed (speed is 1.0 at load time)
    const speed = parseFloat(document.getElementById(`speed${deckNum}`)?.value || 1);
    const currentBpmEl = document.getElementById(`currentBpm${deckNum}`);
    if (currentBpmEl) currentBpmEl.value = (result.bpm * speed).toFixed(2);
    return result;
  }

  // ── BPM + phase sync ──────────────────────────────────────────

  /**
   * Full sync: tempo-match slave deck to master, then phase-snap.
   *
   * Step 1 — Tempo: adjust slave playbackRate = masterBPM / slaveBPM
   * Step 2 — Phase: seek slave to the beat index that aligns with master's
   *           current position, using BeatAnalyzer.phaseSnapTime()
   *
   * Falls back to manual BPM field values if beatGrid is not yet available.
   */
  /**
   * Sync: adjust the clicked deck's speed to match the other deck's BPM.
   * Clicking SYNC on deck 1 → deck 1 adjusts to match deck 2's BPM.
   * Clicking SYNC on deck 2 → deck 2 adjusts to match deck 1's BPM.
   */
  sync(deckNum) {
    const thisDeck  = deckNum === 1 ? this.deck1 : this.deck2;
    const otherDeck = deckNum === 1 ? this.deck2 : this.deck1;
    if (!thisDeck || !otherDeck) return;

    const thisBpm  = thisDeck.beatGrid?.bpm  ?? thisDeck.bpm;
    const otherBpm = (otherDeck.beatGrid?.bpm ?? otherDeck.bpm) * otherDeck.playbackRate;
    if (!thisBpm || !otherBpm) return;

    const rate = otherBpm / thisBpm;
    thisDeck.setPlaybackRate(rate);
    document.getElementById(`speed${deckNum}`).value    = rate;
    document.getElementById(`speedVal${deckNum}`).value = rate.toFixed(3);
    const currentBpmEl = document.getElementById(`currentBpm${deckNum}`);
    if (currentBpmEl && thisDeck.bpm) currentBpmEl.value = (thisDeck.bpm * rate).toFixed(2);
  }

  // ── Export ────────────────────────────────────────────────────

  async exportMix() {
    if (!this.initialized) return;
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.textContent = '⏳ RENDERING…';
    try {
      await this.exporter.export(
        this.deck1, this.deck2,
        this.channel1, this.channel2,
        this.crossfader.value,
        this.audioEngine.masterGain.gain.value
      );
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '⬇ EXPORT MIX';
    }
  }

  // ── Private ───────────────────────────────────────────────────

  _onDeckEnded(deckNum) {
    const btn = document.getElementById(`play${deckNum}`);
    btn.textContent = '▶';
    btn.classList.remove('active');
  }

  _startRAF() {
    const loop = () => {
      if (this.deck1?.buffer) {
        const t1 = this.deck1.getCurrentTime();
        this.waveform1.draw(t1, this.deck1.isPlaying);
        this.overview1.draw(t1);
        this._updateTimeDisplay(1, this.deck1.getRealCurrentTime(), this.deck1.getRealDuration());
      }
      if (this.deck2?.buffer) {
        const t2 = this.deck2.getCurrentTime();
        this.waveform2.draw(t2, this.deck2.isPlaying);
        this.overview2.draw(t2);
        this._updateTimeDisplay(2, this.deck2.getRealCurrentTime(), this.deck2.getRealDuration());
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _updateTimeDisplay(deckNum, current, duration) {
    const el = document.getElementById(`time${deckNum}`);
    if (el) el.textContent = `${fmtTime(current)} / ${fmtTime(duration)}`;
  }
}
