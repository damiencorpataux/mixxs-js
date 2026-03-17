// ═══════════════════════════════════════════════════════════════
//  BeatAnalyzer  —  BPM detection + beat timestamps from AudioBuffer
//
//  Algorithm:
//    1. Low-pass filter (OfflineAudioContext) to isolate kick energy
//    2. Build amplitude envelope (peak per chunk)
//    3. Find envelope peaks above adaptive threshold
//    4. BPM histogram vote on inter-peak intervals
//    5. Filter peaks to those consistent with detected BPM → beats[]
//
//  Returns: { bpm, offset, beats[] }
//    bpm    — detected tempo (float, full precision)
//    offset — time of first beat in seconds
//    beats  — array of actual detected beat timestamps in seconds
// ═══════════════════════════════════════════════════════════════
class BeatAnalyzer {
  constructor(options = {}) {
    this.bpmMin       = options.bpmMin       ?? 70;
    this.bpmMax       = options.bpmMax       ?? 180;
    this.lowPassFreq  = options.lowPassFreq  ?? 150;
    this.chunkSize    = options.chunkSize    ?? 512;
    this.peakThresh   = options.peakThresh   ?? 0.9;
    this.bpmTolerance = options.bpmTolerance ?? 2;
  }

  // ── Public ────────────────────────────────────────────────────

  async analyze(audioBuffer) {
    try {
      const filtered = await this._lowPassRender(audioBuffer);
      const envelope = this._buildEnvelope(filtered);
      const peaks    = this._findPeaks(envelope, audioBuffer.sampleRate);
      const bpm      = this._detectBpm(peaks);
      const offset   = peaks.length > 0 ? peaks[0] : 0;
      const beats    = this._filterBeats(peaks, bpm, offset);
      return { bpm, offset, beats };
    } catch (err) {
      console.warn('BeatAnalyzer: detection failed, using defaults.', err);
      return { bpm: 120, offset: 0, beats: [] };
    }
  }

  // ── Phase math (used by Deck / MixerController) ───────────────

  static nearestBeatIndex(currentTime, bpm, offset) {
    return Math.round((currentTime - offset) / (60 / bpm));
  }

  static beatIndexToTime(beatIndex, bpm, offset, duration) {
    return Math.max(0, Math.min(offset + beatIndex * (60 / bpm), duration));
  }

  static phaseSnapTime(masterCurrentTime, masterBpm, masterOffset,
                        slaveBpm, slaveOffset, slaveDuration) {
    const idx = BeatAnalyzer.nearestBeatIndex(masterCurrentTime, masterBpm, masterOffset);
    return BeatAnalyzer.beatIndexToTime(idx, slaveBpm, slaveOffset, slaveDuration);
  }

  // ── Private ───────────────────────────────────────────────────

  async _lowPassRender(audioBuffer) {
    const offCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const src    = offCtx.createBufferSource();
    src.buffer   = audioBuffer;
    const lpf    = offCtx.createBiquadFilter();
    lpf.type     = 'lowpass';
    lpf.frequency.value = this.lowPassFreq;
    src.connect(lpf);
    lpf.connect(offCtx.destination);
    src.start(0);
    return offCtx.startRendering();
  }

  _buildEnvelope(audioBuffer) {
    const data      = audioBuffer.getChannelData(0);
    const numChunks = Math.floor(data.length / this.chunkSize);
    const envelope  = new Float32Array(numChunks);
    for (let i = 0; i < numChunks; i++) {
      let peak = 0;
      const base = i * this.chunkSize;
      for (let j = 0; j < this.chunkSize; j++) {
        const v = Math.abs(data[base + j]);
        if (v > peak) peak = v;
      }
      envelope[i] = peak;
    }
    return envelope;
  }

  _findPeaks(envelope, sampleRate) {
    const chunkDuration = this.chunkSize / sampleRate;
    const windowSize    = Math.ceil(1.0 / chunkDuration);
    const peaks         = [];
    for (let i = 0; i < envelope.length; i++) {
      let localMax = 0;
      const start = Math.max(0, i - windowSize);
      for (let k = start; k <= i; k++) {
        if (envelope[k] > localMax) localMax = envelope[k];
      }
      if (envelope[i] > localMax * this.peakThresh) {
        const t = i * chunkDuration;
        if (peaks.length === 0 || t - peaks[peaks.length - 1] > 0.25) {
          peaks.push(t);
        }
      }
    }
    return peaks;
  }

  _detectBpm(peaks) {
    if (peaks.length < 2) return 120;
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      let bpm = 60 / (peaks[i] - peaks[i - 1]);
      while (bpm < this.bpmMin) bpm *= 2;
      while (bpm > this.bpmMax) bpm /= 2;
      if (bpm >= this.bpmMin && bpm <= this.bpmMax) intervals.push(bpm);
    }
    if (intervals.length === 0) return 120;
    // Histogram vote
    const buckets = {};
    for (const bpm of intervals) {
      const b = Math.round(bpm / this.bpmTolerance) * this.bpmTolerance;
      buckets[b] = (buckets[b] || 0) + 1;
    }
    let roughBpm = 120, bestCount = 0;
    for (const [bpm, count] of Object.entries(buckets)) {
      if (count > bestCount) { bestCount = count; roughBpm = parseFloat(bpm); }
    }
    // Refine: mean of intervals within ±5% of rough BPM
    const matching = intervals.filter(b => Math.abs(b - roughBpm) <= roughBpm * 0.05);
    if (matching.length === 0) return roughBpm;
    return matching.reduce((s, b) => s + b, 0) / matching.length;
  }

  _filterBeats(peaks, bpm, offset) {
    if (peaks.length === 0) return [];
    const beatDuration = 60 / bpm;
    const tolerance    = beatDuration * 0.30;
    const numBeats     = Math.ceil((peaks[peaks.length - 1] - offset) / beatDuration) + 1;
    const beats        = [];
    for (let n = 0; n < numBeats; n++) {
      const expected = offset + n * beatDuration;
      let closest = null, closestDist = Infinity;
      for (const t of peaks) {
        const dist = Math.abs(t - expected);
        if (dist < closestDist) { closestDist = dist; closest = t; }
        if (t > expected + tolerance) break;
      }
      // Use real peak if close enough, otherwise fall back to extrapolated position
      const beat = (closest !== null && closestDist <= tolerance) ? closest : expected;
      if (beats.length === 0 || beats[beats.length - 1] !== beat) {
        beats.push(beat);
      }
    }
    return beats;
  }
}
