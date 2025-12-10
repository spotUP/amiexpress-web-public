# AmiExpress SDK - Complete Game Development Guide

This document is the definitive reference for creating BBS door games with the AmiExpress SDK. It covers every feature, with exact usage patterns and decision trees.

## Table of Contents

1. [Door Types - When to Use Each](#door-types---when-to-use-each)
2. [Quick Start Templates](#quick-start-templates)
3. [The Door Class (Server Runtime)](#the-door-class-server-runtime)
4. [The ClientDoor Class (Client/Hybrid Runtime)](#the-clientdoor-class-clienthybrid-runtime)
5. [Audio Engine](#audio-engine)
6. [Graphics Engine](#graphics-engine)
7. [Input Handling](#input-handling)
8. [Components Reference](#components-reference)
9. [Types Reference](#types-reference)
10. [Common Patterns](#common-patterns)
11. [Checklist for New Games](#checklist-for-new-games)

---

## Door Types - When to Use Each

### Decision Tree

```
Need Web Audio, Canvas, or WebGL?
  YES -> Use HYBRID door
  NO  -> Need real-time multiplayer or complex AI?
           YES -> Use SERVER door (Door class)
           NO  -> Simple game?
                    YES -> Use SERVER door
```

### Runtime Comparison

| Feature | Server (`Door`) | Hybrid (`ClientDoor` + RPC) |
|---------|-----------------|----------------------------|
| **Location** | Node.js backend | Browser + Node.js |
| **Audio** | Terminal bell only (`\x07`) | Real Web Audio (Tone.js) |
| **Graphics** | ANSI via socket | ANSI via socket |
| **Input** | Via socket | Via socket (same as server) |
| **Persistence** | Direct file I/O | RPC to server |
| **Telnet/SSH** | Yes | Fallback to server component |
| **WebSocket** | Yes | Yes (full features) |
| **Complexity** | Simple | More complex |

### package.json Configuration

**Server Door:**
```json
{
  "name": "my-game",
  "runtime": "server",
  "main": "index.ts",
  "doorType": "TS"
}
```

**Hybrid Door:**
```json
{
  "name": "my-game",
  "runtime": "hybrid",
  "main": "server.ts",
  "doorType": "TS",
  "client": {
    "entry": "./client.ts",
    "bundle": "./dist/client.bundle.js"
  },
  "server": {
    "entry": "./server.ts"
  },
  "scripts": {
    "build": "tsc && esbuild client.ts --bundle --outfile=dist/client.bundle.js --format=esm --target=es2020"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../../sdk"
  }
}
```

---

## Quick Start Templates

### Server Door (Simple Game)

```typescript
import { Door, BBSUser } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
  author: 'You',
  description: 'A simple game',
  minSecurity: 0,
});

let gameState = { score: 0, playing: false };

door.onConnect(async (user: BBSUser) => {
  door.send('\x1b[2J\x1b[H');  // Clear screen
  door.send(`Welcome, ${user.name}!\r\n`);
  gameState.playing = true;
  renderGame();
});

door.onInput((user: BBSUser, key) => {
  if (key.key === 'q') {
    door.send('Goodbye!\r\n');
    door.shutdown();
    return;
  }
  // Handle other input
  handleInput(key.key);
  renderGame();
});

function renderGame() {
  door.send('\x1b[2J\x1b[H');  // Clear screen
  door.send(`Score: ${gameState.score}\r\n`);
}

function handleInput(key: string) {
  // Game logic
}

door.start();
```

### Hybrid Door (With Audio)

**client.ts:**
```typescript
import { ClientDoor, AudioEngine } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'My Game',
  version: '1.0.0',
  author: 'You',
  runtime: 'hybrid',
  hybrid: true,  // REQUIRED for RPC
});

const audio = new AudioEngine({
  masterVolume: 0.7,
  musicVolume: 0.4,
  sfxVolume: 0.8,
});

let score = 0;

door.onConnect(async (user) => {
  await audio.init();  // MUST call after user interaction
  audio.generateMusic({ prompt: 'chiptune', tempo: 140, pattern: 'x-x-', instruments: ['square'] });

  // Load highscores from server
  const result = await door.rpc('getHighscores', {});
  console.log('Highscores:', result.highscores);

  door.clearScreen();
  door.send(`Welcome, ${user.name}!\r\n`);
});

door.onInput((user, key) => {
  if (key.key === ' ') {
    audio.playSound('hit');
    score += 10;
  }
  if (key.key === 'q') {
    audio.stopMusic();
    door.shutdown();
  }
});

door.setFPS(30);
door.start();
```

**server.ts:**
```typescript
import * as fs from 'fs';

interface HighScore { name: string; score: number; }

export function getHighscores(): { highscores: HighScore[] } {
  try {
    const data = fs.readFileSync('highscores.json', 'utf-8');
    return { highscores: JSON.parse(data) };
  } catch { return { highscores: [] }; }
}

export function saveHighscore(params: { name: string; score: number }): { success: boolean } {
  const scores = getHighscores().highscores;
  scores.push({ name: params.name, score: params.score });
  scores.sort((a, b) => b.score - a.score);
  fs.writeFileSync('highscores.json', JSON.stringify(scores.slice(0, 10)));
  return { success: true };
}

export const rpcHandlers = { getHighscores, saveHighscore };
export default rpcHandlers;
```

---

## The Door Class (Server Runtime)

### Import
```typescript
import { Door, BBSUser, KeyEvent } from '@amiexpress/bbs-door-sdk';
// OR
import { Door } from '@amiexpress/bbs-door-sdk/core';
```

### Constructor
```typescript
const door = new Door({
  name: string;           // Door display name
  version: string;        // Version string (e.g., "1.0.0")
  author: string;         // Author name
  description?: string;   // Short description
  minSecurity?: number;   // Minimum security level (0-255)
  maxTime?: number;       // Max time in minutes (0 = unlimited)
  multiplayer?: boolean;  // Enable multiplayer
});
```

### Event Handlers

| Event | Signature | When Called |
|-------|-----------|-------------|
| `onConnect` | `(user: BBSUser) => void` | User connects |
| `onDisconnect` | `(user: BBSUser) => void` | User disconnects |
| `onInput` | `(user: BBSUser, key: KeyEvent) => void` | Key pressed |
| `onUpdate` | `(delta: number) => void` | Every frame (use for game logic) |
| `onRender` | `(frame: number) => void` | Every frame (use for rendering) |

### Methods

| Method | Description |
|--------|-------------|
| `door.start()` | Start the door |
| `door.shutdown()` | Graceful shutdown |
| `door.send(text: string)` | Send text to user |
| `door.sendAnsi(ansi: string)` | Send ANSI codes |
| `door.disconnect(userId)` | Disconnect specific user |
| `door.getUser(userId)` | Get user by ID |
| `door.getAllUsers()` | Get all connected users |

### BBSUser Properties

```typescript
interface BBSUser {
  id: number;              // Unique user ID
  name: string;            // Username
  node: number;            // Node number
  securityLevel: number;   // 0-255
  timeLeft: number;        // Minutes remaining
  graphicsMode: 'ANSI' | 'ASCII' | 'RIP';
  termWidth: number;       // Usually 80
  termHeight: number;      // Usually 24
  data: Record<string, any>;  // Custom data storage
}
```

---

## The ClientDoor Class (Client/Hybrid Runtime)

### Import
```typescript
import { ClientDoor, AudioEngine, AnsiColor } from '@amiexpress/bbs-door-sdk/client';
```

### Constructor
```typescript
const door = new ClientDoor({
  name: string;
  version: string;
  author: string;
  description?: string;
  minSecurity?: number;
  runtime?: 'client' | 'hybrid';  // Use 'hybrid' for RPC
  hybrid?: boolean;  // Set to true for RPC support
});
```

### Event Handlers

Same as Door class, plus:

| Method | Description |
|--------|-------------|
| `door.setFPS(fps)` | Set target FPS (1-120, default 30) |
| `door.getFPS()` | Get current FPS |
| `door.getFrameCount()` | Get total frames rendered |
| `door.pause()` | Pause game loop |
| `door.resume()` | Resume game loop |

### Output Methods

| Method | Description |
|--------|-------------|
| `door.send(text)` | Send text |
| `door.sendAnsi(ansi)` | Send ANSI |
| `door.clearScreen()` | Clear terminal |
| `door.moveCursor(x, y)` | Move cursor (1-indexed) |
| `door.setColor(code)` | Set ANSI color code |

### Input Methods

| Method | Description |
|--------|-------------|
| `await door.wait(ms)` | Async delay |
| `await door.waitForInput(timeout?)` | Wait for keypress |
| `await door.prompt(text, timeout?)` | Get text input |

### RPC (Hybrid Only)

```typescript
// In client.ts
const result = await door.rpc('methodName', { param1: 'value' });

// In server.ts
export function methodName(params: { param1: string }) {
  return { result: 'value' };
}
export const rpcHandlers = { methodName };
```

**RPC Requirements:**
1. Set `hybrid: true` in ClientDoor config
2. Set `"runtime": "hybrid"` in package.json
3. Export `rpcHandlers` from server.ts

---

## Audio Engine

### Import
```typescript
import { AudioEngine } from '@amiexpress/bbs-door-sdk/client';
```

### Constructor
```typescript
const audio = new AudioEngine({
  masterVolume?: number;  // 0.0 - 1.0, default 0.7
  musicVolume?: number;   // 0.0 - 1.0, default 0.5
  sfxVolume?: number;     // 0.0 - 1.0, default 0.8
  enabled?: boolean;      // default true
});
```

### Initialization

**CRITICAL:** Must call `audio.init()` after user interaction (click, keypress):

```typescript
door.onConnect(async () => {
  await audio.init();  // Now audio works
});
```

### Pre-defined Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `laser` | Sawtooth sweep | Shooting, attacks |
| `explosion` | Pink noise burst | Destruction, impacts |
| `jump` | Square wave up | Jumping |
| `coin` | Two-note chime | Collectibles, score |
| `hit` | White noise pop | Ball bounces, hits |
| `powerup` | Ascending arpeggio | Power-ups, upgrades |
| `menu-beep` | Sine blip | Menu navigation |
| `gameover` | Descending sad | Game over, death |

### Playing Sounds

```typescript
// Basic
audio.playSound('laser');
audio.playSound('explosion');
audio.playSound('coin');

// With parameters
audio.playSound('menu-beep', { frequency: 1000 });
audio.playSound('laser', { frequency: 440, duration: 0.2 });
```

### Custom Sounds

```typescript
audio.playCustomSound({
  type: 'custom',
  frequency: 440,        // Hz
  duration: 0.2,         // seconds
  envelope: 'pluck',     // 'pluck' | 'fade' | 'sustain'
  volume: 0.5            // 0.0 - 1.0
});
```

### Music Generation

```typescript
audio.generateMusic({
  prompt: 'upbeat chiptune melody in C major',
  tempo: 140,           // BPM
  pattern: 'x-x-x-x-',  // Scribbletune pattern
  instruments: ['square', 'triangle', 'sawtooth'],
  duration: 8           // measures (optional)
});
```

### Adaptive Music

```typescript
// Calm exploration
audio.setMusicState('explore', 0.3, 'fade');

// Combat music
audio.setMusicState('combat', 0.9, 'crossfade');

// Boss fight
audio.setMusicState('boss-fight', 1.0, 'immediate');
```

### Volume Control

```typescript
audio.setMasterVolume(0.8);
audio.setMusicVolume(0.5);
audio.setSFXVolume(0.9);
audio.setEnabled(false);  // Mute all
```

### Cleanup

```typescript
audio.stopMusic();
audio.dispose();  // Free resources
```

---

## Graphics Engine

### Import
```typescript
import { GraphicsEngine } from '@amiexpress/bbs-door-sdk/client';
// or
import { GraphicsEngine } from '@amiexpress/bbs-door-sdk';
```

### Constructor
```typescript
const gfx = new GraphicsEngine({
  width: 80,
  height: 24,
  doubleBuffer: false  // Enable for flicker-free animation
});
```

### Drawing Methods

```typescript
// Clear screen
gfx.clear(AnsiColor.Black);

// Draw character
gfx.drawChar(x, y, '@', AnsiColor.Yellow, AnsiColor.Black);

// Draw text (strips ANSI codes)
gfx.drawText(x, y, 'Hello', AnsiColor.White, AnsiColor.Blue);

// Draw box
gfx.drawBox(x, y, width, height, AnsiColor.Red);

// Render to string
const output = gfx.render();
door.send(output);
```

### Sprites

```typescript
const sprite = gfx.createSprite({
  id: 'player',
  frames: ['frame1', 'frame2'],  // ANSI art strings
  position: { x: 10, y: 5 },
  size: { width: 3, height: 2 },
  fps: 10
});

gfx.updateSprite('player', { x: 15, y: 5 });
gfx.playSprite('player');
gfx.stopSprite('player');
```

### Parallax Scrolling

```typescript
gfx.addParallaxLayer({
  image: 'mountains.ans',
  scrollSpeed: 0.5,  // 0.0-1.0
  depth: 3,
  opacity: 1.0
});

gfx.scrollCamera(1, 0);  // Scroll right
```

### Particles

```typescript
gfx.createParticleSystem('explosion', {
  type: 'explosion',
  count: 50,
  lifetime: 1000,  // ms
  velocity: { min: 1, max: 5 },
  color: AnsiColor.Yellow,
  gravity: 0.1
});

gfx.emitParticles('explosion', { x: 40, y: 12 });
```

---

## Input Handling

### KeyEvent Structure

```typescript
interface KeyEvent {
  key: string;    // Key name or character
  code: number;   // Raw key code
  ctrl: boolean;  // Ctrl held?
  alt: boolean;   // Alt held?
  shift: boolean; // Shift held?
}
```

### Common Key Values

**IMPORTANT: Server doors receive RAW terminal escape sequences, not key names!**

Server doors (runtime: "server") receive raw input directly from the terminal. You must translate escape sequences yourself:

| Key | Raw Escape Sequence | After Translation |
|-----|---------------------|-------------------|
| Arrow Up | `'\x1b[A'` | `'arrowup'` |
| Arrow Down | `'\x1b[B'` | `'arrowdown'` |
| Arrow Left | `'\x1b[D'` | `'arrowleft'` |
| Arrow Right | `'\x1b[C'` | `'arrowright'` |
| Enter | `'\r'` or `'\n'` | `'enter'` |
| Space | `' '` | `'space'` |
| Escape | `'\x1b'` | `'escape'` |
| Backspace | `'\x7f'` or `'\x08'` | `'backspace'` |
| Letters | `'a'`, `'b'`, ... | (already lowercase) |

**Key translation helper for server doors:**

```typescript
function translateKey(key: string): string {
  const keyMap: Record<string, string> = {
    '\x1b[A': 'arrowup',
    '\x1b[B': 'arrowdown',
    '\x1b[C': 'arrowright',
    '\x1b[D': 'arrowleft',
    '\x1bOA': 'arrowup',    // Application mode
    '\x1bOB': 'arrowdown',
    '\x1bOC': 'arrowright',
    '\x1bOD': 'arrowleft',
    '\r': 'enter',
    '\n': 'enter',
    '\x7f': 'backspace',
    '\x08': 'backspace',
    ' ': 'space',
  };
  return keyMap[key] || key.toLowerCase();
}

// Usage in server door:
session.doorInputHandler = (data: string) => {
  const key = translateKey(data);
  if (key === 'arrowup') { /* move up */ }
  if (key === 'arrowleft') { /* move left */ }
};
```

**Hybrid doors (runtime: "hybrid")** using ClientDoor receive KeyEvent objects with normalized key names like `'ArrowUp'`, `'ArrowDown'`, etc.

### Input Engine (Optional)

```typescript
import { InputEngine } from '@amiexpress/bbs-door-sdk/client';

const input = new InputEngine();

input.bindAction('move-up', 'ArrowUp', () => player.y--);
input.bindAction('move-up', 'w', () => player.y--);  // Also bind W
input.bindAction('shoot', ' ', () => shoot());

door.onInput((user, key) => {
  input.processInput(key);  // Triggers bound callbacks
});
```

### KeyStateTracker - Instant Key Repeat for Games

**Problem**: Browser keyboards have a ~500ms delay before key repeat starts. This makes games unplayable!

**Solution**: `KeyStateTracker` eliminates the delay by tracking key states directly and emitting continuous events.

```typescript
import { KeyStateTracker } from '@amiexpress/bbs-door-sdk/client';

const keyTracker = new KeyStateTracker();

door.onConnect((user) => {
  // Start tracking keys - emits at 60fps while keys are held
  keyTracker.start((key) => {
    // Handle paddle/player movement (instant response!)
    if (key === 'arrowleft' || key === 'a') {
      paddle.x -= SPEED;
    }
    if (key === 'arrowright' || key === 'd') {
      paddle.x += SPEED;
    }
  }, 16); // 16ms = 60fps repeat rate
});

// Handle other keys normally (space, enter, etc.)
door.onInput((user, key) => {
  const k = key.key?.toLowerCase() || '';

  // Skip movement keys (handled by KeyStateTracker)
  if (k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd') {
    return;
  }

  // Handle action keys
  if (k === 'space') launchBall();
  if (k === 'q') quit();
});

// Clean up on exit
function quit() {
  keyTracker.stop();
  door.shutdown();
}
```

**Key Features**:
- Zero delay - instant response when key pressed
- Configurable repeat rate (default: 16ms = 60fps)
- Automatic cleanup of browser event listeners
- Works with any key (arrows, WASD, etc.)

**When to Use**:
- ✅ Games requiring smooth movement (platformers, shooters, paddle games)
- ✅ Real-time controls where instant response is critical
- ❌ Menu navigation (normal onInput is fine)
- ❌ Text input (use prompt() or normal onInput)

**Browser Compatibility**: Works in all modern browsers. Falls back gracefully if KeyboardEvent not available.

---

## Case-Insensitive Filesystem

**IMPORTANT**: AmiExpress uses case-insensitive filesystem operations (like AmigaOS).

All BBS file operations use the `amigafs` module which handles case-insensitive matching:
- `Doors/arkanoid-audio` = `doors/ARKANOID-AUDIO` = `DOORS/Arkanoid-Audio`
- `Commands/BBSCmd/WHO.info` = `commands/bbscmd/who.INFO`
- This applies to ALL BBS data: doors, commands, screens, bulletins, conferences

**For Door Developers**:
- Your door paths will work regardless of case
- `LOCATION=Doors/my-game` in .info files is case-insensitive
- File operations within doors are case-sensitive (standard Node.js fs)
- Only BBS framework paths use case-insensitive matching

**Why This Matters**:
- Real Amiga BBS data uses mixed case filenames
- Ports from classic BBSes maintain original casing
- macOS/Linux are case-sensitive by default, but BBS framework handles it

---

## Components Reference

### MenuSystem

```typescript
import { MenuSystem } from '@amiexpress/bbs-door-sdk/components/menus';

const menu = new MenuSystem({
  title: 'Main Menu',
  style: 'retro-neon',  // 'classic' | 'retro-neon' | 'minimalist' | 'boxed'
  navigation: 'arrow-keys',  // 'arrow-keys' | 'number-keys' | 'hotkeys'
  modal: true
});

menu.addItem('New Game', () => startGame(), { key: 'N' });
menu.addItem('Options', () => showOptions());
menu.addItem('Quit', () => quit(), { key: 'Q' });

await menu.show(door, user);
```

### SaveManager

```typescript
import { SaveManager } from '@amiexpress/bbs-door-sdk/components/save';

const saves = new SaveManager('my-game');

await saves.save(1, { level: 5, score: 1000 });
const data = await saves.load(1);
const slots = await saves.listSlots();
```

### HUDBuilder

```typescript
import { HUDBuilder } from '@amiexpress/bbs-door-sdk/components/hud';

const hud = new HUDBuilder();

hud.addElement('score', {
  type: 'counter',
  position: { x: 2, y: 1 },
  format: 'SCORE: %08d'
});

hud.addElement('health', {
  type: 'bar',
  position: { x: 60, y: 1 },
  size: { width: 20, height: 1 },
  color: AnsiColor.Red
});

hud.update('score', 12500);
hud.update('health', 0.75);  // 75%

door.send(hud.render());
```

---

## Types Reference

### AnsiColor (Foreground)

```typescript
enum AnsiColor {
  BLACK = 30,
  RED = 31,
  GREEN = 32,
  YELLOW = 33,
  BLUE = 34,
  MAGENTA = 35,
  CYAN = 36,
  WHITE = 37,
  BRIGHT_BLACK = 90,
  BRIGHT_RED = 91,
  BRIGHT_GREEN = 92,
  BRIGHT_YELLOW = 93,
  BRIGHT_BLUE = 94,
  BRIGHT_MAGENTA = 95,
  BRIGHT_CYAN = 96,
  BRIGHT_WHITE = 97,
}
```

### AnsiBgColor (Background)

```typescript
enum AnsiBgColor {
  BLACK = 40,
  RED = 41,
  GREEN = 42,
  YELLOW = 43,
  BLUE = 44,
  MAGENTA = 45,
  CYAN = 46,
  WHITE = 47,
  BRIGHT_BLACK = 100,
  // ... etc
}
```

### Position

```typescript
interface Position { x: number; y: number; }
```

### Size

```typescript
interface Size { width: number; height: number; }
```

### Rect

```typescript
interface Rect extends Position, Size {}
```

---

## Common Patterns

### ANSI Escape Sequences

```typescript
const ESC = '\x1b';
const CSI = `${ESC}[`;

// Cursor
const home = `${CSI}H`;
const goto = (x: number, y: number) => `${CSI}${y};${x}H`;
const hide = `${CSI}?25l`;
const show = `${CSI}?25h`;

// Screen
const clear = `${CSI}2J`;
const clearLine = `${CSI}2K`;

// Colors
const reset = `${CSI}0m`;
const fgColor = (n: number) => `${CSI}${n}m`;
const bgColor = (n: number) => `${CSI}${n}m`;

// Example usage
door.send(hide + clear + home);
door.send(`${fgColor(33)}${bgColor(44)}Yellow on Blue${reset}`);
door.send(show);
```

### Unicode Block Characters

```typescript
const BLOCK = {
  full: '\u2588',     // Full block
  upper: '\u2580',    // Upper half
  lower: '\u2584',    // Lower half
  light: '\u2591',    // Light shade
  medium: '\u2592',   // Medium shade
  dark: '\u2593',     // Dark shade
};
```

### Game Loop Pattern

```typescript
let lastUpdate = 0;
const TICK_RATE = 1000 / 60;  // 60 FPS logic

door.onUpdate((delta) => {
  lastUpdate += delta;
  while (lastUpdate >= TICK_RATE) {
    updateGame();
    lastUpdate -= TICK_RATE;
  }
});

door.onRender((frame) => {
  renderGame();
});
```

### State Machine

```typescript
type GameState = 'menu' | 'playing' | 'paused' | 'gameover';
let state: GameState = 'menu';

door.onInput((user, key) => {
  switch (state) {
    case 'menu': handleMenuInput(key); break;
    case 'playing': handleGameInput(key); break;
    case 'paused': handlePauseInput(key); break;
    case 'gameover': handleGameOverInput(key); break;
  }
});
```

---

## Checklist for New Games

### Server Door Checklist

- [ ] Create `package.json` with `"runtime": "server"`
- [ ] Create `index.ts` with Door import
- [ ] Set up `onConnect` handler
- [ ] Set up `onInput` handler
- [ ] Implement game state
- [ ] Implement render function
- [ ] Handle 'q' to quit
- [ ] Call `door.start()` at end

### Hybrid Door Checklist

**package.json:**
- [ ] Set `"runtime": "hybrid"`
- [ ] Add `"client": { "entry": "./client.ts", "bundle": "./dist/client.bundle.js" }`
- [ ] Add `"server": { "entry": "./server.ts" }`
- [ ] Add esbuild script with ALL externals: `--external:fs --external:path --external:child_process --external:neo-blessed`
- [ ] Set SDK path correctly based on door location (e.g., `file:../../sdk`)

**tsconfig.json:**
- [ ] Add `"lib": ["ES2020", "DOM"]` for browser APIs
- [ ] Add `"typeRoots": ["../../sdk/types", "./node_modules/@types"]` (REQUIRED for neo-blessed types)
- [ ] Set `"skipLibCheck": true`

**client.ts:**
- [ ] Import from `@amiexpress/bbs-door-sdk/client`
- [ ] Set `hybrid: true` in ClientDoor config (REQUIRED for RPC)
- [ ] Use `user.name` NOT `user.username`
- [ ] Initialize AudioEngine after user interaction with `await audio.init()`
- [ ] Call `door.setFPS(30)` before `door.start()`
- [ ] Call `audio.stopMusic()` on exit

**server.ts:**
- [ ] Export `rpcHandlers` object with method implementations
- [ ] Each handler receives `(params, context)` arguments

**Build:**
- [ ] Run `npm install` to install dependencies
- [ ] Run `npm run build` to compile TypeScript and bundle client
- [ ] Verify bundle created in `dist/client.bundle.js`

**Registration (REQUIRED for command to work):**
- [ ] Create `.info` file in `Commands/BBSCmd/` to register the door command

Example `Commands/BBSCmd/MYGAME.info`:
```
BBSCMD=MYGAME
TYPE=TS
RUNTIME=HYBRID
LOCATION=Doors/my-game
DESCRIPTION=My awesome game with audio
ACCESS=0
MULTINODE=YES
PRIORITY=SAME
```

| Field | Description |
|-------|-------------|
| BBSCMD | Command name users type (e.g., MYGAME) |
| TYPE | `TS` for TypeScript doors |
| RUNTIME | `HYBRID` for hybrid doors, omit for server-only |
| LOCATION | Path to door directory relative to BBS root |
| DESCRIPTION | Shown in door listings |
| ACCESS | Minimum security level (0 = all users) |
| MULTINODE | `YES` allows multiple users simultaneously |
| PRIORITY | `SAME` runs at normal priority |

**Server must be restarted to pick up new .info files.**

### Audio Checklist

- [ ] Call `await audio.init()` after user interaction
- [ ] Wrap audio calls in try/catch for graceful degradation
- [ ] Call `audio.stopMusic()` before exit
- [ ] Call `audio.dispose()` on cleanup

---

## Building Hybrid Doors

### Required Configuration Files

#### tsconfig.json (for hybrid doors)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "typeRoots": ["../../sdk/types", "./node_modules/@types"]
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**CRITICAL**: The `typeRoots` entry pointing to `../../sdk/types` is required to resolve the neo-blessed type declarations. Without it, you'll get TypeScript errors like:
```
Could not find a declaration file for module 'neo-blessed'
```

#### package.json (for hybrid doors)

```json
{
  "name": "my-game",
  "version": "1.0.0",
  "main": "server.ts",
  "bbsCommand": "MYGAME",
  "doorType": "TS",
  "runtime": "hybrid",
  "client": {
    "entry": "./client.ts",
    "bundle": "./dist/client.bundle.js"
  },
  "server": {
    "entry": "./server.ts"
  },
  "accessLevel": 0,
  "scripts": {
    "build": "tsc && npm run bundle:client",
    "bundle:client": "esbuild client.ts --bundle --outfile=dist/client.bundle.js --format=esm --target=es2020 --external:fs --external:path --external:child_process --external:neo-blessed",
    "start": "npx tsx server.ts"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk"
  },
  "devDependencies": {
    "esbuild": "^0.19.0",
    "typescript": "^5.0.0"
  }
}
```

**CRITICAL**: The `--external` flags in esbuild are REQUIRED! The SDK client exports include some server-side components that use Node.js modules. These must be excluded from browser bundles:

| External | Why It's Needed |
|----------|-----------------|
| `--external:fs` | SaveManager uses fs for file operations |
| `--external:path` | Various components use path module |
| `--external:child_process` | neo-blessed uses child_process |
| `--external:neo-blessed` | UIEngine is server-side only |

Without these externals, you'll get esbuild errors like:
```
Could not resolve "fs"
The package "fs" wasn't found on the file system but is built into node.
```

### SDK Path Reference

The SDK path in `dependencies` depends on your door's location:

| Door Location | SDK Path |
|---------------|----------|
| `Doors/my-game/` | `file:../../sdk` |
| `Doors/category/my-game/` | `file:../../../sdk` |
| `sdk/examples/my-game/` | `file:../..` |

### Client-Safe Imports

When writing client code, only import what you actually need from the SDK. The full client index exports many components, but not all are browser-safe:

**Browser-Safe (use freely):**
- `ClientDoor` - Main door class
- `AudioEngine` - Web Audio sounds/music
- `GraphicsEngine` - Sprite/particle rendering
- `PhysicsEngine` - Collision detection
- `InputEngine` - Key binding
- `AIEngine` - Pathfinding/behaviors
- `NetworkEngine` - Multiplayer
- `MenuSystem` - Interactive menus
- `HUDBuilder` - Health bars, scores
- `InventorySystem` - Item management
- `DialogueSystem` - NPC conversations
- `QuestSystem` - Quest tracking
- `LevelManager` - Level loading
- ANSI string utilities (`stripAnsi`, `visibleLength`, etc.)
- Type exports (`BBSUser`, `KeyEvent`, `AnsiColor`, etc.)

**Server-Only (avoid in client.ts):**
- `UIEngine` - Uses neo-blessed (Node.js terminal library)
- `SaveManager` - Uses fs module for file I/O

If you import these in client code, your build will fail even with `--external` flags because the import statement itself triggers the bundler.

### Build Commands

```bash
# Full build (TypeScript + client bundle)
npm run build

# TypeScript check only (no emit)
npx tsc --noEmit

# Client bundle only (skip TypeScript)
npm run bundle:client
```

### Expected Bundle Sizes

| Door Type | Typical Size | Notes |
|-----------|--------------|-------|
| Basic game | 50-200 KB | Just ClientDoor + game logic |
| With AudioEngine | 1.2-1.8 MB | Includes Tone.js |
| With GraphicsEngine | 200-500 KB | Sprite/particle systems |
| Full-featured | 2-3 MB | Multiple engines |

The AudioEngine includes Tone.js which is ~1.2MB. This is expected and acceptable for hybrid doors.

---

## Troubleshooting

### Build Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Could not find a declaration file for module 'neo-blessed'` | Missing typeRoots in tsconfig.json | Add `"typeRoots": ["../../sdk/types", "./node_modules/@types"]` |
| `Could not resolve "fs"` | esbuild bundling Node.js modules | Add `--external:fs` to esbuild command |
| `Could not resolve "path"` | esbuild bundling Node.js modules | Add `--external:path` to esbuild command |
| `Could not resolve "child_process"` | neo-blessed dependency | Add `--external:child_process --external:neo-blessed` |
| `Cannot find module '@amiexpress/bbs-door-sdk'` | Wrong SDK path | Check relative path in package.json dependencies |
| `Command not found: MYGAME` | Missing .info file | Create `Commands/BBSCmd/MYGAME.info` and restart server |
| `Available doors: 0` | Door not registered | Create `.info` file in `Commands/BBSCmd/` |

### Runtime Errors

| Issue | Solution |
|-------|----------|
| Audio not playing | Call `audio.init()` after user input (browser requirement) |
| RPC not working | Set `hybrid: true` in ClientDoor config |
| Arrow keys not working (server door) | Server doors receive raw escape sequences (`'\x1b[A'`), not key names. Use translateKey() helper. |
| Arrow keys not working (hybrid door) | Check key value is `'ArrowUp'` not just `'up'` |
| Key repeat delay (~500ms) | Browser default! Use `KeyStateTracker` for instant response (see Input Handling section) |
| Paddle/player movement too slow | Increase movement speed OR use `KeyStateTracker` for 60fps key repeat |
| Screen flickering | Use double buffering in GraphicsEngine |
| Door won't start | Ensure `door.start()` is called |
| User undefined | Use `door.getUser()` in onInput handler |
| `RPC is only available for hybrid doors` | Add `hybrid: true` to ClientDoor config |
| Input events not firing | Check `onInput` handler is registered before `start()` |
| Case-sensitive path errors | BBS uses case-insensitive paths (AmigaOS style). `Doors/` = `doors/` |

### Common Mistakes

1. **Forgetting `hybrid: true`** in ClientDoor config when using RPC:
   ```typescript
   // WRONG
   const door = new ClientDoor({ name: 'Game', version: '1.0.0' });

   // CORRECT
   const door = new ClientDoor({ name: 'Game', version: '1.0.0', hybrid: true });
   ```

2. **Using `user.username` instead of `user.name`**:
   ```typescript
   // WRONG - BBSUser has 'name', not 'username'
   door.send(`Hello ${user.username}`);

   // CORRECT
   door.send(`Hello ${user.name}`);
   ```

3. **Not awaiting `audio.init()`**:
   ```typescript
   // WRONG - may fail silently
   audio.init();
   audio.playSound('coin');

   // CORRECT
   await audio.init();
   audio.playSound('coin');
   ```

4. **Missing esbuild externals** - always include all four:
   ```bash
   # WRONG - missing externals
   esbuild client.ts --bundle --outfile=dist/client.bundle.js

   # CORRECT - all externals specified
   esbuild client.ts --bundle --outfile=dist/client.bundle.js --format=esm --target=es2020 --external:fs --external:path --external:child_process --external:neo-blessed
   ```

5. **Wrong SDK path** after moving door:
   ```json
   // If you move from Doors/game/ to Doors/arcade/game/
   // Change SDK path from:
   "file:../../sdk"
   // To:
   "file:../../../sdk"
   ```
