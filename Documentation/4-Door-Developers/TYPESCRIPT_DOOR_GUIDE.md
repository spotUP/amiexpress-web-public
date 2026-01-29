# TypeScript Door Development Guide

Complete guide for creating TypeScript doors for AmiExpress-Web BBS.

## Modern Door UX (Required)

Always aim for modern, desktop-like doors using neo-blessed windows, panels, and mouse support. Avoid 90's text menus unless explicitly requested.

## Quick Checklist for TypeScript Doors

Before you start coding, remember these critical rules:

- ✅ **ALWAYS use SDK helpers** - `createBox()`, `createList()`, `createTextbox()`
- ❌ **NEVER use blessed directly** - `blessed.box()`, `blessed.list()` will break mouse support
- ✅ **Enable mouse** - `screen.program.enableMouse()` at start of every screen
- ✅ **Enable keyboard nav** - `vi: true` on all list widgets
- ✅ **Use DoorInputManager** - Proper input cleanup, prevents BBS input breakage
- ✅ **Clear screen properly** - `clearRegion()` + `alloc()` + `render()` + 200ms wait
- ✅ **Clean up on exit** - `screen.remove()` all widgets, `inputManager.disable()`
- ✅ **Add backgrounds** - `bg: 'black'` in all widget styles
- ✅ **Import correctly** - Use `@amiexpress/bbs-door-sdk/utils/...`, not relative paths
- ✅ **Check reference doors** - Look at `Doors/grandmaster/ui/` for patterns

**If your door has any of these issues, you did it wrong:**
- ❌ Mouse clicks don't work
- ❌ Arrow keys don't navigate lists
- ❌ BBS input broken after exiting door
- ❌ Colors don't display (`{cyan-fg}` shows as literal text)
- ❌ Widgets don't clean up (ghost boxes after exit)

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
  "type": "module",
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
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### 3. Install Dependencies

```bash
npm install
```

This creates a symlink to the SDK at `node_modules/@amiexpress/bbs-door-sdk`.

**Required Fields:**
- `bbsCommand`: The command users type to run your door (e.g., "MYDOOR")
- `doorType`: Must be "TS" for TypeScript doors
- `main`: Entry point file (usually "index.ts")
- `runtime`: Must be "server" for server-side TypeScript doors
- `doorPattern`: Must be "runDoor" (the exported function name)

### 4. Create tsconfig.json

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

### 5. Create index.ts

**CRITICAL**: Your door MUST export a `runDoor()` function. Without this export, the BBS cannot load your door.

**⚠️ IMPORTANT: SDK Import Rules**

When importing from the SDK, **ALWAYS use package paths**, NEVER relative paths:

```typescript
// ✅ CORRECT
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';

// ❌ WRONG - Will break your door!
import { createBox } from '../../utils/blessed-helpers';
import { AudioEngine } from '../../engines/audio/audio-engine';
```

See the "CRITICAL: SDK Import Rules" section in Troubleshooting for full details.

---

## CRITICAL: ALWAYS Use SDK UI Helpers

