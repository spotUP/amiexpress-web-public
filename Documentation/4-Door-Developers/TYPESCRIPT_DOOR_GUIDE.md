# TypeScript Door Development Guide

Complete guide for creating TypeScript doors for AmiExpress-Web BBS.

## Door Types

AmiExpress-Web supports **three types of doors**:

### 1. Backend Doors (Server-Side)
- **Runtime**: `server`
- **Code runs on**: Node.js server
- **I/O**: ANSI escape codes via `socket.emit('ansi-output', ...)`
- **Audio**: Terminal bell only (`\x07`)
- **Best for**: Text games, utilities, ANSI-based interfaces
- **Example**: Text adventure games, BBS utilities, simple games

### 2. Frontend Doors (Client-Side)
- **Runtime**: `client`
- **Code runs on**: Browser (JavaScript)
- **I/O**: Full DOM access, Canvas, WebGL
- **Audio**: Web Audio API, actual sound files
- **Best for**: Graphical games, rich media experiences
- **Example**: Canvas-based games, audio visualizers

### 3. Hybrid Doors (Backend + Frontend)
- **Runtime**: `hybrid`
- **Code runs on**: Both server and browser
- **I/O**: Backend logic with frontend rendering
- **Audio**: Web Audio API for real sounds
- **Best for**: Games needing both server logic and rich client audio/graphics
- **Example**: Arkanoid (audio + highscores), multiplayer games with sound

**IMPORTANT**: This guide covers **Backend Doors** (`runtime: "server"`). For frontend or hybrid doors, see [CLIENT_DOOR_DEVELOPMENT.md](CLIENT_DOOR_DEVELOPMENT.md).

---

## Quick Start

### 1. Create Door Directory

```bash
mkdir -p doors/my-door
cd doors/my-door
```

### 2. Create package.json

```json
{
  "name": "my-door",
  "version": "1.0.0",
  "description": "My awesome BBS door",
  "main": "index.ts",
  "bbsCommand": "MYDOOR",
  "doorType": "TS",
  "runtime": "server",
  "doorPattern": "runDoor",
  "accessLevel": 0,
  "author": "Your Name",
  "keywords": ["bbs", "door", "game"],
  "scripts": {
    "build": "tsc",
    "start": "npx tsx index.ts"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Required Fields:**
- `bbsCommand`: The command users type to run your door (e.g., "MYDOOR")
- `doorType`: Must be "TS" for TypeScript doors
- `main`: Entry point file (usually "index.ts")
- `runtime`: Must be "server" for server-side TypeScript doors
- `doorPattern`: Must be "runDoor" (the exported function name)

### 3. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**NOTE:** Do NOT include `"types": ["node"]` in the compilerOptions unless you explicitly want to limit TypeScript to only Node.js types. If you add npm packages with `@types/*`, they won't be found if types is restricted.

### 4. Create index.ts

```typescript
/**
 * My Door - Description
 */

