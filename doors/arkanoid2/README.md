# Arkanoid Audio (Hybrid Door)

Arkanoid with real Web Audio sounds and music via the SDK AudioEngine.

## Command

`ARKANOID2` - Runs the audio-enabled version

## Features

- All original gameplay from the server-only version
- Real Web Audio sounds via SDK AudioEngine (Tone.js):
  - `hit` - Ball bounces
  - `explosion` - Brick destruction
  - `powerup` - Power-up collection
  - `gameover` - Life lost
  - `coin` - Level complete
- Procedural chiptune background music
- RPC-based highscore persistence

## Files

- `client.ts` - Browser-side game with SDK AudioEngine
- `server.ts` - Node.js RPC handlers for highscore persistence
- `package.json` - Hybrid door configuration

## Building

```bash
npm install
npm run build
```

## How It Works

1. User runs `ARKANOID2`
2. Backend detects `runtime: "hybrid"` and serves bundled client
3. Client uses SDK ClientDoor for Socket.IO communication
4. Game runs in browser with real Web Audio
5. Highscores saved/loaded via RPC to server component

## Audio Features

The hybrid version uses the SDK AudioEngine with Tone.js for:

- **Sound Effects**: hit, explosion, powerup, gameover, levelComplete
- **Background Music**: Procedural chiptune generated on game start
- **Configurable Volumes**: Master, music, and SFX levels

## Comparison with Server Version

| Feature | arkanoid (server) | arkanoid-audio (hybrid) |
|---------|-------------------|-------------------------|
| Command | `ARKANOID` | `ARKANOID2` |
| Audio | Terminal bell | Web Audio (Tone.js) |
| Music | None | Chiptune |
| Highscores | Local file | RPC to server |
| Works on Telnet | Yes | Falls back to server |