**❌ NEVER DO THIS:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// ❌ WRONG - No mouse support, broken cleanup, missing tags
const box = blessed.box({ parent: screen, ... });
const list = blessed.list({ parent: screen, ... });
const textbox = blessed.textbox({ parent: screen, ... });
```

**✅ ALWAYS DO THIS:**
```typescript
import { createBox, createList, createTextbox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// ✅ CORRECT - Full mouse support, proper cleanup, auto tags
const box = createBox({ parent: screen, ... });
const list = createList({ parent: screen, mouse: true, vi: true, ... });
const textbox = createTextbox({ parent: screen, ... });
```

**Why SDK helpers are required:**

1. **Mouse support** - SDK widgets have proper mouse event handling
2. **Automatic cleanup** - Widgets clean up properly when removed
3. **Tags enabled** - `tags: true` is automatic (colors work correctly)
4. **Keyboard navigation** - `vi: true` for arrow keys, `keys: true` for shortcuts
5. **Consistent behavior** - All doors work the same way

**Reference implementation:** See `Doors/grandmaster/ui/menu.ts` for a complete example of proper SDK widget usage.

**Required pattern for all screens:**
```typescript
import { createScreen, createBox, createList, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Enable mouse at start of every screen
screen.program.enableMouse();

// Clear screen before rendering
screen.clearRegion(0, screen.width, 0, screen.height);
screen.alloc();
screen.render();
await new Promise(r => setTimeout(r, 200));  // Wait for clear

// Use SDK helpers for ALL widgets
const header = createBox({ parent: screen, ... });
const menu = createList({ parent: screen, mouse: true, vi: true, ... });

// Proper cleanup on exit
const cleanup = () => {
  screen.remove(header);
  screen.remove(menu);
};
```

---

## Basic Door Example (Raw ANSI - No UI)

This example shows basic door structure **without neo-blessed**. For modern UI doors, skip to "Neo-Blessed UI Example" below.

```typescript
/**
 * My Door - Description
 */

/** Optional metadata for SDK tools */
export const metadata = {
  name: 'My Door',
  version: '1.0.0',
  description: 'My awesome BBS door',
  author: 'Your Name',
  command: 'MYDOOR',
};

/** REQUIRED: Main entry point - BBS calls this function */
export async function runDoor(doorSession: any): Promise<void> {
  // IMPORTANT: Use bbsSession, not session!
  const { socket, bbsSession, user } = doorSession;

  // CRITICAL: Set both inDoorManager flag AND doorInputHandler on bbsSession
  // The backend requires BOTH flags to route input to your door
  bbsSession.inDoorManager = true;

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
      // Cleanup before closing - clear BOTH flags
      bbsSession.inDoorManager = false;
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
      // CRITICAL: Clean up BOTH flags when door exits
      bbsSession.inDoorManager = false;
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}
```

### 6. Create .info File (Required)

Create `Commands/BBSCmd/MYDOOR.info`:

```
BBSCMD=MYDOOR
TYPE=TS
LOCATION=doors/my-door
DESCRIPTION=My awesome BBS door
ACCESS=0
MULTINODE=YES
PRIORITY=SAME
PRELOADER=YES
```

#### .info File Fields

- **BBSCMD** - Command name users type (uppercase)
- **TYPE** - Door type (TS for TypeScript, SDK for new SDK doors)
- **LOCATION** - Path to door directory (relative to BBS root, e.g., `doors/my-door`)
- **DESCRIPTION** - User-visible description
- **ACCESS** - Minimum security level (0 = all users)
- **MULTINODE** - YES/NO (whether multiple users can run simultaneously)
- **PRIORITY** - SAME/HIGHER/LOWER (process priority)
- **PRELOADER** - YES/NO (show animated loading spinner during module import)

#### PRELOADER Tooltype

**When to use PRELOADER=YES:**
- TypeScript doors that take >200ms to initialize (large dependencies, complex UI setup)
- Doors using neo-blessed with many widgets
- Doors importing heavy npm packages

**When to use PRELOADER=NO:**
- Simple/fast doors that initialize instantly
- Doors that want to show custom loading UI

**How it works:**
1. User runs command (e.g., `MYDOOR`)
2. If `PRELOADER=YES`, BBS shows animated spinner with "Loading MYDOOR..." message
3. Spinner animates while door module is imported (`import('doors/my-door')`)
4. Once import completes and `runDoor()` starts executing, spinner automatically hides
5. Door takes over rendering

**Implementation:** The preloader uses `showPreloaderWhile()` from `sdk/utils/door-preloader.ts` which:
- Displays centered box with animated spinner (|, /, -, \)
- Uses direct ANSI output (bypasses blessed rendering)
- Continues until door module import completes
- No hardcoded delays - duration matches actual import time

**Example:** See `Doors/neo-blessed-showcase/neo-blessed-showcase.info` for reference.

**Important:** TypeScript doors are discovered at BBS startup by scanning `.info` files.
Doors without a `.info` file will not be registered or available.

**Packaging:** The SDK packer expects a `.info` file in `Commands/BBSCmd/` and builds a minimal archive
containing `Commands/BBSCmd/` and `Doors/<door>/` only (no SDK bundled).

Use the packer:

```bash
# From your door repo root (must include Commands/BBSCmd/<DOOR>.info)
npm run pack
```

### 7. Test Your Door

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
  x: number;   // 0-indexed column (add 1 for ANSI positioning)
  y: number;   // 0-indexed row (add 1 for ANSI positioning)
  button?: number;  // 0=left, 1=middle, 2=right
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}
```

**IMPORTANT - Coordinate Systems:**
- Frontend sends **0-indexed** coordinates (0-79 for columns, 0-23 for rows)
- ANSI escape sequences use **1-indexed** coordinates (1-80, 1-24)
- Always add 1 when converting mouse coordinates to ANSI positions:
  ```typescript
  const mouseX = event.x + 1;  // 0-indexed -> 1-indexed
  const mouseY = event.y + 1;
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

## Input Management & Cleanup

### ⚠️ CRITICAL: Always Use DoorInputManager

**THE #1 CAUSE OF "BBS INPUT BROKEN AFTER DOOR EXIT" BUGS IS MISSING INPUT CLEANUP.**

Every blessed UI door MUST use `DoorInputManager` to properly manage input state. Manual input setup WITHOUT proper cleanup WILL break BBS input when the door exits.

### Why DoorInputManager?

Input handling has 7+ layers that must be set up AND torn down correctly:
1. BBS game mode (`enableGameMode` / `disableGameMode`)
2. BBS session flag (`inDoorManager = true/false`)
3. Blessed keyboard capture (`grabKeys = true/false`)
4. Blessed mouse events (`enableMouse()` / `disableMouse()`)
5. BBS mouse events flag (`mouseEventsEnabled = true/false`)
6. Input handler registration (`doorInputHandler`)
7. Input handler cleanup (`delete doorInputHandler`)

**Missing even ONE cleanup step = broken BBS input.**

DoorInputManager handles ALL of this automatically in the correct order.

### ✅ CORRECT: Using DoorInputManager

```typescript
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

class MyDoor {
  private inputManager!: DoorInputManager;

  async run() {
    // Create screen
    this.screen = createScreen(this.session.bbs, { ... });

    // Set up input management
    this.inputManager = new DoorInputManager(this.session, this.screen, {
      enableGameMode: false,  // Blessed UI mode (use true for ncurses games)
      enableGrabKeys: false,  // Blessed focus system (use true for games)
      enableMouse: true,      // Enable mouse events
      debug: false,
      debugName: 'MyDoor'
    });

    // Enable input (sets all 7 flags correctly)
    this.inputManager.enable();

    // ... your door logic ...
  }

  cleanup() {
    // CRITICAL: Disable input FIRST (before screen.destroy)
    if (this.inputManager) {
      this.inputManager.disable();  // Resets all 7 flags in reverse order
    }

    if (this.screen) {
      this.screen.destroy();
    }
  }
}
```

### ❌ WRONG: Manual Input Setup

```typescript
// ❌ DON'T DO THIS - Missing cleanup steps!
function setupScreen() {
  const screen = createScreen(session.bbs, { ... });

  // Manual setup (easy to forget cleanup)
  session.bbsSession.inDoorManager = true;
  session.bbsSession.mouseEventsEnabled = true;
  session.bbsSession.doorInputHandler = (data) => {
    screen.program.emit('data', data);
  };

  return screen;
}

function cleanup() {
  // ❌ INCOMPLETE CLEANUP - Will break BBS input!
  screen.destroy();
  // Missing: inDoorManager = false
  // Missing: mouseEventsEnabled = false
  // Missing: delete doorInputHandler
}
```

### Input Modes: Game vs Blessed UI

**Blessed UI Mode** (Desktop-like doors):
```typescript
this.inputManager = new DoorInputManager(session, screen, {
  enableGameMode: false,  // Blessed handles input routing
  enableGrabKeys: false,  // Blessed focus system works
  enableMouse: true       // Mouse events enabled
});
```

**Game Mode** (Arcade games, ncurses):
```typescript
this.inputManager = new DoorInputManager(session, screen, {
  enableGameMode: true,   // Raw keyboard input
  enableGrabKeys: true,   // Capture ALL keys
  enableMouse: true       // Mouse events enabled
});
```

### Test Checklist: Input Cleanup Working?

After implementing DoorInputManager, test this:

1. ✅ Run door
2. ✅ Exit door via menu/quit
3. ✅ **IMMEDIATELY type in BBS prompt** - should work!
4. ✅ Run door AGAIN - should work!
5. ✅ Exit again - BBS input should STILL work!

**If typing doesn't work after exit = missing DoorInputManager.disable() call.**

### Common Mistakes

**❌ Calling screen.enableMouse() after inputManager.enable():**
```typescript
inputManager.enable();
screen.program.enableMouse();  // ❌ Redundant - already done!
```

**✅ Correct - DoorInputManager handles it:**
```typescript
inputManager.enable();  // ✓ Calls enableMouse() internally
```

**❌ Destroying screen before disabling inputManager:**
```typescript
screen.destroy();         // ❌ WRONG ORDER
inputManager.disable();   // Too late!
```

**✅ Correct - Disable inputManager FIRST:**
```typescript
inputManager.disable();   // ✓ Restore BBS state
screen.destroy();         // ✓ Then destroy UI
```

### Reference Doors Using DoorInputManager

Good examples to copy:
- `Doors/livechat/server.ts` - Chat door with blessed UI
- `Doors/ansi-editor/index.ts` - ANSI editor with blessed UI
- `Doors/whip/app.ts` - Project management door
- `Doors/zoo-keeper/index.ts` - Game door with blessed UI
- `Doors/card-lobby/index.ts` - Card game lobby

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

## Complete Example: Neo-Blessed UI Door

**Modern door pattern using SDK helpers** - This is the RECOMMENDED way to build TypeScript doors.

```typescript
/**
 * Modern Menu Door - Complete Example
 * Shows proper use of SDK UI helpers, mouse support, and cleanup
 */

import {
  createScreen,
  createBox,
  createList,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export const metadata = {
  name: 'Modern Menu',
  version: '1.0.0',
  description: 'Example neo-blessed door',
  author: 'Your Name',
  command: 'MENU',
};

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession, bbs, user } = doorSession;

  // Create screen
  const screen = createScreen(bbs, {
    title: 'Modern Menu Door',
    smartCSR: false,
    fastCSR: false,
    focusKeys: false,
  });

  // Create input manager for proper cleanup
  const inputManager = new DoorInputManager(bbsSession, screen, {
    enableGameMode: true,
    enableGrabKeys: true,
    enableMouse: true,
    debug: false,
    debugName: 'MENU'
  });

  // Enable input (includes mouse)
  inputManager.enable();

  // Clear screen
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();
  screen.render();
  await new Promise(r => setTimeout(r, 200));

  // Create header using SDK helper
  const header = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{bold}{cyan-fg}=== MODERN MENU ==={/cyan-fg}{/bold}{/center}',
    style: { fg: 'cyan', bg: 'black' }
  });

  // Create menu using SDK helper
  const menuBox = createBox({
    parent: screen,
    top: 4,
    left: 'center',
    width: 30,
    height: 10,
    border: { type: 'line' },
    label: ' Select Option ',
    style: {
      border: { fg: 'cyan' },
      bg: 'black'
    }
  });

  const menuItems = [
    { key: 'P', label: 'Play Game', value: 'play' },
    { key: 'S', label: 'Scores', value: 'scores' },
    { key: 'H', label: 'Help', value: 'help' },
    { key: 'Q', label: 'Quit', value: 'quit' }
  ];

  // CRITICAL: Use createList, not blessed.list
  const menu = createList({
    parent: menuBox,
    top: 1,
    left: 1,
    width: '100%-2',
    height: menuItems.length,
    items: menuItems.map(item => `[{bold}${item.key}{/bold}] ${item.label}`),
    keys: true,
    vi: true,      // Arrow key navigation
    mouse: true,   // Mouse click support
    style: {
      selected: { bg: 'cyan', fg: 'black' },
      item: { fg: 'white' }
    }
  });

  // Footer
  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{center}Arrow Keys: Navigate  |  Enter: Select  |  Q: Quit{/center}',
    style: { fg: 'gray', bg: 'black' }
  });

  menu.focus();
  screen.render();

  // Handle selection
  await new Promise<void>((resolve) => {
    // Keyboard shortcuts
    const keyHandler = (ch: any, key: any) => {
      const keyName = key.name.toUpperCase();
      const menuItem = menuItems.find(item => item.key === keyName);

      if (menuItem) {
        if (menuItem.value === 'quit') {
          resolve();
        } else {
          // Handle other menu items
          socket.emit('ansi-output', `Selected: ${menuItem.label}\r\n`);
        }
      }
    };

    // Mouse/Enter selection
    const selectHandler = (item: any, index: number) => {
      const selected = menuItems[index];
      if (selected.value === 'quit') {
        resolve();
      } else {
        socket.emit('ansi-output', `Selected: ${selected.label}\r\n`);
      }
    };

    menu.on('select', selectHandler);
    screen.on('keypress', keyHandler);

    // Cleanup on socket disconnect
    socket.once('disconnect', () => resolve());
  });

  // Cleanup - CRITICAL: Remove all widgets and disable input
  screen.off('keypress', () => {});
  menu.removeAllListeners('select');
  screen.remove(header);
  screen.remove(menuBox);
  screen.remove(footer);

  inputManager.disable();  // Automatic cleanup
  screen.destroy();
}
```

**Key points in this example:**

1. ✅ **SDK helpers only** - `createBox`, `createList`, not `blessed.box()`
2. ✅ **DoorInputManager** - Handles all input cleanup automatically
3. ✅ **Mouse enabled** - `screen.program.enableMouse()` and `mouse: true`
4. ✅ **Keyboard navigation** - `vi: true` for arrow keys, `keys: true` for shortcuts
5. ✅ **Proper cleanup** - Remove all widgets, disable input manager
6. ✅ **Background colors** - `bg: 'black'` on all widgets prevents visual artifacts
7. ✅ **Screen clear** - `clearRegion()` + `alloc()` + `render()` + 200ms wait

**For more complex examples, see:**
- `Doors/grandmaster/ui/menu.ts` - Multi-panel menu with descriptions
- `Doors/whip/ui/main-menu.ts` - Simple menu with stats
- `Doors/whip/ui/kanban-board.ts` - Complex multi-column board
- `Doors/bug-tracker/app.ts` - Full implementation with all patterns below

---

## View Management Patterns (Best Practices)

These patterns emerged from real-world door development and solve common issues with navigation, focus, and cleanup.

### Three-Part Layout Pattern

**Every view should have three parts:**

1. **Header** - Title bar with summary info (NOT focusable)
2. **Content** - Main List or scrollable Box (focusable)
3. **Footer** - Action hints and keyboard shortcuts (NOT focusable)

```typescript
private showMyView(): void {
  this.currentView = 'myview';
  this.clearMain();

  // 1. Header - NOT focusable
  createBox({
    parent: this.mainContainer,
    top: 0,
    left: 1,
    width: '98%',
    height: 3,
    border: { type: 'line' },
    label: ' View Title ',
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    content: ' Summary info here',
    tags: true,
    focusable: false,  // CRITICAL: Headers are not focusable
  });

  // 2. Content - focusable List or scrollable Box
  const contentList = createList({
    parent: this.mainContainer,
    top: 3,
    left: 1,
    width: '98%',
    height: '100%-6',  // Leave room for header (3) and footer (3)
    border: { type: 'line' },
    items: ['Item 1', 'Item 2', 'Item 3'],
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
      selected: { fg: 'black', bg: 'cyan' },
      item: { fg: 'white', bg: 'black' },
    },
    padding: { left: 1 },
    // Lists are focusable by default via createList
  });

  // 3. Footer - NOT focusable
  createBox({
    parent: this.mainContainer,
    bottom: 0,
    left: 1,
    width: '98%',
    height: 3,
    border: { type: 'line' },
    style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
    content: ' {cyan-fg}[Enter]{/} Select   {red-fg}[ESC]{/} Back',
    tags: true,
    focusable: false,  // CRITICAL: Footers are not focusable
  });

  contentList.focus();
  this.screen.render();
}
```

**Why this matters:**
- Consistent visual layout across all screens
- Users can't tab to headers/footers (which would be confusing)
- Footer always shows available actions
- Arrow keys work predictably on content

### Focus Management: `focusable: false`

**All non-interactive boxes must have `focusable: false`:**

```typescript
// Header boxes - NEVER focusable
createBox({
  parent: screen,
  content: 'Header',
  focusable: false,  // CRITICAL
});

