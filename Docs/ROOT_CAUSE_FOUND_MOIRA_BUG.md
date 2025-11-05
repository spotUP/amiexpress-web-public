# ROOT CAUSE FOUND: Moira Instruction Length Bug

**Date**: 2025-11-01
**Status**: ROOT CAUSE IDENTIFIED - MOIRA BUG

---

## Executive Summary

The door crash is caused by a **Moira M68K emulator bug** where the instruction `MOVE.L (A7)+,D0` (opcode 0x201F) is incorrectly decoded as 4 bytes instead of 2 bytes, causing PC to skip past the correct next instruction and land in the middle of a MOVEM instruction.

---

## The Investigation Journey

### Initial Hypothesis (WRONG)
- Believed memory corruption was overwriting code
- Thought "dos.library" string was displaced backward by 40 bytes
- Added watchpoints to detect memory writes

### Discovery #1: No Memory Corruption
- Watchpoint revealed writes happen at PC=0 (during loading, not execution)
- Checked door file structure - bytes are CORRECT at all file offsets
- segment.data buffer contains correct bytes from file
- Memory contains correct bytes after loading
- **No memory corruption exists!**

### Discovery #2: Wrong Analysis
- Originally thought memory 0x1250 should contain JSR instruction
- This was based on looking at absolute file offset 0x250
- **ERROR**: Memory 0x1250 maps to file offset 0x274, not 0x250!
- File offset 0x274 correctly contains `7F 7E 4E 75 64 6F 73...` (MOVEM mask + RTS + "dos.library")
- Memory 0x1250 is SUPPOSED to contain 0x7F7E (register mask for MOVEM)

### Discovery #3: PC in Wrong Location
- PC should NEVER be at 0x1250 (middle of MOVEM instruction)
- Correct instruction sequence after CloseLibrary returns:
  ```
  0x124C: MOVE.L (A7)+,D0     (2 bytes)
  0x124E: MOVEM.L (A7)+,regs  (4 bytes: 4CDF 7F7E)
  0x1252: RTS                  (2 bytes)
  ```

### Discovery #4: THE BUG - PC Advances Incorrectly
**PC progression**:
```
Iteration 207: PC=0x124C, execute MOVE.L (A7)+,D0 (opcode 0x201F)
Iteration 208: PC=0x1250  ← WRONG! Should be 0x124E!
```

**PC advanced by 4 bytes, but MOVE.L (A7)+,D0 is only 2 bytes!**

---

## Root Cause

### Moira Instruction Decoder Bug

**Instruction**: `MOVE.L (A7)+,D0`
**Opcode**: `0x201F`
**Correct size**: 2 bytes (just the opcode word)
**Moira's behavior**: Treats it as 4 bytes, advances PC by 4

### Why This Causes the Crash

1. Door returns from CloseLibrary trap to 0x124C
2. Execute MOVE.L (A7)+,D0 at 0x124C (opcode 0x201F)
3. Moira incorrectly advances PC by 4 bytes → PC=0x1250
4. PC=0x1250 is in the middle of MOVEM instruction
5. Attempts to execute 0x7F7E (register mask) as opcode
6. Invalid execution leads to corrupted PC=0xF00080
7. Crash in unmapped memory

### The Instruction at 0x124C-0x1253

```
Memory 0x124C: 201F = MOVE.L (A7)+,D0     ← Moira treats this as 4 bytes
Memory 0x124E: 4CDF = MOVEM opcode        ← Should execute this next
Memory 0x1250: 7F7E = MOVEM register mask ← PC lands here (WRONG!)
Memory 0x1252: 4E75 = RTS
Memory 0x1254: "dos.library" string
```

---

## Evidence

### File Structure (CORRECT)
```
File offset 0x270 (memory 0x124C): 201F 4CDF 7F7E 4E75 646F 732E
```

### PC History (SHOWS BUG)
```
Iteration 205: PC=0x1248 (JSR to CloseLibrary)
Iteration 206: PC=0xFE62 (library trap)
Iteration 207: PC=0x124C (return from trap, execute MOVE)
Iteration 208: PC=0x1250 (WRONG - skipped 0x124E!)
Iteration 209: PC=0xF00080 (crash in unmapped memory)
```

### Test Output
```
=== ITERATION 207 - START ===
PC at start: 0x124c
Opcode at PC: 0x201f

=== ITERATION 208 - START ===
PC at start: 0x1250
```

---

## M68K Instruction Encoding

### MOVE.L (An)+,Dn (Opcode 0x201F)

**Encoding**:
```
Bits 15-12: 0010 (MOVE)
Bits 11-9:  000 (destination D0)
Bits 8-6:   111 (destination mode: register direct)
Bits 5-3:   011 (source mode: (An)+)
Bits 2-0:   111 (source register A7)
```

**Instruction format**: Single word (2 bytes)
**No extension words required**

### Why Moira Gets It Wrong

Moira may be:
1. Incorrectly detecting an extension word
2. Reading the next instruction word as part of this instruction
3. Miscalculating instruction length for (An)+ addressing mode

---

## Next Steps

### Option 1: Fix Moira Bug
- Locate Moira's instruction decoder for opcode 0x201F
- Fix the length calculation for MOVE.L (An)+,Dn instructions
- Rebuild WASM module
- Test door execution

### Option 2: Workaround
- Detect when PC advances incorrectly
- Correct PC after execute() for known problem opcodes
- Not ideal, but faster than fixing Moira

### Option 3: Replace Emulator
- Switch to different M68K emulator (Musashi, UAE, etc.)
- More work, but might have fewer bugs

---

## Files Involved

- `moira-source/Moira/Moira.cpp` - Instruction decoder
- `moira-source/Moira/MoiraExec.cpp` - Execution engine
- `moira-wrapper.cpp` - Our WASM wrapper
- `AmigaDoorSession.ts` - Door execution loop

---

## Lessons Learned

1. **Don't assume memory corruption** - Verify actual file contents first
2. **Understand memory mapping** - File offset ≠ memory address
3. **PC should only be at instruction boundaries** - If PC is at a non-instruction boundary, something is very wrong
4. **Instruction length bugs are subtle** - Off-by-2 errors can be hard to spot

---

## Conclusion

After 2+ days of investigation through:
- vAmiga page table implementation
- Memory corruption theories
- Watchpoint debugging
- Detailed PC tracking

The root cause is a **single bug in Moira**: the M68K emulator incorrectly calculates the length of `MOVE.L (A7)+,D0` as 4 bytes instead of 2 bytes, causing PC to skip the next instruction and crash.

**No memory corruption. No relocation bugs. No hunk loader issues. Just a simple instruction length bug.**

This has been an epic debugging session! 🎯
