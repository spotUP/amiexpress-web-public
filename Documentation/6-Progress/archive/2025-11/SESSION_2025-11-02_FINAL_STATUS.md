# Session 2025-11-02: Final Status - Double Interception Still Unresolved

## Session Goal

Fix the WHO2 door to execute successfully without hanging or producing duplicate output.

## Fixes Applied

### 1. Console Device Specification Handling ✅

**File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:216-238`

**Problem:** Door couldn't open "con:10/10/320/80/Output/auto/close/wait"

**Solution:** Recognize ANY string starting with "con:" as console device

**Result:** WORKS - Door now opens console successfully

### 2. State-Based Duplicate Trap Prevention (Partial) ⚠️

**Files:**
- `AmigaDoorSession.ts:64-65` - Added `lastInterceptedTrap` and `lastInterceptedIteration` fields
- `AmigaDoorSession.ts:1541-1543` - JSR handler marks trap as intercepted
- `AmigaDoorSession.ts:885-894` - First trap detector skips if just handled
- `AmigaDoorSession.ts:1412-1421` - Second trap detector skips if just handled

**Problem:** Library calls were being intercepted twice - once by JSR handler, once by trap address detector

**Result:** PARTIAL SUCCESS - Skipping works but outputs still appear twice

## Current Issue: Why Double Output Persists

### The Problem

Despite state-based skipping, Write() still outputs twice:

```
[LibraryTraps] Intercepted: Write() at offset -48      <-- JSR handler
[OUTPUT] /X DooR by SPY/MST\n                          <-- First output
[LibraryTraps] Write() returned 0x13                   <-- From handleTrapByOffset()
[AmigaDoorSession] Marked trap 0x1ffd0 as intercepted
[AmigaDoorSession] SKIPPING DUPLICATE TRAP             <-- Skip detector works!
[OUTPUT] /X DooR by SPY/MST\n                          <-- Second output!
[LibraryTraps] Write() returned 0x13                   <-- From handleTrap()!
```

### Root Cause Analysis

There are TWO DIFFERENT handler functions that both log "returned 0x":
1. `handleTrapByOffset()` at line 935 - Called by JSR handler
2. `handleTrap()` at line 784 - Called by trap address detector

**The Sequence:**
1. JSR handler at PC=0x27fa intercepts, calls `handleTrapByOffset()`, outputs text, sets PC to 0x27fe, marks trap 0x1ffd0
2. Next iteration: PC should be 0x27fe but somehow a trap detector sees PC=0x1ffd0
3. Skip check works, skips duplicate
4. But ANOTHER trap detector (different code path) still calls `handleTrap()` directly!
5. `handleTrap()` outputs again

### Why Two Trap Detectors Both Fire

The code has MULTIPLE execution paths:
- Path A (iterations < 1000): One set of trap detection at lines 849-918
- Path B (iterations >= 1000): Different trap detection at lines 1356-1478
- Path C: JSR detection at lines 1506-1551

At iteration 1927, Path B and Path C both execute, causing double handling even with the skip logic!

## On Real Amiga: How It Works

On a real Amiga, library calls work via the **SetFunction/SetPatch mechanism**:

1. **ROM Library Vectors**: Library functions exist as JMP instructions in ROM at negative offsets from library base
2. **JSR (d16,A6)**: Door executes `JSR -48(A6)` which jumps to the ROM vector
3. **JMP to Handler**: ROM vector contains `JMP` to actual handler code
4. **One Execution**: Each JSR results in ONE function execution

Our emulation tries to intercept BEFORE the JSR executes (to avoid running ROM code), but the complex multi-path execution model causes the same trap to be detected by multiple code paths.

## Why We Can't Get It Working

**The Fundamental Problem:**

Our emulation has 3+ different code paths that can all detect the same library call:
1. Early trap detection (iterations < 1000)
2. Late trap detection (iterations >= 1000)
3. JSR instruction detection

Even with state-based skipping, the logic isn't coordinated across ALL paths. The skip flag prevents Path B from re-executing, but Path B might not be the one that fires - it could be Path A or a different detector entirely.

**The paths execute in different iteration ranges and have different variable scopes (`tracePc` vs `pc`), making it nearly impossible to coordinate them without major refactoring.**

## Next Steps (If Continuing)

### Option 1: Architectural Refactoring (Recommended)

Consolidate ALL trap detection into ONE canonical function:

```typescript
private checkAndHandleLibraryTrap(pc: number): boolean {
  // Single source of truth for ALL trap detection
  // Returns true if handled, false if should execute normally
}
```

Call this from ONE place in the main loop, regardless of iteration count.

### Option 2: ROM Unmapping

Unmap the ROM library vector addresses so if CPU accidentally executes there, it triggers an exception instead of running duplicate code.

### Option 3: Accept JSR-Only Interception

Remove ALL trap address detection. ONLY intercept via JSR (d16,A6) instruction detection. This means:
- Simpler logic
- No double interception possible
- But: Won't catch library calls made via other mechanisms (JSR to absolute address, etc.)

## Files Modified This Session

1. `web/backend/src/amiga-emulation/api/DosLibrary.ts` - Console device fix ✅
2. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - State-based duplicate prevention (incomplete)

## Documentation Created

1. `Docs/SESSION_2025-11-02_DOS_LIBRARY_FIXES.md` - Console and DOS library fixes
2. `Docs/SESSION_2025-11-02_DOUBLE_INTERCEPTION_BUG.md` - Initial analysis
3. `Docs/SESSION_2025-11-02_FINAL_STATUS.md` - This document

## Recommendation

The double interception issue requires **architectural refactoring** of the emulation loop. The current multi-path design with different iteration ranges makes it impossible to reliably prevent duplicate handling without a complete restructure.

Consider:
1. Testing OTHER doors that don't rely on Write() to see if they work
2. Focusing on XIM protocol doors that use PutMsg() instead of DOS Write()
3. Deferring WHO door fix until major emulation loop refactor can be planned

The console device fix and DOS library improvements ARE valuable and will help other doors.
