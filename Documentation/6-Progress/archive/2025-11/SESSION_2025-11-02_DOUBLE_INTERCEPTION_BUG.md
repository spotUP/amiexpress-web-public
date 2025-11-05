# Session 2025-11-02: Double Interception Bug

## Summary

Fixed critical double interception bug where library calls were being handled twice, causing duplicate output. WHO door now outputs correctly but still has other issues preventing completion.

## Root Cause

There were THREE separate trap detection blocks in AmigaDoorSession.ts:
1. Line 761: Early trap detection (appears to be unused/legacy)
2. Lines 836-901: Main trap detection block
3. Lines 1353-1440: Secondary trap detection block

When a door executes `JSR (d16,A6)` to call a library function, BOTH trap detection blocks would fire:
1. One detects PC at library trap address (e.g., 0x1ffd0 for Write)
2. Then JSR handler detects the JSR instruction itself

This caused Write() and other functions to execute twice.

## Fixes Applied

### Fix #1: Console Device Specification Handling ✅

**File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:216-238`

**Problem:** Open() only recognized exact "CON:", "*", "CONSOLE:" but not parameterized specs like "con:10/10/320/80/Output/auto/close/wait"

**Solution:**
```typescript
const isConsoleDevice = filename === '*' ||
                       filename.toUpperCase() === 'CONSOLE:' ||
                       filename.toUpperCase().startsWith('CON:');
```

**Result:** WHO door successfully opens console with parameters

### Fix #2: Skip JSR Instructions in Trap Detection (Partial) ⚠️

**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts`

**Changes:**
- Line 841-844: Check if instruction is JSR (d16,A6) before trap detection
- Line 849: Skip trap check if `!isJSR_A6`
- Lines 1357-1361: Added same JSR check to second trap detection block
- Line 1386: Added `!pcIsJSR_A6` check

**Code:**
```typescript
// Read instruction bytes FIRST
const op0 = this.emulator.readMemory(tracePc);
const op1 = this.emulator.readMemory(tracePc + 1);
const opcode = (op0 << 8) | op1;

// CRITICAL FIX: Check if current instruction is JSR (d16,A6) - opcode 0x4eae
// If so, skip the trap address check below because the JSR handler
// at lines 1488-1529 will handle it. This prevents DOUBLE INTERCEPTION.
const isJSR_A6 = (opcode === 0x4eae);

// Check for library trap BEFORE executing
// BUT: Skip this check if we're about to execute JSR (d16,A6)
if (!isJSR_A6 && this.libraryTraps) {
  // ... trap detection
}
```

**Result:** Still shows double output - fix incomplete

## Current Status

### WHO Door Behavior

**Test:** `Scripts/test-who-simple.ts`

**Output:**
```
/X DooR by SPY/MST
/X DooR by SPY/MST
```
(Banner displays twice)

**Analysis:**
- Door calls JSR at PC=0x27fa to Write() function
- Write() executes and returns correctly
- But somehow Write() is being called twice
- After outputting banner, door loops calling Close(4) until timeout

### Why Double Output Still Occurs

The fix is incomplete. Despite adding JSR checks to both trap detection blocks, the output still appears twice. Possible reasons:

1. **Variable Scope Issues**: `tracePc` is defined in different scopes for different iteration ranges. For iterations < 1000 (line 777) vs iterations >= 1000, different code paths may apply.

2. **Multiple Code Paths**: There appear to be at least 3 different execution paths through the emulation loop depending on iteration count, making it difficult to ensure all paths have the JSR check.

3. **Timing Issue**: The JSR handler may be executing, returning, but then the next iteration immediately detects the PC is at a trap address and re-executes it.

4. **ROM Execution**: When JSR executes normally (without interception), the CPU actually ENTERS the library ROM code. The trap detection may be firing when PC is genuinely at the library vector address in ROM.

## Next Steps

To fully fix the double interception:

1. **Simplify Trap Detection**: Consolidate the multiple trap detection blocks into ONE canonical location
2. **State Machine Approach**: Add a flag like `jsrJustHandled` that prevents re-detection in the next iteration
3. **Execution Model Fix**: Ensure that when JSR is intercepted, the CPU state is set such that it CANNOT accidentally enter the ROM library code

Alternatively:

4. **Accept Single Path**: Only use the JSR handler OR the trap address handler, not both
5. **ROM Unmapping**: Unmap the ROM library vectors so doors can't accidentally execute into them

## Files Modified

1. `web/backend/src/amiga-emulation/api/DosLibrary.ts` - Console device fix
2. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Partial double-interception fix

## References

- Previous session: `Docs/SESSION_2025-11-02_DOS_LIBRARY_FIXES.md`
- Trap handling code: `web/backend/src/amiga-emulation/api/LibraryTraps.ts:645-950`
