# AmiExpress BBS Door Plugin SDK

**The Ultimate Next-Generation BBS Door Development Framework**

Version 1.0.0 - Revolutionary Edition

## 🚀 What is This?

The AmiExpress BBS Door Plugin SDK is a **groundbreaking, production-ready framework** for creating cutting-edge BBS doors that rival modern indie games. This SDK enables developers (and AI models) to generate TypeScript, ARexx, and Python-based BBS doors with unprecedented visual depth, advanced gameplay mechanics, and professional polish.

### 🎮 Never Before Possible on BBS

- **Advanced ANSI/ASCII Graphics**: Animated sprites, parallax scrolling, particle effects, cinematic cutscenes
- **Real Physics**: Collision detection, gravity, momentum, particle systems
- **Professional Audio**: Procedural sound effects and AI-generated music (Tone.js + Scribbletune)
- **Modern Game Engines**: Full 2D platformers, shooters, RPGs, puzzle games
- **Live Preview**: Browser-based testing environment with real-time updates
- **AI-Ready**: Fully documented for seamless AI code generation

## 📦 What's Included

### Core Engines
- **Graphics Engine**: ANSI/ASCII rendering, sprites, animations, parallax layers
- **Physics Engine**: Collision detection, gravity, particle systems
- **Audio Engine**: Tone.js sound effects + Scribbletune music generation
- **Input Engine**: Keyboard, mouse emulation, macros
- **Network Engine**: Multiplayer support, real-time communication

### Game Components
- Menu systems with modal overlays
- HUD builders (health bars, score, timers, mini-maps)
- Level editors (tile-based, procedural generation)
- AI pathfinding and behaviors
- Save/load systems with high scores
- Event systems (timers, triggers, quests)
- Inventory and character systems

### Example Games (Production-Ready)
1. **Tetris**: Animated blocks, parallax backgrounds, power-ups
2. **Space Invaders**: Particle effects, boss fights, dynamic starfields
3. **Super Mario Bros Clone**: Full platformer with cutscenes, animated sprites
4. **Texas Hold'em Poker**: Multiplayer, AI opponents, tournaments
5. **Dungeon Crawler RPG**: Procedural levels, inventory, branching narratives
6. **Pac-Man Clone**: Animated ghosts, maze effects, parallax layers
7. **Chess**: AI opponent, animated pieces, strategic cutscenes
8. **BBS Chat Tool**: Multi-user, moderation, file sharing
9. **File Compressor**: Encryption, batch processing, progress animations

### Tools & Utilities
- **Release Packer**: Auto-generates BBS-ready ZIP with FILE_ID.DIZ and .NFO
- **Preview Server**: Browser-based testing environment
- **CLI Tools**: Batch processing, project scaffolding
- **Debug Console**: Real-time logging and performance monitoring

## 🎯 Quick Start (30 Seconds to Your First Door)

```bash
# 1. Install the SDK
cd sdk
npm install

# 2. Create a new door from template
npm run create-door my-awesome-game

# 3. Start the preview server
npm run preview

# 4. Open browser to http://localhost:8080
# Your door is now running with live reload!

# 5. Build release ZIP
npm run pack my-awesome-game
# Creates: releases/my-awesome-game.zip (with FILE_ID.DIZ, .NFO, all assets)
```

## 🏗️ SDK Architecture

