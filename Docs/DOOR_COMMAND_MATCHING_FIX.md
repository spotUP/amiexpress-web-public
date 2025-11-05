# Door Command Matching Fix - Session 2025-11-01

## Problem

Door commands loaded from .info files were not being recognized when typed by users.

**Example**: Typing `testrestrict` returned `Unknown command: TESTRESTRICT`

## Root Cause Analysis

The `initializeDoors()` function was creating a hardcoded array of only 2 doors (SAL, CHECKUP), but the 58 doors loaded from Commands/BBSCmd/*.info files were stored as `CommandDefinition` objects in `commandCache.bbscmd` and were never converted to `Door` objects for the door handler.

**Data Flow Issue**:
1. `loadCommands()` parsed .info files → stored in `commandCache.bbscmd` as `CommandDefinition` objects
2. `initializeDoors()` created hardcoded `Door[]` array → only SAL and CHECKUP
3. `command.handler.ts` searched `doors[]` array for matches → only found 2 doors
4. User types `testrestrict` → not in doors array → "Unknown command"

## Solution

### 1. Export commandCache (command-execution.handler.ts:40)

```typescript
// Before: private cache
const commandCache: {
  syscmd: Map<string, CommandDefinition>;
  bbscmd: Map<string, CommandDefinition>;
} = { ... };

// After: export for access by door handler
export const commandCache: {
  syscmd: Map<string, CommandDefinition>;
  bbscmd: Map<string, CommandDefinition>;
} = { ... };
```

### 2. Convert CommandDefinition to Door Objects (door.handler.ts:728)

```typescript
export async function initializeDoors() {
  // Import commandCache to access loaded BBSCMD commands
  const { commandCache } = await import('./command-execution.handler');

  // Convert CommandDefinition objects from BBSCMD to Door objects
  const bbsCmdDoors: Door[] = [];

  for (const [cmdName, cmdDef] of commandCache.bbscmd) {
    // Convert CommandDefinition to Door interface
    const door: Door = {
      id: cmdDef.name.toLowerCase(),
      name: cmdDef.name,
      description: `${cmdDef.type} door`,
      command: cmdDef.name.toUpperCase(),  // e.g., "TESTRESTRICT"
      path: cmdDef.location,                // From LOCATION= field
      accessLevel: cmdDef.access || 0,      // From ACCESS= field
      enabled: true,
      type: cmdDef.type,                    // TYPE= (XIM, AIM, etc.)
      parameters: []
    };

    bbsCmdDoors.push(door);
  }

  // Merge with hardcoded web doors
  doors = [...bbsCmdDoors, ...webDoors];
}
```

### 3. Fix Initialization Order (index.ts:2535-2542)

**CRITICAL**: `loadCommands()` must be called BEFORE `initializeDoors()`

```typescript
// BEFORE (BROKEN):
await initializeDoors();           // Line 2536 - doors array empty!
loadCommands(bbsBaseDir, 1, 0);    // Line 2548 - loaded too late!

// AFTER (WORKING):
loadCommands(bbsBaseDir, 1, 0);    // Line 2539 - load commands FIRST
await initializeDoors();           // Line 2542 - convert to doors
```

## Results

**Before Fix:**
- 2 doors registered (SAL, CHECKUP - hardcoded only)
- Door commands from .info files not recognized
- "Unknown command" errors for all BBSCMD doors

**After Fix:**
- ✅ 60 doors registered (58 BBSCMD + 2 web doors)
- ✅ All Commands/BBSCmd/*.info files converted to Door objects
- ✅ Door command matching works correctly
- ✅ Commands are recognized and executed

## Test Results - TESTRESTRICT Door

**Test**: `node test-testrestrict.js`

**Backend Logs**:
```
[CommandPriority] Processing command: TESTRESTRICT with params: 
[SYSCMD] Executing: TESTRESTRICT 
  Command not found: TESTRESTRICT
[BBSCMD] Executing: TESTRESTRICT 
  Found command: TESTRESTRICT (XIM)
  Executing XIM door: Doors/TestRestrict
Executing door: TESTRESTRICT
[executeAmigaDoor] Starting Amiga door: TESTRESTRICT (XIM)
[executeAmigaDoor] Location: Doors/TestRestrict
[executeAmigaDoor] Full door path: ~/Code/amiexpress-web/Doors/TestRestrict
[executeAmigaDoor] Starting 68k emulation for: ~/Code/amiexpress-web/Doors/TestRestrict
[AmigaDoorSession] Starting door: ~/Code/amiexpress-web/Doors/TestRestrict
[AEDoorLibrary] Prompt(diface=0x1684, maxlen=458752, prompt="")
[AEDoorLibrary] Pausing emulator (waiting for user input, maxlen=458752)
```

**Browser Console**:
```
🚪 Door status changed: initializing
🚪 Door active: false
🚪 Door status changed: running
🚪 Door active: true
```

**Status**: ✅ **DOOR COMMAND MATCHING WORKS!**
- Command recognized correctly
- Door file found and loaded
- Emulation started successfully
- Door is running and waiting for user input

## Files Modified

1. **web/backend/src/handlers/command-execution.handler.ts**
   - Line 40: Export `commandCache` for access by door handler

2. **web/backend/src/handlers/door.handler.ts**
   - Lines 728-783: Complete rewrite of `initializeDoors()`
   - Converts `CommandDefinition` from BBSCMD to `Door` objects
   - Merges with hardcoded web doors

3. **web/backend/src/index.ts**
   - Lines 2535-2542: Swapped order - `loadCommands()` before `initializeDoors()`
   - Added critical comment explaining dependency

## Related Documentation

- `Docs/DOOR_FILE_STATUS.md` - Inventory of all 60 doors and file locations
- `Commands/BBSCmd/*.info` - Door configuration files
- `express.e:28228` - Command priority (SYSCMD > BBSCMD > InternalCommand)

## Next Steps

1. ✅ Door command matching - FIXED
2. ⏭️ Test all 54 working doors systematically
3. ⏭️ Fix .info paths for 4 broken doors (CONFLIST, GL, NUKE, REQ)
4. ⏭️ Implement MCI door handler for CONFLIST
5. ⏭️ Document door execution success/failure patterns

---

**Date**: 2025-11-01  
**Status**: ✅ COMPLETE - Door command matching fully functional
