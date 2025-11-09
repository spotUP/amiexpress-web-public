# VS Code Configuration for AmiExpress-Web

This directory contains VS Code workspace configuration for developing BBS applications and SDK games.

## 🎮 Quick Start

### Running Games

Click the **Run** button (▶️) or press `F5`, then select:

1. **🎮 SDK Preview Server** - Opens web preview at http://localhost:8080
   - Shows all example games
   - Hot-reloads on code changes
   - Full terminal emulation

2. **🎮 Run: [Game Name]** - Run a specific example game directly
   - Hello World
   - Tic-Tac-Toe
   - Tetris
   - Dungeon RPG
   - Space Shooter
   - Bug Tracker
   - Tracker Door
   - Fire Emblem

3. **🔧 Run Current Game** - Run whatever game file you have open
   - Open any `index.ts` in an example game
   - Press `F5` and select this option
   - Game runs with mock test user

### Running the BBS

- **🚀 Full BBS (Backend + Frontend)** - Runs both servers together
- **🚀 Run BBS Backend** - Backend only (port 3001)
- **🎨 Run BBS Frontend** - Frontend only (port 5174)

## 📋 Available Launch Configurations

### SDK Game Development
- `🎮 SDK Preview Server` - Full preview server with all games
- `⚡ SDK Preview (Quick)` - Fast startup, skips build
- `🎮 Run: [Game]` - Individual game launchers
- `🔧 Run Current Game` - Run active file

### BBS Development
- `🚀 Run BBS Backend` - Backend dev server
- `🎨 Run BBS Frontend` - Vite dev server
- `🚀 Full BBS` - Both servers (compound)

### Testing
- `🧪 Test Backend` - Jest tests for backend
- `🧪 Test SDK` - Jest tests for SDK

## 🔨 Build Tasks

Access via `Terminal > Run Task...` or `Ctrl+Shift+B`:

- **🔨 Build SDK** - Compile SDK TypeScript (default build)
- **👀 Watch SDK** - Watch mode for SDK development
- **🔨 Build Backend** - Type-check backend
- **🔨 Build Frontend** - Build frontend production bundle
- **🎮 Start SDK Preview** - Launch preview server
- **🚀 Start All Servers** - Run start-servers.sh
- **🛑 Kill All Servers** - Stop all development servers
- **🧪 Test All Commands** - Run comprehensive BBS tests
- **🚀 Push and Deploy** - Git push + deploy to production

## 🎯 Typical Workflows

### Creating a New Game

1. Navigate to `sdk/examples/`
2. Copy an existing example or use SDK CLI
3. Open the game's `index.ts`
4. Press `F5` → Select "🔧 Run Current Game"
5. Game runs with test user automatically

### Testing in Browser

1. Press `F5` → Select "🎮 SDK Preview Server"
2. Browser opens at http://localhost:8080
3. Click on any game to play
4. Edit code → Save → Browser auto-reloads

### BBS Development

1. Press `F5` → Select "🚀 Full BBS"
2. Backend starts on port 3001
3. Frontend starts on port 5174
4. Open http://localhost:5174 in browser
5. Changes auto-reload

### Debugging

1. Set breakpoints in your TypeScript code
2. Press `F5` and select appropriate configuration
3. Debugger stops at breakpoints
4. Use Debug Console to inspect variables

## 🔍 Debugging Tips

### SDK Games
- Games run with `NODE_ENV=development` automatically
- Mock user is auto-created via `setupMockDevelopment()`
- Console logs appear in VS Code Debug Console
- ANSI output renders in terminal

### Backend
- Backend runs with `tsx` for TypeScript debugging
- Breakpoints work in `.ts` files directly
- Socket.io events visible in console
- Database queries logged to console

## 📝 Settings

The workspace includes:

- **Auto-formatting** on save (Prettier)
- **ESLint** integration
- **TypeScript** language server
- **Git** smart commits enabled
- **Terminal** defaults to bash
- **80/120 column rulers** for code style

## 🔌 Recommended Extensions

When you open this workspace, VS Code will recommend:

- ESLint - Code linting
- Prettier - Code formatting
- TypeScript - Language support
- GitLens - Git integration
- Output Colorizer - ANSI color in terminal
- Markdown All in One - Documentation
- Code Spell Checker - Catch typos

## 🚨 Troubleshooting

### "Cannot find module" errors
```bash
# Install dependencies
cd sdk && npm install
cd ../web/backend && npm install
cd ../frontend && npm install
```

### Games don't run
```bash
# Build SDK first
cd sdk
npm run build
```

### Preview server won't start
```bash
# Kill processes on port 8080
lsof -ti:8080 | xargs kill -9

# Or use quick preview (no build)
npm run preview:quick
```

### TypeScript errors in examples
```bash
# Examples need SDK built first
cd sdk
npm run build
```

## 🎓 Learning Resources

- SDK Documentation: `sdk/README.md`
- Example Games: `sdk/examples/`
- Door API Reference: `sdk/docs/`
- BBS Architecture: `Documentation/3-Developers/ARCHITECTURE.md`
- Testing Guide: `Documentation/3-Developers/TESTING.md`

## 💡 Pro Tips

1. **Use the preview server** for the best development experience
2. **Set breakpoints** in your game code for debugging
3. **Watch mode** (`👀 Watch SDK`) rebuilds automatically
4. **Quick preview** skips build for faster iteration
5. **Compound launch** runs backend + frontend together
6. **Current file runner** lets you quickly test any game

---

Happy coding! 🚀