export async function runDoor(doorSession: any): Promise<void> {
  // IMPORTANT: Use bbsSession, not session!
  const { socket, bbsSession, user } = doorSession;

  // Clear screen and show welcome
  socket.emit('ansi-output', '\x1b[2J\x1b[H');  // Clear screen
  socket.emit('ansi-output', '\x1b[36mWelcome to My Door!\x1b[0m\r\n');
  socket.emit('ansi-output', `Hello, ${user?.username || bbsSession.user?.username || 'Guest'}!\r\n`);
  socket.emit('ansi-output', '\r\nPress Q to quit...\r\n');

  // Set up input handler on bbsSession (not session!)
  // IMPORTANT: Input data is a raw string (the key pressed), NOT an object!
  bbsSession.doorInputHandler = (data: string) => {
    // Data is the raw key string: 'a', 'q', '\r', '\x1b[A' (arrow up), etc.
    const key = data.toLowerCase();

    if (key === 'q') {
      // Cleanup before closing
      bbsSession.doorInputHandler = null;
      socket.emit('ansi-output', '\r\n\x1b[32mGoodbye!\x1b[0m\r\n');
      socket.emit('door:close');
    } else {
      socket.emit('ansi-output', `You pressed: ${key}\r\n`);
    }
  };

  // Wait for door to close
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}
```

### 5. Create .info File

Create `Commands/BBSCmd/MYDOOR.info`:

```
BBSCMD=MYDOOR
TYPE=TS
LOCATION=doors/my-door
DESCRIPTION=My awesome BBS door
ACCESS=0
MULTINODE=YES
PRIORITY=SAME
```

### 6. Test Your Door

Restart the BBS server, then type `MYDOOR` at the main menu.

---

## Door Session Object

The `doorSession` object passed to `runDoor()` contains:

```typescript
interface DoorSession {
  socket: Socket;           // Socket.IO socket for I/O
  bbsSession: BBSSession;   // BBS session with user info (NOTE: bbsSession, not session!)
  user: User;               // Current user object
  bbs: BBSApi;              // BBS API functions
  params: string[];         // Command-line parameters
}
```

**IMPORTANT:** The session property is named `bbsSession`, not `session`. This is a common mistake!

### Accessing User Info

```typescript
// CORRECT - use bbsSession
const username = doorSession.bbsSession.user?.username || 'Guest';
const accessLevel = doorSession.bbsSession.user?.accessLevel || 0;
const nodeId = doorSession.bbsSession.nodeId || 1;

// Or destructure at the start
const { socket, bbsSession, user } = doorSession;
const username = user?.username || bbsSession.user?.username || 'Guest';
```

### Sending Output

```typescript
// Send text/ANSI to terminal
socket.emit('ansi-output', 'Hello World!\r\n');