```
sdk/
├── core/                 # Core framework (TypeScript, ARexx, Python bridges)
│   ├── door-api.ts      # Main door API
│   ├── arexx-bridge.ts  # ARexx integration
│   └── python-bridge.ts # Python integration
├── engines/             # Game engines
│   ├── graphics/        # ANSI/ASCII rendering, sprites, animations
│   ├── physics/         # Collision, gravity, particles
│   ├── audio/           # Tone.js + Scribbletune integration
│   ├── input/           # Keyboard, mouse, macros
│   └── network/         # Multiplayer, real-time sync
├── components/          # Reusable game components
│   ├── menus/          # Menu systems, modals
│   ├── hud/            # Health bars, scores, timers
│   ├── levels/         # Level editors, tile systems
│   ├── ai/             # Pathfinding, behaviors
│   └── persistence/    # Save/load, high scores
├── examples/           # Production-ready example games
│   ├── tetris/
│   ├── space-invaders/
│   ├── platformer/
│   └── ... (9 complete games)
├── tools/              # Development tools
│   ├── packer/         # Release archive generator
│   ├── preview/        # Browser-based preview server
│   └── cli/            # Command-line tools
├── docs/               # Comprehensive documentation
│   ├── api/            # API reference
│   ├── tutorials/      # Step-by-step guides
│   └── examples/       # Code examples
└── templates/          # Project templates
    ├── typescript/
    ├── arexx/
    └── python/
```

## 🎨 Graphics Capabilities

### Advanced ANSI/ASCII Rendering
```typescript
import { GraphicsEngine } from '@amiexpress/sdk/engines/graphics';

const gfx = new GraphicsEngine();

// Animated sprites with frame-by-frame control
const player = gfx.createSprite({
  frames: ['playerWalk1.ans', 'playerWalk2.ans', 'playerWalk3.ans'],
  fps: 10,
  loop: true
});

// Parallax scrolling backgrounds (up to 5 layers)
gfx.addParallaxLayer({
  image: 'sky.ans',
  scrollSpeed: 0.2,
  depth: 5
});

// Particle effects
gfx.createParticleSystem({
  type: 'explosion',
  count: 50,
  lifetime: 1000,
  velocity: { min: -5, max: 5 }
});

// Cinematic cutscenes
gfx.playCutscene({
  scenes: [
    { image: 'intro1.ans', duration: 3000, transition: 'fade' },
    { image: 'intro2.ans', duration: 3000, transition: 'slide' }
  ]
});
```

## 🎵 Audio System

### Procedural Sound Effects & AI Music Generation
```typescript
import { AudioEngine } from '@amiexpress/sdk/engines/audio';

const audio = new AudioEngine();

// Procedural sound effects
audio.playSound('laser', {
  frequency: 440,
  duration: 0.1,
  envelope: 'pluck'
});

// AI-generated music from text prompts
audio.generateMusic({
  prompt: 'upbeat chiptune melody in C major',
  tempo: 140,
  pattern: 'x-x-x-x-',
  instruments: ['square', 'triangle']
});

// Adaptive music that changes with game state
audio.setMusicState({
  state: 'boss-fight',
  intensity: 0.8,
  transition: 'crossfade'
});
```

## 🎮 Game Components

### Physics Engine
```typescript
import { PhysicsEngine } from '@amiexpress/sdk/engines/physics';

const physics = new PhysicsEngine();

// Add entities with physics
const player = physics.createBody({
  x: 10, y: 10,
  width: 2, height: 4,
  mass: 1,
  friction: 0.8,
  bounce: 0.2
});

// Apply forces
physics.applyGravity(player, 9.8);
physics.applyVelocity(player, { x: 5, y: 0 });

// Collision detection
physics.onCollision(player, 'enemy', (enemy) => {
  player.takeDamage(10);
});
```

### Advanced Menu System
```typescript
import { MenuSystem } from '@amiexpress/sdk/components/menus';

const menu = new MenuSystem({
  title: 'Main Menu',
  style: 'retro-neon',
  navigation: 'arrow-keys'
});

menu.addItem('New Game', () => startGame());
menu.addItem('Load Game', () => showLoadMenu());
menu.addItem('Options', () => showOptionsModal()); // Modal overlay!
menu.addItem('Quit', () => exitDoor());

menu.show();
```

### HUD Builder
```typescript
import { HUDBuilder } from '@amiexpress/sdk/components/hud';

const hud = new HUDBuilder();

hud.addHealthBar({
  position: { x: 1, y: 1 },
  width: 20,
  style: 'gradient',
  color: 'red'
});

hud.addScoreCounter({
  position: { x: 60, y: 1 },
  format: 'SCORE: {score:06d}',
  animateOnChange: true
});

hud.addMiniMap({
  position: { x: 70, y: 15 },
  size: { width: 10, height: 8 },
  zoom: 2
});
```

