# Example Doors

Production-ready example games and tools showcasing SDK capabilities.

## Available Examples

### 🎮 Games

#### Tetris
**Location**: `tetris/`
**Description**: Classic block puzzle game with animated falling blocks, progressive difficulty, and high score tracking.

**Features**:
- Animated sprites
- Progressive speed increase
- Line clearing effects
- Sound effects
- Professional HUD
- High score system

**Run**: `npm run example tetris`

### 🚀 Coming Soon

#### Space Invaders
Classic arcade shooter with waves of enemies, power-ups, and boss fights.

**Planned Features**:
- Particle effects for explosions
- Parallax starfield background
- Multiple enemy types
- Boss battles
- Weapon power-ups

#### Super Mario Bros Clone
Full-featured 2D platformer with multiple worlds and power-ups.

**Planned Features**:
- Physics-based jumping and movement
- Multiple level worlds
- Enemy AI with various behaviors
- Power-ups (mushrooms, fire flowers)
- Animated character sprites
- Tiled level designs
- Cinematic cutscenes

#### Texas Hold'em Poker
Multiplayer card game with betting and AI opponents.

**Planned Features**:
- Up to 6 players
- AI opponents with varying difficulty
- Tournament mode
- Animated card dealing
- Chip betting system
- Player statistics

#### Dungeon Crawler RPG
Text-based dungeon exploration with procedural generation.

**Planned Features**:
- Procedurally generated dungeons
- Turn-based combat
- Inventory management
- Character progression
- Quest system
- Branching narratives

#### Pac-Man Clone
Maze navigation with ghosts and pellets.

**Planned Features**:
- Classic maze layout
- AI ghost behaviors
- Power pellets
- Fruit bonuses
- Animated sprites
- Progressive difficulty

#### Chess
Strategic board game with AI opponent.

**Planned Features**:
- Full chess rules
- AI with adjustable difficulty
- Move validation
- Check/checkmate detection
- Animated piece movements
- Game save/load

### 🛠️ Utilities

#### BBS Chat Tool
Multi-user messaging system.

**Planned Features**:
- Real-time messaging
- User moderation
- File sharing
- Emoticons
- Customizable chat rooms
- Private messaging

#### File Compressor
BBS file management utility.

**Planned Features**:
- ZIP/archive creation
- Encryption options
- Batch processing
- Progress animations
- File integrity checking

## Creating Your Own Example

1. Create directory: `examples/your-door/`
2. Add `package.json` with metadata
3. Create main `.ts` file
4. Add README.md
5. Test in preview mode
6. Submit PR!

## Testing Examples

### Preview Mode (Recommended)
```bash
# Start preview server
npm run preview

# Open http://localhost:8080
# Select example from list
```

### Direct Run
```bash
cd examples/tetris
npm start
```

### Build Release
```bash
npm run pack tetris
# Creates: releases/tetris-v1.0.0.zip
```

## Example Structure

```
your-door/
├── package.json          # Door metadata
├── your-door.ts          # Main code
├── README.md             # Documentation
├── assets/               # ANSI art, data files
│   ├── screens/
│   ├── sprites/
│   └── sounds/
└── config.json           # Configuration
```

## Best Practices

1. **Documentation** - Include clear README with instructions
2. **Code Comments** - Explain complex logic
3. **Error Handling** - Handle edge cases gracefully
4. **Configuration** - Make settings configurable
5. **Assets** - Include all required assets
6. **Testing** - Test thoroughly in preview mode
7. **Compatibility** - Ensure 80x24 terminal compatibility

## Contributing Examples

We welcome example contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Your example could help thousands of developers learn the SDK!

## Support

Having trouble with an example?
- Check the example's README
- Review [QUICK_START.md](../docs/QUICK_START.md)
- Read [API_REFERENCE.md](../docs/API_REFERENCE.md)
- Open an issue on GitHub

Happy coding! 🎮
