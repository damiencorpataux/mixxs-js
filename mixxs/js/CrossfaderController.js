// ═══════════════════════════════════════════════════════════════
//  CrossfaderController  —  equal-power crossfade between 2 channels
//
//  value 0 = full channel 1
//  value 1 = full channel 2
// ═══════════════════════════════════════════════════════════════
class CrossfaderController {
  constructor(channel1, channel2, masterGain) {
    const ctx = channel1.ctx;
    this.value = 0.5;

    this.cfGain1 = ctx.createGain();
    this.cfGain2 = ctx.createGain();

    channel1.output.connect(this.cfGain1);
    channel2.output.connect(this.cfGain2);
    this.cfGain1.connect(masterGain);
    this.cfGain2.connect(masterGain);

    this.setValue(0.5);
  }

  setValue(v) {
    this.value = v;
    const angle = v * Math.PI / 2;
    this.cfGain1.gain.value = Math.cos(angle);
    this.cfGain2.gain.value = Math.sin(angle);
  }
}
