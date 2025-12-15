# AmiExpress BBS Door SDK

The official SDK for creating doors (games, utilities, apps) for AmiExpress BBS.

## Quick Links

- **[Game Development Guide](./docs/GAME_DEVELOPMENT_GUIDE.md)** - Complete reference for game development
- **[Examples](./examples/)** - Working door examples
- **[Templates](./templates/)** - Starter templates
- **[C SDK](../dev/c-doors/README.md)** - Create authentic 68K Amiga binaries

## Two Development Approaches

### TypeScript SDK (This Directory)
- **Best for**: New doors, modern features, easy development
- **Language**: TypeScript/JavaScript
- **Execution**: Native Node.js (fast, no emulation)
- **Libraries**: Full npm ecosystem available

### C SDK (dev/c-doors/)
- **Best for**: Porting classic doors, learning Amiga programming
- **Language**: C (cross-compiled to 68K)
- **Execution**: MOIRA 68K emulator (authentic Amiga experience)
- **Compatibility**: 100% compatible with classic AmiExpress doors

Both approaches produce doors that work identically from the user's perspective!

## Installation

```bash
npm install @amiexpress/bbs-door-sdk
```

## Quick Start

### SDK v2.0 - Simple Door

```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
  author: 'You',
  description: 'A simple BBS door'
});

// Called when door starts
door.onStart(async (ctx: DoorContext) => {
  await ctx.output.clear();
  await ctx.output.writeLine(`Hello, ${ctx.user.username}!`);
});

// Called on each keypress
door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  if (key.key === 'q' || key.key === 'Q') {
    await ctx.output.writeLine('Goodbye!');
    ctx.close();  // Exit the door
  }
});

// Called when door closes
door.onClose(async (ctx: DoorContext) => {
  // Cleanup, save state, etc.
});

// Export for BBS to load
export default door;
```

**Key Concepts:**
- **`ctx.close()`** - Immediately exits the door and returns to BBS
- **`onClose`** - Runs cleanup before exit (always called)
- **`ctx.output`** - All output methods (write, writeLine, clear, etc.)
- **`ctx.input`** - Input methods (getLine, getChar, etc.)
- **`ctx.storage`** - Save/load door data
- **`ctx.user`** - Current user info

### Hybrid Door (Browser + Server)

Hybrid doors run client code in the browser (for Web Audio, Canvas, etc.) and server code in Node.js (for file I/O, database, etc.).

**client.ts**:
```typescript
import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'Music Tracker',
  version: '1.0.0',
  author: 'You'
});

door.onConnect(async (user) => {
  // Browser-side: Web Audio API
  const audioContext = new AudioContext();
  // ... setup audio
});

door.onInput(async (user, key) => {
  if (key.key === 's') {
    // Call server to save file
    await door.rpc('saveSong', { filename: 'song.mod', data: songData });
  }
});

door.start();
```

**server.ts**:
```typescript
import { ServerDoor } from '@amiexpress/bbs-door-sdk/server';
import * as fs from 'fs/promises';

const door = new ServerDoor({
  name: 'Music Tracker',
  version: '1.0.0',
  author: 'You'
});

// Handle RPC calls from client
door.onRPC('saveSong', async (params) => {
  await fs.writeFile(params.filename, params.data);
  return { success: true };
});

door.start();
```

## Door Types

| Type | Import | Runtime | Audio | Use Case |
|------|--------|---------|-------|----------|
| **CoreDoor** | `@amiexpress/bbs-door-sdk` | BBS (tsx) | Bell only | Simple games, text doors |
| **ServerDoor** | `.../server` | Node.js | Bell only | Complex server-side logic |
| **ClientDoor** | `.../client` | Browser | Web Audio | Rich UI, graphics, audio |
| **Hybrid** | Both | Browser + Node | Web Audio | Full-featured games with file I/O |

**SDK v2.0 Recommendation**: Use **CoreDoor** for most new doors - it's the simplest and most integrated with the BBS.

## Package Structure

```
sdk/
  core/           - Door API, types
  client/         - ClientDoor, browser runtime
  engines/        - Audio, Graphics, Input, Physics, AI
  components/     - Menu, HUD, Save, Inventory, Quest
  tools/          - CLI (create-door, pack, validate)
  examples/       - Working example doors
  templates/      - Starter templates
  docs/           - Documentation
```

## Available Engines

- **AudioEngine** - Web Audio sounds and music (Tone.js)
- **GraphicsEngine** - Sprites, particles, parallax scrolling
- **InputEngine** - Key binding and input mapping
- **PhysicsEngine** - Collision detection, movement
- **AIEngine** - Pathfinding, behaviors
- **NetworkEngine** - Multiplayer support

## Available Components

- **MenuSystem** - Interactive menus with styles
- **HUDBuilder** - Health bars, score counters
- **SaveManager** - Save/load game state
- **InventorySystem** - Item management
- **DialogueSystem** - NPC conversations
- **QuestSystem** - Quest tracking

## CLI Tools

```bash
npm run create-door   # Create new door (wizard)
npm run pack          # Package door for distribution
npm run validate      # Validate door structure
npm run preview       # Live preview environment
```

## Documentation

See [docs/GAME_DEVELOPMENT_GUIDE.md](./docs/GAME_DEVELOPMENT_GUIDE.md) for the complete reference including:

- Door types and when to use each
- Full API reference for Door, ClientDoor, AudioEngine
- ANSI color codes and escape sequences
- Input handling patterns
- Component usage examples
- Troubleshooting guide
