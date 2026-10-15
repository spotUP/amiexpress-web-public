# JoinCnf A4 Register Analysis - 2026-01-07

## TL;DR

joincnf door DOES have proper relocations. The LEA.L $8000, A4 instruction at offset 0xA HAS a relocation entry that correctly adds DATA segment address. The problem is NOT incorrect initialization - **A4 gets cleared to 0 AFTER being set correctly**.

## Binary Analysis

### Relocations

The binary has **6 relocations to DATA segment**:
```
Relocations to segment 2 (DATA):
- offset=0x3982
- offset=0x398C
- offset=0x396A
- offset=0x3960
- offset=0x14
- offset=0xA     ← LEA operand!
```

### LEA Instruction Structure

```
File offset 0x28: Start of CODE data
File offset 0x30: LEA.L instruction
  - Offset 0x8 from CODE start: 49F9 (opcode)
  - Offset 0xA from CODE start: 0000 8000 (operand) ← HAS RELOCATION
```

###Relocation Behavior

When loaded at CODE=0x1008, DATA=0xC308:
1. Original value at CODE+0xA: **0x00008000**
2. Relocation applies: 0x8000 + 0xC308 = **0x14308**
3. LEA instruction executes: **A4 = 0x14308**

This is CORRECT! The value 0x14308 is DATA + 0x8000 = 0xC308 + 0x8000.

## Execution Pattern

From test runs:
1. ✅ Door starts, sends 12 XIM messages
2. ✅ LEA instruction sets A4 = 0x14308
3. ❌ Later: **A4 becomes 0** (not wrong value - ZERO!)
4. ❌ PC jumps to invalid addresses: 0x1edea2, 0x1f7ae2, 0x1d1792...
5. ❌ Eventually stuck in AEDoor.library loop at 0xC0xxxx

## Root Cause

**A4 is being CLEARED to 0 during execution**, not set incorrectly at startup.

Possible causes:
1. Door code explicitly clears A4 (unlikely - would crash on real Amiga too)
2. AEDoor.library corrupts A4 (possible - check library functions)
3. Exception handler or interrupt corrupts A4 (possible)
4. Memory corruption overwrites A4 (possible)

## What Vamos Does

From vamos source (`run.py`):
```python
set_regs = {
    REG_D0: args_len,
    REG_D1: reg_d1,
    REG_A0: args_ptr,
    REG_D2: stack_size,
    REG_A2: ctx.odg_base,
    REG_A5: ctx.odg_base,
    REG_A6: ctx.odg_base,
}
```

**Vamos does NOT set A4** - leaves it to door's own LEA instruction.

## Previous Hypothesis (WRONG)

❌ "Door has LEA.L $8000, A4 with NO relocation"
✅ ACTUALLY: Door has proper relocation at offset 0xA

❌ "Need to patch LEA instruction to use correct A4"
✅ ACTUALLY: LEA instruction works correctly via relocation

## Next Steps

1. **Trace A4 writes** - Add logging to see what clears A4 to 0
2. **Check AEDoor.library** - Verify library functions don't corrupt A4
3. **Check exception handlers** - Verify exception/interrupt handling preserves A4
4. **Memory watch** - Monitor A4 memory location for corruption

## Files Modified

- Removed incorrect `patchHardcodedA4()` from HunkLoader.ts:354

## References

- HUNK_RELOC32 at file offset 0x5FD0
- LEA instruction at CODE offset 0x8 (file offset 0x30)
- Relocation at CODE offset 0xA (file offset 0x32)
- vamos source: `/opt/homebrew/lib/python3.11/site-packages/amitools/vamos/dos/run.py`
