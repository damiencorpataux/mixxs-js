// ═══════════════════════════════════════════════════════════════
//  Exporter  —  OfflineAudioContext mixdown → WAV file download
//
//  Bakes in the current gain, pan, crossfader, and master volume
//  state from both decks at the moment of export.
// ═══════════════════════════════════════════════════════════════
class Exporter {
  async export(deck1, deck2, channel1, channel2, crossfaderValue, masterVolume) {
    const buf1 = deck1.buffer;
    const buf2 = deck2.buffer;
    if (!buf1 && !buf2) throw new Error('No tracks loaded');

    const sampleRate = (buf1 || buf2).sampleRate;
    const duration   = Math.max(buf1?.duration || 0, buf2?.duration || 0);
    const offCtx     = new OfflineAudioContext(
      2,
      Math.ceil(sampleRate * duration),
      sampleRate
    );

    const masterGain = offCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(offCtx.destination);

    const cfAngle = crossfaderValue * Math.PI / 2;

    const addTrack = (buf, playbackRate, faderVol, panVal, cfGainVal, offset) => {
      if (!buf) return;
      const src = offCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = playbackRate;
      const gain = offCtx.createGain();
      gain.gain.value = faderVol * cfGainVal;
      const pan = offCtx.createStereoPanner();
      pan.pan.value = panVal;
      src.connect(gain);
      gain.connect(pan);
      pan.connect(masterGain);
      src.start(0, offset);
    };

    addTrack(
      buf1, deck1.playbackRate,
      channel1.fader.gain.value,
      channel1.panner.pan.value,
      Math.cos(cfAngle),
      deck1.startOffset
    );
    addTrack(
      buf2, deck2.playbackRate,
      channel2.fader.gain.value,
      channel2.panner.pan.value,
      Math.sin(cfAngle),
      deck2.startOffset
    );

    const rendered = await offCtx.startRendering();
    this._downloadWAV(rendered);
  }

  // ── Private ──────────────────────────────────────────────────

  _downloadWAV(audioBuffer) {
    const numCh      = audioBuffer.numberOfChannels;
    const length     = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const bps        = 16;
    const blockAlign = numCh * (bps / 8);
    const dataSize   = length * blockAlign;

    const ab   = new ArrayBuffer(44 + dataSize);
    const view = new DataView(ab);

    const ws = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    ws(0,  'RIFF'); view.setUint32(4,  36 + dataSize,        true);
    ws(8,  'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16,                                     true); // chunk size
    view.setUint16(20, 1,                                      true); // PCM
    view.setUint16(22, numCh,                                  true);
    view.setUint32(24, sampleRate,                             true);
    view.setUint32(28, sampleRate * blockAlign,                true); // byte rate
    view.setUint16(32, blockAlign,                             true);
    view.setUint16(34, bps,                                    true);
    ws(36, 'data'); view.setUint32(40, dataSize,               true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }

    const blob = new Blob([ab], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'djmix-export.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}
