# Session 2025-11-02: Restart Needed - Current State

## Session Goal

Fix WHO2 door to execute without double output or hanging.

## Problem Summary

The WHO door outputs its banner **twice** instead of once:
```
/X DooR by SPY/MST
/X DooR by SPY/MST
```

Then loops forever calling `Close(4)` until timeout.

## Root Cause

**Double Interception Bug**: Library calls are being intercepted and executed twice due to multiple trap detection code paths in `AmigaDoorSession.ts`.

The emulation has 3+ separate trap detection blocks:
1. Line 814-820: NEW unified handler (added this session) ✅
2. Lines 945-950: Iterations < 1000 trap detection (partially removed)
3. Lines 1402-1512: Iterations >= 1000 trap detection (still active) ❌
4. Lines 1530-1592: Old JSR detection (still active) ❌

Each block calls library functions independently, causing duplicate execution.

## Fixes Completed This Session ✅

### 1. Console Device Specification Handling
**File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:216-238`

**What:** Fixed `Open()` to recognize parameterized console specs like `"con:10/10/320/80/Output/auto/close/wait"`

**Code:**
```typescript
const isConsoleDevice = filename === '*' ||
                       filename.toUpperCase() === 'CONSOLE:' ||
                       filename.toUpperCase().startsWith('CON:');
```

**Result:** WHO door successfully opens console ✅

### 2. Unified Trap Handler Created
**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts:67-160`

**What:** Created single canonical `checkAndHandleLibraryTrap(pc: number)` method that handles:
- JSR (d16,A6) detection
- Direct trap address detection
- Duplicate prevention with state tracking
- Proper return value handling

**Result:** Works correctly when called ✅

### 3. Integrated Unified Handler
**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts:814-820`

**What:** Added call to unified handler at top of main loop

**Code:**
```typescript
const trapHandled = await this.checkAndHandleLibraryTrap(pc);
if (trapHandled) {
  this.iterationCount++;
  await new Promise(resolve => setImmediate(resolve));
  continue;
}
```

**Result:** Executes first, but old blocks still run after ⚠️

### 4. Partial Old Code Removal
**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts:945-950`

**What:** Removed first duplicate trap detection block (iterations < 1000)

**Result:** One block removed, but 2-3 more remain ⚠️

## Current State ⚠️

### What Works
- ✅ Unified trap handler correctly detects and handles all traps
- ✅ Console device opening works
- ✅ DOS library functions execute correctly
- ✅ State-based duplicate detection logic is sound

### What's Broken
- ❌ Old trap detection blocks still active (lines ~1402-1512, ~1530-1592)
- ❌ Double output persists
- ❌ WHO door loops calling Close() forever

### Evidence
```bash
$ timeout 5 npx tsx Scripts/test-who-simple.ts 2>&1 | grep "OUTPUT"
[OUTPUT] /X DooR by SPY/MST\n
[OUTPUT] /X DooR by SPY/MST\n
```

```bash
$ timeout 5 npx tsx Scripts/test-who-simple.ts 2>&1 | grep "Write.*returned"
[LibraryTraps] Write() returned 0x13    # First call
[LibraryTraps] Write() returned 0x13    # Second call - OLD BLOCK!
```

## Solution: Complete Main Loop Rewrite (Option C)

### Why Rewrite Is Better

Current code has:
- 1000+ line main loop with nested conditionals
- Iteration-based logic (`if (iterationCount < 1000)`)
- Multiple variable scopes (`tracePc` vs `pc`)
- Debugging code intermixed with logic
- 3-4 duplicate trap detection blocks

Rewrite benefits:
- **Clean architecture**: One execution path
- **No technical debt**: No scattered duplicates
- **Maintainable**: Easy to understand
- **Prevents future bugs**: Can't have duplicates

### Rewrite Plan

