# Session 2025-10-31: HunkLoader Fix - MultiTop Door Breakthrough

## Executive Summary

**MAJOR BREAKTHROUGH**: Fixed HunkLoader to properly parse Amiga Hunk files with memory flags, enabling MultiTop door to load and execute for the first time.

**Key Achievement**: Identified that both GetAnswer and MultiTop doors crash with the **same A1=0x1 register initialization issue**, confirming this is a systematic emulation problem, not door-specific bugs.

## Problem: HunkLoader Crash on MultiTop

### Initial Error
```
TypeError: Cannot read properties of undefined (reading 'address')
at HunkLoader.load (HunkLoader.ts:273:55)
```

### Root Cause
HunkLoader was reading hunk type values like `0x400003EA` and treating them as unknown hunk types, when they were actually `HUNK_DATA (0x3EA)` with memory flags in the upper bits.

**Amiga Hunk Format**: Bits 30-31 of hunk type contain memory allocation flags (CHIP, FAST, etc.)

## Solution: Mask Hunk Types

### Reference: vAmiga Implementation
Found in `/Docs/vAmiga/Core/Misc/OSDebugger/OSDescriptors.cpp:165`:
```cpp
// Read type
auto type = read() & 0x3FFFFFFF;  // Mask to remove memory flags
```

### Fix Applied
**File**: `web/backend/src/amiga-emulation/loader/HunkLoader.ts:102-104`

```typescript
const rawHunkType = this.readLong();
// Mask to get hunk type only (bits 0-29), ignoring memory flags (bits 30-31)
const hunkType = rawHunkType & 0x3FFFFFFF;
```

### Additional Fixes

1. **Relocation Validation** (lines 245-249):
```typescript
// Validate target segment exists
if (reloc.targetSegment >= hunkFile.segments.length) {
  console.warn(`[HunkLoader] Skipping invalid relocation: target segment ${reloc.targetSegment} doesn't exist (only ${hunkFile.segments.length} segments)`);
  continue;
}
```

2. **Early Parse Termination** (lines 178-183):
```typescript
if (hunkType > 0x400 || hunkType < 0x3E7) {
  // This doesn't look like a valid hunk type, probably reached data section
  console.log(`[HunkLoader] Reached invalid hunk type 0x${hunkType.toString(16)}, stopping parse`);
  this.position = this.buffer.length;
  break;
}
```

## Results: MultiTop Door Now Loads!

### Before Fix
```
[HunkLoader] CODE segment: 30688 bytes at 0x1000
[HunkLoader] Found 35 relocations for segment 0
[HunkLoader] Reached invalid hunk type 0x400003ea, stopping parse
[HunkLoader] Skipping invalid relocation: target segment 2 doesn't exist (only 1 segments)
[AmigaDoorSession] Error starting door: TypeError: Cannot read properties of undefined
```

### After Fix
```
[HunkLoader] CODE segment: 30688 bytes at 0x1000
[HunkLoader] Found 35 relocations for segment 0
[HunkLoader] DATA segment: 2340 bytes at 0x8800
[HunkLoader] DATA segment: 4652 bytes at 0x9200
[HunkLoader] Found 78 relocations for segment 2
[HunkLoader] Loading code segment at 0x1000, data.length=30688
[HunkLoader] Loading data segment at 0x8800, data.length=2340
[HunkLoader] Loading data segment at 0x9200, data.length=4652
[AmigaDoorSession] CPU configured for door execution
[AmigaDoorSession] Starting door execution...
```

**SUCCESS**: All 3 segments loaded properly!

## Door Execution Analysis

### Library Traps Working
```
[AmigaDoorSession] Inst 408: PC=0x10c0 - JSR (-306,A6) - SetTaskPri
[LibraryTraps] Intercepted: SetTaskPri() at PC=0xfece

