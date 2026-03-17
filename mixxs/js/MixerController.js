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
    const loadingEl = document.getElementById(`loading${deckNum}`);
    const emptyEl   = document.getElementById(`waveEmpty${deckNum}`);
    loadingEl.classList.add('active');
    loadingEl.textContent = 'DECODING…';
    try {
      const buffer   = await this.fileLoader.load(file);
      const deck     = deckNum === 1 ? this.deck1     : this.deck2;
      const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
      deck.load(buffer);
      waveform.load(buffer);
      const overview = deckNum === 1 ? this.overview1 : this.overview2;
      overview.load(buffer);
      // Reset BPM displays until analysis completes
      document.getElementById(`bpm${deckNum}`).value = '';
      document.getElementById(`currentBpm${deckNum}`).value = '';
      emptyEl.style.display = 'none';
      const overviewEmpty = document.getElementById(`overviewEmpty${deckNum}`);
      if (overviewEmpty) overviewEmpty.style.display = 'none';
      document.getElementById(`trackName${deckNum}`).textContent = file.name;
      document.getElementById(`deckFilename${deckNum}`).textContent = file.name;
      this._updateTimeDisplay(deckNum, 0, buffer.duration);

      // ── Auto-analyze BPM asynchronously ──
      loadingEl.textContent = 'ANALYZING…';
      this.analyzeDeck(deckNum).then(result => {
        loadingEl.classList.remove('active');
        loadingEl.textContent = 'DECODING…'; // reset for next load
      }).catch(() => {
        loadingEl.classList.remove('active');
        loadingEl.textContent = 'DECODING…';
      });
    } catch (err) {
      loadingEl.classList.remove('active');
      alert(`Failed to decode audio: ${err.message}`);
    }
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

  // ── Beat analysis ─────────────────────────────────────────────

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
  sync(masterDeckNum) {
    const master   = masterDeckNum === 1 ? this.deck1 : this.deck2;
    const slave    = masterDeckNum === 1 ? this.deck2 : this.deck1;
    const slaveNum = masterDeckNum === 1 ? 2 : 1;
    if (!master || !slave) return;

    const masterBpm = master.beatGrid?.bpm ?? master.bpm;
    const slaveBpm  = slave.beatGrid?.bpm  ?? slave.bpm;
    if (!slaveBpm) return;

    // ── Step 1: Tempo match ──
    const rate = masterBpm / slaveBpm;
    slave.setPlaybackRate(rate);
    document.getElementById(`speed${slaveNum}`).value     = rate;
    document.getElementById(`speedVal${slaveNum}`).value  = rate.toFixed(3);
    // Update current BPM display for slave
    const currentBpmEl = document.getElementById(`currentBpm${slaveNum}`);
    if (currentBpmEl && slave.bpm) currentBpmEl.value = (slave.bpm * rate).toFixed(2);

    // ── Step 2: Phase snap ──
    if (master.beatGrid && slave.beatGrid && slave.buffer) {
      const seekTime = BeatAnalyzer.phaseSnapTime(
        master.getCurrentTime(),
        master.beatGrid.bpm,
        master.beatGrid.offset,
        slave.beatGrid.bpm,
        slave.beatGrid.offset,
        slave.buffer.duration
      );
      slave.seek(seekTime);
    }
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
        this._updateTimeDisplay(1, t1, this.deck1.buffer.duration);
      }
      if (this.deck2?.buffer) {
        const t2 = this.deck2.getCurrentTime();
        this.waveform2.draw(t2, this.deck2.isPlaying);
        this.overview2.draw(t2);
        this._updateTimeDisplay(2, t2, this.deck2.buffer.duration);
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
