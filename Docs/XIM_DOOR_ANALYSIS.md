# XIM-DOOR Analysis - Session 2025-10-30

## Problem: Doors Output "dos.library" and Get Stuck

### Symptoms
- Doors execute and enter infinite loop
- Output displays "dos.library" text
- PC gets stuck at 0x0 (executing null pointers)
- A6 register is 0x0 when calling library functions

### Root Cause

The door (RTW/RTW) is a **XIM-DOOR** (AmiExpress Extended Internal Module Door).

**CRITICAL DISCOVERY:** XIM doors do NOT call OpenLibrary()!

### Evidence

```
[AmigaDOS] *** TRAP HANDLER CALLED *** offset=-60 (0x-3c)
[AmigaDOS] Stub library call: offset=-60 (0x-3c)
[AmigaDOS] Library base in A6: 0x0    ← A6 IS ZERO!
[AmigaDOS] Unknown library base 0x0, trying all libraries...
[dos.library] Output()
```

No OpenLibrary() calls were found in the logs.

### What is a XIM-DOOR?

From the door DATA segment:
```
". This is a XIM-DOOR for AmiExpr"
```

XIM doors are different from standalone doors:

**Standalone Doors:**
1. Call OpenLibrary("dos.library", 0)
2. Call OpenLibrary("exec.library", 0)
3. Call OpenLibrary("icon.library", 0)
4. Call OpenLibrary("AEDoor.library", 0) or FindPort("AEDoorPort")
5. Do their work
6. CloseLibrary() for all

**XIM Doors (AmiExpress Internal Modules):**
1. **Expect the BBS to have ALREADY opened libraries**
2. Expect DosBase to be set
3. Expect ExecBase to be set (already at address 4)
4. May expect other globals to be initialized
5. Jump directly to using library functions

### Why It Fails

1. Door calls `JSR -60(A6)` (Output function)
2. A6 = 0x0 (no library base!)
3. Trap handler intercepts the call
4. Falls back to routing by offset (works)
5. But Output() just returns a filehandle, doesn't output text
6. Door likely tries to Write() to that handle
7. Write() probably outputs the "dos.library" string (embedded in DATA segment)
8. Door gets stuck in error handling loop

### Solution

We need to implement XIM-DOOR initialization support:

**Option 1: Pre-open Libraries (Recommended)**
```typescript
// In AmigaDoorSession.ts, before calling execute():
if (isXimDoor(executable)) {
  // Set up DosBase at standard location (e.g., address 8)
  const dosBase = 0xFFFF0000;
  emulator.writeLong(0x8, dosBase);

  // ExecBase already at address 4 (0xFF8000)

  // A6 should be pre-loaded with DosBase for XIM doors
  emulator.setRegister(CPURegister.A6, dosBase);
}
```

**Option 2: Detect and Auto-Fix A6=0**
```typescript
// In AmigaDosEnvironment.ts handleLibraryCall():
if (libraryBase === 0) {
  // XIM door - use DosBase as default
  libraryBase = 0xFFFF0000;
  console.log(`[AmigaDOS] XIM door detected (A6=0), using DosBase=0x${libraryBase.toString(16)}`);
}
```

**Option 3: Initialize DosBase from CLI Args**
```typescript
// XIM doors often get DosBase from CLI structure
// Need to set up fake CLI with DosBase pointer
```

### How to Detect XIM Doors

1. **Check DATA segment for "XIM-DOOR" string**
2. **Check if door DATA segment has "AEDoorRP" string**
3. **Check .info file TYPE=XIM tooltype**

### Next Steps

1. ✅ Document XIM-DOOR architecture
2. ⏳ Implement DosBase initialization for XIM doors
3. ⏳ Test with RTW/RTW door
4. ⏳ Test with AquaWho door (FRONTEND command)
5. ⏳ Create XIM-DOOR detection function

## XIM-DOOR Initialization Sequence

### What the BBS Should Do

When loading a XIM door, AmiExpress does:

```c
// 1. Open dos.library
DosBase = OpenLibrary("dos.library", 0);

// 2. Set up CLI structure (command line interface)
struct CLI *cli = AllocDosObject(DOS_CLI, NULL);
cli->cli_Module = LoadSeg(doorPath);  // Load the door executable

// 3. Set globals
BPTR input = Input();
BPTR output = Output();

// 4. Pass to door via registers:
//    D0 = length of argument string
//    A0 = pointer to argument string
//    A6 = DosBase (already set from OpenLibrary)

// 5. Jump to door entry point
//    Door expects:
//    - ExecBase at address 4
//    - DosBase in A6 (or at fixed address)
//    - Input() and Output() handles available via dos.library
```

### What We Need to Add

In AmigaDoorSession.ts:

```typescript
export class AmigaDoorSession {
  start(): void {
    // ... existing code ...

    // NEW: Detect if XIM door
    const isXim = this.detectXimDoor();

    if (isXim) {
      console.log('[AmigaDoorSession] XIM-DOOR detected, setting up DosBase');

      // Set DosBase at standard CLI location
      const dosBase = 0xFFFF0000;  // dos.library base
      const dosBaseAddr = 0x8;      // Standard DosBase global address

      // Write DosBase to memory
      this.emulator.writeMemory(dosBaseAddr + 0, (dosBase >> 24) & 0xFF);
      this.emulator.writeMemory(dosBaseAddr + 1, (dosBase >> 16) & 0xFF);
      this.emulator.writeMemory(dosBaseAddr + 2, (dosBase >> 8) & 0xFF);
      this.emulator.writeMemory(dosBaseAddr + 3, dosBase & 0xFF);

      // Pre-load A6 with DosBase
      this.emulator.setRegister(CPURegister.A6, dosBase);

      console.log(`[AmigaDoorSession] DosBase=0x${dosBase.toString(16)} set at 0x${dosBaseAddr.toString(16)}`);
      console.log(`[AmigaDoorSession] A6 pre-loaded with DosBase`);
    }

    // ... execute door ...
  }

  private detectXimDoor(): boolean {
    // Check DATA segment for "XIM-DOOR" marker
    for (const segment of this.segments) {
      if (segment.type === 'DATA') {
        const data = segment.data;
        const str = String.fromCharCode(...data.slice(0, 256));
        if (str.includes('XIM-DOOR') || str.includes('AEDoorRP')) {
          return true;
        }
      }
    }
    return false;
  }
}
```

