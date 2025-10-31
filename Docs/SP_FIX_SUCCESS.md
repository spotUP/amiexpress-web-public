# Critical Breakthrough: SP Register Fix

**Date:** 2025-10-30
**Status:** ✅ SP register issue RESOLVED

---

## The Problem

The door was crashing immediately because **SP (Stack Pointer) was 0x0** instead of the expected 0xFDFFC.

### Symptoms:
```
We SET:  SP = 0xFDFFC
We READ: SP = 0x0
```

The first instruction `MOVEM.L D1-D7/A0-A6,-(A7)` tried to push registers onto stack at address 0x0, causing immediate crash.

---

## Root Cause Discovery Process

### Investigation Steps:

1. **Added logging to verify setRegister() works:**
   ```
   VERIFY setRegister: SP=fe000 (expected fe000) ✓ WORKS!
   VERIFY after sentinel: SP=fdffc (expected fdffc) ✓ WORKS!
   ```

2. **Found SP was reset later:**
   ```
   VERIFY after sentinel: SP=fdffc ✓
   [... 4 lines of logging ...]
   END OF loadDoor(): SP=0x0 ❌
   ```

3. **Identified the culprit:**
   Between the two checks, we had:
   ```typescript
   this.emulator.setRegister(14, execBaseAddr);  // A6
   this.emulator.setRegister(17, 0x2700);        // SR ← THIS!
   ```

**Setting SR (Status Register) was resetting SP to 0!**

---

## The Fix

**Reordered register setup to set SR FIRST:**

```typescript
// OLD ORDER (broken):
1. Set SP = 0xFDFFC
2. Set PC = 0x1000
3. Set A6 = ExecBase
4. Set SR = 0x2700  ← This reset SP to 0!

// NEW ORDER (working):
1. Set SR = 0x2700  ← Set FIRST
2. Set A6 = ExecBase
3. Set PC = 0x1000
4. Set SP = 0xFDFFC ← Set LAST
```

### Code Change:

```typescript
// Set CPU to SUPERVISOR MODE (bit 13 of SR) to allow privileged instructions
// CRITICAL: Set SR FIRST before other registers, as setSR might affect CPU state
this.emulator.setRegister(17, 0x2700);  // SR (Status Register)

// Set up A6 register with ExecBase (standard Amiga convention)
const execBaseAddr = this.execLibrary.getExecBaseAddress();
this.emulator.setRegister(14, execBaseAddr);  // A6 = ExecBase

// Now set PC
this.emulator.setRegister(16, hunkFile.entryPoint);  // PC

// Set SP LAST
const finalSP = 0xFDFFC;
this.emulator.setRegister(15, finalSP);  // A7 (SP)
```

---

## Why This Works

The Moira CPU's `setSR()` function changes the Status Register, which controls:
- CPU mode (user vs supervisor)
- Interrupt mask
- Condition codes

**setSR() internally resets certain CPU state**, including potentially clearing registers. By setting SR first, we ensure it doesn't overwrite the other registers we've set.

---

## Results

### Before Fix:
```
Initial SP: 0x0 ❌
execute() call #1: PC=0x1000, SP=0x0 ❌
Door crashes immediately
```

### After Fix:
```
END OF loadDoor(): SP=0xfdffc ✓
START OF runExecutionLoop(): SP=0xfdffc ✓
execute() call #1: PC=0x1000, SP=0xfdffc ✓
Door starts execution with correct registers!
```

---

## Current Status

✅ **SP is now correct**
✅ **Door starts execution at PC=0x1000**
✅ **First instruction executes**

❌ **Door still crashes after a few instructions**
- PC jumps to unexpected addresses (0x10EE0, 0x12268...)
- No library calls are made
- Need to investigate why door's own code causes jumps

---

## Next Steps

1. Analyze what the first few instructions do
2. Check if door code is relocating itself
3. Verify memory at 0x1000 contains correct instructions
4. Trace execution to find where PC diverges from expected flow
5. Check if door needs additional setup (DOS structures, CLI, etc.)

---

## Lessons Learned

1. **Register order matters** - SR affects CPU state
2. **Always set control registers FIRST** before data registers
3. **Add verification logging** at multiple points to isolate issues
4. **Don't assume setRegister is atomic** - it may have side effects

---

## Files Modified

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Reordered register setup
- Added comprehensive logging to track register changes

---

## Conclusion

This was a critical breakthrough! The SP register issue has plagued door execution from the start. By reordering the register setup to set SR first, we've ensured SP remains at the correct value (0xFDFFC) throughout execution.

**The door now starts with correct CPU state.** The remaining issue is understanding why the door's code jumps to unexpected addresses, but this is a huge step forward.

**Status: Major Progress - SP Fixed, Door Starts Execution**
