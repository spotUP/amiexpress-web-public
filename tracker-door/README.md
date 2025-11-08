# 🎵 TrackerDoor - BBS Music Tracker

**TrackerDoor** is a professional music tracker BBS door inspired by Renoise, Protracker, and FastTracker II. Create chiptunes, demos, and game music directly on your BBS with a full-featured ANSI/ASCII interface!

## 🌟 Features

### Tracker Interface
- **Pattern Editor:** Classic tracker grid (64 rows, 16 channels)
- **Note Entry:** Piano keyboard note input with octave control
- **Real-time Playback:** Instant audio feedback
- **Pattern Navigation:** Arrow keys, page up/down, home/end
- **Multi-channel:** Up to 16 simultaneous audio channels

### Audio Engine (Tone.js)
- **Soft Synths:** Multiple synthesis types (FM, AM, subtractive, wavetable)
- **Sample Playback:** Load and play audio samples
- **Effects Chain:** Per-channel effect routing
- **Master Effects:** Global reverb, delay, EQ, compressor
- **Real-time DSP:** Low-latency audio processing

### Instruments & Samples
- **Instrument Editor:** ADSR envelopes, filter cutoff, resonance
- **Synth Presets:** 50+ built-in sounds (bass, lead, pad, drum, fx)
- **Sample Management:** Import WAV/MP3, trim, loop points
- **Velocity Layers:** Dynamic sample switching
- **Instrument Library:** Save/load custom instruments

### Effects (Per-Channel & Master)
- **Time-based:** Delay, Reverb, Echo, Chorus, Flanger
- **Dynamics:** Compressor, Limiter, Gate
- **Filters:** Low-pass, High-pass, Band-pass, Notch
- **Modulation:** Tremolo, Vibrato, Phaser, Ring Mod
- **Distortion:** Overdrive, Fuzz, Bitcrusher
- **Spatial:** Panner, Stereo Width

### Song Arrangement
- **Pattern Sequencer:** Arrange patterns into songs
- **Pattern Cloning:** Duplicate and modify patterns
- **Tempo/BPM Control:** 40-300 BPM with swing
- **Time Signatures:** 4/4, 3/4, 6/8, 7/8, custom
- **Loop Points:** Set song loop regions

### Module Export
- **JSON Format:** Human-readable module format
- **Binary Export:** Compact .trkmod format
- **Game Integration:** Direct import into Door SDK games
- **Metadata:** Title, artist, comments, copyright

### AI-Assisted Composition (Scribbletune)
- **Melody Generation:** AI-suggested melodies
- **Chord Progressions:** Auto-generate chord sequences
- **Rhythm Patterns:** Drum pattern suggestions
- **Variation Generator:** Create pattern variations

## 🎹 ANSI Interface

### Pattern Editor View
```
╔════════════════════════════════════════════════════════════════════════════╗
║ TrackerDoor v1.0              BPM: 140  Row: 00/64  Pat: 01/08  Ch: 01/16 ║
╠════════════════════════════════════════════════════════════════════════════╣
║    ROW │ CH01     │ CH02     │ CH03     │ CH04     │ CH05     │ CH06     ║
╠════════╪══════════╪══════════╪══════════╪══════════╪══════════╪══════════╣
║ ►  00  │ C-4 01 64│ --- -- --│ E-4 02 80│ --- -- --│ G-4 03 64│ --- -- --║
║    01  │ ... .. ..│ D-4 01 64│ ... .. ..│ --- -- --│ ... .. ..│ --- -- --║
║    02  │ E-4 01 64│ ... .. ..│ G-4 02 80│ C-5 04 FF│ B-4 03 64│ --- -- --║
║    03  │ ... .. ..│ ... .. ..│ ... .. ..│ ... .. ..│ ... .. ..│ --- -- --║
║    04  │ G-4 01 80│ F-4 01 64│ --- -- --│ ... .. ..│ D-5 03 64│ E-4 05 80║
║    05  │ ... .. ..│ ... .. ..│ --- -- --│ --- -- --│ ... .. ..│ ... .. ..║
║    06  │ C-5 01 FF│ A-4 01 64│ C-5 02 80│ E-5 04 FF│ --- -- --│ G-4 05 80║
║    07  │ ... .. ..│ ... .. ..│ ... .. ..│ ... .. ..│ --- -- --│ ... .. ..║
╠════════╧══════════╧══════════╧══════════╧══════════╧══════════╧══════════╣
║ [F1] Help  [F2] Pattern  [F3] Instrument  [F4] Sample  [F5] Effects       ║
║ [F6] Song  [F7] Export   [F8] Settings    [F9] AI      [ESC] Main Menu    ║
╚════════════════════════════════════════════════════════════════════════════╝

Note: C-4 = Note, 01 = Instrument, 64 = Volume (00-FF)
      --- = Note off, ... = Empty cell, ► = Current row
```

