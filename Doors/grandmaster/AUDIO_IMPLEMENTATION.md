# GRANDMASTER Audio Implementation

## Overview

Complete audio system using authentic TGM3 sound samples with dual playback:
1. **Primary**: WAV file playback via Socket.IO events (browser)
2. **Fallback**: Tone.js synthesized approximations (Node.js testing)

## TGM3 Sound Mapping

All 19 sound effects mapped from authentic TGM3 arcade samples:

| Game Event | TGM3 Source | File | Trigger Location |
|------------|-------------|------|------------------|
| **move** | SEB_mino1.wav | `move.wav` | game-screen.ts:369,375,393 |
| **rotate** | SEB_prerotate.wav | `rotate.wav` | game-screen.ts:381,387 |
| **lock** | SEB_fixa.wav | `lock.wav` | game-screen.ts:241 |
| **hard_drop** | SEB_fall.wav | `hard_drop.wav` | game-screen.ts:399 |
| **hold** | SEB_hold.wav | `hold.wav` | game-screen.ts:404 |
| **line_clear** | SEB_disappear.wav | `line_clear.wav` | game-screen.ts:180 |
| **tetris** | SEP_tetris.wav | `tetris.wav` | game-screen.ts:163,174,241 |
| **level_up** | SEP_levelchange.wav | `level_up.wav` | game-screen.ts:147 |
| **grade_up** | SEP_lankup.wav | `grade_up.wav` | game-screen.ts:156,242 |
| **section_cool** | SEP_cool.wav | `section_cool.wav` | game-screen.ts:252 |
| **section_regret** | SEP_siren.wav | `section_regret.wav` | game-screen.ts:257 |
| **game_over** | SEP_gameover.wav | `game_over.wav` | game-screen.ts:1000 |
| **ready** | SEP_ready.wav | `ready.wav` | versus-screen.ts:237 |
| **go** | SEP_go.wav | `go.wav` | versus-screen.ts:246 |
| **countdown** | SEP_timecount.wav | `countdown.wav` | versus-screen.ts:248 |
| **menu_select** | SEI_name_select.wav | `menu_select.wav` | (UI events) |
| **error** | SEI_data_error.wav | `error.wav` | (Error handlers) |
| **garbage** | SEP_Intrusion.wav | `garbage.wav` | versus-screen.ts:147 |
| **attack** | SEP_atack.wav | `attack.wav` | versus-screen.ts:153 |

## Audio System Architecture

### SoundEngine (audio/sounds.ts)

**Dual Playback System:**

```typescript
playSfx(effect: SoundEffect): void {
  // 1. Emit socket event for browser WAV playback
  this.session.socket.emit('audio:sfx', {
    effect,
    volume: this.sfxVolume,
    file: `/doors/grandmaster/sounds/${effect}.wav`
  });

  // 2. Play tone.js synthesis as fallback
  this.playSynthesizedSfx(effect);
}
```

**Tone.js Synthesizers:**
- `Synth` - Square wave for melodic sounds (move, rotate, tetris)
- `NoiseSynth` - White noise for percussive sounds (lock, garbage)

**Volume Control:**
- SFX Volume: 0.0 - 1.0 (default: 1.0)
- Music Volume: 0.0 - 1.0 (default: 0.8)
- Mute toggle available

## Game Event Triggers

### Movement & Placement (game-screen.ts)

**Move** - Quick chirp (C6, 30ms)
```typescript
// Triggered on: Left/Right DAS movement
this.sounds.playSfx('move');
```

**Rotate** - Higher blip (E6, 50ms)
```typescript
// Triggered on: CW/CCW rotation
this.sounds.playSfx('rotate');
```

**Lock** - Solid thunk (white noise, 50ms)
```typescript
// Triggered on: Piece locks to board
private triggerLockFlash(): void {
  this.animations.lockGlow(cells, color);
  this.sounds.playSfx('lock');
}
```

