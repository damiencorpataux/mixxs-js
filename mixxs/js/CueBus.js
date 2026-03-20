// ═══════════════════════════════════════════════════════════════
//  CueBus  —  bridges masterContext → cueContext via MediaStream
//  Receives pre-fader CUE sends from each ChannelController
// ═══════════════════════════════════════════════════════════════
class CueBus {
  constructor(audioEngine) {
    const ctx    = audioEngine.masterContext;
    const cueCtx = audioEngine.cueContext;

    this.input      = ctx.createGain();
    this.streamDest = ctx.createMediaStreamDestination();

    // Analyser tap on the CUE bus — used by VU meter (stays in master context)
    this.analyser                      = ctx.createAnalyser();
    this.analyser.fftSize              = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.input.connect(this.analyser);
    this.input.connect(this.streamDest);

    this.streamSrc  = cueCtx.createMediaStreamSource(this.streamDest.stream);
    this.cueGain    = cueCtx.createGain();
    this.cueGain.gain.value = 0.9;
    this.streamSrc.connect(this.cueGain);
    this.cueGain.connect(cueCtx.destination);
  }

  setVolume(v) {
    this.cueGain.gain.value = v;
  }
}
