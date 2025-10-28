# Amiga Door Emulation Debugging - Root Cause Found

**Date:** October 25-26, 2025
**Status:** ✅ Root cause identified - Ready for fix

---

## Summary

Successfully debugged why Amiga doors execute but produce no output. Created standalone test script that bypasses BBS/database for rapid iteration. **Root cause:** Door lacks proper ExecBase/library setup, so it calls its own code instead of BBS library functions.

---

## Test Script Created

**Location:** `backend/test-door.ts`

**Usage:**
```bash
cd backend
npx tsx test-door.ts
```

**Benefits:**
- No database connection required
- No BBS server needed
- Instant feedback (5 second test cycles)
- Full console output of all debugging

---

## Key Findings

### 1. DBRA Delay Loop Skip ✅ (WORKING)

**Problem:** Door was stuck in `DBRA D0, -4` delay loops designed for 8MHz CPU
**Solution:** Implemented automatic DBRA detection and skip mechanism
**Result:** Door progresses past initialization delays successfully

**Evidence:**
```
[DBRA Skip] Detected delay loop at PC=0x1024, D0=10000
  Skipping ~100000 cycles (12.50ms)
```

### 2. JSR (A6) Library Call Detection ✅ (WORKING)

**Discovery:** Doors use `JSR -xxx(A6)` for library calls, NOT `JSR absolute.L`
**Implementation:** Added detector for opcode `4E AE/AF` (JSR with A6 displacement)
**Result:** Successfully detecting all library call attempts

**Evidence:**
```
[JSR (A6)] PC=0x100e calling (A6=1000) + offset -552 = 0xdd8
```

### 3. ExecBase Problem ⚠️ (ROOT CAUSE)

