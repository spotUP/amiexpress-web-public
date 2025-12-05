# AquaScan FR Solution - Final Answer

## Root Cause (Confirmed via Disassembly)

AquaScan's code at `0x6154-0x615a` contains:
```asm
cmpi.w 0x26, 0x32(a5)  ; Compare value at offset 0x32 with 0x26
bcs.b 0x6160           ; Branch if less than (unsigned comparison)
```

AquaScan copies `fib_DirEntryType` from the FileInfoBlock to offset `0x32(a5)` and performs an UNSIGNED comparison with `0x26` (38 decimal).

**The Problem:**
- Our Examine() returned `fib_DirEntryType=-3` for "Dir1" files (regular file marker)
- Unsigned value of -3 = 0xFFFD = 65533
- 65533 is NOT less than 38, so branch fails
- AquaScan exits the loop without calling Open()
- Result: "Nothing found!"

**The Solution:**
AmiExpress "Dir1", "Dir2", etc. files are **pseudo-directories** - they're text files containing BBS file listings, but doors like AquaScan expect them to be marked as directories (fib_DirEntryType=2) so they can be opened and read line-by-line.

## The Fix

Modified `DosLibrary.ts` Examine() and ExNext() methods:

```typescript
// Special case: AmiExpress "Dir1", "Dir2", etc. files are treated as pseudo-directories
const isBBSDirFile = /^DIR\d+$/i.test(fileName);
const dirEntryType = stats.isDirectory() || isBBSDirFile ? 2 : -3;
this.writeLong(fibPtr + 4, dirEntryType);  // fib_DirEntryType
this.writeLong(fibPtr + 120, dirEntryType); // fib_EntryType
```

Now "Dir1", "Dir2", "DIR1", "DIR2", etc. files return `fib_DirEntryType=2` (directory marker) even though they're regular files.

## Why This Works

1. AquaScan checks if fib_DirEntryType < 0x26 (unsigned)
2. Directory marker (2) is less than 38, so branch succeeds
3. AquaScan continues to Open() and read the file
4. Files are displayed instead of "Nothing found!"

## Testing Required

User needs to restart server and test:
```
ascan fr
```

Expected result: Files from Conf2/Dir1 should now display correctly instead of "Nothing found!"

## Debugging with Individual Door Logs

**IMPORTANT**: Each 68K door execution creates an individual log file in `web/backend/logs/` with the pattern:
```
door-68k-{DoorName}-{Timestamp}-N{NodeNumber}.log
```

For AquaScan FR debugging:
1. Run `ascan fr` command
2. Check most recent log: `ls -lt web/backend/logs/door-68k-*AquaScan* | head -1`
3. View full log with dos.library calls: `cat web/backend/logs/door-68k-AquaScan-{timestamp}.log`
4. Look for Examine() calls to see if fib_DirEntryType is now returning 2 for Dir1 files

## Files Modified

- `web/backend/src/amiga-emulation/api/DosLibrary.ts`:
  - Examine() method (lines ~2057-2062)
  - ExNext() method (lines ~2201-2205)
  - Both fib_DirEntryType and fib_EntryType updated to use same value

## Documentation Progress

- [X] Identified root cause via disassembly analysis
- [X] Confirmed unsigned comparison issue in AquaScan code
- [X] Implemented fix for BBS Dir files
- [X] TypeScript check passed (no new errors)
- [ ] User testing pending
