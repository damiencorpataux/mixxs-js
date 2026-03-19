// ═══════════════════════════════════════════════════════════════
//  MixerController  —  top-level audio orchestrator
//
//  Zero DOM knowledge — all UI communication via CustomEvents:
//
//  mixxs:playstate    { deckNum, isPlaying }
//  mixxs:timeupdate   { deckNum, current, duration }
//  mixxs:bpmupdate    { deckNum, bpm, currentBpm }
//  mixxs:speedupdate  { deckNum, rate }
//  mixxs:loopstate    { deckNum, active }
//  mixxs:loadprogress { deckNum, label }      — overlay text
//  mixxs:loadend      { deckNum, filename }   — file loaded OK
//  mixxs:exportstate  { busy }
// ═══════════════════════════════════════════════════════════════
class MixerController {
  constructor() {
    this.audioEngine  = new AudioEngine();
    this.fileLoader   = null;
    this.cueBus       = null;
    this.channel1     = null;
    this.channel2     = null;
    this.deck1        = null;
    this.deck2        = null;
    this.crossfader   = null;
    this.waveform1    = null;
    this.waveform2    = null;
    this.overview1    = null;
    this.overview2    = null;
    this.exporter     = new Exporter();
    this.clicktrack   = null;
    this.initialized  = false;
    this.rafId        = null;
    this._cueState    = { 1: false, 2: false }; // owned here, not in DOM
  }

  // ── Event helper ──────────────────────────────────────────────

