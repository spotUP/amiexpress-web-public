# SDK Preview Simplification - November 11, 2025

## Summary

Simplified the AmiExpress SDK door preview system by removing the complex PREVIEW_MODE implementation and replacing it with a simple script that runs doors in the real BBS environment. This architectural change aligns with the classic AmiExpress philosophy where doors always run as separate processes communicating with the BBS.

## Problem

The SDK had two separate execution modes:

1. **PREVIEW_MODE** - Simulated environment using stdin/stdout with test user
2. **SDK_MODE** - Real BBS environment with IPC communication

This created several issues:
- Dual code paths to maintain in the Door class
- Preview mode used fake stdin/stdout instead of real BBS communication
- Test data was stubbed rather than using real BBS services
- What worked in preview might not work in production (different code paths)
- Complex 2760-line web-based preview server

## Solution

### Architecture Change

**Before:**
```
Preview Mode: SDK Door → stdin/stdout → test data (simulated)
BBS Mode:     SDK Door → IPC → BBS backend → Socket.IO → real user
```

**After:**
```
Preview:      SDK CLI → BBS backend → SDK Door (SDK_MODE) → IPC → real connection
Production:   BBS backend → SDK Door (SDK_MODE) → IPC → real connection
```

### Implementation

1. **Removed PREVIEW_MODE from Door class** (sdk/core/door-api.ts)
   - Deleted stdin/stdout setup code (37 lines removed)
   - Deleted test user auto-connect code (17 lines removed)
   - Simplified setupDefaultHandlers() to only handle SDK_MODE
   - Door class now has single code path: SDK_MODE with IPC

2. **Created simplified preview script** (sdk/tools/preview/start-preview.sh)
   - Builds SDK
   - Builds door
   - Creates .info file to register door in BBS
   - Starts BBS servers
   - Shows instructions to test in browser
   - ~150 lines vs 2760 lines of old preview server

3. **Updated package.json**
   - Modified preview script to accept arguments

### Benefits

1. **Single Code Path** - SDK doors only need to support SDK_MODE
2. **Real Environment** - Preview uses actual BBS backend, not simulated I/O
3. **Simpler Code** - Removed 54 lines of PREVIEW_MODE code from Door class
4. **Better Testing** - If it works in preview, it works in production (same code)
5. **True to Classic AmiExpress** - Doors run as separate processes, just like original

## Files Modified

### sdk/core/door-api.ts
- Removed PREVIEW_MODE check from setupDefaultHandlers()
- Removed stdin/stdout input handling (lines 155-186)
- Removed stdout output handling (lines 187-191)
- Removed test user auto-connect (lines 224-241)
- Simplified start() method to only handle SDK_MODE

### sdk/tools/preview/start-preview.sh
- Completely rewritten as simple preview launcher
- Builds SDK and door
- Creates .info file for BBS registration
- Starts BBS servers
- Provides usage instructions

### sdk/package.json
- Updated preview script to pass arguments

## Usage

### Before (Complex Preview Mode)
```bash
cd sdk
npm run preview  # Starts web server on port 8080
# Open browser, select door, test in simulated environment
```

### After (Real BBS Preview)
```bash
cd sdk
npm run preview examples/hello-world

# Automatically:
# 1. Builds SDK
# 2. Builds hello-world door
# 3. Registers door as /HELLOWORLD command
# 4. Starts BBS on http://localhost:5173
# 5. Shows instructions to test

# Then you:
# 1. Open browser to http://localhost:5173
# 2. Login to BBS
# 3. Run /HELLOWORLD command
# 4. Test door in REAL BBS environment
```

## Door Patterns

The SDK now supports three door patterns, each for different use cases:

### 1. runDoor() Pattern (TYPE=TS)
**Use Case:** Simple utility doors, chat, menus, forms

```typescript
export async function runDoor(doorSession: DoorSession) {
  const { socket, session } = doorSession;

  socket.emit('ansi-output', '\x1b[0;36mHello from runDoor!\x1b[0m\r\n');

  await new Promise(resolve => {
    socket.once('user-input', () => resolve(null));
  });
}
```

**Examples:**
- Discord Announce - Webhook notifications
- Telnet Connect - Telnet client
- BBSLink - InterBBS games client
- File Lister - File area browser
- User Stats - Display user statistics

### 2. Door Wrapper Pattern (TYPE=SDK)
**Use Case:** Real-time action games with game loops

