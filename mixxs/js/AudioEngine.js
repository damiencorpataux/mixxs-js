// ═══════════════════════════════════════════════════════════════
//  AudioEngine  —  manages two AudioContexts + device routing
// ═══════════════════════════════════════════════════════════════
class AudioEngine {
  constructor() {
    this.masterContext = null;
    this.cueContext    = null;
    this.masterGain    = null;
  }

  init() {
    if (this.masterContext) return;
    this.masterContext = new AudioContext();
    this.cueContext    = new AudioContext();
    this.masterGain    = this.masterContext.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.masterContext.destination);
  }

  async enumerateOutputs() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) { /* output list still available in Chrome without mic grant */ }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audiooutput');
  }

  async setMasterDevice(deviceId) {
    if (this.masterContext?.setSinkId) {
      await this.masterContext.setSinkId(deviceId || '');
    }
  }

  async setCueDevice(deviceId) {
    if (this.cueContext?.setSinkId) {
      await this.cueContext.setSinkId(deviceId || '');
    }
  }

  resume() {
    this.masterContext?.resume();
    this.cueContext?.resume();
  }
}
