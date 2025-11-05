# AmiExpress Door System - How It Works

## Summary: Door Discovery is Working Correctly

**The BBS IS already scanning and registering doors on startup** - exactly as the original AmiExpress did.

---

## How AmiExpress Doors Work (From E Sources)

### Original E Implementation (express.e)

1. **Commands are defined in .info files** (not auto-discovered from directories)
2. **Location:** `Commands/BBSCmd/*.info` files
3. **Loading:** express.e lines 4630-4650 - scans BBSCMD directory
4. **Priority:** CONFCMD > NODECMD > BBSCMD

### Our Implementation (1:1 Port)

**File:** `/web/backend/src/handlers/command-execution.handler.ts`

```typescript
export function loadCommands(baseDir, conferenceId, nodeId) {
  // Scan Commands/BBSCmd directory for .info files
  const bbsCommands = scanCommandDirectory(baseDir, CommandType.BBSCMD, conferenceId, nodeId);

  // Cache commands for lookup
  for (const [name, cmd] of bbsCommands) {
    commandCache.bbscmd.set(name.toUpperCase(), cmd);
  }
}
```

**This is called once at startup** in `index.ts`:
```typescript
loadCommands(bbsBaseDir, 1, 0); // Conference 1, Node 0
```

---

## Current Status

### ✅ Working Correctly

**58 doors registered at startup:**

```
Commands loaded:
  Loaded 58 BBS commands
  Loaded 23 system commands
  Total: 81 commands
```

**Sample registered doors:**
- B → Bulls (bulletin system)
- CONFLIST → Conference list
- DEL → MGZ List Manager
- ED → 5D-Edit
- GA → GetAnswer
- MRC → MRC door
- OLM → War OLM
- WHO → AquaWho
- etc.

### 📂 Door Directory Structure

**Commands/BBSCmd/** - Command definitions (.info files)
- Contains 58+ `.info` files
- Each defines a command name and door location
- Format: AmigaDOS ToolType format

**Doors/** - Door executables and data
- 51 door directories
- Not all have .info files in Commands/BBSCmd
- Some are libraries, not standalone doors
- Some may be alternate versions

---

## How Doors Are Registered

### .info File Format (ToolType)

Example: `Commands/BBSCmd/ga.info`
```
LOCATION=Doors:GetAnswer/GetAnswer
ACCESS=0
PRIORITY=SAME
TYPE=XIM
MULTINODE=YES
```

### Our Parser

**File:** `/web/backend/src/utils/amiga-command-parser.util.ts`

```typescript
scanCommandDirectory() {
  // 1. Find all .info files in Commands/BBSCmd
  // 2. Parse ToolTypes to get LOCATION, ACCESS, etc.
  // 3. Register command → door mapping
}
```

---

## Why Some Doors Aren't Commands

### Door Directories Without .info Files

Many directories in `Doors/` are:

1. **Libraries/Support Files**
   - Not standalone executables
   - Used by other doors

2. **Alternate Versions**
   - .000, .020, .030 versions
   - Different CPU optimizations

3. **Not Installed**
   - Copied but not configured
   - Need .info file to activate

4. **Internal/Debug Tools**
   - Not meant for users
   - Development aids

---

## How to Add a New Door

To make a door available as a command:

### Step 1: Create .info File

Create `Commands/BBSCmd/MYCOMMAND.info`:
```
LOCATION=Doors:MyDoor/MyDoor
ACCESS=0
PRIORITY=SAME
STACK=4096
TYPE=XIM
MULTINODE=YES
```

### Step 2: Restart Backend

```bash
./dev/scripts/stop-all.sh
./dev/scripts/start-backend.sh
```

### Step 3: Verify Registration

Check logs:
```bash
grep "Registered door: MYCOMMAND" /tmp/backend.log
```

### Step 4: Test

Login to BBS and type: `MYCOMMAND`

---

## Command Discovery Process

### At Startup

1. **index.ts calls loadCommands()**
   ```typescript
   loadCommands(bbsBaseDir, 1, 0);
   ```

2. **scanCommandDirectory() reads .info files**
   ```typescript
   // Scans Commands/BBSCmd/*.info
   const bbsCommands = scanCommandDirectory(baseDir, CommandType.BBSCMD, ...);
   ```

3. **Commands cached in memory**
   ```typescript
   commandCache.bbscmd.set("GA", { command: "GA", location: "Doors:GetAnswer/GetAnswer", ... });
   ```

4. **Doors array populated**
   ```typescript
   await initializeDoors(); // Converts CommandDefinitions to Door objects
   setDoors(doors);         // Injects into command handler
   ```

### At Runtime

When user types a command:

1. **Check SYSCMD** (system commands)
2. **Check BBSCMD** (door commands) ← Doors checked here
3. **Check Internal** (built-in commands)

**File:** `command.handler.ts` lines 2730-2740
```typescript
const matchingDoor = doors.find(door =>
  door.command.toLowerCase() === command.toLowerCase()
);

if (matchingDoor) {
  await executeDoor(socket, session, matchingDoor);
}
```

---

## Testing All Available Doors

To test the 58 registered doors, use their command names:

```bash
# Create test list
grep "Registered door:" /tmp/backend.log | awk '{print $NF}' | awk -F'→' '{print $1}' > door-commands.txt

# 58 commands:
ARCL, ASSN, B, BBSC, BCR, BORD, BRE, CONFLIST, CTOP, DARK,
DEL, DKNS, DMAS, DMUD, ED, FALC, FHON, FISH, GA, GGAM,
GL, GWALL, GWAR, HACK, I, JUNK, LEGN, LINKMENU, LINKWALL,
LMON, LORD, LORD2, LUNA, MEGA, MMOT, MRC, MRCSTAT1, MRCSTAT2,
MZKL, NETR, NUKE, OLM, OOII, REQ, SENT, SIZE, STUPID,
TEOS, TEST, TESTRESTRICT, TLIST, TW2002, U, ULIST, USRP,
VSYS, WHAT, WHO
```

---

## Misconception Clarified

### ❌ WRONG Assumption
"BBS should auto-discover all directories in Doors/ and make them commands"

### ✅ CORRECT Behavior
"BBS loads commands from .info files in Commands/BBSCmd/, which point to door executables"

**This is exactly how AmiExpress worked** - doors must be explicitly registered via .info files.

---

## Summary

1. **Door system is working correctly** ✅
2. **58 doors are registered** ✅
3. **Registration happens at startup** ✅
4. **Method matches original AmiExpress** ✅
5. **No changes needed** ✅

The issue was not that doors aren't being registered - it's that **door directories ≠ door commands**. Only doors with .info files in Commands/BBSCmd/ are registered as commands.

---

**Date:** 2025-11-01
**Status:** ✅ Door system working as designed
**Next:** Test the 58 registered doors using correct command names
