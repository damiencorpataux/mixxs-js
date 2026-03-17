# DJMIX

A browser-based DJ mixer. No install, no server, no dependencies — just open `index.html` and play.

![Chrome](https://img.shields.io/badge/Chrome-110+-orange) ![Edge](https://img.shields.io/badge/Edge-110+-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Two independent decks** — load any local audio file (MP3, WAV, FLAC, OGG…)
- **Waveform visualizer** — click to seek, playhead tracks in real time
- **Per-deck controls** — volume, pan, playback speed
- **BPM sync** — set BPM on each deck, sync tempo with one click
- **Crossfader** — equal-power curve for smooth transitions
- **CUE / headphone monitoring** — pre-listen a deck privately before bringing it in
- **Dual audio output routing** — send master and cue to separate physical devices
- **Export** — render the current mix to a WAV file

---

## Getting Started

```bash
git clone https://github.com/damiencorpataux/mixxs-js.git
cd mixxs-js
```

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

The project is structured around a clear separation of concerns, mirroring the signal flow of a real DJ mixer:

```
FileLoader → AudioBuffer
                ├── WaveformRenderer   (visual)
                └── Deck               (transport + speed)
                        └── ChannelController   (gain, pan, EQ stubs, CUE send)
                                    └── CrossfaderController
                                                └── AudioEngine (master + export)
                                                        └── CueBus (headphone output)
```

| File | Responsibility |
|---|---|
| `AudioEngine.js` | Manages two `AudioContext` instances and device routing |
| `CueBus.js` | MediaStream bridge from master context to cue context |
| `ChannelController.js` | Per-channel gain, pan, EQ nodes, CUE send |
| `CrossfaderController.js` | Equal-power crossfade between two channels |
| `Deck.js` | Transport controls, playback rate, position tracking |
| `WaveformRenderer.js` | Canvas waveform with peak precomputation |
| `FileLoader.js` | File → decoded `AudioBuffer` |
| `Exporter.js` | `OfflineAudioContext` mixdown → WAV download |
| `MixerController.js` | Top-level orchestrator, RAF sync loop |
| `main.js` | DOM event wiring |

---

## Browser Support

| Browser | Playback | Dual output |
|---|---|---|
| Chrome 110+ | ✅ | ✅ |
| Edge 110+ | ✅ | ✅ |
| Firefox | ✅ | ⚠️ partial |
| Safari | ✅ | ❌ |

Note on using multi-device outputs for master and cue: opening `index.html` directly via `file://` won't work because Chrome restricts audio device enumeration on that protocol.

---

## Roadmap

- [ ] 3-band EQ per channel (nodes already stubbed in)
- [ ] Auto BPM detection
- [ ] Beat phase sync
- [ ] 3rd and 4th deck support
- [ ] Loop controls
- [ ] Hot cues

---

## License

MIT
