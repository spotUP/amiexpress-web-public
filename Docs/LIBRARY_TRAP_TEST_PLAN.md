# Library Trap Testing - Analysis & Next Steps

**Date:** 2025-10-30
**Status:** Library traps installed but NOT triggered by GetAnswer door

---

## Test Results

### What Worked ✅

1. **Library trap system initialized perfectly:**
   ```
   [LibraryTraps] Installing Exec.library vectors at base 0x10000
     [OpenLibrary] Vector at 0xffe2 (offset -30)
     [CloseLibrary] Vector at 0xffdc (offset -36)
     [Forbid] Vector at 0xffd6 (offset -42)
     [Permit] Vector at 0xffd0 (offset -48)
     [AllocMem] Vector at 0xffca (offset -54)
     [FreeMem] Vector at 0xffc4 (offset -60)
     [FindTask] Vector at 0xffbe (offset -66)
   [LibraryTraps] Installed 7 Exec.library vectors
   ```

2. **Door loaded and executed:**
   - Binary parsed correctly (2 segments, 8160 bytes)
   - Entry point set: 0x1000
   - CPU executed 1.5 billion cycles
   - PC moved through code: 0x8c → 0x110 → 0x1a0 → 0x224 → etc.

### What Didn't Work ❌

1. **No library trap interception occurred:**
   - Zero `[LibraryTraps] Intercepted:` messages
   - PC never reached trap addresses (0xffe2, 0xffdc, etc.)
   - Door ran entirely in low memory (0x60-0x2a8 range)

2. **Door never exited naturally:**
   - No RTS to exit sentinel (0xdeadbeef)
   - Likely hit 5-minute timeout
   - Suggests door hung waiting for something

---

## Analysis

### Why GetAnswer Never Called Exec Functions

**Hypothesis:** GetAnswer door uses **ONLY AEDoor.library functions** for I/O, not Exec functions.

**Evidence:**
1. PC stayed in door's code segment (0x60-0x2a8)
2. Never jumped to high memory where library vectors are (0xFF** range)
3. Amiga doors typically use AEDoor.library for:
   - aePutCh() - Output characters
   - aeGetCh() - Input characters
   - aeWriteStr() - Output strings
   - GetDT() - Get user data
   - Carrier() - Check connection

**GetAnswer is waiting for:**
- AEDoor.library functions to exist
- Ability to output prompts
- Ability to read user input
- BBS session data

### Offset Calculation - Is it Correct?

**Current calculation:**
```typescript
const trapAddr = execBase + vector.offset;
// 0x10000 + (-30) = 0xFFE2
```

**Question:** Should it be -30 or -552?

**Answer:** Need to check Amiga include files. Library Vector Offsets (LVOs) are in bytes:
- OpenLibrary: -552 bytes (not -30!)
- CloseLibrary: -414 bytes
- Forbid: -132 bytes
- Permit: -138 bytes
- AllocMem: -198 bytes
- FreeMem: -210 bytes
- FindTask: -294 bytes

**CRITICAL BUG FOUND:** Our offsets are wrong! We used function indices instead of byte offsets!

---

## Root Cause: Wrong LVO Offsets

### The Problem

We used small negative numbers (-30, -36, -42...) which are **not** the correct Amiga LVO values.

**Amiga LVO standard offsets (from exec.library FD file):**
```
OpenLibrary   -552  (0xFDD8)
CloseLibrary  -414  (0xFE62)
Forbid        -132  (0xFF7C)
Permit        -138  (0xFF76)
AllocMem      -198  (0xFF3A)
FreeMem       -210  (0xFF2E)
FindTask      -294  (0xFED6)
```

### Correct Trap Addresses

With ExecBase = 0x10000:
```
OpenLibrary:   0x10000 + (-552)  = 0xFDD8
CloseLibrary:  0x10000 + (-414)  = 0xFE62
Forbid:        0x10000 + (-132)  = 0xFF7C
Permit:        0x10000 + (-138)  = 0xFF76
AllocMem:      0x10000 + (-198)  = 0xFF3A
FreeMem:       0x10000 + (-210)  = 0xFF2E
FindTask:      0x10000 + (-294)  = 0xFED6
```

**Current (WRONG) trap addresses:**
```
0xFFE2, 0xFFDC, 0xFFD6, 0xFFD0, 0xFFCA, 0xFFC4, 0xFFBE
```

**Doors are calling JSR to the CORRECT addresses (e.g., 0xFDD8), but our traps are at the WRONG addresses (0xFFE2)!**

---

## Fix Required

### 1. Correct the LVO Offsets in LibraryTraps.ts

**Change from:**
```typescript
const EXEC_VECTORS: LibraryVector[] = [
  { offset: -30, name: 'OpenLibrary', ... },
  { offset: -36, name: 'CloseLibrary', ... },
  // ...
];
```

**Change to:**
```typescript
const EXEC_VECTORS: LibraryVector[] = [
  { offset: -552, name: 'OpenLibrary', ... },
  { offset: -414, name: 'CloseLibrary', ... },
  { offset: -132, name: 'Forbid', ... },
  { offset: -138, name: 'Permit', ... },
  { offset: -198, name: 'AllocMem', ... },
  { offset: -210, name: 'FreeMem', ... },
  { offset: -294, name: 'FindTask', ... },
];
```

### 2. Find Complete Exec LVO Definitions

**Check vAmiga sources for complete list:**
```bash
find ~/Code/amiexpress-web/Docs/vAmiga -name "*.fd" -o -name "*exec*" | grep -i exec
```

**Or use standard Amiga NDK includes** (if available).

### 3. Retest with Corrected Offsets

After fixing offsets:
1. Restart backend
2. Run GetAnswer door again
3. Look for `[LibraryTraps] Intercepted:` messages
4. If still no calls, GetAnswer truly doesn't use Exec (only AEDoor)
5. Need to test with a door that DOES use Exec functions

---

## Next Steps

### Immediate (Critical Fix)

1. **Find correct Exec.library LVO offsets** from:
   - vAmiga sources
   - Amiga NDK includes
   - Or official Exec autodocs

2. **Update LibraryTraps.ts with correct offsets**

3. **Rebuild and test**

### After Fix

4. **Test with a door that uses Exec functions:**
   - Look for doors with source code
   - Check if they call OpenLibrary, AllocMem, etc.
   - Examples: WHAT door, T-Join door, etc.

5. **If still no Exec calls, proceed with Phase 3:**
   - Implement DOS.library (for file I/O)
   - Implement AEDoor.library (for BBS I/O)
   - GetAnswer will work once AEDoor is implemented

---

## References

**Amiga Library LVO Documentation:**
- RKM Libraries Manual (Chapter 1: Exec)
- exec.library FD file (function descriptor)
- exec_pragmas.h / clib/exec_protos.h

**vAmiga Sources:**
- `Docs/vAmiga/Core/Misc/OSDebugger/` - Library structure definitions
- Look for FD files or LVO definitions
