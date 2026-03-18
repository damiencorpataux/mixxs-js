# MIXXS

▶️ [Try it online](https://www.mien.ch/mixxs-js/mixxs/)

A browser-based DJ mixer. No install, no server, no dependencies — just open `index.html` and play.

![Chrome](https://img.shields.io/badge/Chrome-110+-orange) ![Edge](https://img.shields.io/badge/Edge-110+-blue) ![License](https://img.shields.io/badge/license-MIT-green)

![App screenshot](docs/mixxs.png)

---

## Features

**Decks**
- Two independent decks — load any local audio file (MP3, WAV, FLAC, OGG…)
- Drag & drop files onto the deck, waveform, or anywhere on the deck surface
- Zoomable waveform (scroll to zoom 0.5×–64×) with centered playhead and beat grid markers
- Full-track overview waveform with moving playhead
- BPM auto-detection — detected tempo displayed read-only per deck
- Playback speed control with current BPM display (editable)
- Momentary ±4% pitch bend buttons (hold to bend, release to restore)
- Beat nudge buttons (◀ ▶) for fine phase alignment
- Loop: set beat count (1 2 4 8 16 32 64), activate snaps to nearest beat, loop region shown on waveform
- SYNC button: matches deck tempo to the other deck's current playing BPM

**Mixer**
- 3-band EQ per channel (High / Mid / Low, ±12 dB)
- Per-channel volume knob (dB)
- Equal-power crossfader
- CUE / headphone pre-listen per channel
- Master volume knob (dB)
- Click track — beat-synced metronome with independent volume

**Routing & Export**
- Dual audio output — send master and cue to separate physical devices
- Export mix to WAV (bakes in current gain, EQ, crossfader state)

---

## Getting Started

```bash
git clone https://github.com/damiencorpataux/mixxs-js.git
cd mixxs-js
```

Then serve it locally — opening `index.html` directly via `file://` won't work because Chrome restricts audio device enumeration on that protocol.

**Node:**
```bash
npx serve mixxs
# → http://localhost:3000
```

**Python** (pre-installed on macOS):
```bash
python3 -m http.server 8080 --directory mixxs
# → http://localhost:8080
```

> No build step, no bundler. Any static file server works.

---

## Dual Output Setup

To route master and cue to separate devices (e.g. speakers + headphones):

1. Connect both audio output devices
2. Click **⚙ DEVICES** in the top-right corner
3. Select a device for **Master Output** and a separate one for **Cue/Headphone Output**
4. Click **Apply**

> Requires Chrome or Edge 110+. Uses the [`setSinkId()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId) Web Audio API.

---

## Architecture

```
FileLoader → AudioBuffer
                ├── WaveformRenderer    (zoomable waveform, beat grid, loop overlay)
                ├── OverviewRenderer    (full-track overview, loop overlay)
                └── Deck                (transport, speed, loop, bend)
                        └── ChannelController   (gain, EQ, CUE send)
                                    └── CrossfaderController
                                                └── AudioEngine (master + export)
                                                        └── CueBus (headphone output)
```

| File | Responsibility |
|---|---|
| `AudioEngine.js` | Two `AudioContext` instances, device routing via `setSinkId()` |
| `CueBus.js` | MediaStream bridge from master context to cue context |
| `ChannelController.js` | Per-channel gain, 3-band EQ, CUE send |
| `CrossfaderController.js` | Equal-power crossfade |
| `Deck.js` | Transport, playback rate, loop, position tracking |
| `BeatAnalyzer.js` | BPM detection + beat timestamp array from `AudioBuffer` |
| `WaveformRenderer.js` | Zoomable canvas waveform, beat markers, loop overlay |
| `OverviewRenderer.js` | Full-track overview waveform, loop overlay |
| `Clicktrack.js` | Beat-synced metronome click via `OscillatorNode` |
| `FileLoader.js` | File → decoded `AudioBuffer` |
| `Exporter.js` | `OfflineAudioContext` mixdown → WAV |
| `MixerController.js` | Top-level orchestrator, RAF loop |
| `main.js` | DOM event wiring, knob drawing |

---

## Browser Support

| Browser | Playback | Dual output |
|---|---|---|
| Chrome 110+ | ✅ | ✅ |
| Edge 110+ | ✅ | ✅ |
| Firefox | ✅ | ⚠️ partial |
| Safari | ✅ | ❌ |

---

## Roadmap

- [ ] 3rd and 4th deck support
- [ ] Hot cues
- [ ] Auto BPM phase sync
- [ ] Beat phase lock (continuous)

---

## License

MIT
