# AmiExpress BBS Door SDK

The official SDK for creating doors (games, utilities, apps) for AmiExpress BBS.

Modern Door UX (Required)

Always aim for modern, desktop-like doors using neo-blessed windows, panels, and mouse support. Avoid 90's text menus unless explicitly requested.

## Quick Links

- **[TypeScript Door Guide](../Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md)** - Full TypeScript door patterns and pitfalls
- **[TypeScript Examples](./examples/)** - Working TypeScript door examples
- **[Templates](./templates/)** - Starter templates
- **[68K SDK](./68k/README.md)** - Create authentic 68K Amiga binaries (C/Assembly)

## SDK 2.0 - Three Development Approaches

### 1. TypeScript SDK (`/sdk/core/`, `/sdk/engines/`, etc.)
- **Best for**: New doors, modern features, rapid development
- **Language**: TypeScript/JavaScript
- **Execution**: Native Node.js (fast, no emulation overhead)
- **Libraries**: Full npm ecosystem (React, Tone.js, etc.)
- **Development**: Hot reload, modern debugging tools

### 2. 68K C SDK (`/sdk/68k/`)
- **Best for**: Porting classic C doors, maximum compatibility
- **Language**: C (cross-compiled to 68000 machine code)
- **Execution**: MOIRA 68K emulator (authentic Amiga)
- **Binary Size**: 1-10KB typical
- **Performance**: Excellent (assembly glue layer calls real AEDoor.library)

### 3. 68K Assembly SDK (`/sdk/68k/`)
- **Best for**: Time-critical code, smallest binaries, retro programming
- **Language**: Motorola 68000 assembly (vasm)
- **Execution**: MOIRA 68K emulator (authentic Amiga)
- **Binary Size**: 200-500 bytes typical (smallest possible)
- **Performance**: Maximum speed (direct hardware access)

### 4. Mixed C + Assembly (`/sdk/68k/`)
- **Best for**: Performance-critical doors with time-sensitive sections
- **Approach**: Write most code in C, optimize hot paths in assembly
- **Binary Size**: 2-15KB typical
- **Performance**: Near-assembly speed for critical sections, C convenience elsewhere

**All approaches produce doors that work identically from the user's perspective!**

## 68K Binary Compilation Quick Reference

**For detailed instructions, see [68K SDK README](./68k/README.md)**

### Build a C Door to 68K Binary

```bash
cd sdk/68k
make door NAME=mydoor      # Compiles doors/mydoor/mydoor.c → mydoor (68K HUNK binary)
make install-door NAME=mydoor  # Installs to ../../doors/MYDOOR/
```

### Build an Assembly Door to 68K Binary

```bash
cd sdk/68k
make asm NAME=mydoor       # Assembles doors/mydoor/mydoor.asm → mydoor (68K HUNK binary)
make install-door NAME=mydoor  # Installs to ../../doors/MYDOOR/
```

### Build a Mixed C + Assembly Door

See "Mixed C + Assembly Programming" section in [68K SDK README](./68k/README.md) for details on:
- Inline assembly in C functions
- Separate .asm files linked with C code
- When to use assembly for time-critical sections

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

**Important:** TypeScript doors are registered by scanning `.info` files in `Commands/BBSCmd/` at BBS startup. Doors without a `.info` file will not be available.

## Release Packaging (Required)

Use the SDK packer to create self-contained, minimal archives (no SDK bundled):

```bash
# From your door repo root (must include Commands/BBSCmd/<DOOR>.info)
npm run pack
```

Release archives include only:

```
Commands/BBSCmd/<DOOR>.info
Doors/<door>/
  package.json
  package-lock.json
  dist/
  assets/ (optional)
  data/ (optional)
  config.json (optional)
  *.ts/*.js runtime files
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
  engines/        - Audio, Cards, Graphics, Input, Physics, AI, Poker
  components/     - Menu, HUD, Save, Inventory, Quest
  tools/          - CLI (create-door, pack, validate)
  examples/       - Working example doors
  templates/      - Starter templates
  docs/           - Documentation
```

## Available Engines

- **AudioEngine** - Web Audio with **65 procedural sounds** (Tone.js) - See [Sound Library Reference](./docs/SOUND_LIBRARY_REFERENCE.md)
- **TrackerEngine** - MOD/XM/S3M/IT tracker music player (libopenmpt) - 50+ formats with authentic playback
- **CardEngine** - ASCII/ANSI playing cards, hands, and UNO (defaults to ASCII + ANSI)
- **GraphicsEngine** - Sprites, particles, parallax scrolling
- **InputEngine** - Key binding and input mapping
- **PhysicsEngine** - Collision detection, movement
- **AIEngine** - Pathfinding, behaviors
- **NetworkEngine** - Multiplayer support
- **PokerEngine** - Texas Hold'em game state engine (pokertools)

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

See:
- `sdk/docs/` for engine quick references and guides
- `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` for door patterns, input handling, and troubleshooting
