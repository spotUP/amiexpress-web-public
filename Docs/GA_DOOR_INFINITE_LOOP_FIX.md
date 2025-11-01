# GA Door Infinite Loop - Root Cause Analysis
## 2025-10-31

## Problem Summary
The GetAnswer (GA) door executes but produces **no output** because it gets stuck in an infinite loop during initialization.

## Root Cause Found

### The Infinite Loop
- **Location**: PC=0x1022
- **Instruction**: `MOVE.L -(A1), (A3)+` (opcode 0x26c1)
- **Loop Control**: Next instruction at 0x1024 is `DBRA D0, -6` (opcode 0x51c8)
  - This loops back to 0x1022 while D0 > 0

### Register Values During Loop
```
A1 = 0x0         (source pointer - WRONG!)
A3 = 0x254       (destination pointer - increments each iteration)
D0 = 0x40        (loop counter - decrements from 64 to 0)
```

### Why It Loops Forever
1. **A1 is ZERO** - the source pointer for data copying is 0x0
2. Instruction executes: `MOVE.L -(A1), (A3)+`
   - Decrements A1: 0x0 - 4 = 0xFFFFFFFC (wraps around!)
   - Reads 4 bytes from 0xFFFFFFFC
   - Writes to A3 (0x254, 0x258, 0x25C, etc.)
   - Increments A3 by 4
3. `DBRA D0, -6` decrements D0 and loops back
4. **A1 stays at 0** because next iteration reloads it

### What This Code Does
This is a **data segment initialization loop** that copies initialized data from the executable's DATA segment to the BSS (uninitialized data) segment in memory.

```asm
; Pseudocode of the loop:
  MOVE.L  A1,D0          ; D0 = number of longwords to copy
loop:
  MOVE.L  -(A1),(A3)+    ; Copy from source to dest
  DBRA    D0,loop        ; Loop while D0 > 0
```

## Why A1 is Zero

### Hypothesis 1: Hunk Loading Issue
The door's DATA hunk may not be loaded or the pointer wasn't set up correctly.

**Check HunkLoader.ts:**
- Are DATA hunks being loaded?
- Are relocation tables applied correctly?
- Is the initial DATA address set in A1?

### Hypothesis 2: Register Initialization
The door's startup code expects registers to be initialized:
- A1 should point to END of DATA segment (copies backwards with -(A1))
- A3 should point to START of BSS segment
- D0 should contain number of longwords to copy

**Our code may not be setting these up before jumping to entry point.**

### Hypothesis 3: Wrong Entry Point
We might be jumping into the middle of the door's initialization code, skipping the part that sets up A1.

## The Fix

### Option 1: Fix Hunk Loading (Best)
Ensure HunkLoader properly:
1. Loads DATA hunks to memory
2. Applies relocations
3. Sets up initial register values for data copy

### Option 2: Detect and Skip Loop
If A1 == 0, skip the copy loop:
```typescript
if (tracePc === 0x1022 && a1 === 0) {
  console.log('[AmigaDoorSession] Skipping broken data copy loop');
  // Skip past loop by setting D0=0
  this.emulator.setRegister(0, 0);
}
```

### Option 3: Fix Registers Manually
Before starting door execution, manually set:
```typescript
// Calculate proper A1 value from loaded hunks
const dataEnd = calculateDataSegmentEnd();
this.emulator.setRegister(9, dataEnd); // A1
```

## Test Script
Use `~/Code/amiexpress-web/test-ga-command.js` to test:
```bash
node test-ga-command.js
```

Correct key sequence:
1. `A` + Enter (ANSI graphics)
2. `sysop` + Enter (username)
3. `sysop` + Enter (password)
4. Enter (first prompt)
5. Enter (second prompt)
6. `GA` + Enter (execute door)

## Monitoring
Watch backend logs:
```bash
tail -f /tmp/backend.log | grep -E "🔄|LOOP|A1=|A3=|GetAnswer"
```

## Next Steps
1. **Investigate HunkLoader.ts** - Check how DATA hunks are loaded
2. **Check door entry point** - Verify we're jumping to the correct start address
3. **Add register initialization** - Set up A1, A3, D0 before door starts
4. **Reference vAmiga** - Check how vAmiga handles Amiga executable loading

## Files to Check
- `/web/backend/src/amiga-emulation/loader/HunkLoader.ts` - Hunk file loading
- `/web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door initialization (loadDoor method)
- `/Docs/vAmiga/` - Reference implementation

## Success Criteria
When fixed, you should see:
1. ✅ No infinite loop at PC=0x1022
2. ✅ Door executes past initialization
3. ✅ XIM protocol commands called (🔊 [XIM OUTPUT] in logs)
4. ✅ Text appears in terminal