**Hard Drop** - Deep thud (C3, 100ms)
```typescript
// Triggered on: Instant drop to bottom
this.sounds.playSfx('hard_drop');
```

**Hold** - Soft whoosh (white noise, 80ms)
```typescript
// Triggered on: Hold piece swap
this.sounds.playSfx('hold');
```

### Scoring & Progression (game-screen.ts)

**Line Clear** - Rising tone (G5→C6, 150ms)
```typescript
// Triggered on: 1-3 line clears
if (linesCleared >= 1) {
  this.sounds.playSfx('line_clear');
}
```

**Tetris** - Triumphant chord (C5→E5→G5→C6, 350ms)
```typescript
// Triggered on: 4-line clear, T-Spin, high combos
if (linesCleared === 4) {
  this.sounds.playSfx('tetris');
}
```

**Level Up** - Ascending arpeggio (C5→E5→G5, 240ms)
```typescript
// Triggered on: Level increase
if (gameState.level > this.lastLevel) {
  this.sounds.playSfx('level_up');
}
```

**Grade Up** - Epic fanfare (C5→G5→C6, 650ms)
```typescript
// Triggered on: Grade promotion (9→8→7...→S1→GM)
if (gameState.grade !== this.lastGrade) {
  this.sounds.playSfx('grade_up');
}
```

**Section Cool** - Success chime (G5→C6, 280ms)
```typescript
// Triggered on: Fast section completion (<50s)
if (timeDelta < coolThreshold) {
  this.sounds.playSfx('section_cool');
}
```

**Section Regret** - Warning siren (F5→D5, 200ms)
```typescript
// Triggered on: Slow section completion (>65s)
if (timeDelta > regretThreshold) {
  this.sounds.playSfx('section_regret');
}
```

### Game State (game-screen.ts, versus-screen.ts)

**Game Over** - Descending failure (C5→G4→C4, 900ms)
```typescript
// Triggered on: Top out / game end
this.sounds.playSfx('game_over');
```

**Ready** - Anticipation tone (E5, 200ms)
```typescript
// Triggered on: Countdown start (multiplayer)
this.sounds.playSfx('ready');
```

**Go** - Start tone (C6, 300ms)
```typescript
// Triggered on: Game start (multiplayer)
if (text === 'GO!') {
  this.sounds.playSfx('go');
}
```

**Countdown** - Tick (G5, 50ms)
```typescript
// Triggered on: Each countdown number (3, 2, 1)
this.sounds.playSfx('countdown');
```

### Multiplayer (versus-screen.ts)

**Garbage** - Incoming warning (white noise, 100ms)
```typescript
// Triggered on: Incoming attack
this.attackManager.onGarbageReceivedCallback((lines, sender) => {
  this.sounds.playSfx('garbage');
});
```

**Attack** - Outgoing blast (G5→C6, 140ms)
```typescript
// Triggered on: Sending attack to opponents
this.attackManager.onAttackSentCallback((lines, type) => {
  this.sounds.playSfx('attack');
});
```

### UI Events

**Menu Select** - UI blip (C5, 50ms)
```typescript
// Usage: Menu item selection, button clicks
this.sounds.playSfx('menu_select');
```

**Error** - Error buzz (F4→E4, 200ms)
```typescript
// Usage: Invalid actions, error states
this.sounds.playSfx('error');
```

## Tone.js Synthesis Details

Each sound effect has a carefully crafted tone.js approximation:

### Melodic Sounds (Synth)
- **Move**: C6, 30ms attack/release, 30% volume
- **Rotate**: E6, 50ms attack/release, 40% volume
- **Hard Drop**: C3, 100ms attack/release, 60% volume
- **Tetris**: C5→E5→G5→C6 chord progression, 350ms total
- **Level Up**: C5→E5→G5 arpeggio, 240ms total
- **Grade Up**: C5→G5→C6 fanfare, 650ms total

