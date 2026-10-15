# GRANDMASTER Music Tracks

## Overview

The music system supports MOD/XM tracker music files played via Socket.IO events to the BBS frontend.

## Music Tracks

| Track | File | Usage | Loop |
|-------|------|-------|------|
| **menu** | menu.mod | Main menu screen | Yes |
| **master** | master.mod | Master mode gameplay | Yes |
| **death** | death.mod | Death mode (Shirase) gameplay | Yes |
| **game_over** | game_over.mod | Game over screen | No |
| **credits** | credits.mod | Credits/attract mode | Yes |

## Integration

### Menu Screen
```typescript
// Play menu music when showing menu
this.sounds.playMusic('menu', true);
```

### Game Screen
```typescript
// Play gameplay music when game starts
this.sounds.playMusic('master', true);

// Play game over music
this.sounds.playMusic('game_over', false);  // No loop
```

## Socket.IO Events

### Play Music
```typescript
socket.emit('audio:music', {
  track: 'master',
  loop: true,
  volume: 0.8,
  file: '/doors/grandmaster/music/master.mod'
});
```

### Stop Music
```typescript
socket.emit('audio:music:stop');
```

### Change Volume
```typescript
socket.emit('audio:music:volume', { volume: 0.5 });
```

## File Format

- **Primary**: MOD (Amiga ProTracker modules)
- **Alternative**: XM (Extended Module)
- **Playback**: TrackerEngine on frontend (web-based chiptune playback)

## Creating Music Tracks

### Authentic TGM3 Style
- Use classic arcade-style chiptune compositions
- Fast-paced, energetic melodies for gameplay
- Dramatic orchestral for game over/credits
- Menu music should be catchy and memorable

### Recommended Tools
- **OpenMPT** (Windows/Wine): Full-featured tracker
- **MilkyTracker**: Cross-platform MOD/XM editor
- **Protracker** (Amiga): Original tracker software
- **Schism Tracker**: Modern tracker with classic workflow

### Guidelines
- **BPM**: 140-180 for gameplay, 100-120 for menu/credits
- **Channels**: 4-8 channels (authentic Amiga sound)
- **File Size**: <500KB per track (keep downloads fast)
- **Loop Points**: Set clean loop points for looping tracks
- **Volume**: Mix at consistent volume across tracks

## Frontend Integration

The BBS frontend needs to implement MOD/XM playback:

```typescript
import { ChiptuneJsPlayer } from 'chiptune3';

socket.on('audio:music', ({ track, loop, volume, file }) => {
  const player = new ChiptuneJsPlayer(new ChiptuneJsConfig(-1));
  player.load(file);
  player.play();
  player.setVolume(volume);

  if (loop) {
    player.onEnded(() => player.play());
  }
});
```

## Music Sources

### Official TGM3 Soundtrack
- Composed by Shinji Hosoe (SuperSweep/Sampling Masters MEGA)
- Available on iTunes/Spotify: "Tetris: The Grand Master 3 - Terror-Instinct Original Soundtrack"

### Creating Original Tracks
- Must be original compositions (no copyrighted material)
- Can be inspired by TGM3 style but not direct copies
- Credit composers in game credits

## Performance

- **File Size**: Total ~1-2MB for all tracks
- **Streaming**: Frontend streams from BBS server
- **Caching**: Browser caches MOD files after first load
- **CPU**: <1% CPU usage with ChiptuneJS player
- **Memory**: ~5-10MB per loaded track

## Testing

```bash
# Play menu music
cd sdk/doors/grandmaster
npm run build
# In game: Navigate to menu, music should play

# Test all tracks
# - Menu screen: menu.mod
# - Start master mode: master.mod
# - Game over: game_over.mod
```

## Future Enhancements

1. **Dynamic Music System**
   - Change tempo/intensity based on gameplay
   - Layer additional tracks for combos/high speed
   - Crossfade between tracks

2. **Player-Selected Music**
   - Allow players to choose soundtrack
   - Upload custom MOD files
   - Music packs (TGM, Tetris Effect, Custom)

3. **Positional Audio**
   - Stereo panning for multiplayer
   - Audio ducking during important events

4. **Equalizer**
   - Visual waveform display
   - Real-time frequency bars

## Credits

Music integration system by AmiExpress BBS SDK
Tracker playback via ChiptuneJS
Inspired by Tetris: The Grand Master 3 - Terror-Instinct