// Footer boxes - NEVER focusable
createBox({
  parent: screen,
  content: 'Footer hints',
  focusable: false,  // CRITICAL
});

// Stats/info panels - NEVER focusable
createBox({
  parent: screen,
  content: 'Statistics: ...',
  focusable: false,  // CRITICAL
});

// Labels - NEVER focusable
createBox({
  parent: screen,
  content: 'Field Label:',
  focusable: false,  // CRITICAL
});
```

**What IS focusable:**
- Lists (menus, selections)
- Textboxes (input fields)
- Buttons
- Scrollable content boxes (for reading/scrolling)

**Symptoms of missing `focusable: false`:**
- Users can tab to header/footer
- Focus "disappears" (on non-interactive element)
- Tab order is confusing

### View State Management

**Use a `currentView` property to track which view is active:**

```typescript
type ViewName = 'menu' | 'list' | 'detail' | 'edit' | 'settings';

class MyDoor {
  private currentView: ViewName = 'menu';

  private showMainMenu(): void {
    this.currentView = 'menu';
    this.clearMain();
    // ... build menu view
  }

  private showList(): void {
    this.currentView = 'list';
    this.clearMain();
    // ... build list view
  }
}
```

**Why track view state?**
1. Prevent key handlers from firing in wrong view
2. Conditional behavior based on current view
3. ESC key returns to correct parent view

```typescript
// Key handlers check current view
this.registerKey(['s', 'S'], () => {
  if (this.currentView === 'menu') {  // Only on menu
    this.showSettings();
  }
});

// Global Q only quits from main menu
this.screen.key(['q', 'Q'], () => {
  if (this.currentView === 'menu') {  // Only on menu
    this.quit();
  }
});
```

### Key Handler Cleanup Pattern

**Key handlers accumulate if not cleaned up between views!**

```typescript
class MyDoor {
  private keyHandlers: { keys: string[]; handler: () => void }[] = [];

