# Tic-Tac-Toe Door

SDK v2.0 demo door - Simple single-player tic-tac-toe game.

## Directory Structure

```
doors/tic-tac-toe/
├── index.ts         - SDK v2.0 door implementation
├── package.json     - Dependencies
├── tsconfig.json    - TypeScript config
├── dist/            - Compiled JavaScript
│   └── index.js     - Built door (executed by BBS)
└── README.md        - This file
```

## Command Registration

**Location**: `/Commands/BBSCmd/ttt.info`

The .info file MUST be in `/Commands/BBSCmd/` for the BBS to find and register the command.

**Important**: Use `TYPE=TS` in the .info file to route TypeScript doors correctly.

## Building

```bash
npm install
npm run build
```

## Installation

### For Development
1. Door files stay in `doors/tic-tac-toe/`
2. .info file in `/Commands/BBSCmd/ttt.info`
3. BBS reads .info and loads door from `doors/tic-tac-toe/dist/index.js`

### For Release Packaging
When packaging this door for distribution:

1. Include all door files in archive:
   ```
   tic-tac-toe.tar.gz:
   ├── index.ts
   ├── package.json
   ├── tsconfig.json
   ├── ttt.info          ← Include .info file in archive
   └── README.md
   ```

2. Installation instructions for users:
   ```bash
   # Extract to doors/
   cd /path/to/bbs
   tar xzf tic-tac-toe.tar.gz -C doors/

   # Copy .info file to Commands/BBSCmd/
   cp doors/tic-tac-toe/ttt.info Commands/BBSCmd/

   # Build the door
   cd doors/tic-tac-toe
   npm install
   npm run build
   ```

## Command Usage

Users can run this door with:
- `TTT`
- `TICTACTOE`

## SDK v2.0 Features Used

- **CoreDoor**: Lifecycle hooks (onStart, onInput, onClose, onError)
- **DoorContext**: Full context API
- **Output API**: write(), writeLine(), ANSI codes
- **Input API**: KeyPress events
- **Type Safety**: Full TypeScript types

## Data Storage

Game state is ephemeral (no persistent storage used).
For doors that need storage, use `ctx.storage.save()` and `ctx.storage.load()`.
