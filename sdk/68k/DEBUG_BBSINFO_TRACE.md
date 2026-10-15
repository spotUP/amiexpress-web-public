# BBSInfo Debug Trace - Finding the Real Problem

## What Was Added

Added comprehensive debug logging to `/web/backend/src/amiga-emulation/session/door-info.util.ts` (lines 62-116) to verify:

1. **What we're writing** - User data being written to memory
2. **Where we're writing** - Exact memory addresses
3. **Read-back verification** - What's actually in memory after writing
4. **Pointer verification** - Check if DoorInfo+0x1c and +0x20 are correct
5. **Data via pointers** - Read strings using the pointer addresses

## Debug Output Format

```
[door-info.util] ===== BBSInfo Population Debug =====
[door-info.util] doorInfoAddr=0xXXXXXX bbsInfoAddr=0xXXXXXX
[door-info.util] Writing: user="sysop" loc="Server Room" bbsName="AmiExpress-Web"

[door-info.util] ===== Verification (Reading Back) =====
[door-info.util] Read back from BBSInfo+0x14: "..." (length=N)
[door-info.util] Read back from BBSInfo+0xdc: "..." (length=N)
[door-info.util] Read back from BBSInfo+0x120: "..."
[door-info.util] Read back from BBSInfo+0x150: "..."
[door-info.util] Read back from BBSInfo+0x170: "..."
[door-info.util] DoorInfo+0x1c pointer: 0xXXXXXX (should be 0xXXXXXX)
[door-info.util] DoorInfo+0x20 pointer: 0xXXXXXX (should be 0xXXXXXX)
[door-info.util] ✓ Pointers are CORRECT / ✗ ERROR: Pointers are WRONG!
[door-info.util] Via DoorInfo+0x20 pointer: "..."
[door-info.util] Via DoorInfo+0x1c pointer: "..."
[door-info.util] ===== End Verification =====
```

## What to Look For

### Scenario 1: Pointers are WRONG
If output shows `✗ ERROR: Pointers are WRONG!`:
- **Problem**: DoorInfo+0x1c and +0x20 are being overwritten
- **Cause**: Real library initialization overwrites our pointers
- **Solution**: Set pointers AFTER library initialization, not before

### Scenario 2: Pointers are CORRECT but strings are EMPTY
If pointers match but read-back shows empty strings:
- **Problem**: Wrong memory offsets for string data
- **Cause**: BBSInfo+0x14 and +0xdc are not where library expects data
- **Solution**: Find actual offsets library reads from

### Scenario 3: Strings populate but diagnostic still shows garbage
If read-back shows correct data but diagnostic shows ` or backticks:
- **Problem**: Library is reading from DIFFERENT structure entirely
- **Cause**: Library might not use BBSInfo structure at all for these functions
- **Solution**: Trace library function calls to see what it actually reads

### Scenario 4: Everything verifies but still fails
If all verification passes but diagnostic fails:
- **Problem**: Timing issue - data populated BEFORE library reads it
- **Cause**: Library reads data during initialization, before our population runs
- **Solution**: Hook library initialization to populate data earlier

## Expected Addresses

Based on previous logs, we should see:
```
doorInfoAddr=0x100100 (or similar)
bbsInfoAddr=0x100146 (doorInfoAddr + 0x46)

Pointers should be:
DoorInfo+0x1c = 0x10021c (bbsInfoAddr + 0xdc)
DoorInfo+0x20 = 0x10015a (bbsInfoAddr + 0x14)
```

## Next Steps Based on Results

### If pointers are wrong:
1. Check when library initialization happens
2. Find where library sets up DoorInfo structure
3. Hook after library setup to set our pointers

### If offsets are wrong:
1. Re-examine disassembly for actual string locations
2. Check if library uses different structure layout
3. Compare with working Amiga BBS memory dump

### If library doesn't use BBSInfo:
1. Check if getname/getlocation use XIM protocol instead
2. Implement XIM message handlers for DT_NAME, DT_LOCATION
3. Update XIMProtocol.ts to return user data

## Test Command

```bash
# Restart backend to load new code
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh

# In BBS terminal:
DIAGNOSTIC

# Check backend logs for debug output:
grep "BBSInfo" logs/backend.log | tail -50
```

## Current Hypothesis

Based on disassembly analysis (aedoor_library_disasm.asm lines 388-396), the library function `CopyLocationString` reads from `DoorInfo+0x20`:

```asm
0x000003c0: move.l a1, -(a7)           ; Save A1
0x000003c2: movea.l 0x20(a1), a1      ; A1 = pointer at DoorInfo+0x20
0x000003c6: move.w 0xc6, d0           ; Max 198 bytes
0x000003ca: move.b (a1)+, (a0)+       ; Copy byte
0x000003cc: dbeq d0, 0x3ca            ; Loop
0x000003d0: clr.b (a0)                ; Null terminate
```

So the library SHOULD read from the pointer at `DoorInfo+0x20`. If our verification shows this pointer is correct and points to a string, but the diagnostic still shows garbage, then either:

1. **Library is calling different function** - Maybe getname() doesn't call CopyLocationString
2. **Library is reading before we write** - Timing issue
3. **Library uses different DoorInfo instance** - Multiple DoorInfo structures exist

## Status

✅ Debug logging added
🔄 Ready for testing
⏳ Waiting for diagnostic run with new logs

---

**Created**: 2025-12-16
**Purpose**: Debug BBSInfo population issue with comprehensive memory verification
