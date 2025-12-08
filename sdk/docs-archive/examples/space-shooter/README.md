# Space Shooter - Complete SDK Example

A retro space shooter game that showcases all AmiExpress BBS Door SDK features.

## Features Demonstrated

### Graphics Engine
- **ANSI rendering**: Full 80x24 terminal graphics
- **Sprites**: Player ship, enemies, bullets with ASCII art
- **Particle effects**: Explosions and hit effects
- **Simple parallax**: Animated star field background
- **HUD system**: Lives bar, score display, wave counter

### Physics Engine
- **Collision detection**: Bullet vs enemy, enemy vs player
- **Movement**: Smooth player control with friction
- **Game objects**: Dynamic entity management

### Audio Engine
- **Sound effects**: Shoot, explosion, hit, powerup, game over sounds
- **Background music**: Procedurally generated space battle music
- **Audio control**: Master volume and effect mixing

### Input Engine
- **Key mapping**: WASD to arrow keys
- **Action binding**: Fire, pause, quit commands
- **Macros**: Konami code for extra life easter egg
- **Input processing**: Real-time keyboard handling

### Menu System
- **Title screen**: Game branding and instructions
- **High scores**: Top 10 leaderboard display
- **Game over screen**: Final score and stats

### HUD Builder
- **Lives bar**: Visual health indicator
- **Score display**: Formatted number display
- **Text labels**: Wave counter and game state

### Game State Management
- **Wave progression**: Increasing difficulty
- **High score persistence**: Leaderboard tracking
- **Pause/resume**: Game flow control
- **Game over handling**: Score submission

## Controls

- **Arrow Keys**: Move ship (or WASD)
- **Space**: Fire bullets
- **P**: Pause/Resume
- **Q**: Quit game

**Easter Egg**: Try the Konami code (↑↑↓↓←→←→) for a surprise!

## Running the Game

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Preview in Browser
```bash
npm run preview
```

Then select "space-shooter" from the door list in your browser.

## Code Structure

```
index.ts
├── Constants         - Game configuration
├── Types            - GameObject, Enemy, HighScore interfaces
├── GameState        - Manages game data and state
└── SpaceShooter     - Main game class
    ├── setupInput()       - Configure controls
    ├── showTitleScreen()  - Display menu
    ├── startGame()        - Initialize game loop
    ├── update()           - Game logic (60 FPS)
    ├── render()           - Draw frame
    ├── spawnEnemy()       - Enemy generation
    ├── fire()             - Player shooting
    ├── checkCollisions()  - Hit detection
    └── endGame()          - Game over handling
```

## Game Mechanics

### Scoring
- Enemy destroyed: 100 points
- Wave completed: 1000 points bonus

### Difficulty
- Each wave spawns more enemies
- Enemies move faster in later waves
- Enemy shooting chance increases

### Lives
- Start with 3 lives
- Lose life on enemy collision or hit by enemy bullet
- Konami code grants extra life

### Waves
- Each wave has 10 enemies
- Enemies spawn gradually
- Wave complete when all enemies destroyed
- Bonus points awarded per wave

## High Scores

High scores are stored in memory (in production, would use file/database):
- Top 10 scores tracked
- Shows player name, score, wave reached, and date
- Displayed on title screen

## Learning from This Example

This game demonstrates:

1. **Complete game loop**: Input → Update → Render cycle
2. **Entity management**: Dynamic creation/destruction of game objects
3. **State machines**: Title → Playing → Paused → Game Over
4. **Visual feedback**: Particle effects, HUD updates, screen overlays
5. **Audio feedback**: Sound effects tied to game events
6. **User input**: Multiple control schemes, macros, action binding
7. **Game design**: Wave progression, scoring, difficulty curve

## Extending This Game

Ideas for enhancements:

- **Power-ups**: Shield, rapid fire, spread shot
- **Boss battles**: Special enemies at end of waves
- **Different enemies**: Various movement patterns and behaviors
- **Multiplayer**: Co-op or versus modes
- **Persistent saves**: Resume game from checkpoint
- **Achievements**: Unlock system
- **Better graphics**: More detailed ASCII art
- **Story mode**: Cutscenes between waves

## SDK Components Used

```typescript
import {
  Door,              // Main door API
  GraphicsEngine,    // ANSI graphics
  PhysicsEngine,     // Collision detection
  AudioEngine,       // Sound and music
  InputEngine,       // Keyboard input
  MenuSystem,        // Menus (future use)
  HUDBuilder         // Heads-up display
} from '@amiexpress/bbs-door-sdk';
```

All major SDK features are demonstrated in ~600 lines of code!

## License

MIT License - Free to use and modify for your own doors.