  // Register a key handler (tracks it for cleanup)
  private registerKey(keys: string | string[], handler: () => void): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.keyHandlers.push({ keys: keyArray, handler });
    this.screen.key(keyArray, handler);
  }

  // Clear all view-specific key handlers
  private clearKeyHandlers(): void {
    this.keyHandlers.forEach(({ keys, handler }) => {
      this.screen.unkey(keys, handler);
    });
    this.keyHandlers = [];
  }

  // Clear main container AND key handlers
  private clearMain(): void {
    this.clearKeyHandlers();  // CRITICAL: Clear handlers first
    const children = [...this.mainContainer.children];
    children.forEach(child => child.detach());
  }
}
```

**Symptoms of missing key handler cleanup:**
- Keys fire multiple times per press
- Old view's keys work in new view
- Memory leaks (handlers accumulate)

### ESC Key Race Condition Fix

**ESC handlers must use `setImmediate()` to avoid race conditions:**

```typescript
// WRONG - May cause race condition
this.registerKey(['escape'], () => {
  if (this.currentView === 'detail') {
    this.showMainMenu();  // Can conflict with global ESC
  }
});

// CORRECT - Use setImmediate to defer
this.registerKey(['escape'], () => {
  if (this.currentView === 'detail') {
    setImmediate(() => this.showMainMenu());  // Deferred execution
  }
});
```

**Why `setImmediate()`?**
- ESC triggers both local and global handlers
- Without deferral, view change happens mid-event
- `setImmediate()` ensures event processing completes first

### Complete View Management Example

```typescript
import { createScreen, createBox, createList, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen, Box, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

type ViewName = 'menu' | 'detail';

class MyDoor {
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private currentView: ViewName = 'menu';
  private mainContainer!: Box;
  private keyHandlers: { keys: string[]; handler: () => void }[] = [];

  async run(): Promise<void> {
    this.screen = createScreen(this.ctx.bbs, { title: 'My Door', mouse: true });
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,
      enableGrabKeys: true,
      enableMouse: true,
    });
    this.inputManager.enable();

    // Create base layout
    this.createBaseLayout();
    this.showMainMenu();

    await new Promise<void>((resolve) => {
      this.screen.once('destroy', resolve);
    });
  }

  private createBaseLayout(): void {
    // Global header (always visible)
    createBox({
      parent: this.screen,
      top: 0, left: 0, width: '100%', height: 3,
      content: '{center}{bold}My Door{/bold}{/center}',
      style: { fg: 'white', bg: 'blue' },
      tags: true,
      focusable: false,
    });

    // Main container for views
    this.mainContainer = createBox({
      parent: this.screen,
      top: 3, left: 0, width: '100%', bottom: 3,
      focusable: false,
    });

    // Global footer (always visible)
    createBox({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 3,
      content: '{center}Q=Quit | Arrow Keys | Enter{/center}',
      style: { fg: 'white', bg: 'blue' },
      tags: true,
      focusable: false,
    });

    // Global Q quits only from menu
    this.screen.key(['q', 'Q'], () => {
      if (this.currentView === 'menu') this.quit();
    });
  }

  private registerKey(keys: string | string[], handler: () => void): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.keyHandlers.push({ keys: keyArray, handler });
    this.screen.key(keyArray, handler);
  }

  private clearKeyHandlers(): void {
    this.keyHandlers.forEach(({ keys, handler }) => {
      this.screen.unkey(keys, handler);
    });
    this.keyHandlers = [];
  }

  private clearMain(): void {
    this.clearKeyHandlers();
    [...this.mainContainer.children].forEach(child => child.detach());
  }

  private showMainMenu(): void {
    this.currentView = 'menu';
    this.clearMain();

    // Header (not focusable)
    createBox({
      parent: this.mainContainer,
      top: 0, left: 1, width: '98%', height: 3,
      content: ' Welcome!',
      border: { type: 'line' },
      focusable: false,
    });

    // Menu list (focusable)
    const menuList = createList({
      parent: this.mainContainer,
      top: 3, left: 1, width: '98%', height: '100%-6',
      items: ['[V] View Details', '[Q] Quit'],
      border: { type: 'line' },
      style: { selected: { fg: 'black', bg: 'cyan' } },
    });

    // Footer (not focusable)
    createBox({
      parent: this.mainContainer,
      bottom: 0, left: 1, width: '98%', height: 3,
      content: ' {cyan-fg}[Enter]{/} Select   {red-fg}[Q]{/} Quit',
      border: { type: 'line' },
      tags: true,
      focusable: false,
    });

    menuList.on('select', (_item: any, index: number) => {
      if (this.currentView === 'menu') {
        if (index === 0) this.showDetail();
        if (index === 1) this.quit();
      }
    });

    this.registerKey(['v', 'V'], () => {
      if (this.currentView === 'menu') this.showDetail();
    });

    menuList.focus();
    this.screen.render();
  }

  private showDetail(): void {
    this.currentView = 'detail';
    this.clearMain();

    createBox({
      parent: this.mainContainer,
      top: 0, left: 1, width: '98%', height: 3,
      content: ' Detail View',
      border: { type: 'line' },
      focusable: false,
    });

    const contentBox = createBox({
      parent: this.mainContainer,
      top: 3, left: 1, width: '98%', height: '100%-6',
      content: 'Detail content here...',
      border: { type: 'line' },
      scrollable: true,
      focusable: true,
    });

    createBox({
      parent: this.mainContainer,
      bottom: 0, left: 1, width: '98%', height: 3,
      content: ' {red-fg}[ESC]{/} Back',
      border: { type: 'line' },
      tags: true,
      focusable: false,
    });

    // ESC with setImmediate to avoid race condition
    this.registerKey(['escape'], () => {
      if (this.currentView === 'detail') {
        setImmediate(() => this.showMainMenu());
      }
    });

    contentBox.focus();
    this.screen.render();
  }

  private quit(): void {
    this.clearKeyHandlers();
    this.inputManager.disable();
    this.screen.destroy();
  }
}
```

**Key takeaways:**
1. Every view follows three-part layout (Header, Content, Footer)
2. All non-interactive boxes have `focusable: false`
3. `currentView` tracks active view for conditional key handling
4. `registerKey`/`clearKeyHandlers` prevents handler accumulation
5. ESC handlers use `setImmediate()` to avoid race conditions
6. `clearMain()` cleans both children AND key handlers

---

## Troubleshooting

### Invalid TypeScript door: Must export Door instance or runDoor() function

This error means your door's entry point is missing the required `runDoor()` export.

**Fix**: Ensure your `index.ts` exports a `runDoor()` function:

```typescript
// REQUIRED - named export
export async function runDoor(session: any): Promise<void> {
  // Your door code here
}

