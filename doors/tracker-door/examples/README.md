# TrackerDoor Example Songs

This directory contains example songs demonstrating TrackerDoor features.

## Loading Songs

To load these example songs in TrackerDoor:

1. Open the tracker in the browser BBS.
2. Press `L` (Load) from the main menu or press `Ctrl+L` in the pattern view.
3. When prompted to pick a file, enter the path to one of these example JSON files, e.g.:
   - `examples/demo-showcase.json`
   - `examples/chiptune-melody.json`
4. The song will load into the current session.

To save the current song, use the Export/Save flow in the tracker and provide a filename (you can also save into the `examples/` folder if you want a new preset there).

## Example Files

### chiptune-melody.json
A simple 4-channel chiptune melody demonstrating:
- Basic pattern structure
- Square lead, saw bass, and noise percussion
- Pattern sequencing and looping
- Volume levels

**Instruments Used:**
- Square Lead (bright melody)
- Saw Bass (filtered bassline)
- Hihat (noise percussion)
- Kick Drum (sine bass drum)

**BPM:** 140
**Channels:** 4
**Patterns:** 3

### demo-showcase.json
A comprehensive 8-channel demo showing advanced features:
- Effect chains (reverb, chorus, distortion)
- Multiple instrument types (synth, FM, noise)
- Complex pattern arrangements
- Arpeggios and melodic variations

**Instruments Used:**
- Square Lead
- Saw Bass with lowpass filter
- Sine Pad with reverb
- PWM Synth with chorus
- Noise Drum
- FM Bell with reverb
- Distorted Sawtooth Lead

**BPM:** 150
**Channels:** 8
**Patterns:** 4

## Creating Your Own Songs

Songs are stored in JSON format with the following structure:

```json
{
  "title": "Song Name",
  "artist": "Artist Name",
  "bpm": 140,
  "ticksPerRow": 6,
  "channels": 4,
  "sequence": [0, 1, 2],
  "patterns": [...],
  "instruments": [...]
}
```

### Pattern Data Format

Patterns store notes using `"row:channel"` keys:

```json
{
  "0:0": { "note": "C-4", "instrument": 1, "volume": 200 }
}
```

- **note**: Format is `NOTE-OCTAVE` (e.g., `C-4`, `D#5`, `---` for note off, `...` for empty)
- **instrument**: 1-based instrument number
- **volume**: 0-255 (255 = max)

### Available Instruments

TrackerDoor includes 8 default instruments:
1. Square Lead - Classic chiptune lead
2. Saw Bass - Filtered bass
3. Sine Pad - Smooth pad with reverb
4. Triangle Arp - Arpeggio synth
5. PWM Synth - Pulse width modulation with chorus
6. Noise Drum - Percussion
7. FM Bell - FM synthesis bell
8. Distorted Lead - Aggressive lead with distortion

## Tips

- Use lower octaves (2-3) for bass (instrument 2)
- Kick drums work well at C-2 or D-2 (instrument 6)
- Hihats at high frequencies with noise (instrument 6)
- FM bells sound great for melodies (instrument 7)
- Layer multiple channels for richer sound
- Experiment with volume columns for dynamics
- Keep BPM between 120-180 for most electronic music

## Pattern Editor Shortcuts

- **Arrow keys**: Navigate
- **Piano keys** (A-K): Enter notes
- **0-9**: Set instrument
- **Space**: Insert empty row
- **Backspace**: Delete note
- **+/-**: Change octave
- **F5**: Play from cursor
- **F8**: Stop playback

Enjoy making music with TrackerDoor! 🎵