### Instrument Editor View
```
╔════════════════════════════════════════════════════════════════════════════╗
║ INSTRUMENT EDITOR                               Instrument 01: "Bass Lead" ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Type: [●] Synth  [ ] Sample                                              ║
║                                                                            ║
║  Oscillator                                                                ║
║  ┌──────────────────────────────────────────────────────────────────────┐ ║
║  │ Waveform: [Sawtooth ▼]         Detune: [0 cents]                     │ ║
║  │ Sub Osc:  [Square   ▼]         Mix:    [████░░░░░░] 40%              │ ║
║  └──────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Filter (Low-pass)                                                         ║
║  ┌──────────────────────────────────────────────────────────────────────┐ ║
║  │ Cutoff:   [██████████] 1200 Hz    Resonance: [█████░░░░░] 50%        │ ║
║  │ Envelope: [████░░░░░░] 40%        Tracking:  [████████░░] 80%        │ ║
║  └──────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Amplitude Envelope                                                        ║
║  ┌──────────────────────────────────────────────────────────────────────┐ ║
║  │     ┌──┐                                                              │ ║
║  │    ╱│  │╲                                                             │ ║
║  │   ╱ │  │ ╲___                                                         │ ║
║  │  ╱  │  │     ╲___                                                     │ ║
║  │ ╱   │  │         ╲___                                                 │ ║
║  │╱────┴──┴─────────────╲___                                             │ ║
║  │ A:50 D:200 S:60% R:500 (ms)                                           │ ║
║  └──────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
║  Effects Chain: [Chorus] → [Delay] → [Reverb]                            ║
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║ [Tab] Next Field  [Enter] Edit  [P] Preview  [S] Save  [ESC] Back        ║
╚════════════════════════════════════════════════════════════════════════════╝
```

## 📦 Installation

```bash
cd tracker-door
npm install
npm run build
```

## 🚀 Usage

### As BBS Door
Configure in your BBS menu pointing to the compiled door.

### Standalone Testing
```bash
npm run dev
```

## 🎮 Keyboard Shortcuts

### Pattern Editor
- **Arrow Keys:** Navigate cells
- **Page Up/Down:** Jump 16 rows
- **Home/End:** First/last row
- **Tab:** Next channel
- **Shift+Tab:** Previous channel
- **Space:** Play/pause from current row
- **Enter:** Play pattern
- **Backspace:** Clear cell
- **Delete:** Delete row
- **Insert:** Insert row

### Note Entry (Piano Keyboard Layout)
```
Octave 4:  2 3   5 6 7   9 0
          Q W E R T Y U I O P
          C# D#  F# G# A#
          C  D  E  F  G  A  B

Octave Controls:
- [<] [-] Lower octave
- [>] [+] Raise octave
- [*] Set volume (00-FF hex)
- [/] Set instrument (01-99)
```

### Global
- **F1:** Help screen
- **F2:** Pattern list
- **F3:** Instrument editor
- **F4:** Sample manager
- **F5:** Effects editor
- **F6:** Song arranger
- **F7:** Export module
- **F8:** Settings
- **F9:** AI assistant
- **F10:** Quit
- **Ctrl+S:** Quick save
- **Ctrl+Z:** Undo
- **Ctrl+Y:** Redo

## 🏗️ Architecture