### Percussive Sounds (NoiseSynth)
- **Lock**: 50ms white noise burst, 50% volume
- **Hold**: 80ms white noise, 40% volume
- **Garbage**: 100ms white noise, 60% volume

### Envelope Settings
- **Attack**: 5ms (instant onset)
- **Decay**: 100ms (natural fade)
- **Sustain**: 0 (no sustained note)
- **Release**: 50-100ms (smooth tail)

## Socket.IO Events

### SFX Playback
```typescript
socket.emit('audio:sfx', {
  effect: 'tetris',
  volume: 0.8,
  file: '/api/doors/grandmaster/assets/sounds/tetris.wav'
});
```

### Music Playback
```typescript
socket.emit('audio:music', {
  track: 'master',
  loop: true,
  volume: 0.8,
  file: '/api/doors/grandmaster/assets/music/master.mod'
});
```

### Music Control
```typescript
socket.emit('audio:music:stop');
socket.emit('audio:music:volume', { volume: 0.5 });
```

## Asset Structure

```
sdk/doors/grandmaster/
├── assets/
│   └── sounds/              # TGM3 WAV files (2.5 MB total)
│       ├── move.wav         (63 KB)
│       ├── rotate.wav       (95 KB)
│       ├── lock.wav         (21 KB)
│       ├── hard_drop.wav    (50 KB)
│       ├── hold.wav         (92 KB)
│       ├── line_clear.wav   (69 KB)
│       ├── tetris.wav       (380 KB)
│       ├── level_up.wav     (174 KB)
│       ├── grade_up.wav     (152 KB)
│       ├── section_cool.wav (131 KB)
│       ├── section_regret.wav (60 KB)
│       ├── game_over.wav    (558 KB)
│       ├── ready.wav        (191 KB)
│       ├── go.wav           (190 KB)
│       ├── countdown.wav    (53 KB)
│       ├── menu_select.wav  (7.8 KB)
│       ├── error.wav        (42 KB)
│       ├── garbage.wav      (118 KB)
│       └── attack.wav       (140 KB)
└── audio/
    └── sounds.ts            # SoundEngine implementation
```

## Frontend Integration

The BBS frontend needs to handle these socket events:

```typescript
// Listen for audio events
socket.on('audio:sfx', ({ effect, volume, file }) => {
  const audio = new Audio(file);
  audio.volume = volume;
  audio.play().catch(err => console.log('Audio playback failed:', err));
});

socket.on('audio:music', ({ track, loop, volume, file }) => {
  // Load and play MOD/music file with TrackerEngine
});
```

## Testing

### Node.js (Tone.js synthesis)
```bash
cd sdk/doors/grandmaster
npm run build
# Tone.js synthesizers will be used
```

### Browser (WAV playback)
```bash
# Start BBS servers
./dev/scripts/start-servers.sh

# Navigate to http://localhost:3001
# Run GMASTER command
# Socket.IO events will trigger WAV playback
```

## Volume Recommendations

| Context | SFX Volume | Music Volume |
|---------|------------|--------------|
| Gameplay | 1.0 | 0.6 |
| Lobby | 0.7 | 0.8 |
| Menu | 0.5 | 0.7 |
| Testing | 0.3 | 0.0 |

## Performance

- **WAV Files**: 2.5 MB total, cached by browser
- **Tone.js**: ~1ms synthesis overhead per sound
- **Network**: 1-2 KB per sound event (socket message)
- **Memory**: ~10 MB for all loaded WAV files

## Future Enhancements

1. **Music Tracks**: Add TGM3 MOD/XM music files
2. **Voice Samples**: "Excellent!", "Cool!", "Regret!"
3. **Combo Voices**: "Double!", "Triple!", "TETRIS!"
4. **Dynamic Mixing**: Auto-duck music during important sounds
5. **Positional Audio**: Stereo panning for multiplayer attacks
6. **Audio Visualizer**: Real-time waveform display

## Credits

Sound samples extracted from Tetris: The Grand Master 3 - Terror-Instinct (Arika, 2005)
