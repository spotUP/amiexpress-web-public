# BREAKTHROUGH: Instruction 198 Fixed!

## Date: 2025-10-30

## The Victory

**Door now executes PAST instruction 198!**

```
[AmigaDoorSession] Inst 198: PC=0x1248, SP=0xfdff8, A6=0x10000, opcode=0x4eaf
[AmigaDoorSession] *** JSR (3682,A7) at PC=0x1248, SP=0xfdff8 ***
[AmigaDoorSession] Inst 199: PC=0xfee5a, SP=0xfdff4, A6=0x10000, opcode=0x4e75  ← RTS stub!
[AmigaDoorSession] Inst 200: PC=0x124c, SP=0xfdff8, A6=0x10000, opcode=0x201f  ← Back to door code!
```

##  The Solution

### Problem Discovered
- Opcode 0x4EAF = `JSR (d16,A7)` means: **PC ← A7 + d16**
- It jumps TO the calculated address (0xFEE5A), NOT load FROM it
- We need EXECUTABLE CODE at the target, not a function pointer!

### The Fix
```typescript
// Write RTS instruction at multiple locations to cover SP variations
for (let offset = -16; offset <= 16; offset += 2) {
  const stubAddr = finalSP + STACK_FN_OFFSET + offset;
  this.emulator.writeMemory16(stubAddr, 0x4E75);  // RTS
}
```

**Result:**
- Door executes JSR (3682,A7)
- Jumps to 0xFEE5A
- Executes RTS (0x4E75)
- Returns to 0x124C
- **Continues execution!**

## Progress Summary

### Before This Session:
- Door stuck at instruction 198
- JSR (3682,A7) jumped to garbage (opcode 0x0000)
- Crashed and looped forever

### After This Session:
- Door executes to instruction 200+
- JSR successfully calls and returns from stub
- Continues normal execution flow
- **NEW BLOCKER:** Door crashes around instruction 210-220

## Key Learnings

### Mistake #1: Misunderstanding JSR Addressing Mode
**Wrong:** Thought JSR (d16,An) loads address FROM [An+d16] then jumps
**Right:** JSR (d16,An) calculates address An+d16 and jumps directly

### Mistake #2: Stack Pointer Calculation
**Wrong:** Used finalSP (0xFDFFC) for calculations
**Right:** Door's SP was 0xFDFF8 at time of JSR (4 bytes different)
**Solution:** Write stubs at multiple offsets to cover SP variations

### Mistake #3: Pointer vs Code
**Wrong:** Wrote function POINTER (0x00F00F10) at target location
**Right:** Write executable CODE (0x4E75 = RTS) at target location

## What This Means

**C Runtime Stack Setup:**
The door expects certain code/trampolines on the stack, set up by C runtime initialization. We're providing minimal stubs (just RTS) which allows the door to continue but might not fully implement what it needs.

**Next Investigation:**
- Door now crashes around inst 210-220
- PC jumps to 0xF00160 then 0x24 (near zero!)
- Need to investigate what happens after inst 200

## Files Modified

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` (lines 245-258)
  - Added RTS stubs at stack-relative addresses
  - Covers SP range from finalSP-16 to finalSP+16

## Statistics

- **Instructions Executed:** 200+ (was stuck at 198)
- **Library Calls Working:** 3 (SetTaskPri, OpenLibrary, FreeMem)
- **Stubs Working:** 2 (0xF4 vector, stack-relative JSR)
- **Progress:** MASSIVE! Door is now actually running!

## Next Steps

1. **Analyze instructions 200-220** - Where does it crash next?
2. **Check A6 register** - At inst 210, A6=0x0 (should be 0x10000)
3. **Investigate stack corruption** - SP jumps from 0xFDFF8 to 0xFE02E
4. **More stub functions?** - Door might need other stack-based code

---

## Celebration Moment

This was the breakthrough we needed! After all the work on:
- ✅ Trap system (fixed in previous session)
- ✅ SP corruption via 0xF4 stub (fixed in previous session)
- ✅ Stack-relative JSR stub (fixed TODAY!)

**The door is RUNNING!** 🎉

Next challenge: Get it to communicate with BBS (find AEDoor message port, send/receive messages).