  emit(type, detail = {}) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
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
      this.channel1, this.channel2, this.audioEngine.masterGain
    );
    this.clicktrack = new Clicktrack(this.audioEngine.masterContext);
    this.waveform1  = new WaveformView(document.getElementById('waveform1'));
    this.waveform2  = new WaveformView(document.getElementById('waveform2'));
    this.overview1  = new WaveformOverview(document.getElementById('overview1'), t => this.deck1?.seek(t));
    this.overview2  = new WaveformOverview(document.getElementById('overview2'), t => this.deck2?.seek(t));

    this.deck1.onEnded = () => this._onDeckEnded(1);
    this.deck2.onEnded = () => this._onDeckEnded(2);

    this._startRAF();
    this.initialized = true;
  }

  // ── File loading ──────────────────────────────────────────────

  async loadFile(deckNum, file) {
    this._init();
    this._cancelLoad(deckNum);
    const cancelled = { value: false };
    this[`_loadCancel${deckNum}`] = cancelled;

    // Reset deck state
    this.stopDeck(deckNum);
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (deck) { deck.loop = false; deck.loopIn = 0; }
    this.emit('mixxs:loopstate', { deckNum, active: false });

    this.emit('mixxs:loadprogress', { deckNum, label: 'DECODING…', active: true, onCancel: () => {
      cancelled.value = true;
      this.emit('mixxs:loadprogress', { deckNum, active: false });
    }});

    try {
      const buffer = await this.fileLoader.load(file);
      if (cancelled.value) return;

      const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
      const overview = deckNum === 1 ? this.overview1 : this.overview2;
      deck.load(buffer);
      deck.setPlaybackRate(1.0);
      this.emit('mixxs:speedupdate', { deckNum, rate: 1.0 });

      waveform.load(buffer);
      const otherWaveform = deckNum === 1 ? this.waveform2 : this.waveform1;
      const otherSec = otherWaveform?.getVisibleSec();
      if (otherSec != null) waveform.setVisibleSec(otherSec);
      overview.load(buffer);

      this.emit('mixxs:bpmupdate',  { deckNum, bpm: '', currentBpm: '' });
      this.emit('mixxs:timeupdate', { deckNum, current: 0, duration: deck.getRealDuration() });
      this.emit('mixxs:loadend',    { deckNum, filename: file.name });

      this.emit('mixxs:loadprogress', { deckNum, label: 'ANALYZING…', active: true });
      this.analyzeDeck(deckNum).then(() => {
        if (!cancelled.value) this.emit('mixxs:loadprogress', { deckNum, active: false });
      }).catch(() => {
        if (!cancelled.value) this.emit('mixxs:loadprogress', { deckNum, active: false });
      });
    } catch (err) {
      if (!cancelled.value) {
        this.emit('mixxs:loadprogress', { deckNum, active: false });
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
    if (!deck?.buffer) return;
    if (deck.isPlaying) {
      deck.pause();
    } else {
      deck.play();
    }
    this.emit('mixxs:playstate', { deckNum, isPlaying: deck.isPlaying });
  }

  stopDeck(deckNum) {
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (!deck) return;
    deck.stop();
    this.emit('mixxs:playstate', { deckNum, isPlaying: false });
  }

  // ── CUE ───────────────────────────────────────────────────────

  toggleCue(deckNum) {
    const channel = deckNum === 1 ? this.channel1 : this.channel2;
    if (!channel) { this._init(); return; } // init audio context but allow toggle
    const active = !this._cueState[deckNum];
    this._cueState[deckNum] = active;
    channel.setCue(active);
    this.emit('mixxs:cuestate', { deckNum, active });
  }

  // ── Waveform seek ─────────────────────────────────────────────

  seekOnCanvas(deckNum, event) {
    const deck     = deckNum === 1 ? this.deck1     : this.deck2;
    const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
    if (!deck?.buffer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    deck.seek(waveform.getTimeAtX(event.clientX - rect.left, deck.getCurrentTime()));
  }

  // ── Loop ──────────────────────────────────────────────────────

  toggleLoop(deckNum, beats) {
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (!deck?.buffer) return;
    if (deck.loop) {
      deck.stopLoop();
      this.emit('mixxs:loopstate', { deckNum, active: false });
    } else {
      deck.startLoop(beats);
      this.emit('mixxs:loopstate', { deckNum, active: true });
    }
  }

  // ── Click track ───────────────────────────────────────────────

  toggleClick(btn) {
    if (!this.initialized) this._init();
    if (this.clicktrack.enabled) {
      this.clicktrack.disable();
      btn.classList.remove('active');
    } else {
      this.clicktrack.enable();
      btn.classList.add('active');
    }
  }

  // ── Zoom sync ─────────────────────────────────────────────────

  syncZoom(sourceNum) {
    const src  = sourceNum === 1 ? this.waveform1 : this.waveform2;
    const dest = sourceNum === 1 ? this.waveform2 : this.waveform1;
    if (!src || !dest) return;
    const sec = src.getVisibleSec();
    if (sec != null) dest.setVisibleSec(sec);
  }

  // ── BPM analysis ──────────────────────────────────────────────

  async analyzeDeck(deckNum) {
    const deck = deckNum === 1 ? this.deck1 : this.deck2;
    if (!deck?.buffer) return;
    const analyzer = new BeatAnalyzer();
    const result   = await analyzer.analyze(deck.buffer);
    deck.beatGrid  = result;
    deck.bpm       = result.bpm;
    const waveform = deckNum === 1 ? this.waveform1 : this.waveform2;
    const overview = deckNum === 1 ? this.overview1 : this.overview2;
    waveform.setBeatGrid(result);
    overview.setBeatGrid(result);
    this.emit('mixxs:bpmupdate', {
      deckNum,
      bpm:        result.bpm.toFixed(1),
      currentBpm: (result.bpm * 1.0).toFixed(1), // speed is 1.0 at load time
    });
    return result;
  }

  // ── BPM sync ──────────────────────────────────────────────────

  sync(deckNum) {
    const thisDeck  = deckNum === 1 ? this.deck1 : this.deck2;
    const otherDeck = deckNum === 1 ? this.deck2 : this.deck1;
    if (!thisDeck || !otherDeck?.buffer) return;

    const thisBpm  = thisDeck.beatGrid?.bpm  ?? thisDeck.bpm;
    const otherBpm = (otherDeck.beatGrid?.bpm ?? otherDeck.bpm) * otherDeck.playbackRate;
    if (!thisBpm || !otherBpm) return;

    const rate = otherBpm / thisBpm;
    thisDeck.setPlaybackRate(rate);
    this.emit('mixxs:speedupdate', { deckNum, rate });
    if (thisDeck.bpm)
      this.emit('mixxs:bpmupdate', {
        deckNum,
        bpm:        thisDeck.bpm.toFixed(1),
        currentBpm: (thisDeck.bpm * rate).toFixed(1),
      });
  }

  // ── Export ────────────────────────────────────────────────────

  async exportMix() {
    if (!this.initialized) return;
    this.emit('mixxs:exportstate', { busy: true });
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
      this.emit('mixxs:exportstate', { busy: false });
    }
  }

  // ── Private ───────────────────────────────────────────────────

  _onDeckEnded(deckNum) {
    this.emit('mixxs:playstate', { deckNum, isPlaying: false });
  }

  _startRAF() {
    const loop = () => {
      if (this.clicktrack) {
        const masterDeck = this.deck1?.isPlaying ? this.deck1 : this.deck2;
        this.clicktrack.tick(masterDeck);
      }
      [1, 2].forEach(n => {
        const deck     = this[`deck${n}`];
        const waveform = this[`waveform${n}`];
        const overview = this[`overview${n}`];
        if (!deck?.buffer) return;
        deck.checkLoop();
        const t       = deck.getCurrentTime();
        const beatDur = deck.beatGrid ? 60 / deck.beatGrid.bpm : 60 / deck.bpm;
        const loopOut = deck.loopIn + deck.loopBeats * beatDur;
        waveform.setLoop(deck.loop, deck.loopIn, loopOut);
        overview.setLoop(deck.loop, deck.loopIn, loopOut);
        waveform.draw(t, deck.isPlaying);
        overview.draw(t);
        this.emit('mixxs:timeupdate', {
          deckNum: n,
          current:  deck.getRealCurrentTime(),
          duration: deck.getRealDuration(),
        });
      });
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
}
