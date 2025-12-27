# GRANDMASTER Voice Samples

## Overview

Voice announcements add excitement and feedback to gameplay, modeled after TGM3's iconic voice callouts.

## Voice Samples

| Voice | File | Trigger | Usage |
|-------|------|---------|-------|
| **Excellent** | excellent.wav | Perfect play, high combos, skillful moves | Reward exceptional performance |
| **Cool** | cool.wav | Section completed under time threshold | Section time judgment |
| **Regret** | regret.wav | Section completed over time threshold | Section time judgment |
| **Double** | double.wav | 2-line clear | Combo announcements |
| **Triple** | triple.wav | 3-line clear | Combo announcements |
| **Tetris** | tetris_voice.wav | 4-line clear (voice version) | Major achievement |
| **Combo** | combo.wav | 5+ combo | Combo milestones |
| **Perfect** | perfect.wav | Perfect clear (empty board) | Rare achievement |
| **Bravo** | bravo.wav | Game completion, high grade | Victory celebration |

## Integration

### Trigger Locations

**Section Completion** (game-screen.ts):
```typescript
if (sectionResult === 'COOL') {
  this.sounds.playVoice('cool');
} else if (sectionResult === 'REGRET') {
  this.sounds.playVoice('regret');
}
```

**Line Clears** (game-screen.ts):
```typescript
if (linesCleared === 2) {
  this.sounds.playVoice('double');
} else if (linesCleared === 3) {
  this.sounds.playVoice('triple');
} else if (linesCleared === 4) {
  this.sounds.playVoice('tetris_voice');
}
```

**Combo Achievements** (game-screen.ts):
```typescript
if (combo >= 10) {
  this.sounds.playVoice('excellent');
} else if (combo >= 5) {
  this.sounds.playVoice('combo');
}
```

**Perfect Clear** (game-screen.ts):
```typescript
if (isPerfectClear) {
  this.sounds.playVoice('perfect');
  this.particles.spawn('perfectClear', 40, 12);
}
```

**Game Completion** (game-screen.ts):
```typescript
if (grade === 'GMM' || grade === 'GM') {
  this.sounds.playVoice('bravo');
}
```

## Socket.IO Events

### Voice Playback
```typescript
socket.emit('audio:voice', {
  sample: 'excellent',
  volume: 0.8,
  file: '/doors/grandmaster/voices/excellent.wav'
});
```

Frontend handles:
```typescript
socket.on('audio:voice', ({ sample, volume, file }) => {
  const audio = new Audio(file);
  audio.volume = volume;
  audio.play();
});
```

## Voice Priority System

When multiple voice triggers occur simultaneously, priority determines which plays:

1. **Perfect** (highest priority)
2. **Bravo**
3. **Excellent**
4. **Tetris**
5. **Combo**
6. **Triple**
7. **Double**
8. **Cool**
9. **Regret** (lowest priority)

## Voice Characteristics

### Tone and Style
- **Energetic**: Upbeat, motivating announcer voice
- **Clear**: Easy to understand during fast gameplay
- **Punchy**: Short, impactful clips (0.5-2 seconds)
- **Dynamic**: Varied pitch/intensity based on achievement

### Recording Guidelines
- **Sample Rate**: 44.1 kHz
- **Bit Depth**: 16-bit
- **Channels**: Mono (better for BBS bandwidth)
- **Format**: WAV (uncompressed)
- **Duration**: 0.5-2 seconds
- **Volume**: Normalized to -3 dB

### Voice Acting Direction
- **"Excellent!"**: Enthusiastic, impressed tone
- **"Cool!"**: Approving, satisfied tone
- **"Regret!"**: Disappointed but not harsh
- **"Double/Triple/Tetris!"**: Excited, building intensity
- **"Combo!"**: Energetic, encouraging
- **"Perfect!"**: Amazed, celebratory
- **"Bravo!"**: Triumphant, congratulatory

## Creating Voice Samples

### Option 1: Text-to-Speech (Quick)
```bash
# macOS
say -v "Alex" -o excellent.wav "Excellent!"
say -v "Samantha" -o cool.wav "Cool!"
say -v "Daniel" -o tetris_voice.wav "Tetris!"

# Convert to proper format
ffmpeg -i excellent.wav -ar 44100 -ac 1 -c:a pcm_s16le excellent_final.wav
```

### Option 2: Voice Acting (Best Quality)
1. Record in quiet environment
2. Use pop filter to reduce plosives
3. Multiple takes for best energy
4. Edit out silence/breath sounds
5. Normalize volume
6. Export as WAV 44.1 kHz mono

### Option 3: Authentic TGM3 Samples
- Extract from TGM3 arcade ROM (for reference only)
- Must create original recordings for distribution
- Copyright restrictions on arcade samples

## File Structure

```
assets/voices/
├── README.md
├── excellent.wav     (1.2 MB) - "Excellent!"
├── cool.wav          (0.8 MB) - "Cool!"
├── regret.wav        (0.9 MB) - "Regret!"
├── double.wav        (0.7 MB) - "Double!"
├── triple.wav        (0.8 MB) - "Triple!"
├── tetris_voice.wav  (1.0 MB) - "Tetris!"
├── combo.wav         (0.9 MB) - "Combo!"
├── perfect.wav       (1.1 MB) - "Perfect!"
└── bravo.wav         (1.3 MB) - "Bravo!"
```

**Total Size**: ~9 MB

## Performance

- **Latency**: <50ms from trigger to playback
- **Overlap**: Voices can overlap with music/SFX
- **Caching**: Browser caches WAV files
- **Bandwidth**: 9 MB total download (one-time)

## Testing

```bash
# Build and test
cd sdk/doors/grandmaster
npm run build

# In game:
# - Clear 4 lines -> "Tetris!"
# - Build 5+ combo -> "Combo!"
# - Complete section fast -> "Cool!"
# - Complete section slow -> "Regret!"
# - Perfect clear -> "Perfect!"
# - Reach GM grade -> "Bravo!"
```

## Future Enhancements

1. **Extended Callouts**
   - "Incredible!"
   - "Unstoppable!"
   - "Legendary!"

2. **Combo Voices**
   - "Five!", "Six!", "Seven!", etc.
   - "Ten Combo!"
   - "Twenty Combo!"

3. **Grade Callouts**
   - "S1!", "S2!", "S3!"
   - "Master!"
   - "Grand Master!"

4. **Warning Voices**
   - "Danger!" (board near top)
   - "Hurry!" (time running out)
   - "Last Piece!" (final credit roll piece)

5. **Multilingual Support**
   - English (default)
   - Japanese (authentic TGM style)
   - Spanish, French, German

## Voice Volume Mixing

Voice samples play at SFX volume level and automatically mix with:
- **Music**: Continues playing (no ducking)
- **SFX**: Play simultaneously
- **Other Voices**: Newer voice overrides previous (single voice at a time)

## Credits

Voice system inspired by:
- Tetris: The Grand Master 3 - Terror-Instinct
- Tetris Effect
- Puyo Puyo Tetris
- Modern fighting games (Street Fighter, Tekken)
