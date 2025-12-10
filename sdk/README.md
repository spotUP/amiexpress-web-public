# AmiExpress BBS Door SDK

The official SDK for creating doors (games, utilities, apps) for AmiExpress BBS.

## Quick Links

- **[Game Development Guide](./docs/GAME_DEVELOPMENT_GUIDE.md)** - Complete reference for game development
- **[Examples](./examples/)** - Working door examples
- **[Templates](./templates/)** - Starter templates

## Installation

```bash
npm install @amiexpress/bbs-door-sdk
```

## Quick Start

### Server Door (Simple)

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
  author: 'You'
});

door.onConnect((user) => {
  door.send(`Hello, ${user.name}!\r\n`);
});

door.onInput((user, key) => {
  if (key.key === 'q') door.shutdown();
});

door.start();
```

### Hybrid Door (With Audio)

```typescript
import { ClientDoor, AudioEngine } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'My Game',
  version: '1.0.0',
  author: 'You',
  hybrid: true
});

const audio = new AudioEngine();

door.onConnect(async (user) => {
  await audio.init();
  audio.playSound('coin');
});

door.setFPS(30);
door.start();
```

## Door Types

| Type | Runtime | Audio | Use Case |
|------|---------|-------|----------|
| **Server** | Node.js | Bell only | Simple games, text adventures |
| **Hybrid** | Browser + Node | Web Audio | Games with sound/music |

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
