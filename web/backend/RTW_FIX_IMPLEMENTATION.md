# RTW Door Fix - A5-88 CommandsStructure Pointer

## Problem Identified

RTW door shows error: "This is a XIM-DOOR for AmiExpress 3.x only"

**Root Cause**: RTW reads memory at `A5-0x58` (A5-88) expecting a pointer to an AmiExpress CommandsStructure. We were storing `frameBase` (A5 itself) there, causing RTW to dereference invalid data and fail validation.

## Investigation Process

1. **strings analysis** on RTW binary revealed:
   - References to intuition.library (we have this as TypeScript stub)
   - Port names: AEServer.%d, AEDoorRP.000, AEDoorPort%d (all present)
   - Console and file operations
   - ANSI formatting sequences

2. **A5 register analysis**:
   - A5 = stack top (set at DoorLoader.ts:429)
   - RTW checks *(A5-88) for AmiExpress structure pointer
   - We had: writeFrame32(-88, frameBase) - pointing A5 to itself!

3. **Found SharedBBSData/CommandsStructure**:
   - GlobalStructures.ts defines CommandsStructure (1976 bytes)
   - Contains: bbsName, sysopName, confNames, etc.
   - SharedBBSData manages it at 0xF00300
   - **BUT**: Never instantiated - dead code!

## Solution Implemented

### Changes Made

**File**: `web/backend/src/amiga-emulation/DoorLoader.ts`

**1. Added import** (line 16):
```typescript
import { SharedBBSData } from "./structures/GlobalStructures.js";
```

**2. Create SharedBBSData before A5 frame setup** (lines 439-445):
```typescript
// Create SharedBBSData structure (CommandsStructure, etc.) for AmiExpress doors
// XIM doors like RTW expect a pointer to CommandsStructure at A5-88
console.log('[DoorLoader] Creating SharedBBSData (CommandsStructure) for AmiExpress environment...');
const sharedBBSData = new SharedBBSData(this.emulator, 0xF00300);
sharedBBSData.writeBBSData(this.config.bbsSession);
const cmdsAddr = sharedBBSData.getCmdsAddr();
console.log(`[DoorLoader] CommandsStructure created at 0x${cmdsAddr.toString(16)}`);
```

**3. Update A5-88 to point to CommandsStructure** (line 480):
```typescript
// OLD:
writeFrame32(-88, frameBase); // saved a5

// NEW:
writeFrame32(-88, cmdsAddr); // CRITICAL: Pointer to CommandsStructure (RTW checks this!)
```

## Environment Variables (Also Fixed)

**File**: `web/backend/src/amiga-emulation/session/EnvironmentManager.ts`

Updated to correct values (lines 250-257):
- EXPRESS_VERSION = 'v5.6' (was '3.10')
- EXPRESS_BBSNAME = 'AmiExpress BBS' (was 'AmiExpress-Web')
- EXPRESS_SYSOP = 'Sysop'
- Added: BBS_LOCATION, BBS_PHONE

## Expected Behavior After Fix

When RTW executes:
1. Reads pointer at A5-88 → gets 0xF00300 (CommandsStructure address)
2. Dereferences to access BBS configuration:
   - +0x4D9: bbsName = "AmiExpress BBS"
   - +0x52B: sysopName = "Sysop"
   - Other BBS config fields
3. Validates structure → recognizes AmiExpress environment
4. Proceeds to display node information instead of error banner

## Testing Instructions

1. Restart BBS server to load new code
2. Run RTW door from a BBS session
3. Check logs for:
   - `[DoorLoader] Creating SharedBBSData (CommandsStructure)...`
   - `[DoorLoader] CommandsStructure created at 0xF00300`
4. Verify RTW shows node list instead of error banner

## Related Files Modified

- `web/backend/src/amiga-emulation/DoorLoader.ts` (main fix)
- `web/backend/src/amiga-emulation/session/EnvironmentManager.ts` (env vars)
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` (env var init)
- `web/backend/src/amiga-emulation/LibraryManager.ts` (env var call)

## Compilation Status

✅ TypeScript compilation: PASSED (no errors)

---

*Date: 2024-12-25*
*Session: RTW debugging - A5-88 structure pointer fix*