## 🤖 AI-Ready Documentation

Every function includes:
- **Type definitions**: Full TypeScript types for autocomplete
- **Usage examples**: Real code snippets
- **Parameter docs**: What each parameter does
- **Return values**: What you get back
- **Common patterns**: Best practices

Perfect for AI code generation!

## 🌐 Language Support

### TypeScript (Primary)
```typescript
import { Door } from '@amiexpress/sdk';

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
  author: 'Your Name'
});

door.onConnect((user) => {
  user.send('Welcome to My Game!');
});
```

### ARexx (Classic Amiga)
```arexx
/* Load SDK */
CALL LoadSDK('AmiExpress:SDK/core/arexx-bridge.rexx')

/* Create door */
door = CreateDoor('My Game', '1.0.0')

/* Handle connection */
DO WHILE UserConnected()
  input = WaitInput()
  CALL ProcessInput(input)
END
```

### Python (Modern Scripting)
```python
from amiexpress_sdk import Door, GraphicsEngine

door = Door(name='My Game', version='1.0.0')
gfx = GraphicsEngine()

@door.on_connect
def handle_connect(user):
    user.send('Welcome to My Game!')
    gfx.draw_sprite('player', x=10, y=10)
```

## 🚢 Release Packaging

The SDK automatically generates BBS-compliant release archives:

```bash
npm run pack my-game
```

Creates:
```
releases/my-game.zip
├── my-game.exe           # Compiled door (or script)
├── my-game.cfg           # Configuration
├── FILE_ID.DIZ           # BBS standard description
├── my-game.NFO           # ASCII art info file
├── README.TXT            # Installation guide
├── assets/               # Game assets (ANSI art, data)
└── docs/                 # User documentation
```

**FILE_ID.DIZ** (auto-generated):
```
My Game v1.0.0
──────────────────────────────
Amazing BBS door game with
next-gen graphics & sound!

By: Your Name
Released: 2025-11-08
```

## 📚 Complete Documentation

- **[API Reference](docs/api/README.md)**: Every function, class, and module
- **[Tutorials](docs/tutorials/README.md)**: Step-by-step guides
- **[Examples](docs/examples/README.md)**: 100+ code snippets
- **[FAQ](docs/FAQ.md)**: Common questions and troubleshooting
- **[Video Tutorials](docs/videos.md)**: Visual guides (YouTube links)

## 🎯 SDK Philosophy

1. **Modular**: Small, independent modules - use what you need
2. **Documented**: Every line explained for humans and AI
3. **Production-Ready**: No stubs, no TODOs, fully functional
4. **BBS-Native**: True to BBS heritage while pushing boundaries
5. **AI-Friendly**: Structured for seamless AI code generation

## 🏆 What Makes This Revolutionary

### Before This SDK:
- BBS doors were simple text menus
- No animations, no advanced graphics
- Limited to basic gameplay
- Manual, tedious development

### With This SDK:
- **Hollywood-quality** animated ANSI graphics
- **Modern game engines** (physics, AI, audio)
- **Production-ready** in minutes, not months
- **AI-powered** development workflow

## 🛠️ System Requirements

- **Node.js**: 18+ (for TypeScript/tools)
- **Python**: 3.8+ (for Python doors)
- **ARexx**: Classic Amiga or UAE emulator (for ARexx doors)
- **Browser**: Modern browser for preview system
- **OS**: Windows, macOS, Linux

## 📄 License

MIT License - Use freely, commercially or personally!

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md)

## 🎉 Let's Build the Future of BBS!

This SDK represents the culmination of BBS heritage and modern game development. Create doors that were previously impossible. Push the boundaries. Make something amazing.

**Welcome to the next generation of BBS doors.**

---

*Made with ❤️ for the BBS community*