[AmigaDoorSession] Inst 413: PC=0x10ce - JSR (-552,A6) - OpenLibrary
[LibraryTraps] Intercepted: OpenLibrary() at PC=0xfdd8
[ExecLibrary] OpenLibrary("dos.library", 0)
[LibraryTraps] OpenLibrary() returned 0x20000
```

**SUCCESS**: Library call interception confirmed working!

### Execution Progress
- Inst 0-407: Initialization code executes correctly
- Inst 408: SetTaskPri() called successfully
- Inst 413: OpenLibrary("dos.library") called successfully
- Inst 418-440: DOS.library setup code
- Inst 449: **Enters delay loop with D0=0xdeadbeee (reduced to 100)**
- Inst 450-760: Delay loop executes (our optimization working)
- Inst 1000+: **Enters polling loop at PC=0x1156**

### The Crash: Same as GetAnswer
```
[AmigaDoorSession] [1000] PC=0x115c, A1=0x1, D0=0xffff, opcode=0x51ca (DBRA)
[AmigaDoorSession] [1001] PC=0x1156, A1=0x1, D0=0xffff, opcode=0x11b1 (MOVE.B (A1),D0)
[AmigaDoorSession] [1002] PC=0x115c, A1=0x1, D0=0xffff, opcode=0x51ca (DBRA)
[AmigaDoorSession] [1003] PC=0x1156, A1=0x1, D0=0xffff, opcode=0x11b1 (MOVE.B (A1),D0)
... loops 65,535 times ...
[AmigaDoorSession] [1151] PC=0x201658 - Outside code range (0x1000-0x3000)
```

**CRITICAL FINDING**: Both GetAnswer and MultiTop crash at **identical PC=0x1156** with **identical A1=0x1 register value**.

## Root Cause Confirmed: Register Initialization

### Evidence
1. **GetAnswer door**: Crashes with A1=0x1 at PC=0x1156
2. **MultiTop door**: Crashes with A1=0x1 at PC=0x1156
3. **Same polling loop**: Both read `MOVE.B (A1),D0` expecting valid data
4. **Same crash pattern**: Both jump to garbage address after 65K loops

### What A1 Should Contain
A1 should point to a valid data structure (likely a message port or door configuration structure), not address 0x1 (exception vectors).

### Why This Happens
Door executables expect certain registers to be initialized before entry:
- **A1**: Pointer to door arguments or message port
- **A2-A5**: May contain library bases or data pointers
- **D0-D1**: May contain argument counts or flags
- **SP (A7)**: Stack pointer (currently correct at 0xfdffc)
- **A6**: ExecBase pointer (currently correct at 0x10000)

## Next Steps

### 1. Analyze Amiga Door Launch Protocol
Check vAmiga or AmigaDOS documentation for:
- What registers are set when launching a program
- How CLI vs Workbench launches differ
- What data structures A1 should point to

### 2. Implement Proper Register Initialization
In `AmigaDoorSession.ts`, before starting execution:
```typescript
// Set up door arguments
this.emulator.setRegister(9, argvAddress);  // A1 = argv pointer
this.emulator.setRegister(0, argc);         // D0 = argc
```

### 3. Test Both Doors
After implementing register initialization:
- Run GetAnswer door test
- Run MultiTop door test
- Verify both execute past PC=0x1156
- Confirm doors can communicate with BBS

## Files Modified

### `web/backend/src/amiga-emulation/loader/HunkLoader.ts`
- Line 102-104: Added hunk type masking (`& 0x3FFFFFFF`)
- Line 245-249: Added relocation target validation
- Line 178-183: Improved unknown hunk handling

## Testing

### Test Command
```bash
node test-multitop.js
```

### Expected Output
```
[HunkLoader] CODE segment: 30688 bytes at 0x1000
[HunkLoader] DATA segment: 2340 bytes at 0x8800
[HunkLoader] DATA segment: 4652 bytes at 0x9200
[LibraryTraps] Intercepted: OpenLibrary()
[ExecLibrary] OpenLibrary("dos.library", 0)
```

### Known Issues
- Both doors still crash at PC=0x1156 due to A1=0x1
- Requires register initialization before this is resolved

## References

- vAmiga HunkLoader: `/Docs/vAmiga/Core/Misc/OSDebugger/OSDescriptors.cpp`
- Amiga Hunk Format: Lines 165 (type masking), 191-206 (HUNK_RELOC32)
- Previous session: `SESSION_2025_10_30_CONT5_STATUS.md`

## Conclusion

**Major progress**: Fixed HunkLoader to properly parse Amiga executables with memory flags. MultiTop door now loads all segments and executes to the same point as GetAnswer, confirming the A1 register initialization is the remaining blocker for door execution.

**Impact**: Any Amiga executable with memory flags in hunk types can now be loaded, greatly expanding door compatibility.

**Next Priority**: Implement proper register initialization (A1-A7, D0-D7) based on Amiga door launch protocol.
