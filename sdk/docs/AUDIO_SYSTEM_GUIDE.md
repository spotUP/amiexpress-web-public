# Audio System Guide

**Complete guide to implementing audio in SDK doors**

## Overview

The SDK provides a flexible audio framework for adding sound effects and music to your doors. This guide covers how to properly extend and customize audio for your game.

## Sound Effect Types

### Extending SoundEffect Type

When adding new sound effects to your game, you must extend the `SoundEffect` type in your audio module.

**Example from GRANDMASTER** (`audio/sounds.ts`):

```typescript
/**
 * Sound effect types
 */
export type SoundEffect =
  // Core gameplay sounds
  | 'move'
  | 'rotate'
  | 'lock'
  | 'line_clear'
  | 'tetris'
  | 'hold'
  | 'hard_drop'

  // Progression sounds
  | 'level_up'
  | 'grade_up'
  | 'section_cool'
  | 'section_regret'

  // Game state sounds
  | 'game_over'
  | 'ready'
  | 'go'
  | 'countdown'

  // UI & multiplayer sounds (MUST BE ADDED)
  | 'menu_select'   // For menu/lobby interactions
  | 'error'         // For error feedback
  | 'garbage'       // For incoming attacks
  | 'attack';       // For outgoing attacks
```

### ⚠️ Common Mistake: Missing Sound Effects

**Error**: `Argument of type '"menu_select"' is not assignable to parameter of type 'SoundEffect'`

**Cause**: Trying to play a sound effect that hasn't been added to the `SoundEffect` type.

**Solution**: Always add new sound effects to the type definition BEFORE using them:

```typescript
// ✗ WRONG - Using undefined sound effect
this.sounds.playSfx('menu_select');  // ERROR: Not in SoundEffect type

// ✓ CORRECT - Add to type first
export type SoundEffect =
  | 'move'
  | 'rotate'
  | 'menu_select';  // Add here first

// Then use it
this.sounds.playSfx('menu_select');  // ✓ Works
```

## Sound Effect Categories

### Gameplay Sounds
Actions during gameplay:
- `move` - Piece movement (DAS)
- `rotate` - Piece rotation
- `lock` - Piece locks to board
- `hard_drop` - Hard drop (sonic drop)
- `hold` - Hold piece swap
- `soft_drop` - Soft drop tick (optional)

### Line Clear Sounds
Achievements and scoring:
- `line_clear` - Basic line clear (1-3 lines)
- `tetris` - 4-line clear
- `tspin` - T-Spin clear (optional)
- `perfect_clear` - All-clear bonus (optional)

### Progression Sounds
Player advancement:
- `level_up` - Level increase
- `grade_up` - Grade promotion
- `section_cool` - Fast section completion
- `section_regret` - Slow section completion
- `rank_up` - Rank promotion (optional)

### Game State Sounds
Major state changes:
- `ready` - Game ready countdown
- `go` - Game start
- `countdown` - Countdown tick
- `game_over` - Game ended
- `pause` - Game paused (optional)

### UI & Menu Sounds
Interface interactions:
- `menu_select` - Menu item selected
- `menu_move` - Menu cursor moved
- `button_click` - Button clicked
- `error` - Invalid action/error
- `confirm` - Action confirmed
- `cancel` - Action cancelled

### Multiplayer Sounds
Network gameplay:
- `garbage` - Incoming attack/garbage
- `attack` - Outgoing attack sent
- `ko` - Opponent eliminated (optional)
- `warning` - Danger warning (optional)

## SoundEngine Implementation

### Basic SoundEngine Class

```typescript
/**
 * Sound engine for game audio
 */
export class SoundEngine {
  private sfxVolume: number = 1.0;
  private musicVolume: number = 0.8;
  private session: any;

  constructor(session: any) {
    this.session = session;
  }

  /**
   * Play sound effect
   */
  playSfx(effect: SoundEffect): void {
    if (this.sfxVolume === 0) return;

    // BBS implementation - send ANSI beep or audio command
    // In browser: could load and play actual audio file

    console.log(`[SFX] ${effect} (volume: ${this.sfxVolume})`);
  }

  /**
   * Play music track
   */
  playMusic(track: MusicTrack, loop: boolean = true): void {
    if (this.musicVolume === 0) return;

    console.log(`[Music] ${track} (loop: ${loop}, volume: ${this.musicVolume})`);
  }

  /**
   * Stop music
   */
  stopMusic(): void {
    console.log('[Music] Stopped');
  }

  /**
   * Set SFX volume
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set music volume
   */
  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
  }
}
```

### Advanced SoundEngine with Categories

```typescript
export class SoundEngine {
  private categories: Map<string, number> = new Map([
    ['gameplay', 1.0],
    ['ui', 0.8],
    ['multiplayer', 1.0],
    ['progression', 0.9],
  ]);

  playSfx(effect: SoundEffect, category: string = 'gameplay'): void {
    const categoryVolume = this.categories.get(category) ?? 1.0;
    const finalVolume = this.sfxVolume * categoryVolume;

    if (finalVolume === 0) return;

    // Play with adjusted volume
    this.playAudioFile(effect, finalVolume);
  }

  setCategoryVolume(category: string, volume: number): void {
    this.categories.set(category, Math.max(0, Math.min(1, volume)));
  }
}
```

## Usage Patterns

### In Gameplay Code