## Testing Plan

1. **Add XIM detection and DosBase setup**
2. **Test with RTW door:**
   - Should stop outputting "dos.library"
   - Should execute properly
3. **Test with AquaWho:**
   - Check if also XIM door
   - Should work with message ports

## Expected Behavior After Fix

### Before (Current):
```
Door executes JSR -60(A6)  // A6=0
Trap handler: A6=0, route by offset
Output() returns filehandle
Door writes "dos.library" string to handle
Door gets stuck in loop
```

### After (Fixed):
```
Door starts with A6=0xFFFF0000 (DosBase pre-loaded)
Door executes JSR -60(A6)  // A6=0xFFFF0000
Trap handler: A6=0xFFFF0000, route to dos.library
Output() returns proper filehandle
Door writes actual output
Door continues execution
```

## Status

- ✅ Root cause identified: XIM doors don't call OpenLibrary()
- ✅ Solution designed: Handle A6=0 by defaulting to DosBase
- ✅ XIM-DOOR detection implemented
- ✅ A6=0 → DosBase routing implemented
- ⏳ Testing with user pending (rate limit hit)

## Implementation Complete

### Changes Made

**File: `AmigaDoorSession.ts`**
```typescript
// Lines 124-137: XIM-DOOR Detection
// Detect if this is a XIM-DOOR (AmiExpress Extended Internal Module)
// XIM doors expect DosBase to be pre-loaded in A6, they don't call OpenLibrary()
let isXimDoor = false;
for (const seg of hunkFile.segments) {
  if (seg.type === 'data') {
    const ascii = Array.from(seg.data.slice(0, 256)).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '').join('');
    if (ascii.includes('XIM-DOOR') || ascii.includes('AEDoorRP')) {
      isXimDoor = true;
      console.log('[AmigaDoorSession] *** XIM-DOOR DETECTED ***');
      console.log('[AmigaDoorSession] This door expects DosBase to be pre-loaded in A6');
      break;
    }
  }
}

// Lines 186-193: Pre-load DosBase in A6 (door will overwrite, but we tried)
// XIM-DOOR INITIALIZATION: Pre-load DosBase in A6
if (isXimDoor) {
  const dosBaseAddr = 0xFFFF0000; // dos.library base address
  console.log('[AmigaDoorSession] XIM-DOOR: Pre-loading DosBase in A6');
  console.log(`[AmigaDoorSession] XIM-DOOR: Setting A6=0x${dosBaseAddr.toString(16)} (dos.library base)`);
  this.emulator.setRegister(14, dosBaseAddr); // A6 = register 14
  console.log('[AmigaDoorSession] XIM-DOOR: Door can now call dos.library functions via JSR -XX(A6)');
}
```

**File: `AmigaDosEnvironment.ts`**
```typescript
// Lines 167-177: Handle A6=0 by defaulting to DosBase
// Get the library base from A6 register (standard Amiga convention)
let libraryBase = this.emulator.getRegister(CPURegister.A6);
console.log(`[AmigaDOS] Library base in A6: 0x${libraryBase.toString(16)}`);

// XIM-DOOR FIX: When A6=0, default to DosBase
// XIM doors overwrite A6 with ExecBase, then call dos.library functions with A6=0
// We detect this and route to dos.library automatically
if (libraryBase === 0) {
  libraryBase = 0xFFFF0000; // DosBase
  console.log(`[AmigaDOS] XIM-DOOR: A6=0 detected, defaulting to DosBase (0x${libraryBase.toString(16)})`);
}
```

### How It Works

1. **Door starts** → We detect "XIM-DOOR" or "AEDoorRP" in DATA segment
2. **We pre-load** → A6 = 0xFFFF0000 (DosBase)
3. **Door executes** → Loads ExecBase from address 4 into A6
4. **Door clears A6** → Sets A6 = 0 before calling dos.library functions
5. **Our trap handler** → Detects A6=0, changes it to 0xFFFF0000
6. **Router dispatches** → Calls dos.library functions correctly

### Expected Behavior

**Before fix:**
```
Door calls JSR -60(A6) with A6=0
→ Route by offset only (fallback)
→ Output() returns filehandle
→ Door outputs "dos.library" string
→ Gets stuck in loop
```

**After fix:**
```
Door calls JSR -60(A6) with A6=0
→ Detect A6=0, set to 0xFFFF0000
→ Route to dos.library
→ Output() works correctly
→ Door outputs actual content
→ Door continues execution ✅
```

### Testing Status

- ✅ XIM-DOOR detection working (logs show "*** XIM-DOOR DETECTED ***")
- ✅ DosBase pre-loading working (logs show "Setting A6=0xffff0000")
- ✅ A6=0 routing ready (code deployed)
- ⏳ User testing blocked by BBS rate limit ("Too many connections from your IP")

**Next:** User needs to wait a moment and reconnect to test the WHO door.
