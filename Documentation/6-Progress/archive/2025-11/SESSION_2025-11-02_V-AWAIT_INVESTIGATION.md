# V-AWAIT Door Investigation & Partial Fix

**Date**: 2025-11-02
**Issue**: V-AWAIT door crashes on connect, blocking BBS login
**Status**: AEDoor.library version fixed, but door still has deeper issues

## Summary

V-AWAIT door was being run automatically from AWAITSCREEN.TXT on connect. The door crashed, causing the backend to fail. Investigation revealed multiple issues.

## Fixes Applied

### 1. AEDoor.library Version Upgrade
**File**: `web/backend/src/amiga-emulation/api/ExecLibrary.ts:330`

**Problem**: V-AWAIT requires AEDoor.library version 2+, but we advertised version 1

**Fix**:
```typescript
case 'aedoor.library':
  libAddr = this.AEDOOR_LIB_ADDR;
  libVersion = 2;  // V-AWAIT door requires version 2+
  libRevision = 0;
  break;
```

**Result**: AEDoor.library now opens successfully

### 2. Kickstart ROM Path Resolution
**File**: `web/backend/src/amiga-emulation/KickstartRom.ts:27-50`

**Problem**: ROM path only worked when running from `web/backend/` directory

**Fix**: Added multiple path fallbacks to support running from project root:
```typescript
const possiblePaths = [
  path.join(process.cwd(), 'data/amiga-roms', romFilename),                    // From web/backend/
  path.join(process.cwd(), 'web/backend/data/amiga-roms', romFilename),        // From project root
  path.join(__dirname, '../../data/amiga-roms', romFilename),                  // Relative to source
];
```

**Result**: ROM loads correctly from any working directory

## Remaining Issues with V-AWAIT

### Issue: Door Calls Non-Existent DOS Function

**Evidence**:
```
JSR (-948,A6) at PC=0x1270, SP=0xfdfd8
Target: 0x20000 + (-948) = 0x1fc6c
Opcode at 0x1fc6c: 0x0000 (uninitialized memory)
```

**Analysis**:
- V-AWAIT calls DOS library function at offset -948
- Standard Amiga DOS.library doesn't have functions at this offset
- Highest standard DOS offset is around -800
- This causes execution to jump into uninitialized ROM space
- Door then executes illegal instructions (0x0000)

### Issue: Stack Corruption from Bad StackSwap

**Evidence**:
```
StackSwap(struct=0x12c8)
  NEW: Lower=0x45727272, Upper=0x20796561, SP=0x68207468

Hex to ASCII:
  0x45727272 = "Errr"
  0x20796561 = " yea"
  0x68207468 = "h th"

Complete string at 0x12c8: "Errr yeah this is like an /X door d00d!"
```

**Analysis**:
- StackSwapStruct address (0x12c8) points to error message string, not valid struct!
- This is V-AWAIT's way of saying it's not compatible
- Message: "Errr yeah this is like an /X door d00d!" (needs /X mode)
- Stack gets corrupted by garbage values
- All subsequent function returns fail
- Door exits with return address 0x0

## Why V-AWAIT Fails

From strings analysis of the binary:
```
"Errr yeah this is like an /X door d00d!"          ← Error we're seeing
"Eeeeek! Can't find AEDoor.library, sneif!"        ← Now fixed (v2)
"Eeeek! Can't find S:SAmiLog.Store, outta here!"   ← Needs log file
```

**Root Causes**:
1. ✅ **FIXED**: AEDoor.library version too low (was 1, needs 2+)
2. ❌ **UNFIXED**: Calls non-existent DOS function at offset -948
3. ❌ **UNFIXED**: Needs `/X` mode (expert mode?) to run properly
4. ❌ **UNFIXED**: Needs `S:SAmiLog.Store` log file

## Workaround Applied

**File**: `Node0/Screens/AWAITSCREEN.TXT`
**Action**: Removed `~CC_V-AWAIT|` command
**Result**: Backend no longer crashes on connect

## Recommendations

### Short Term
- Keep V-AWAIT disabled in AWAITSCREEN.TXT
- Backend now works for login and other doors (WHO, etc.)

### Long Term (if V-AWAIT support needed)
1. Investigate why door calls DOS offset -948:
   - Check if it's a different DOS.library version
   - Check if A6 (library base) is corrupted before the call
   - Disassemble the binary to understand the call

2. Implement missing DOS functions:
   - Add catch-all handler for unimplemented library functions
   - Return sensible defaults (NULL) instead of crashing

3. Understand `/X` mode requirement:
   - Check AmiExpress documentation for expert mode
   - May need special initialization

4. Create required files:
   - `S:SAmiLog.Store` - Activity log file
   - Check what format it expects

## Files Modified

- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - AEDoor.library version 2
- `web/backend/src/amiga-emulation/KickstartRom.ts` - Multi-path ROM loading
- `Node0/Screens/AWAITSCREEN.TXT` - Disabled V-AWAIT (temporary)
- `Node0/Screens/Logon*.txt` - Disabled WALL commands (temporary)

## Test Results

```bash
# AEDoor.library now opens successfully:
[ExecLibrary] OpenLibrary("AEDoor.library", 2)
[ExecLibrary]   Library structure written: AEDoor.library v2.0
[ExecLibrary]   Opened at 0x30000, v2.0

# But door still fails with stack corruption:
[ExecLibrary] StackSwap(struct=0x12c8)
[ExecLibrary]   NEW: Lower=0x45727272 ("Errr"), Upper=0x20796561 (" yea"), SP=0x68207468 ("h th")

# Final result:
[AmigaDoorSession] Door PC in low memory (0x0) - treating as exit
[AmigaDoorSession] Total instructions executed: 254
```

## Next Steps

Focus shifted to WHO door testing since:
- V-AWAIT requires significant additional work
- WHO door is simpler and more critical for testing
- WHO door uses standard library functions
- Backend now accessible with V-AWAIT disabled