```typescript
private async runExecutionLoop(): Promise<void> {
  while (this.isRunning) {
    const pc = this.emulator.getRegister(16);

    // 1. Check exit conditions (exit trap, unmapped memory)
    if (this.checkExitConditions(pc)) return;

    // 2. Handle delay loops (reduce D0 counter)
    this.handleDelayLoops(pc);

    // 3. UNIFIED trap detection - SINGLE call
    const trapHandled = await this.checkAndHandleLibraryTrap(pc);
    if (trapHandled) {
      this.iterationCount++;
      continue;
    }

    // 4. Execute instruction normally
    this.emulator.execute(CYCLES_PER_ITERATION);
    this.iterationCount++;

    // 5. Track PC history
    this.lastPCs.push(this.emulator.getRegister(16));
    if (this.lastPCs.length > 100) this.lastPCs.shift();

    // 6. Periodic logging
    if (this.iterationCount % 10000 === 0) {
      console.log(`Iteration ${this.iterationCount}`);
    }

    await new Promise(resolve => setImmediate(resolve));
  }
}
```

**Estimated time:** 30-60 minutes

### Files to Modify

1. **`web/backend/src/amiga-emulation/AmigaDoorSession.ts`**
   - Lines 797-1820: Replace entire while loop
   - Keep helper methods:
     - `checkAndHandleLibraryTrap()` ✅ (already exists)
     - Extract `checkExitConditions()`
     - Extract `handleDelayLoops()`

## Remaining Old Trap Blocks to Remove

If doing manual removal instead of rewrite:

### Block 1: Lines ~1402-1512
```typescript
// Handle library trap if PC is at a vector address...
if (this.libraryTraps) {
  // ... 100+ lines of duplicate logic ...
  const handled = this.libraryTraps.handleTrap(pc)
}
```

### Block 2: Lines ~1530-1592
```typescript
// Check for JSR to library function BEFORE execution
if (opcodePre === 0x4eae) {
  // ... duplicate JSR handling ...
  const handled = this.libraryTraps.handleTrapByOffset(offset, a6);
}
```

### How to Find Them
```bash
grep -n "this.libraryTraps.handleTrap\|this.libraryTraps.handleTrapByOffset" \
  web/backend/src/amiga-emulation/AmigaDoorSession.ts | \
  grep -v "checkAndHandleLibraryTrap"
```

Output shows line numbers to remove.

## Test Commands

```bash
# Test WHO door
timeout 15 npx tsx Scripts/test-who-simple.ts 2>&1 | grep "OUTPUT"

# Check for duplicate Write() calls
timeout 5 npx tsx Scripts/test-who-simple.ts 2>&1 | grep "Write.*returned" | wc -l
# Should be: 1 (currently: 2)

# Check trap handler logs
timeout 5 npx tsx Scripts/test-who-simple.ts 2>&1 | grep -E "(JSR.*TRAP|DIRECT TRAP)" | head -5
# Should only see unified handler messages
```

## Success Criteria

After rewrite/fix, the output should be:
```
=== FULL OUTPUT ===
/X DooR by SPY/MST
=== END OUTPUT ===
```

**One line, not two!**

## Documentation Created This Session

1. `SESSION_2025-11-02_DOS_LIBRARY_FIXES.md` - Console device + DOS fixes
2. `SESSION_2025-11-02_DOUBLE_INTERCEPTION_BUG.md` - Initial bug analysis
3. `SESSION_2025-11-02_FINAL_STATUS.md` - Why we can't get it working
4. `SESSION_2025-11-02_REFACTORING_STATUS.md` - Refactoring progress
5. `SESSION_2025-11-02_RESTART_NEEDED.md` - This document

## Next Session Actions

**Option 1: Complete the Rewrite (Recommended)**
1. Replace lines 797-1820 with clean main loop (see plan above)
2. Extract helper methods for exit/delay logic
3. Test WHO door
4. Should see single output ✅

**Option 2: Remove Old Blocks Manually**
1. Find blocks with grep command above
2. Remove lines 1402-1512
3. Test
4. Remove lines 1530-1592
5. Test
6. Repeat until no duplicates

## Key Insight

**The architecture fix is correct!** The unified handler works perfectly. We just need to remove the old duplicate code that's still executing. A clean rewrite is the fastest path to success.

## Context for Next Session

- WHO door: `Doors/who/who`
- Test script: `Scripts/test-who-simple.ts`
- Main file: `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
- Unified handler: Lines 67-160 (KEEP THIS!)
- Main loop: Lines 797-1820 (REWRITE THIS!)
