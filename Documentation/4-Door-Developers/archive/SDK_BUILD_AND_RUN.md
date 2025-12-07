# SDK Build & Run - Automatic BBS Installation

## Overview

The SDK Preview's "Build & Run" feature automatically installs doors to the BBS and launches them. When you click "Build & Run", the following happens:

## Complete Workflow

### 1. Build Door
```bash
npm run build
```
- Compiles TypeScript to JavaScript
- Bundles dependencies with esbuild
- Validates door can run with ts-node

### 2. Install to BBS (Automatic)

If build succeeds, `installDoorToBBS()` is called:

**a) Read door metadata from package.json:**
```json
{
  "bbsCommand": "2048",
  "doorType": "TS",
  "description": "Classic 2048 puzzle game",
  "accessLevel": 0
}
```

**b) Generate .info file in Commands/BBSCmd/:**
```
Commands/BBSCmd/2048.info:
  BBSCMD=2048
  TYPE=TS
  LOCATION=doors/2048-game
  DESCRIPTION=Classic 2048 puzzle game
  ACCESS=0
  MULTINODE=YES
  PRIORITY=SAME
```

**c) Create symlink in doors/:**
```bash
doors/2048-game -> sdk/doors/2048-game
```

**d) Reload BBS command cache:**
```bash
POST http://localhost:3001/api/doors/reload
```

The BBS backend:
- Clears BBSCMD cache
- Re-scans Commands/BBSCmd/*.info files
- Reinitializes Door objects
- Returns count of reloaded doors

### 3. Auto-Launch Door

After successful installation:

**a) Switch to BBS Terminal tab**

**b) Send command to BBS:**
```
Send: "2048\r"
```
- No "/" prefix
- Just the command name + Enter key
- Character-by-character input simulation

**c) BBS receives command:**
- Looks up "2048" in BBSCMD cache
- Finds Door with LOCATION=doors/2048-game
- Executes TypeScript door via executeTypeScriptDoor()
- Door runs in BBS session

## File Locations

### Development (Local)
```
/Users/username/Code/amiexpress-web/
├── sdk/doors/2048-game/     <- Source door
├── Commands/BBSCmd/2048.info   <- Command definition
└── doors/2048-game/            <- Symlink to sdk/doors/2048-game
```

### Production (Render.com)
```
/opt/render/project/amiexpress/
├── Commands/BBSCmd/2048.info   <- Command definition
└── doors/2048-game/            <- Installed door files
```

Set `BBS_ROOT` environment variable:
```bash
BBS_ROOT=/opt/render/project/amiexpress
```

## Testing the Workflow

### 1. Start All Servers
```bash
./dev/scripts/start-servers.sh
```

### 2. Open SDK Preview
```bash
cd sdk
npm run preview
# Opens http://localhost:8080
```

### 3. Select a Door
Click on any door (e.g., "2048-game")

### 4. Click "Build & Run"

Watch the console output:
```
✓ Build successful: 2048-game (1234ms)
📦 Installing 2048-game to BBS...
✓ Created 2048.info
✓ Linked to doors/2048-game
✓ BBS commands reloaded: Reloaded 42 door commands (was 41)
✓ Installed 2048 to BBS (Command: 2048)
🚀 Auto-launching door in BBS: 2048-game (command: 2048)
```

### 5. Verify in BBS Terminal Tab

The BBS tab should automatically:
1. Switch to active
2. Echo "2048" at the command prompt
3. Launch the door

### 6. Test Door Works

The door should:
- Display its UI
- Accept keyboard input
- Run normally in the BBS

### 7. Verify Door Installed

From project root:
```bash
# Check .info file exists
cat Commands/BBSCmd/2048.info

# Check symlink exists
ls -la doors/2048-game

# Type command in BBS
# Should launch door immediately
```

## Troubleshooting

### Build Succeeds but Door Doesn't Launch

**Check BBS is running:**
```bash
lsof -ti:3001
```

**Check command was registered:**
```bash
cat Commands/BBSCmd/[COMMAND].info
```

**Try manual reload:**
```bash
curl -X POST http://localhost:3001/api/doors/reload
```

### Door Not Found Error

**Check symlink points to correct location:**
```bash
ls -la doors/[doorname]
```

**Check LOCATION in .info file:**
```bash
grep LOCATION Commands/BBSCmd/[COMMAND].info
# Should be: LOCATION=doors/doorname
```

### BBS Command Cache Not Reloading

**Check BBS backend logs:**
```bash
tail -f logs/backend.log | grep -i reload
```

**Manually restart BBS:**
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

## Benefits

✅ **No Manual Installation** - Build & Run does everything automatically

✅ **Instant Testing** - Door launches immediately after building

✅ **Hot Reload** - BBS picks up changes without restart

✅ **Real BBS Environment** - Doors run as actual BBS doors, not emulated

✅ **Proper Registration** - Commands work system-wide, not just in SDK

## Implementation Files

- **SDK Preview Server**: `sdk/tools/preview/server.js`
  - `installDoorToBBS()` function (lines 51-131)
  - Build success handler (lines 3065-3096)

- **SDK Preview Frontend**: `sdk/tools/preview/frontend/src/App.tsx`
  - Auto-launch handler (lines 326-346)

- **BBS Backend**: `web/backend/src/index.ts`
  - Hot-reload endpoint (lines 642-668)

- **Command Loader**: `web/backend/src/handlers/command-execution.handler.ts`
  - `reloadDoorCommands()` function (lines 88-122)

## See Also

- [Door Development Guide](DOOR_DEVELOPMENT.md)
- [SDK Quick Login](SDK_QUICK_LOGIN.md)
- [Ported E Doors](PORTED_E_DOORS.md)
