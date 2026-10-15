# AudioEngine Quick Reference

Fast lookup for AudioEngine APIs. Provides procedural sound synthesis and adaptive music using Tone.js.

**Full sound library reference:** See [SOUND_LIBRARY_REFERENCE.md](./SOUND_LIBRARY_REFERENCE.md) for all 65 sounds with examples.

## Import

```typescript
import { AudioEngine } from '@amiexpress/bbs-door-sdk';
const audio = new AudioEngine();
await audio.init();  // Required before playing sounds
```

## Built-in Sound Effects (65 sounds)

```typescript
// UI sounds
audio.playSound('click');
audio.playSound('error');
audio.playSound('success');
audio.playSound('notification');

// Combat sounds
audio.playSound('sword-swing');
audio.playSound('magic-cast');
audio.playSound('critical-hit');
audio.playSound('explosion');

// Item sounds
audio.playSound('pickup');
audio.playSound('chest-open');
audio.playSound('gold-collect');

// Card/Casino sounds
audio.playSound('card-deal');
audio.playSound('card-flip');
audio.playSound('chips-win');
audio.playSound('jackpot');

// Retro/Chiptune sounds
audio.playSound('blip');
audio.playSound('1up');
audio.playSound('level-up');
audio.playSound('gameover');
```

## Custom Sounds

```typescript
// Play custom synthesized sound
await audio.playCustomSound({
  type: 'sine',           // sine, square, triangle, sawtooth
  frequency: 440,         // Hz
  duration: 0.5,          // seconds
  attack: 0.01,           // Attack time
  decay: 0.1,             // Decay time
  sustain: 0.5,           // Sustain level (0-1)
  release: 0.2,           // Release time
  volume: -6,             // dB (0 = max, negative = quieter)
  pitchSlide: 200,        // Slide to frequency (optional)
  pitchSlideTime: 0.3     // Slide duration (optional)
});
```

## Music Generation

```typescript
// Generate AI-composed music
await audio.generateMusic({
  tempo: 120,             // BPM
  key: 'C',               // Musical key
  scale: 'major',         // major, minor, pentatonic, blues
  measures: 8,            // Length in measures
  style: 'ambient'        // ambient, action, menu, victory
});

// Control playback
audio.playMusic();
audio.pauseMusic();
audio.stopMusic();
```

## Adaptive Music States

```typescript
// Set music state (crossfades between states)
audio.setMusicState('calm');     // Exploration, peaceful
audio.setMusicState('tension');  // Enemy nearby, suspense
audio.setMusicState('combat');   // Active battle
audio.setMusicState('victory');  // Win condition
audio.setMusicState('defeat');   // Loss condition

// Get current state
const state = audio.getMusicState();
```

## Volume Control

```typescript
// Master volume (-60 to 0 dB)
audio.setMasterVolume(-12);
const masterVol = audio.getMasterVolume();

// Sound effects volume
audio.setSfxVolume(-6);

// Music volume
audio.setMusicVolume(-18);

// Mute/unmute
audio.mute();
audio.unmute();
audio.toggleMute();
const isMuted = audio.isMuted();
```

## Sound Categories (65 total)

| Category | Count | Examples |
|----------|-------|----------|
| **UI** | 10 | click, hover, error, success, notification, confirm, cancel |
| **Combat** | 11 | sword-swing, arrow, magic-cast, shield-block, critical-hit, punch |
| **Items** | 8 | pickup, drop, equip, potion-drink, chest-open, gold-collect |
| **Movement** | 7 | footstep, jump, land, dash, teleport, swim, climb |
| **Environment** | 4 | door-open, door-close, switch, alarm |
| **Cards/Casino** | 10 | card-deal, card-flip, chips-bet, chips-win, dice-roll, jackpot |
| **Retro** | 15 | blip, boop, zap, 1up, death, pause, powerup, level-up, countdown |

See [SOUND_LIBRARY_REFERENCE.md](./SOUND_LIBRARY_REFERENCE.md) for complete list with usage examples.

## Wave Types

| Type | Character | Best For |
|------|-----------|----------|
| `sine` | Pure, clean | Beeps, UI sounds |
| `square` | Hollow, retro | 8-bit style, bass |
| `triangle` | Soft, warm | Gentle sounds, pads |
| `sawtooth` | Bright, harsh | Leads, alarms |

## Music Scales

| Scale | Mood | Notes |
|-------|------|-------|
| `major` | Happy, bright | C D E F G A B |
| `minor` | Sad, serious | C D Eb F G Ab Bb |
| `pentatonic` | Universal, safe | C D E G A |
| `blues` | Soulful, jazzy | C Eb F F# G Bb |

## Events

```typescript
audio.on('soundComplete', (soundName) => { });
audio.on('musicStateChange', (oldState, newState) => { });
audio.on('musicLoopComplete', () => { });
audio.on('volumeChange', (type, volume) => { });
```

## Configuration

```typescript
const audio = new AudioEngine({
  masterVolume: -12,
  sfxVolume: -6,
  musicVolume: -18,
  autoInit: false,        // Don't auto-init (manual init required)
  defaultAttack: 0.01,
  defaultRelease: 0.1
});
```

## Example: Game Audio

```typescript
const audio = new AudioEngine();
await audio.init();

// Background music
await audio.generateMusic({
  tempo: 100,
  key: 'A',
  scale: 'minor',
  measures: 16,
  style: 'ambient'
});
audio.setMusicVolume(-20);
audio.playMusic();

// Game events
function onPlayerJump() {
  audio.playSound('jump');
}

function onEnemySpotted() {
  audio.setMusicState('tension');
}

function onCombatStart() {
  audio.setMusicState('combat');
}

function onCollectCoin() {
  audio.playSound('coin');
}

function onPlayerHit() {
  audio.playSound('hit');
}
```

## Cleanup

```typescript
audio.dispose();  // Stop all audio and release resources
```