### Core Modules
```
tracker-door/
├── src/
│   ├── audio/              # Audio engine
│   │   ├── engine.ts       # Tone.js wrapper
│   │   ├── synth.ts        # Synthesizer
│   │   ├── sampler.ts      # Sample player
│   │   ├── effects.ts      # Effect processors
│   │   └── mixer.ts        # Channel mixer
│   ├── ui/                 # ANSI UI components
│   │   ├── pattern-editor.ts
│   │   ├── instrument-editor.ts
│   │   ├── sample-editor.ts
│   │   ├── effects-editor.ts
│   │   ├── song-editor.ts
│   │   └── components/     # Reusable UI widgets
│   ├── data/               # Data structures
│   │   ├── note.ts
│   │   ├── pattern.ts
│   │   ├── instrument.ts
│   │   ├── song.ts
│   │   └── export.ts
│   ├── utils/              # Utilities
│   │   ├── ansi.ts         # ANSI rendering
│   │   ├── input.ts        # Keyboard handling
│   │   ├── file.ts         # File I/O
│   │   └── math.ts         # DSP math
│   └── index.ts            # Main door entry
├── data/                   # Saved songs/presets
├── docs/                   # Documentation
└── package.json
```

## 📊 Module Format (.trkmod)

### JSON Export Example
```json
{
  "version": "1.0",
  "title": "Awesome Chiptune",
  "artist": "SceneCoder",
  "bpm": 140,
  "channels": 8,
  "patterns": [
    {
      "id": 0,
      "rows": 64,
      "data": [
        { "row": 0, "ch": 0, "note": "C-4", "inst": 1, "vol": 0x64 },
        { "row": 0, "ch": 2, "note": "E-4", "inst": 2, "vol": 0x80 }
      ]
    }
  ],
  "instruments": [
    {
      "id": 1,
      "name": "Bass Lead",
      "type": "synth",
      "oscillator": "sawtooth",
      "filter": { "type": "lowpass", "cutoff": 1200, "q": 5 },
      "envelope": { "attack": 0.05, "decay": 0.2, "sustain": 0.6, "release": 0.5 }
    }
  ],
  "sequence": [0, 0, 1, 2, 1, 3]
}
```

## 🎯 Roadmap

### Phase 1: Foundation ✅ (Complete)
- [x] Project structure
- [x] Data models (Note, Pattern, Instrument, Song)
- [x] ANSI rendering engine
- [x] Basic UI framework

### Phase 2: Pattern Editor ✅ (Complete)
- [x] Tracker grid display
- [x] Note entry system
- [x] Pattern navigation
- [x] Playback engine

### Phase 3: Audio Engine ✅ (Complete)
- [x] Tone.js integration
- [x] Synth engine
- [x] Sample playback
- [x] Channel mixer

### Phase 4: Instruments (Current)
- [x] Instrument editor UI
- [x] ADSR envelopes
- [x] Filter controls
- [x] Preset library

### Phase 5: Effects
- [ ] Effect chain UI
- [ ] Built-in effects
- [ ] Per-channel routing
- [ ] Master bus

### Phase 6: Song Structure
- [ ] Pattern sequencer
- [ ] Song arrangement
- [ ] Tempo/time signature
- [ ] Loop regions

### Phase 7: Export & Integration
- [ ] JSON exporter
- [ ] Binary format
- [ ] Game SDK integration
- [ ] Metadata editor

### Phase 8: Polish & AI
- [ ] Scribbletune integration
- [ ] Help system
- [ ] Undo/redo
- [ ] Auto-save

## 🎨 Technical Details

- **Language:** TypeScript
- **SDK:** @amiexpress/bbs-door-sdk
- **Audio:** Tone.js v15+
- **AI:** Scribbletune (optional)
- **Display:** 80x24 ANSI/ASCII
- **Storage:** JSON + Binary formats

## 📚 References

- **Renoise:** https://www.renoise.com/
- **Protracker:** https://github.com/8bitbubsy/pt2-clone
- **FastTracker II:** https://github.com/8bitbubsy/ft2-clone
- **Tone.js:** https://tonejs.github.io/
- **Scribbletune:** https://scribbletune.com/

## 🤝 Credits

Inspired by legendary trackers:
- **Renoise** - Modern tracker DAW
- **Protracker** - Amiga classic
- **FastTracker II** - PC multichannel pioneer
- **Impulse Tracker** - Advanced features
- **MilkyTracker** - Cross-platform tracker

**Greetings to:** All demosceners and chiptune artists! 🎵

---

Made with ❤️ for the demo scene