**Expected:** Address 4 should contain pointer to exec.library base (~0xff0000 range)
**Actual:** Address 4 contains 0x1000 (door's own CODE segment address)
**Impact:** Door loads 0x1000 into A6, then calls its own code instead of libraries

**Evidence:**
```
[AmigaDoorSession] ExecBase at address 4: 0x1000  ← WRONG!
[JSR (A6)] PC=0x100e calling (A6=1000) + offset -552 = 0xdd8
```

**What's happening:**
1. Door executes: `MOVE.L $4, A6` → A6 = 0x1000 (expects library base)
2. Door executes: `JSR -552(A6)` → Calls 0xdd8 (door's own code at 0x1000 - 552)
3. Door stuck in loop calling internal initialization function
4. Never reaches BBS I/O code because library calls fail

---

## How Amiga Library System Works

### Bootstrap Process:

1. **ExecBase is at address 4:**
   - On real Amiga, exec.library base pointer is ALWAYS at memory address 0x00000004
   - This is set up by Kickstart ROM before any program runs
   - Programs read this address to get exec.library

2. **Opening Other Libraries:**
   ```c
   struct Library *ExecBase = *(struct Library **)4;  // Read address 4
   struct Library *DOSBase = ExecBase->OpenLibrary("dos.library", 0);
   struct Library *AmiExpressBase = ExecBase->OpenLibrary("amiexpress.library", 0);
   ```

3. **Calling Library Functions:**
   ```assembly
   MOVE.L  $4, A6              ; Get ExecBase
   JSR     -552(A6)            ; Call exec.library function (offset -552)
   ```

### Library Base Structure:

```
Address 4: Pointer to ExecBase (e.g., 0xFF0000)
  ↓
ExecBase (0xFF0000):
  Offset -6:   OpenLibrary()
  Offset -12:  CloseLibrary()
  Offset -30:  AllocMem()
  ... etc ...
```

When door calls `JSR -552(A6)` with A6=ExecBase, CPU jumps to function at ExecBase-552.

---

## Current Behavior

### What We See:

```
Iteration 15000 (Virtual time: 1878.23ms):
  PC=0x100e, SP=0xf15f4, D0=0x0
  Instruction bytes: 4e ae fd d8
  [JSR (A6)] calling (A6=1000) + offset -552 = 0xdd8
```

### Analysis:

- **PC=0x100e:** Door is at this address repeatedly
- **Instruction: 4E AE FD D8:** `JSR -552(A6)` = JSR -0x228(A6)
- **A6=0x1000:** This is the CODE segment address (WRONG - should be library base!)
- **Target=0xdd8:** Door's own internal function at address 0x1000 - 0x228

The door is stuck in a loop calling its own initialization code because it thinks 0x1000 is a library base.

---

## Solution Required

### Need to Implement:

1. **Create Fake ExecBase Structure:**
   - Allocate memory at ~0xFF0000 for exec.library
   - Create jump table with all exec.library functions
   - Point address 4 to this structure

2. **Library Function Vectors:**
   ```
   0xFF0000:  ExecBase structure
   0xFEFFFA:  JMP to OpenLibrary() handler    ; Offset -6
   0xFEFFF4:  JMP to CloseLibrary() handler   ; Offset -12
   0xFEFFE2:  JMP to AllocMem() handler       ; Offset -30
   ... etc ...
   ```

3. **Trap Handler Should Catch:**
   - When CPU executes `JSR to 0xFEFFFA`, trap handler intercepts
   - Maps offset back to function ID (offset -6 = OpenLibrary)
   - Calls our TypeScript implementation of that function
   - Returns result to door

### Implementation Location:

**File:** `backend/src/amiga-emulation/AmigaDoorSession.ts`
**Method:** `start()` - After loading segments, before setting PC

```typescript
// Set up ExecBase at address 4
const execBaseAddr = 0xFF0000;
this.emulator.writeMemory(4, (execBaseAddr >> 24) & 0xFF);
this.emulator.writeMemory(5, (execBaseAddr >> 16) & 0xFF);
this.emulator.writeMemory(6, (execBaseAddr >> 8) & 0xFF);
this.emulator.writeMemory(7, execBaseAddr & 0xFF);

// TODO: Set up library jump table at 0xFF0000
```

---

## Test Results With Current Code

### WeekConfTop.XIM Door:

```
✓ Hunk file loads successfully (1 CODE segment, 8044 bytes)
✓ Entry point set correctly (0x1000)
✓ DBRA delay loops skipped automatically
✓ JSR (A6) library calls detected
✗ A6 contains wrong value (0x1000 instead of library base)
✗ Door calls own code in infinite loop
✗ Never reaches BBS I/O functions
```

**Virtual Time Reached:** 12+ seconds
**Iterations:** 100,000+
**Stack Activity:** Active (SP decreasing from 0xfe000 → 0xf0000)
**Library Calls Detected:** 0 (calling own code instead)

---

## Next Steps

1. **Implement ExecBase structure** at 0xFF0000
2. **Set address 4** to point to ExecBase
3. **Create jump table** for common exec.library functions:
   - OpenLibrary (-6)
   - CloseLibrary (-12)
   - AllocMem (-30)
   - FreeMem (-36)
   - etc.

4. **Test again** with test-door.ts script
5. **Expect to see:**
   ```
   [*** LIBRARY CALL VIA A6 ***] JSR -552(A6) at PC=0x100e
     A6=0xff0000, offset=-552, target=0xfefdd8
   [AmigaDOS] *** TRAP HANDLER CALLED *** offset=-552
   ```

6. **Then implement** the actual library functions door needs

---

## Files Modified

- `backend/src/amiga-emulation/AmigaDoorSession.ts` - Added JSR (A6) detection, ExecBase check
- `backend/test-door.ts` - **NEW** - Standalone test script (no DB/BBS required)

## Commits

- `9c3e621` - Enhanced door debugging - reduce cycles, log all JSR calls
- `6d157de` - Add comprehensive door debugging - found root cause!

---

## Debugging Commands

```bash
# Run standalone door test
cd backend
npx tsx test-door.ts

# Filter for important events
npx tsx test-door.ts 2>&1 | grep -E "(JSR|LIBRARY|ExecBase|WARNING)"

# Check first 50 JSR calls
npx tsx test-door.ts 2>&1 | grep "JSR (A6)" | head -50

# See door trace every 5000 iterations
npx tsx test-door.ts 2>&1 | grep "Iteration.*5000"
```

---

**Bottom Line:** We can now debug doors locally in seconds, and we know exactly what's wrong. The door needs proper ExecBase/library setup to call BBS functions. Next: Implement that library infrastructure.