// OPTIONAL - default export (for compatibility)
export default { runDoor };
```

**Common causes:**
1. Exporting a helper function like `createApp()` instead of `runDoor()`
2. Missing the `export` keyword on `runDoor()`
3. Typo in function name (must be exactly `runDoor`)
4. Build not run after changes (`npm run build`)

### Door Not Found

1. Check `.info` file exists in `Commands/BBSCmd/`
2. Verify `LOCATION` matches door directory name
3. Restart BBS server to reload commands
4. Check `package.json` has `runtime: "server"` and `doorPattern: "runDoor"`

**Reminder:** `.info` files are mandatory for TypeScript doors. The BBS will not auto-register doors from `package.json` alone.

### Cannot find package '@amiexpress/bbs-door-sdk'

This error means the SDK symlink is missing or broken.

**Fix**: Run `npm install` in your door directory:

```bash
cd Doors/my-door
npm install
```

This creates a symlink at `node_modules/@amiexpress/bbs-door-sdk` pointing to the SDK.

**If npm install doesn't fix it**, verify your `package.json` has the SDK dependency:

```json
{
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk"
  }
}
```

The path `../../sdk` is relative to doors in `Doors/` directory. For doors in subdirectories, adjust the path accordingly.

### EISDIR: illegal operation on a directory, read

This error means the BBS is trying to read your door directory as a file, usually because:

1. **Wrong .info file format** - Using `COMMAND=` instead of `BBSCMD=`
2. **Wrong TYPE value** - Using `TYPE=TSDOOR` instead of `TYPE=TS`

**Correct .info format:**
```
BBSCMD=MYDOOR
TYPE=TS
LOCATION=sdk/doors/my-door
DESCRIPTION=My door description
ACCESS=0
MULTINODE=YES
```

**Wrong (causes EISDIR error):**
```
COMMAND=MYDOOR      <-- WRONG: Use BBSCMD=
TYPE=TSDOOR         <-- WRONG: Use TYPE=TS
LOCATION=sdk/doors/my-door
```

**Key differences:**
- `BBSCMD=` (not `COMMAND=`) - Identifies the command name
- `TYPE=TS` (not `TYPE=TSDOOR`) - Tells BBS this is a TypeScript door
- The wrong format causes the door to be loaded as an Amiga 68K binary instead of TypeScript

### Input Not Working

1. Ensure `bbsSession.doorInputHandler` is set (NOT `session.doorInputHandler`)
2. **CRITICAL**: Input data is a raw string, NOT an object! Use `data` directly, not `data.key`
3. Arrow keys are ANSI escape sequences (`\x1b[A`, `\x1b[B`, etc.), not strings like 'ArrowUp'
4. Test with simple logging: `console.log('Key received:', JSON.stringify(data))`

### Game Mode and Input Events

**Important**: Game mode is designed for real-time games that need raw keyboard events. However, game mode can block normal input for doors that use `bbs.getKey()` or `socket.once('command', ...)`.

**Key points:**
- Game mode is NOT automatically enabled for TypeScript doors
- If your door needs real-time keyboard input (games, continuous movement), call `bbs.enableGameMode()`
- If your door uses `bbs.getKey()` for "Press any key to continue..." prompts, do NOT enable game mode
- `bbs.getKey()` relies on 'command' events which are blocked when game mode is active

**When to use game mode:**
- Real-time games (paddle games, shooters, snake-style games)
- Applications needing continuous key repeat
- Games tracking multiple simultaneous key presses

**When NOT to use game mode:**
- Simple menus with `bbs.getKey()` prompts
- Utilities with "Press any key to continue..." flows
- Text-based applications with line input

### Hybrid/Client Door Input (IMPORTANT)

**Game Mode for Smooth Keyboard Input:**

For real-time games (Arkanoid, shooters, etc.), the BBS supports **game mode** which sends `keydown` and `keyup` events instead of regular key presses. This eliminates OS key repeat delay and allows tracking multiple simultaneous keys.

**How Game Mode Works:**
1. Game mode is automatically enabled for hybrid/client doors
2. Instead of single key events, you receive `type: 'keydown'` and `type: 'keyup'` events
3. Track held keys in a `Set` and process them in `onUpdate()` for smooth movement

**Example: Smooth Paddle Movement:**

```typescript
class MyGame {
  private heldKeys: Set<string> = new Set();

  constructor() {
    this.door.onInput((user, key) => {
      const keyType = (key as any).type;
      const keyName = ((key as any).key || key.key || '').toLowerCase();

      if (keyType === 'keydown') {
        this.heldKeys.add(keyName);
        // Handle non-movement keys immediately (space, enter, etc.)
        if (keyName !== 'arrowleft' && keyName !== 'arrowright') {
          this.handleInput(keyName);
        }
        return;
      } else if (keyType === 'keyup') {
        this.heldKeys.delete(keyName);
        return;
      }

      // Fallback for non-game-mode input
      this.handleInput(keyName);
    });

    this.door.onUpdate((delta) => {
      // Process held keys every frame for smooth movement
      if (this.heldKeys.has('arrowleft') || this.heldKeys.has('a')) {
        this.movePaddle(-1);
      }
      if (this.heldKeys.has('arrowright') || this.heldKeys.has('d')) {
        this.movePaddle(1);
      }
    });
  }
}
```

**KeyStateTracker Does NOT Work in BBS Terminal:**

The SDK's `KeyStateTracker` class listens to browser `window.keydown`/`window.keyup` events for instant key repeat. However, when running in the BBS terminal (xterm.js):

1. xterm.js intercepts all keyboard events before they reach `window`
2. Input comes through `door.onInput()`, not window events
3. KeyStateTracker will never receive any key presses

**Solution for Hybrid Doors:**

Handle arrow/movement keys directly in the `door.onInput()` callback:

```typescript
door.onInput((user, key) => {
  const k = key.key?.toLowerCase() || '';

  // Handle movement keys during gameplay
  if (this.state === 'playing') {
    if (k === 'arrowleft' || k === 'a') {
      this.movePaddle(-1);
      return;
    } else if (k === 'arrowright' || k === 'd') {
      this.movePaddle(1);
      return;
    }
  }

  // Handle other keys (space, enter, etc.)
  this.handleOtherInput(k);
});
```

**When KeyStateTracker DOES Work:**
- SDK Preview tool (runs in its own browser tab)
- Standalone browser context (door opens in separate window)
- NOT in BBS terminal (xterm.js embeds the door output)

### Mouse Not Working

1. Ensure `bbsSession.mouseEventsEnabled = true` (NOT `session.mouseEventsEnabled`)
2. Mouse events come as JSON strings - check `typeof data === 'string' && data.startsWith('{')`
3. Parse with `JSON.parse(data)` to get `{ type, x, y, button }`
4. **IMPORTANT**: Mouse coordinates are **0-indexed** from frontend. For ANSI positioning (1-indexed), add 1:
   ```typescript
   const mouseX = event.x + 1;  // Convert to 1-indexed for ANSI
   const mouseY = event.y + 1;
   ```
5. Remember to set `bbsSession.mouseEventsEnabled = false` on cleanup

### Mouse Events on Prompts

For a better user experience, **make all "Press Enter" prompts also respond to mouse clicks**. Users expect clicking to work as a confirmation action.

```typescript
private handleMouseInput(event: { type: string; x: number; y: number }): void {
  if (event.type !== 'mouse-click') return;

  switch (this.state) {
    case 'gameover':
    case 'victory':
      // Click anywhere to proceed (like pressing Enter)
      if (this.isHighScore()) {
        this.state = 'enterName';
      } else {
        this.state = 'menu';
      }
      break;

    case 'highscores':
    case 'help':
      // Click anywhere to return
      this.state = 'menu';
      break;

    case 'paused':
      // Click to resume
      this.state = 'playing';
      break;
  }
}
```

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

### CRITICAL: SDK Import Rules (MUST READ)

**🔴 NEVER use relative paths to import SDK files**

This is a **critical mistake** that will break your door's color rendering and cause other bugs:

```typescript
// ❌ WRONG - Relative path imports
import { AudioEngine } from '../../engines/audio/audio-engine';
import { Screen } from '../../engines/ui/blessed/core/screen';
import { NetworkEngine } from '../../engines/network/network-engine';

// ✅ CORRECT - Package imports
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { NetworkEngine } from '@amiexpress/bbs-door-sdk/engines/network/network-engine';
```

**Why this matters:**

1. **TypeScript will compile SDK source into your door's dist/** - When you use relative paths like `../../engines/audio/audio-engine`, TypeScript thinks those are YOUR source files and compiles them into your door's dist directory
2. **Your door will use stale/old SDK code** - Your door will bundle an old snapshot of the SDK instead of using the latest compiled version
3. **Color rendering breaks** - If the SDK has bug fixes (like the fg/bg color swap fix), your door won't get them because it's using old compiled code
4. **Massive dist size** - Your door's dist will bloat to include the entire SDK (100+ files instead of just your code)
5. **TypeScript errors** - You'll get "File is not under 'rootDir'" errors because SDK files are outside your door's directory

**Correct tsconfig.json settings:**

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",  // Important: Set to current directory
    "skipLibCheck": true,  // Skip type checking of SDK .d.ts files
    // ... other options
  },
  "include": ["*.ts", "src/**/*.ts"],  // Only include YOUR door's files
  "exclude": ["node_modules", "dist"]
}
```

**For multi-file doors, be specific about includes:**

```json
{
  "include": [
    "*.ts",
    "commands/**/*.ts",
    "ui/**/*.ts",
    "core/**/*.ts",
    "handlers/**/*.ts"
    // List each subdirectory explicitly
  ]
}
```

**Never use `./**/*.ts` or `**/*.ts` as include patterns** - this will include SDK files via the node_modules symlink!

**How to verify your door is correct:**

```bash
cd sdk/doors/your-door
npm run build

# Check dist structure - should only contain YOUR files
ls dist/
# ✅ Good: index.js, app.js, ui/, commands/, etc.
# ❌ Bad: engines/, core/, doors/ (these are SDK directories)

# If you see SDK directories in dist, fix your imports and tsconfig!
```

### Neo-Blessed Import Errors

**Error**: `ReferenceError: Element is not defined`

**Cause**: This occurs when using neo-blessed with default imports. The SDK's blessed implementation exports classes both as named exports AND in a default export object. However, improper import/export handling can cause runtime errors.

**Solution**: Always use **named imports** from the SDK's blessed module:

```typescript
// CORRECT - Named imports (recommended)
import { Screen, Box, Text, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// WRONG - Default import (can cause runtime errors)
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
const screen = blessed.Screen(...);  // May fail with "Element is not defined"
```

**Blessed-Contrib Imports**:

```typescript
// CORRECT - Import specific widgets
import { Grid, Line, Gauge, Map } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

// WRONG - Default import
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';
```

**Complete Neo-Blessed Example**:

```typescript
import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Grid, Line } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  // Create screen (blessed is case-insensitive for options)
  const screen = new Screen({
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true
  });

  // Create grid layout
  const grid = new Grid({ rows: 12, cols: 12, screen });

  // Create widgets
  const lineChart = grid.set(0, 0, 4, 6, Line, {
    label: 'Performance',
    showLegend: true
  });

  // Render
  screen.render();

  // Cleanup
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      screen.destroy();
      bbsSession.doorInputHandler = null;
      resolve();
    };
    socket.once('door:close', cleanup);
    socket.once('disconnect', cleanup);
  });
}
```

**Key Points**:
- Always use named imports for blessed classes
- Never use default imports from blessed or blessed/contrib
- This prevents runtime "Element is not defined" errors
- SDK v2.0 has been fixed to support both import styles, but named imports are safer

---

### Neo-Blessed Color Rendering

**IMPORTANT**: The SDK automatically handles terminal color initialization. On first render:
1. Resets all terminal attributes (ESC[0m)
2. Clears the screen (ESC[2J)
3. Ensures clean state for color rendering

**Color Format**:
- Use standard color names: `'black'`, `'red'`, `'green'`, `'yellow'`, `'blue'`, `'magenta'`, `'cyan'`, `'white'`
- For bright colors: `'lightred'`, `'lightgreen'`, etc. (or numbers 8-15)
- For 256-color: use numeric values 0-255
- For transparency: `'transparent'` or `'none'` (preserves underlying content)

**Correct Color Usage**:
```typescript
// Style object with fg and bg
const panel = createBox({
  parent: screen,
  style: {
    fg: 'white',      // Foreground color for text
    bg: 'black',      // Background color
    border: { fg: 'cyan' }  // Border color
  }
});

// Selected/focus states
const list = createList({
  parent: screen,
  style: {
    fg: 'white',
    bg: 'black',
    selected: { fg: 'black', bg: 'white' }  // Inverted for selection
  }
});
```

**Color Architecture (Internal)**:
- Colors are packed into 27-bit attributes: `(flags << 18) | (fg << 9) | bg`
- Standard colors 0-7 become ANSI 30-37 (fg) or 40-47 (bg)
- Bright colors 8-15 become ANSI 90-97 (fg) or 100-107 (bg)
- 256-color values use ESC[38;5;N (fg) or ESC[48;5;N (bg)
- The SDK handles all ANSI escape sequence generation automatically

---

### Using SDK Blessed Helpers (Recommended)

**IMPORTANT**: Always use SDK blessed-helpers instead of creating widgets directly. The helpers automatically add `tags: true` to prevent tag rendering bugs.

**The Problem**:
```typescript
// Without tags:true, blessed renders {cyan-fg} as literal text instead of color
const box = blessed.box({
  parent: screen,
  content: '{cyan-fg}Hello{/cyan-fg}'  // Renders as literal "{cyan-fg}Hello{/cyan-fg}"
});
```

**The Solution - Use SDK Helpers**:
```typescript
import { createBox, createList, createText, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// SDK helpers automatically add tags:true
const box = createBox({
  parent: screen,
  content: '{cyan-fg}Hello{/cyan-fg}'  // Renders with cyan foreground color
});
```

**Dockable Defaults + Fixed Playfields**:
```typescript
// createBox returns a DockablePanel with useTitleBar=false by default
const infoPanel = createBox({
  parent: screen,
  label: ' Info ',
  width: '40%',
  height: '100%-3'
});

// Use fixed: true for gameplay fields (no drag/resize/dock)
const playfield = createBox({
  parent: screen,
  top: 1,
  left: 0,
  width: 22,
  height: 22,
  fixed: true
});
```

**Dropdown Menus (SDK Widget)**:
```typescript
import { DropdownMenu } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const menu = new DropdownMenu({
  parent: screen,
  label: 'File',
  items: [
    { label: 'Open', action: () => openDialog() },
    { label: 'Quit', action: () => quitDoor() }
  ]
});
```

**Available Helpers**:

```typescript
// All helpers from @amiexpress/bbs-door-sdk/utils/blessed-helpers
import {
  createBox,       // Dockable panel (border label, no title bar)
  createDockablePanel, // Dockable panel with full options
  createList,      // List widget with auto tags:true
  createText,      // Text widget with auto tags:true
  createTextarea,  // Textarea widget with auto tags:true
  createButton,    // Button widget with auto tags:true
  createTable,     // Table widget with auto tags:true
  createLog        // Log widget with auto tags:true
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

**Complete Example Using Helpers**:

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession, bbs } = doorSession;

  // Create screen with dockBorders for responsive layouts
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,  // Makes borders dock to screen edges
    fullUnicode: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data)
  });

  // Create header using createBox (auto tags:true)
  const header = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{bold}{cyan-fg}MY DOOR{/cyan-fg}{/bold}{/center}',
    style: { fg: 'white', bg: 'blue' }
  });

  // Create list using createList (auto tags:true)
  const list = createList({
    parent: screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    }
  });

  list.setItems([
    '{yellow-fg}Option 1{/yellow-fg}',
    '{green-fg}Option 2{/green-fg}',
    '{cyan-fg}Option 3{/cyan-fg}'
  ]);

  // Create footer using createBox
  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{yellow-fg}Arrows:{/yellow-fg} Navigate  {yellow-fg}Q:{/yellow-fg} Quit'
  });

  // Handle input
  screen.key(['q', 'Q'], () => {
    screen.destroy();
  });

  // Connect input
  if (bbsSession) {
    bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Render
  screen.render();

  // Wait for exit
  return new Promise<void>((resolve) => {
    screen.on('destroy', () => {
      if (bbsSession) {
        bbsSession.doorInputHandler = null;
      }
      resolve();
    });
  });
}
```

**Best Practices**:
1. **Always use SDK helpers** - Never call `blessed.box()`, `blessed.list()`, etc. directly
2. **Use dockBorders** - Add `dockBorders: true` to screen options for responsive layouts
3. **Use percentages** - Width/height as `'100%'`, `'100%-4'`, `'70%'` instead of fixed pixels
4. **Import helpers** - Always import from `@amiexpress/bbs-door-sdk/utils/blessed-helpers`
5. **No emojis** - Use ASCII only (`[OK]`, `[ERROR]`, `*`, `X`, etc.) for BBS compatibility

**Why This Matters**:
- Prevents `{cyan-fg}` from rendering as literal text
- Ensures consistent behavior across all doors
- Centralizes widget creation logic in SDK
- Makes doors portable and maintainable

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

The SDK AudioEngine provides **65 procedural Tone.js sounds** across 7 categories:

| Category | Count | Examples |
|----------|-------|----------|
| **UI** | 10 | click, hover, error, success, notification, confirm |
| **Combat** | 11 | sword-swing, arrow, magic-cast, shield-block, critical-hit |
| **Items** | 8 | pickup, drop, equip, potion-drink, chest-open, gold-collect |
| **Movement** | 7 | footstep, jump, land, dash, teleport, swim |
| **Environment** | 4 | door-open, door-close, switch, alarm |
| **Cards/Casino** | 10 | card-deal, card-flip, chips-bet, chips-win, jackpot |
| **Retro** | 15 | blip, boop, zap, 1up, death, powerup, level-up, countdown |

**Full reference:** See [sdk/docs/SOUND_LIBRARY_REFERENCE.md](../../sdk/docs/SOUND_LIBRARY_REFERENCE.md)

```typescript
// Play any sound by name
audio.playSound('click');
audio.playSound('sword-swing');
audio.playSound('card-deal');
audio.playSound('level-up');
```

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

### Cursor Visibility Control

For games where you don't want the blinking text cursor visible, use the SDK's cursor visibility methods:

```typescript
import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'My Game',
  version: '1.0.0',
  runtime: 'client',
});

door.onConnect(async (user) => {
  // Hide cursor during gameplay
  door.hideCursor();
  // or: door.setCursorVisible(false);

  // ... game code ...

  // Show cursor again before exiting
  door.showCursor();
  // or: door.setCursorVisible(true);
});
```

**Available Methods:**
- `door.setCursorVisible(visible: boolean)` - Main method to show/hide cursor
- `door.hideCursor()` - Convenience method to hide cursor
- `door.showCursor()` - Convenience method to show cursor

**Best Practice:** Always show the cursor before exiting your door:

```typescript
private quit(): void {
  door.showCursor();  // Always restore cursor visibility
  door.send('\x1b[0m');  // Reset colors
  door.shutdown();
}
```

**Note:** You can also use ANSI escape codes directly:
- Hide cursor: `\x1b[?25l`
- Show cursor: `\x1b[?25h`

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

- [SDK v2.0 Comprehensive Guide](SDK_V2_COMPREHENSIVE.md) - Complete SDK v2.0 API reference
- [SDK v2.0 Validation](SDK_V2_VALIDATION.md) - SDK v2.0 test results and examples
- [Door Manager](DOOR_MANAGER.md) - BBS door management
- [Examples](EXAMPLES.md) - More door examples

---

## CRITICAL: Always Use SDK Helpers for UI

**This is the #1 mistake in door development.** You must ALWAYS use SDK helper functions, NEVER use blessed widgets directly.

### Why This Matters

Raw blessed widgets don't have:
- ✅ Auto-enabled tags (colors won't work)
- ✅ Proper mouse event handling
- ✅ Focus management
- ✅ Cleanup behavior
- ✅ Consistent API

### The Rules

**❌ NEVER DO THIS:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// WRONG - No mouse support, no tags, broken cleanup
const box = blessed.box({ parent: screen, ... });
const list = blessed.list({ parent: screen, ... });
const input = blessed.textbox({ parent: screen, ... });
```

**✅ ALWAYS DO THIS:**
```typescript
import {
  createBox,
  createList,
  createTextbox,
  createButton
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// CORRECT - Full SDK support
const box = createBox({ parent: screen, ... });
const list = createList({ parent: screen, mouse: true, vi: true, ... });
const input = createTextbox({ parent: screen, ... });
const button = createButton({ parent: screen, ... });
```

### Complete Widget List

```typescript
import {
  // Core
  createScreen,          // REQUIRED - Create BBS-aware screen
  DoorInputManager,      // REQUIRED - Handle input cleanup
  
  // Widgets (ALWAYS use these instead of blessed.*)
  createBox,             // Container, panel, modal
  createList,            // Menus, dropdowns, selections
  createTextbox,         // Single-line input
  createTextarea,        // Multi-line input
  createButton,          // Clickable button
  createText,            // Static text
  createTable,           // Data tables
  createLog,             // Scrolling log viewer
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

### When You CAN Use blessed Directly

Only for built-in dialogs:
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// These are OK - They're special dialog types
const question = blessed.question({ ... });
const message = blessed.message({ ... });
const prompt = blessed.prompt({ ... });
```

## Form Development Patterns

### Complete Form Example

```typescript
async function showEditor(screen: any, data: any): Promise<void> {
  return new Promise((resolve) => {
    screen.program.enableMouse();

    // 1. Container
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 20,
      border: { type: 'line' },
      label: ' Edit Form ',
      style: { border: { fg: 'yellow' }, bg: 'black' }
    });

    // 2. Text input
    const nameInput = createTextbox({
      parent: modal,
      top: 2,
      left: 2,
      width: '100%-4',
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: data.name,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // 3. Dropdown list
    const typeList = createList({
      parent: modal,
      top: 5,
      left: 2,
      width: 30,
      height: 7,
      border: { type: 'line' },
      keys: true,
      vi: true,
      mouse: true,
      items: ['Type A', 'Type B', 'Type C'],
      selected: 0,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    // 4. Buttons
    const saveBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 15,
      width: 12,
      height: 3,
      content: ' Save ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: { bg: 'lightgreen', fg: 'black' },
        hover: { bg: 'lightgreen', fg: 'black' }
      }
    });

    const cancelBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 40,
      width: 12,
      height: 3,
      content: ' Cancel ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: { bg: 'lightred', fg: 'black' },
        hover: { bg: 'lightred', fg: 'black' }
      }
    });

    // 5. Event handlers
    const save = async () => {
      data.name = nameInput.getValue();
      data.type = ['Type A', 'Type B', 'Type C'][typeList.selected || 0];
      
      if (!data.name.trim()) return; // Validation
      
      screen.remove(modal);
      screen.render();
      resolve();
    };

    saveBtn.on('press', () => save());
    cancelBtn.on('press', () => {
      screen.remove(modal);
      screen.render();
      resolve();
    });

    screen.on('keypress', (ch: any, key: any) => {
      if (key.name === 'escape') {
        screen.remove(modal);
        screen.render();
        resolve();
      }
    });

    nameInput.focus();
    screen.render();
  });
}
```

### Common Form Mistakes

**❌ WRONG - Manual field rendering:**
```typescript
// Don't do this - no proper widgets
let currentField = 0;
const fields = ['name', 'type', 'save'];

const render = () => {
  let content = '';
  content += `Name: ${currentField === 0 ? '{inverse}' : ''}${data.name}{/inverse}\n`;
  content += `Type: ${currentField === 1 ? '{inverse}' : ''}${data.type}{/inverse}\n`;
  content += `${currentField === 2 ? '{inverse}' : ''}[SAVE]{/inverse}`;
  box.setContent(content);
};

screen.on('keypress', (ch, key) => {
  if (key.name === 'up') currentField--;
  if (key.name === 'down') currentField++;
  if (key.name === 'enter') {
    if (currentField === 0) {
      // Manual text prompt? Bad!
    }
  }
  render();
});
```

**Why this is wrong:**
- No mouse support
- No proper focus management
- No built-in validation
- Breaks on resize
- Manual state tracking
- No accessibility

**✅ CORRECT - Use proper widgets (see Complete Form Example above)**

## Dialog Patterns

### Confirmation Dialog

```typescript
async function confirmAction(screen: any, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const question = blessed.question({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line' },
      style: { border: { fg: 'red' }, bg: 'black' },
      label: ' Confirm '
    });

    question.ask(`${message}\n\n(Y/N)`, (answer: boolean) => {
      screen.remove(question);
      screen.render();
      resolve(answer);
    });
  });
}

// Usage
if (await confirmAction(screen, 'Delete this item?')) {
  // Delete
}
```

### Selection Dialog

```typescript
async function selectOption(screen: any, options: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 12,
      border: { type: 'line' },
      label: ' Select ',
      style: { border: { fg: 'yellow' }, bg: 'black' }
    });

    const list = createList({
      parent: modal,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      items: options,
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    list.on('select', (item: any, index: number) => {
      screen.remove(modal);
      screen.render();
      resolve(options[index]);
    });

    screen.on('keypress', (ch: any, key: any) => {
      if (key.name === 'escape') {
        screen.remove(modal);
        screen.render();
        resolve(null);
      }
    });

    list.focus();
    screen.render();
  });
}
```

## Async Event Handler Pattern

**❌ WRONG - Async handlers directly:**
```typescript
screen.on('keypress', async (ch, key) => {
  await doSomething();  // TypeScript error!
});

button.on('press', async () => {
  await save();  // TypeScript error!
});
```

**✅ CORRECT - Wrap in IIFE:**
```typescript
screen.on('keypress', (ch, key) => {
  (async () => {
    await doSomething();
  })();
});

button.on('press', () => {
  (async () => {
    await save();
  })();
});
```

## CRITICAL: Textbox Width Issues and Solutions

**WARNING**: Neo-blessed textboxes have a known issue where they ignore explicit `width` constraints and expand beyond their parent container. This section documents the ONLY working patterns.

### The Problem

```typescript
// ❌ BROKEN - Textbox ignores width and extends past modal
const nameInput = blessed.textbox({
  parent: modal,
  top: 1,
  left: 10,
  width: 50,        // IGNORED!
  height: 1,        // Too small without border
  inputOnFocus: true,
  style: { bg: 'blue' }
});

// ❌ ALSO BROKEN - createTextbox has same issue
const nameInput = createTextbox({
  parent: modal,
  top: 1,
  left: 10,
  width: 50,        // IGNORED!
  height: 1,
  ...
});
```

### The Solution: Bordered Textboxes

**The ONLY reliable pattern** is to use `blessed.textbox()` directly with:
1. `border: { type: 'line' }` - REQUIRED for width to work
2. `height: 3` - 1 for top border + 1 for content + 1 for bottom border
3. `left: 1, right: 1` - Use edge constraints instead of explicit width
4. `label: ' Field Name '` - Put label ON the border, not as separate element

```typescript
// ✅ WORKING PATTERN - Bordered textbox with label on border
const nameInput = blessed.textbox({
  parent: modal,
  top: 1,
  left: 1,
  right: 1,           // Edge constraint - works!
  height: 3,          // MUST be 3 for bordered textbox
  border: { type: 'line' },
  label: ' Name ',    // Label on border - clean look
  keys: true,
  mouse: true,
  inputOnFocus: true,
  value: existingValue,
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' },
  }
});
```

### Complete Working Form Example

```typescript
async function showProjectEditor(screen: Screen, project: Project): Promise<Project | null> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();

    // Modal container
    const modal = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 24,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' }, bg: 'black' },
      label: ' New Project ',
      tags: true,
    });

    // ✅ CORRECT: Bordered textbox with label on border
    const nameInput = blessed.textbox({
      parent: modal,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Name ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: project.name,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } }
    });

    // ✅ Lists work fine with percentage widths
    const typeList = blessed.list({
      parent: modal,
      top: 5,
      left: 1,
      width: '48%',
      height: 9,
      border: { type: 'line' },
      label: ' Type ',
      items: ['demo', 'intro', 'code'],
      style: { border: { fg: 'cyan' }, selected: { bg: 'cyan', fg: 'black' } }
    } as any);

    // ✅ Another bordered textbox
    const descInput = blessed.textbox({
      parent: modal,
      top: 15,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Description (optional) ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } }
    });

    // Buttons still use SDK helper
    const saveBtn = createButton({
      parent: modal,
      top: 19,
      left: 17,
      width: 12,
      height: 3,
      content: ' Save ',
      style: { bg: 'green' }
    });

    nameInput.focus();
    screen.render();
  });
}
```

### Key Rules for Form Dialogs

| Element | Pattern | Notes |
|---------|---------|-------|
| Text input | `blessed.textbox()` + border + height 3 | Only working pattern |
| Label | `label: ' Name '` on textbox border | Don't use separate label elements |
| Width constraint | `left: 1, right: 1` | NOT explicit `width` |
| Selection list | `blessed.list()` + `width: '48%'` | Percentage widths work |
| Buttons | `createButton()` | SDK helper works fine |
| Long text in lists | `.substring(0, 25)` | Truncate to prevent wrapping |

### What NOT to Do

```typescript
// ❌ DON'T: Separate label elements (they get covered)
blessed.box({ content: 'Name:', ... });
const input = blessed.textbox({ ... });

// ❌ DON'T: Height 1 textbox (needs height 3 with border)
blessed.textbox({ height: 1, border: { type: 'line' } });

// ❌ DON'T: Explicit width on textbox (gets ignored)
blessed.textbox({ width: 50, ... });

// ❌ DON'T: createTextbox for form inputs (width issues)
createTextbox({ width: 50, ... });

// ❌ DON'T: blessed.text() for labels (doesn't render)
blessed.text({ content: 'Name:', ... });
```

## Reference Implementations

Study these working examples:

- **`Doors/whip/ui/project-editor.ts`** - Complete form with bordered textboxes (FIXED)
- **`Doors/whip/ui/project-list.ts`** - List view with create/edit/delete dialogs
- **`Doors/whip/ui/kanban-board.ts`** - Multi-column kanban with modals
- **`Doors/grandmaster/ui/menu.ts`** - Complex menu system with mouse support

## Quick Start Guide

For rapid prototyping, see:
**[NEO_BLESSED_QUICK_START.md](NEO_BLESSED_QUICK_START.md)** - 5-minute guide with working examples

