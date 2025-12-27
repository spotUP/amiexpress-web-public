# GRANDMASTER - TGM3-Inspired Multiplayer Tetris

A next-generation Tetris experience for AmiExpress BBS featuring authentic TGM3 mechanics, full grading system, and real-time multiplayer.

## Features

### Core TGM3 Mechanics
- **20G Gravity** - Instant drop at high levels (Master 900+, Death 500+)
- **Lock Delay** - TGM3-style lock delay with reset limits
- **DAS/ARR System** - Precise input handling with Delayed Auto-Shift
- **SRS Rotation** - Super Rotation System with wall kicks
- **Ghost Piece** - Hard drop preview

### Grading System
- **Full TGM3 Progression** - 9 → 8 → 7 → ... → S1 → ... → S13 → m1 → ... → m9 → M → GM
- **Internal Grade Points** - Hidden point system with decay
- **Grade Colors** - Rainbow GM, orange MO, cyan S-ranks, etc.

### Speed Curves
- **Master Mode** - 0-999 levels, gradual acceleration to 20G at level 900
- **Death Mode (Shirase)** - 20G from level 500, extreme difficulty
- **Sprint 40L** - Time attack mode
- **Marathon** - Endless survival with gradual speed increase

### Section System
- **Section Tracking** - 100-level sections with timing
- **COOL/REGRET Grades** - Performance-based section evaluation
- **Target Times** - Authentic TGM3 section targets

### UI Features
- **Neo-Blessed Interface** - Modern terminal UI with widgets
- **ANSI Block Rendering** - Colored tetromino blocks
- **Live Stats Display** - Grade, level, score, combo tracking
- **Next Queue** - Up to 5 piece preview
- **Hold Piece** - Piece storage system

## Commands

```
GMASTER           - Launch (main menu)
GMASTER MASTER    - Master mode solo
GMASTER DEATH     - Death mode solo
GMASTER SPRINT    - 40-line sprint
GMASTER MARATHON  - Marathon mode
GMASTER TRAINING  - Practice mode
```

## Installation

1. **Build the door**:
   ```bash
   cd sdk/doors/grandmaster
   npm install
   npm run build
   ```

2. **Register command** - Create `Commands/BBSCmd/GMASTER.info`:
   ```
   TYPE=COMMAND
   DESCRIPTION=GRANDMASTER - TGM3-Inspired Tetris
   CATEGORY=GAME
   HANDLER=typescript
   LOCATION=sdk/doors/grandmaster/dist/index.js
   MINLEVEL=0
   ENABLED=1
   ```

3. **Restart BBS server**

## Controls

- **Arrow Keys** - Move left/right, rotate, soft drop
- **Z** - Rotate counter-clockwise
- **X / Up** - Rotate clockwise
- **Enter / Space** - Hard drop
- **C / Shift** - Hold piece
- **ESC** - Pause menu

## File Structure

```
grandmaster/
├── package.json              - Door metadata
├── tsconfig.json             - TypeScript configuration
├── index.ts                  - Entry point (runDoor export)
├── app.ts                    - Main application factory
├── core/                     - Game engine
│   ├── types.ts             - Type definitions
│   ├── pieces.ts            - Tetromino shapes and rotation
│   ├── board.ts             - Board management
│   ├── game.ts              - GameEngine class
│   ├── gravity.ts           - Speed curves and timing
│   ├── grading.ts           - Grade progression system
│   └── sections.ts          - Section timing and COOL/REGRET
├── input/                    - Input handling
│   ├── config.ts            - Key bindings
│   └── handler.ts           - DAS/ARR input system
├── ui/                       - User interface
│   ├── menu.ts              - Main menu screen
│   └── game-screen.ts       - Gameplay screen
└── audio/                    - Sound effects
    └── sounds.ts            - SoundEngine class
```

## Development

### Building
```bash
npm run build        # Build TypeScript to JavaScript
npm run build:watch  # Watch mode for development
```

### Testing
```bash
# Launch BBS and connect
./dev/scripts/start-servers.sh

# In BBS terminal
GMASTER             # Launch main menu
GMASTER MASTER      # Launch Master mode directly
```

## Implementation Status

### ✅ Completed
- [x] Core game engine (pieces, board, collision, line clearing)
- [x] SRS rotation system with wall kicks
- [x] Input handler with DAS/ARR
- [x] Neo-blessed UI (menu, game screen)
- [x] TGM3 gravity curves (Master, Death, Sprint, Marathon)
- [x] TGM3 grading system (9 → GM)
- [x] Section system with COOL/REGRET
- [x] Lock delay with reset limits
- [x] Ghost piece preview
- [x] Next queue and hold piece
- [x] Sound engine (stub for future audio)

### 🚧 Future Enhancements
- [ ] Multiplayer (NetworkEngine integration)
- [ ] AI opponents (AIEngine integration)
- [ ] Music playback (TrackerEngine for MOD files)
- [ ] Advanced visual effects (particle systems, screen shake)
- [ ] Credit roll challenge (invisible piece mode)
- [ ] IRS/IHS (Initial Rotation/Hold System)
- [ ] T-Spin detection and scoring
- [ ] Back-to-back Tetris bonus
- [ ] Statistics persistence (database)
- [ ] Leaderboards
- [ ] Additional rotation systems (ARS, NRS, BARS)
- [ ] More game modes (Dig, Ultra, Blitz, Combo, Survival)

## Technical Details

### Game Loop
- **60 FPS** - Frame accumulator pattern for consistent timing
- **Frame-based Updates** - Game engine runs at fixed 60 FPS
- **Render-based Display** - UI renders independently at 60 FPS

### Rotation System
- **SRS (Super Rotation System)** - Modern Tetris standard
- **Wall Kicks** - 5-test wall kick tables for JLSTZ, I, and O pieces
- **Spawn Positions** - Standard centered spawn with I-piece offset

### Grading Algorithm
- **Internal Grade Points** - Hidden point accumulation
- **Decay Rate** - Points lost per piece (varies by grade)
- **Level Requirements** - Minimum level needed for grade advancement
- **Line Clear Bonuses** - Single (10), Double (25), Triple (40), Tetris (100)
- **Combo Multiplier** - Additional points for consecutive line clears

### Speed Curve
- **Gravity (G)** - Cells per frame at 60 FPS
- **ARE** - Appearance delay (frames before new piece spawns)
- **Lock Delay** - Frames before piece locks to board
- **DAS** - Delayed Auto-Shift (frames before auto-repeat)
- **20G Mode** - Gravity >= 20.0 (instant drop)

## Credits

Built with:
- **@amiexpress/bbs-door-sdk** - BBS Door Development Kit
- **Neo-Blessed** - Terminal UI framework
- **TypeScript** - Type-safe development

Inspired by:
- **TGM3 (Tetris: The Grand Master 3 Terror-Instinct)** by Arika
- **Guideline Tetris** by The Tetris Company

## License

Part of the AmiExpress BBS project.

## Author

Created for AmiExpress BBS - https://github.com/yourusername/amiexpress-web
