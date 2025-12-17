# BBSInfo Population Fix - CORRECTED LOCATION

## Issue with Original Fix

**Original Fix Location:** `AmigaDoorSession.ts` lines 373-414
**Problem:** Wrote to fixed address (0x10046) BEFORE DIFace structure was allocated
**Result:** Data written to wrong address, door reads from different (correct) address

## Root Cause

The BBSInfo structure is embedded within the DIFace structure at offset +0x46. The DIFace structure is allocated dynamically by `DoorMessageHandler` when the door calls CreateComm(). Writing to a fixed address before allocation means:

1. AmigaDoorSession writes to 0x10000 + 0x46 = 0x10046
2. DoorMessageHandler allocates DIFace at (for example) 0x80000
3. BBSInfo should be at 0x80000 + 0x46 = 0x80046
4. Door reads from 0x80046, finds nothing (we wrote to 0x10046)

## Correct Fix Location

**File:** `web/backend/src/amiga-emulation/session/door-info.util.ts`
**Lines:** 57-75 (19 new lines added)
**Function:** `populateDoorInfoStructs()`

This function is called AFTER `doorInfoAddr` is allocated, so it writes to the correct address.

## Implementation

```typescript
// CRITICAL FIX: Populate BBSInfo structure with actual string data
// AEDoor.library functions (getname, getlocation, getbbsname, GetTheDate, GetTheTime)
// read strings DIRECTLY from the BBSInfo structure, not via pointers
const bbsInfoAddr = doorInfoAddr + 0x46;  // BBSInfo structure offset within DIFace
const bbsName = "AmiExpress-Web";
const sysopName = "Sysop";

// Format current date and time
const now = new Date();
const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

// Write to BBSInfo structure (max lengths per field)
writeCString(emulator, bbsInfoAddr + 0x00, user.slice(0, 30));        // UserName[31]
writeCString(emulator, bbsInfoAddr + 0x1F, loc.slice(0, 29));         // Location[30]
writeCString(emulator, bbsInfoAddr + 0x3D, bbsName.slice(0, 40));     // BBSName[41]
writeCString(emulator, bbsInfoAddr + 0x66, dateStr.slice(0, 19));     // SystemDate[20]
writeCString(emulator, bbsInfoAddr + 0x7A, timeStr.slice(0, 19));     // SystemTime[20]
writeCString(emulator, bbsInfoAddr + 0x8E, sysopName.slice(0, 30));   // SysopName[31]
```

## Why This Works

1. **Correct Timing:** Runs AFTER DIFace is allocated (when CreateComm is called)
2. **Correct Address:** Uses actual `doorInfoAddr`, not fixed address
3. **Direct String Data:** Writes strings directly into BBSInfo, not pointers
4. **Proper Layout:** Matches exact BBSInfo structure offsets

## Files Modified

- `web/backend/src/amiga-emulation/session/door-info.util.ts` (+19 lines)

## Original Fix Disposition

The original fix in `AmigaDoorSession.ts` lines 373-414 should be **REMOVED** as it:
- Writes to the wrong address
- Runs at the wrong time (too early)
- Is redundant with the corrected fix

## Testing

Restart backend and run DIAGNOSTIC door:
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
telnet localhost 2323
DIAGNOSTIC
```

**Expected Results:**
- Section 3: getname() = "sysop" (not empty)
- Section 3: getlocation() = "Server Room" (not garbage)
- Section 3: getbbsname() = "AmiExpress-Web" (not empty)
- Section 9: GetTheDate() = "12/16/2025" (not garbage)
- Section 9: GetTheTime() = "HH:MM:SS" (not empty)

**Status:** CORRECTED - Ready for Testing