```typescript
import { Door, GraphicsEngine, PhysicsEngine } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: '2048 Game',
  targetFPS: 60  // Game loop for real-time updates
});

const gfx = new GraphicsEngine({ width: 80, height: 24 });
const physics = new PhysicsEngine();

door.onConnect((user) => {
  // Initialize game state
});

door.onInput((user, key) => {
  // Handle arrow keys, WASD, etc.
});

door.onUpdate((deltaTime) => {
  // Game logic at 60 FPS
  physics.update(deltaTime);
});

door.onRender((user) => {
  // Render frame
  door.sendAnsi(gfx.render(), user.id);
});

door.start();
```

**Examples:**
- 2048 Game - Sliding tile puzzle
- Snake - Classic snake game
- Breakout - Brick breaking game
- Space Invaders - Shoot 'em up
- Tetris - Block stacking game

### 3. ClientDoor Pattern (Browser-Based)
**Use Case:** Browser-specific features requiring Web APIs

```typescript
import { ClientDoor, WebGLEngine, AudioEngine } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'Music Player',
  requiresAudio: true
});

const audio = new AudioEngine();

door.onConnect((user) => {
  audio.playMusic('song.mp3');
});
```

**Examples:**
- Music Player - Web Audio API
- 3D Maze - WebGL rendering
- Voice Chat - WebRTC
- Screen Share - Canvas capture
- Music Composer - MIDI synthesis

## Testing

### SDK Build
```bash
cd sdk
npm run build
# ✅ Built successfully
```

### Hello-World Door Build
```bash
cd sdk/examples/hello-world
npm run build
# ✅ Built successfully
# ✅ dist/index.js created
```

### Preview Script
```bash
cd sdk
npm run preview examples/hello-world

# Output:
# ╔══════════════════════════════════════════════════════╗
# ║         AmiExpress SDK Door Preview                  ║
# ╚══════════════════════════════════════════════════════╝
#
# 📦 Door: hello-world
# 📂 Path: examples/hello-world
# 🔖 Command: /HELLOWORLD
#
# 🔨 Building SDK...
# ✅ SDK built
# 🔨 Building door...
# ✅ Door built
# 📝 Creating command registration...
# ✅ Command registered: Commands/HELLOWORLD.info
# 🚀 Starting BBS servers...
#
# ╔══════════════════════════════════════════════════════╗
# ║  ✅ Preview Ready!                                   ║
# ╚══════════════════════════════════════════════════════╝
#
# To test your door:
#   1. Open browser to: http://localhost:5173
#   2. Create an account or login
#   3. Run command: /HELLOWORLD
#
# To stop preview: Press Ctrl+C
# Your door is running in the REAL BBS environment!
```

## Code Statistics

### Lines Removed
- sdk/core/door-api.ts: -54 lines (PREVIEW_MODE code)
- Simplified to single code path

### Files Changed
- sdk/core/door-api.ts (simplified)
- sdk/tools/preview/start-preview.sh (rewritten)
- sdk/package.json (updated)

## Impact

### Developer Experience
- **Simpler mental model** - One execution mode (SDK_MODE)
- **Faster feedback loop** - See door in real BBS immediately
- **Better debugging** - Real BBS logs, services, database
- **Confidence** - Preview = Production (same code path)

### Code Maintenance
- **Less code to maintain** - Removed 54 lines of PREVIEW_MODE logic
- **Single test path** - Only need to test SDK_MODE
- **Easier onboarding** - New developers see real BBS workflow

### Architecture
- **True to classic AmiExpress** - Doors as separate processes
- **IPC communication** - Modern Node.js process.send/on('message')
- **Clean separation** - Door runtime isolated from BBS backend
- **No simulation** - Real Socket.IO, real database, real services

## Future Enhancements

Potential improvements to preview system:

1. **Auto-login** - Preview could auto-login as test user
2. **Auto-run** - Preview could auto-execute door command
3. **Hot reload** - Watch door files and rebuild/restart on change
4. **Terminal preview** - CLI-based preview using Socket.IO client
5. **Multi-door testing** - Test multiple doors simultaneously

## Conclusion

The simplified preview system aligns with the core AmiExpress philosophy: doors run as separate processes communicating with the BBS. This architectural change removes unnecessary complexity, improves developer experience, and ensures that preview testing accurately reflects production behavior.

The SDK now has a clean, single-purpose Door class that only handles SDK_MODE (BBS communication via IPC), while the simple preview script provides a convenient way to test doors in the real BBS environment.

## Related Files

- `/sdk/core/door-api.ts` - Simplified Door class
- `/sdk/tools/preview/start-preview.sh` - New preview script
- `/Commands/HELLOWORLD.info` - Example door registration
- `/web/backend/src/handlers/door.handler.ts` - SDK door executor (executeSDKDoor)

## Session Information

- Date: November 11, 2025
- Implementation Time: ~2 hours
- Lines of Code Changed: ~200 lines
- Files Modified: 3 files
- Tests: SDK build ✅, Door build ✅, Preview script ✅