```typescript
class GameEngine {
  private sounds: SoundEngine;

  move(direction: number): void {
    if (this.canMove(direction)) {
      this.piece.x += direction;
      this.sounds.playSfx('move');  // Play immediately
    }
  }

  rotate(direction: number): void {
    if (this.canRotate(direction)) {
      this.piece.rotation = (this.piece.rotation + direction) % 4;
      this.sounds.playSfx('rotate');
    }
  }

  lockPiece(): void {
    this.placePiece();
    this.sounds.playSfx('lock');

    const linesCleared = this.clearLines();
    if (linesCleared === 4) {
      this.sounds.playSfx('tetris');  // Special sound for tetris
    } else if (linesCleared > 0) {
      this.sounds.playSfx('line_clear');
    }
  }
}
```

### In UI Code

```typescript
class MenuScreen {
  private sounds: SoundEngine;

  private setupMenu(): void {
    this.menu.on('select', (item) => {
      this.sounds.playSfx('menu_select');  // Menu selection sound
      this.handleSelection(item);
    });

    this.menu.on('keypress', (ch, key) => {
      if (key.name === 'up' || key.name === 'down') {
        this.sounds.playSfx('menu_move');  // Cursor movement
      }
    });
  }

  private handleError(message: string): void {
    this.sounds.playSfx('error');  // Error feedback
    this.showErrorMessage(message);
  }
}
```

### In Multiplayer Code

```typescript
class VersusScreen {
  private setupNetworkListeners(): void {
    // Incoming garbage
    this.attackManager.onGarbageReceivedCallback((lines, sender) => {
      this.sounds.playSfx('garbage');  // Danger sound
      this.showAttackFlash('INCOMING', 'red');
    });

    // Outgoing attack
    this.attackManager.onAttackSentCallback((lines, type) => {
      this.sounds.playSfx('attack');  // Success sound
      this.showAttackFlash(`SENT ${lines}`, 'yellow');
    });
  }
}
```

## Music Track Types

```typescript
/**
 * Music track types
 */
export type MusicTrack =
  | 'menu'          // Main menu music
  | 'game_start'    // Game beginning
  | 'gameplay'      // During gameplay
  | 'tension'       // High stakes moment
  | 'boss'          // Final challenge
  | 'victory'       // Win celebration
  | 'defeat'        // Game over
  | 'credits';      // End credits
```

### Music Transitions

```typescript
class GameScreen {
  async run(): Promise<void> {
    // Start with game music
    this.sounds.playMusic('game_start');

    // Transition to main gameplay music
    setTimeout(() => {
      this.sounds.playMusic('gameplay', true);
    }, 5000);

    // Speed up music at high levels
    if (this.level >= 500) {
      this.sounds.playMusic('tension', true);
    }
  }
}
```

## Best Practices

### 1. Always Define Types First

```typescript
// ✓ GOOD - Define all sounds in type
export type SoundEffect =
  | 'move'
  | 'rotate'
  | 'menu_select'
  | 'error';

// Then use them
this.sounds.playSfx('menu_select');
```

### 2. Use Descriptive Names

```typescript
// ✗ BAD
'sound1', 'sound2', 'beep', 'ding'

// ✓ GOOD
'menu_select', 'garbage', 'attack', 'error'
```

### 3. Group Related Sounds

```typescript
export type SoundEffect =
  // Movement
  | 'move'
  | 'rotate'
  | 'drop'

  // Scoring
  | 'line_clear'
  | 'tetris'

  // UI
  | 'menu_select'
  | 'error';
```

### 4. Provide Volume Control

```typescript
class GameEngine {
  constructor(settings: GameSettings) {
    this.sounds = new SoundEngine(session);
    this.sounds.setSfxVolume(settings.sfxVolume);
    this.sounds.setMusicVolume(settings.musicVolume);
  }
}
```

### 5. Don't Spam Sounds

```typescript
// ✗ BAD - Plays every frame
update(): void {
  if (this.piece.falling) {
    this.sounds.playSfx('falling');  // Too frequent!
  }
}

// ✓ GOOD - Plays on state change
onPieceLocked(): void {
  this.sounds.playSfx('lock');  // Once per event
}
```

## Troubleshooting

### Error: Type not assignable

**Error**: `Argument of type '"new_sound"' is not assignable to parameter of type 'SoundEffect'`

**Solution**: Add the sound to your `SoundEffect` type definition first.

### Sound doesn't play

**Checklist**:
1. ✓ Is the sound effect in the `SoundEffect` type?
2. ✓ Is volume > 0?
3. ✓ Is `playSfx()` being called?
4. ✓ Check console for debug logs

### Too many sound effects

**Solution**: Use sound categories or throttling:

```typescript
class ThrottledSounds {
  private lastPlay: Map<string, number> = new Map();
  private throttle: number = 100; // ms

  playSfx(effect: SoundEffect): void {
    const now = Date.now();
    const last = this.lastPlay.get(effect) || 0;

    if (now - last < this.throttle) return;

    this.sounds.playSfx(effect);
    this.lastPlay.set(effect, now);
  }
}
```

## Examples

See complete implementations:
- `/sdk/doors/grandmaster/audio/sounds.ts` - Full sound engine
- `/sdk/doors/livechat/audio/` - Chat notification sounds
- `/sdk/doors/2048-game/audio/` - Puzzle game audio

## See Also

- [NETWORK_ENGINE_GUIDE.md](./NETWORK_ENGINE_GUIDE.md) - Multiplayer audio patterns
- [NEO_BLESSED_GUIDE.md](./NEO_BLESSED_GUIDE.md) - UI feedback with sound
- [TYPESCRIPT_DOOR_GUIDE.md](../Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md) - Complete door development
