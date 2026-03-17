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
    try {
      const buffer   = await this.fileLoader.load(file);
      const deck     = deckNum === 1 ? this.deck1     : this.deck2;
      const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
      deck.load(buffer);
      waveform.load(buffer);
      emptyEl.style.display = 'none';
      document.getElementById(`trackName${deckNum}`).textContent = file.name;
      this._updateTimeDisplay(deckNum, 0, buffer.duration);
    } catch (err) {
      alert(`Failed to decode audio: ${err.message}`);
    } finally {
      loadingEl.classList.remove('active');
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
    const canvas   = event.currentTarget;
    if (!deck?.buffer) return;
    const rect  = canvas.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    deck.seek(ratio * deck.buffer.duration);
  }

  // ── BPM sync ──────────────────────────────────────────────────

  syncBpm(masterDeckNum) {
    const master   = masterDeckNum === 1 ? this.deck1 : this.deck2;
    const slave    = masterDeckNum === 1 ? this.deck2 : this.deck1;
    const slaveNum = masterDeckNum === 1 ? 2 : 1;
    if (!master?.bpm || !slave?.bpm || slave.bpm === 0) return;
    const rate = master.bpm / slave.bpm;
    slave.setPlaybackRate(rate);
    document.getElementById(`speed${slaveNum}`).value = rate;
    document.getElementById(`speedVal${slaveNum}`).textContent = rate.toFixed(2) + '×';
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
        this.waveform1.draw(this.deck1.getCurrentTime());
        this._updateTimeDisplay(1, this.deck1.getCurrentTime(), this.deck1.buffer.duration);
      }
      if (this.deck2?.buffer) {
        this.waveform2.draw(this.deck2.getCurrentTime());
        this._updateTimeDisplay(2, this.deck2.getCurrentTime(), this.deck2.buffer.duration);
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