// ANSI escape codes
socket.emit('ansi-output', '\x1b[2J');      // Clear screen
socket.emit('ansi-output', '\x1b[H');       // Home cursor
socket.emit('ansi-output', '\x1b[10;20H');  // Move to row 10, col 20
socket.emit('ansi-output', '\x1b[31m');     // Red foreground
socket.emit('ansi-output', '\x1b[0m');      // Reset colors
```

### Receiving Keyboard Input

```typescript
// Set up input handler on bbsSession (not session!)
// IMPORTANT: Input is a raw string, NOT an object with a key property!
bbsSession.doorInputHandler = (data: string) => {
  // Data is the raw key pressed:
  // - Regular keys: 'a', 'q', '1', ' ' (space)
  // - Enter: '\r' or '\n'
  // - Escape sequences: '\x1b[A' (up), '\x1b[B' (down), '\x1b[C' (right), '\x1b[D' (left)

  const key = data.toLowerCase();

  // Handle arrow keys (ANSI escape sequences)
  if (data === '\x1b[A' || key === 'w') {
    // Move up
  } else if (data === '\x1b[B' || key === 's') {
    // Move down
  } else if (data === '\x1b[C' || key === 'd') {
    // Move right
  } else if (data === '\x1b[D' || key === 'a') {
    // Move left
  } else if (key === '\r' || key === '\n') {
    // Enter pressed
  } else if (key === 'q') {
    socket.emit('door:close');
  }
};
```

**Common Key Values:**

| Key | Value |
|-----|-------|
| Arrow Up | `\x1b[A` |
| Arrow Down | `\x1b[B` |
| Arrow Right | `\x1b[C` |
| Arrow Left | `\x1b[D` |
| Enter | `\r` or `\n` |
| Escape | `\x1b` (alone) |
| Backspace | `\x7f` or `\x08` |
| Tab | `\t` |
| Space | ` ` (space character) |
| Regular keys | The character itself (e.g., 'a', 'q', '1') |

---

## Mouse Support

Enable mouse events for games and interactive applications:

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  // Enable mouse events - MUST be set on bbsSession
  bbsSession.mouseEventsEnabled = true;

  // Input is a raw string - could be keyboard key or JSON-formatted mouse event
  bbsSession.doorInputHandler = (data: string) => {
    // Check if this is a mouse event (JSON string starting with '{')
    if (data.startsWith('{')) {
      try {
        const event = JSON.parse(data);
        handleMouseEvent(event);
        return;
      } catch (e) {
        // Not valid JSON, continue with keyboard handling
      }
    }

    // Handle keyboard input - data is the raw key string
    handleKeyboard(data);
  };

  function handleMouseEvent(event: MouseEvent) {
    // event.type: 'mouse-hover', 'mouse-click', 'mouse-drag', 'mouse-up'
    // event.x: column (1-indexed)
    // event.y: row (1-indexed)
    // event.button: 0=left, 1=middle, 2=right

    switch (event.type) {
      case 'mouse-hover':
        // Mouse moved (without clicking)
        break;
      case 'mouse-click':
        // Mouse button pressed
        break;
      case 'mouse-drag':
        // Mouse moved while button held
        break;
      case 'mouse-up':
        // Mouse button released
        break;
    }
  }

  // IMPORTANT: Clean up when door closes
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      bbsSession.mouseEventsEnabled = false;
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}

interface MouseEvent {
  type: 'mouse-hover' | 'mouse-click' | 'mouse-drag' | 'mouse-up';
  x: number;
  y: number;
  button?: number;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}
```

**Mouse Control Example (Paddle Game):**

```typescript
function handleMouseInput(event: MouseEvent): void {
  if (gameState === 'playing') {
    // Map mouse X to paddle position
    const mouseX = event.x;
    const paddleHalfWidth = paddle.width / 2;

    // Center paddle on mouse, clamped to game area
    let newX = mouseX - paddleHalfWidth;
    newX = Math.max(GAME_LEFT, Math.min(GAME_RIGHT - paddle.width + 1, newX));
    paddle.x = newX;

    // Click to perform action
    if (event.type === 'mouse-click') {
      launchBall();
    }
  }
}
```

---

## Game Loop Pattern

For games that need continuous updates:

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  let running = true;
  let gameLoop: NodeJS.Timeout | null = null;

  // Game state
  let playerX = 40;
  let score = 0;

  // Input handler - set on bbsSession!
  // IMPORTANT: data is a raw string (the key pressed)
  bbsSession.doorInputHandler = (data: string) => {
    const key = data.toLowerCase();

    // Arrow keys come as ANSI escape sequences
    if (data === '\x1b[D' || key === 'a') {  // Left arrow or 'a'
      playerX = Math.max(1, playerX - 1);
    } else if (data === '\x1b[C' || key === 'd') {  // Right arrow or 'd'
      playerX = Math.min(80, playerX + 1);
    } else if (key === 'q') {
      running = false;
    }
  };

  // Render function
  function render() {
    let output = '\x1b[2J\x1b[H';  // Clear screen
    output += `Score: ${score}\r\n`;
    output += `\x1b[10;${playerX}H@`;  // Draw player
    socket.emit('ansi-output', output);
  }

  // Game loop (30 FPS)
  const FPS = 30;
  gameLoop = setInterval(() => {
    if (!running) {
      if (gameLoop) clearInterval(gameLoop);
      socket.emit('door:close');
      return;
    }

    // Update game state
    score++;

    // Render
    render();
  }, 1000 / FPS);

  // Wait for door to close
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      if (gameLoop) clearInterval(gameLoop);
      // Clean up bbsSession state
      bbsSession.mouseEventsEnabled = false;
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}
```

---

## ANSI Escape Codes Reference

### Cursor Control

| Code | Description |
|------|-------------|
| `\x1b[H` | Move cursor to home (1,1) |
| `\x1b[{row};{col}H` | Move to specific position |
| `\x1b[{n}A` | Move up n lines |
| `\x1b[{n}B` | Move down n lines |
| `\x1b[{n}C` | Move right n columns |
| `\x1b[{n}D` | Move left n columns |
| `\x1b[?25l` | Hide cursor |
| `\x1b[?25h` | Show cursor |

### Screen Control

| Code | Description |
|------|-------------|
| `\x1b[2J` | Clear entire screen |
| `\x1b[J` | Clear from cursor to end |
| `\x1b[1J` | Clear from start to cursor |
| `\x1b[K` | Clear line from cursor |
| `\x1b[2K` | Clear entire line |

### Colors (Foreground)

| Code | Color |
|------|-------|
| `\x1b[30m` | Black |
| `\x1b[31m` | Red |
| `\x1b[32m` | Green |
| `\x1b[33m` | Yellow |
| `\x1b[34m` | Blue |
| `\x1b[35m` | Magenta |
| `\x1b[36m` | Cyan |
| `\x1b[37m` | White |
| `\x1b[90m`-`\x1b[97m` | Bright versions |

### Colors (Background)

| Code | Color |
|------|-------|
| `\x1b[40m` | Black |
| `\x1b[41m` | Red |
| `\x1b[42m` | Green |
| `\x1b[43m` | Yellow |
| `\x1b[44m` | Blue |
| `\x1b[45m` | Magenta |
| `\x1b[46m` | Cyan |
| `\x1b[47m` | White |
| `\x1b[100m`-`\x1b[107m` | Bright versions |

### Text Attributes

| Code | Description |
|------|-------------|
| `\x1b[0m` | Reset all attributes |
| `\x1b[1m` | Bold |
| `\x1b[2m` | Dim |
| `\x1b[5m` | Blink |
| `\x1b[7m` | Reverse (swap fg/bg) |

### Block Characters

```typescript
const BLOCK = {
  full: '\u2588',      // Full block
  upper: '\u2580',     // Upper half
  lower: '\u2584',     // Lower half
  light: '\u2591',     // Light shade
  medium: '\u2592',    // Medium shade
  dark: '\u2593',      // Dark shade
};
```

---

## Saving/Loading Data

Doors can persist data using the filesystem:

```typescript
import * as fs from 'fs';
import * as path from 'path';

// Get door's directory
const doorDir = path.dirname(__filename);

// Save highscores
function saveHighscores(scores: HighScore[]) {
  const filePath = path.join(doorDir, 'highscores.json');
  fs.writeFileSync(filePath, JSON.stringify(scores, null, 2));
}

// Load highscores
function loadHighscores(): HighScore[] {
  const filePath = path.join(doorDir, 'highscores.json');
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
}
```

---

## Audio Feedback

Use terminal bell for audio feedback:

```typescript
const BELL = '\x07';  // Terminal bell character

function playSound() {
  socket.emit('ansi-output', BELL);
}

// Play multiple beeps
function playMelody() {
  let delay = 0;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => socket.emit('ansi-output', BELL), delay);
    delay += 100;
  }
}
```

---

## Closing the Door

Always clean up properly:

```typescript
function cleanup() {
  // Stop game loops
  if (gameLoop) clearInterval(gameLoop);

  // Disable mouse events (use bbsSession!)
  bbsSession.mouseEventsEnabled = false;

  // Clear input handler (use bbsSession!)
  bbsSession.doorInputHandler = null;

  // Show cursor and reset colors
  socket.emit('ansi-output', '\x1b[?25h\x1b[0m');

  // Signal door is done
  socket.emit('door:close');
}

// Call on quit
cleanup();
```

**IMPORTANT Cleanup Checklist:**
1. Clear any `setInterval` or `setTimeout` timers
2. Set `bbsSession.mouseEventsEnabled = false`
3. Set `bbsSession.doorInputHandler = null`
4. Show cursor: `\x1b[?25h`
5. Reset colors: `\x1b[0m`
6. Emit `door:close` event

---

## Complete Example: Simple Menu

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession, user } = doorSession;

  let selection = 0;
  const options = ['Play Game', 'View Scores', 'Help', 'Quit'];
  const username = user?.username || bbsSession.user?.username || 'Guest';

  function render() {
    let out = '\x1b[2J\x1b[H';
    out += '\x1b[36m=== My Door ===\x1b[0m\r\n';
    out += `Welcome, ${username}!\r\n\r\n`;

    for (let i = 0; i < options.length; i++) {
      if (i === selection) {
        out += `\x1b[33m> ${options[i]}\x1b[0m\r\n`;
      } else {
        out += `  ${options[i]}\r\n`;
      }
    }

    out += '\r\n\x1b[90mUse arrows to navigate, Enter to select\x1b[0m';
    socket.emit('ansi-output', out);
  }

  // Set input handler on bbsSession!
  // IMPORTANT: data is a raw string (the key pressed)
  bbsSession.doorInputHandler = (data: string) => {
    const key = data.toLowerCase();

    // Arrow keys are ANSI escape sequences: \x1b[A (up), \x1b[B (down)
    if (data === '\x1b[A' || key === 'w') {
      selection = (selection - 1 + options.length) % options.length;
      render();
    } else if (data === '\x1b[B' || key === 's') {
      selection = (selection + 1) % options.length;
      render();
    } else if (key === '\r' || key === '\n') {
      switch (selection) {
        case 0: /* Start game */ break;
        case 1: /* Show scores */ break;
        case 2: /* Show help */ break;
        case 3:
          // Cleanup before closing
          bbsSession.doorInputHandler = null;
          socket.emit('ansi-output', '\x1b[2J\x1b[H\x1b[?25hGoodbye!\r\n');
          socket.emit('door:close');
          break;
      }
    }
  };

  render();

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}
```

---

## Troubleshooting

### Door Not Found

1. Check `.info` file exists in `Commands/BBSCmd/`
2. Verify `LOCATION` matches door directory name
3. Restart BBS server to reload commands
4. Check `package.json` has `runtime: "server"` and `doorPattern: "runDoor"`

### Input Not Working

1. Ensure `bbsSession.doorInputHandler` is set (NOT `session.doorInputHandler`)
2. **CRITICAL**: Input data is a raw string, NOT an object! Use `data` directly, not `data.key`
3. Arrow keys are ANSI escape sequences (`\x1b[A`, `\x1b[B`, etc.), not strings like 'ArrowUp'
4. Test with simple logging: `console.log('Key received:', JSON.stringify(data))`

### Mouse Not Working

1. Ensure `bbsSession.mouseEventsEnabled = true` (NOT `session.mouseEventsEnabled`)
2. Mouse events come as JSON strings - check `typeof data === 'string' && data.startsWith('{')`
3. Parse with `JSON.parse(data)` to get `{ type, x, y, button }`
4. Remember to set `bbsSession.mouseEventsEnabled = false` on cleanup

### Screen Not Clearing

1. Use `\x1b[2J\x1b[H` (clear + home) together
2. Hide cursor with `\x1b[?25l` for smoother rendering
3. Show cursor on exit with `\x1b[?25h`

### Game Running Slow

1. Reduce FPS (30 is usually enough for terminals)
2. Minimize output - only update changed areas
3. Use double-buffering (build string, emit once)

### Common Mistakes

| Wrong | Correct |
|-------|---------|
| `doorSession.session` | `doorSession.bbsSession` |
| `session.doorInputHandler` | `bbsSession.doorInputHandler` |
| `session.mouseEventsEnabled` | `bbsSession.mouseEventsEnabled` |
| `data.key` or `data?.key` | `data` (input is a raw string, not an object!) |
| Checking for `'ArrowUp'` | Check for `'\x1b[A'` (ANSI escape sequence) |
| Missing `runtime: "server"` in package.json | Add `"runtime": "server"` |
| Missing `doorPattern: "runDoor"` | Add `"doorPattern": "runDoor"` |
| Not cleaning up on exit | Set `doorInputHandler = null`, `mouseEventsEnabled = false` |
| `"types": ["node"]` in tsconfig | Remove the `types` field to allow all `@types/*` packages |

### TypeScript Types Not Found

If you get errors like `Could not find a declaration file for module 'X'`:

1. Check if you have `"types": ["node"]` in tsconfig.json - this restricts TypeScript to ONLY look for `@types/node`
2. **Solution**: Remove the entire `"types"` line from tsconfig.json
3. TypeScript will then automatically find all `@types/*` packages in node_modules

---

## Hybrid Doors (Audio/Graphics + Server Logic)

For doors that need **real audio** (Web Audio API, Tone.js) and **server persistence** (highscores, database), use a **hybrid door**.

### What Makes a Door Hybrid?

- **Client component** (`client.ts`): Runs in browser
  - Full Web Audio API support (real sounds, music)
  - GraphicsEngine, AudioEngine from SDK
  - Handles rendering and input
  - Makes RPC calls to server for persistence

- **Server component** (`server.ts`): Runs in Node.js
  - File system access for highscores
  - Database operations
  - Receives RPC calls from client

### Example: Arkanoid Hybrid Door

**Directory Structure:**
```
doors/arkanoid/
  package.json      # runtime: "hybrid"
  tsconfig.json     # ESNext module
  index.ts          # Entry point + RPC exports
  client.ts         # Browser game with audio
  server.ts         # Highscore persistence
  dist/             # Compiled output
```

**package.json (hybrid):**
```json
{
  "name": "arkanoid",
  "version": "2.0.0",
  "description": "Classic Arkanoid with audio - Hybrid Door",
  "main": "server.ts",
  "bbsCommand": "ARKANOID",
  "doorType": "TS",
  "runtime": "hybrid",
  "client": {
    "entry": "./client.ts",
    "bundle": "./dist/client.bundle.js"
  },
  "server": {
    "entry": "./server.ts"
  },
  "accessLevel": 0
}
```

**client.ts (browser):**
```typescript
import {
  ClientDoor,
  GraphicsEngine,
  AudioEngine,
  AnsiColor
} from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'Arkanoid',
  version: '2.0.0',
  runtime: 'client',
  hybrid: true,  // Enable RPC
});

door.onConnect(async (user) => {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });
  const audio = new AudioEngine();

  await audio.init();

  // Play sounds
  audio.playSound('hit');
  audio.playSound('powerup');
  audio.playSound('gameover');

  // Generate background music
  audio.generateMusic({
    prompt: 'retro arcade',
    tempo: 130,
    instruments: ['square']
  });

  // RPC call to server
  const result = await door.rpc('saveHighscore', {
    name: user.username,
    score: 50000,
    level: 5
  });
});

door.start();
```

**server.ts (Node.js):**
```typescript
import * as fs from 'fs';
import * as path from 'path';

interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

export function getHighscores(): { highscores: HighScore[] } {
  const data = fs.readFileSync('./highscores.json', 'utf-8');
  return { highscores: JSON.parse(data) };
}

export function saveHighscore(params: { name: string; score: number; level: number }) {
  // Save to disk
  return { success: true };
}

export const rpcHandlers = { getHighscores, saveHighscore };
```

### SDK Audio Features

The SDK AudioEngine provides:

**Pre-defined Sounds:**
- `laser` - Laser/shoot sound
- `explosion` - Explosion noise
- `jump` - Jump/bounce sound
- `coin` - Pickup/collect sound
- `hit` - Impact sound
- `powerup` - Power-up fanfare
- `menu-beep` - Menu navigation beep
- `gameover` - Game over descending notes

**Custom Sounds:**
```typescript
audio.playCustomSound({
  type: 'custom',
  frequency: 440,
  duration: 0.2,
  envelope: 'pluck',
  volume: 0.5
});
```

**Background Music:**
```typescript
audio.generateMusic({
  prompt: 'upbeat chiptune',
  tempo: 140,
  pattern: 'x-x-x-x-',
  instruments: ['square', 'triangle']
});
```

**Adaptive Music:**
```typescript
audio.setMusicState('combat', 0.9, 'crossfade');
audio.setMusicState('explore', 0.3, 'fade');
```

### When to Use Each Door Type

| Need | Door Type |
|------|-----------|
| Text-based game, terminal UI | Backend (`server`) |
| Rich graphics, Canvas, WebGL | Frontend (`client`) |
| Audio + score persistence | **Hybrid** |
| Multiplayer with sounds | **Hybrid** |
| Simple text utility | Backend (`server`) |

---

## See Also

- [SDK Status](archive/SDK_CURRENT_STATUS_20251112.md) - Full SDK documentation
- [SDK Build & Run](archive/SDK_BUILD_AND_RUN.md) - Automatic installation
- [Door Manager](DOOR_MANAGER.md) - BBS door management
- [Examples](EXAMPLES.md) - More door examples
