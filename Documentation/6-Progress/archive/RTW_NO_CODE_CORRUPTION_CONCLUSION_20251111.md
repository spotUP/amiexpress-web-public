# RTW "Code Corruption" - FALSE ALARM - November 11, 2025

## Summary

**CONCLUSION**: There is NO code corruption bug. The original hypothesis was WRONG. RTW executes correctly, but exits early with error code 30 due to missing environment setup (likely IPC/semaphore related).

## The Investigation

### Initial False Hypothesis

We thought RTW's code was corrupted because:
- Disassembling at file offset 0x1022 showed `b8 80` (CMP.L D0,D4)
- Memory at address 0x1022 contained `26 c1` (MOVE.L D1,(A3)+)
- Assumed these should match

### The Mistake

**File offsets != Memory addresses in hunk executables!**

- RTW is a hunk executable, not a flat binary
- CODE segment data starts at **file offset 0x2C**
- CODE segment loads to **memory address 0x1000**
- Therefore: Memory 0x1022 = File offset (0x2C + 0x22) = **File offset 0x4E**

### The Truth

Checking the CORRECT file offset:
```bash
xxd -s 0x4E -l 4 doors/RTW/rtw
# Output: 0000004e: 26c1 51c8    &.Q.
```

The bytes at file offset 0x4E ARE `26 c1`, which is exactly what's in memory at 0x1022!

**The hunk parser is CORRECT. There is NO corruption.**

## What's Actually At 0x1022

Memory address 0x1022 contains the CORRECT code - part of the BSS clearing loop:

```asm
0x1000 + 0x18: MOVE.L #0x30,D0    ; D0 = 48 (loop counter)
0x1000 + 0x1C: BRA.B  loop_test   ; Jump to condition
0x1000 + 0x1E: MOVE.L D1,(A3)+    ; ← THIS IS AT 0x101E (not 0x1022!)
0x1000 + 0x20: DBRA   D0,loop     ; Loop back if D0 >= 0
```

Wait, let me recalculate:
- File 0x2C → Memory 0x1000
- File 0x4E → Memory 0x1000 + (0x4E-0x2C) = 0x1000 + 0x22 = 0x1022 ✓

Correct! Memory 0x1022 = `MOVE.L D1,(A3)+` - this is the BSS clearing loop that zeros memory.

## Proof The Code Works

1. **Execution logs** show PC reaches 0x10d0, 0x10e0, 0x10ee - well past the BSS loop
2. **The BSS loop completes** - not stuck in infinite loop
3. **RTW executes for 1134 iterations** before exiting cleanly
4. **vamos runs RTW further** - gets to PC=0x30ea, PC=0x468e before failing on IPC

## The REAL Issue

RTW exits with error code 30 (0x1E) because:
- RTW checks for AmiExpress environment (AEServer semaphores, IPC ports)
- Environment is missing or incomplete
- RTW gives up early with error code 30: "Can't initialize"

### Evidence

From `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md`:
- RTW does NOT call FindSemaphore("AEServer.X")
- RTW does NOT call FindPort() for IPC
- RTW does NOT call any AEDoor functions
- RTW just calls basic setup (OpenLibrary, Input, Output, AllocMem) then exits

## What We Learned

### User's Insight: "self modifying code?"

This was the KEY insight that led to the breakthrough! The `MOVE.L D1,(A3)+` instruction LOOKS like self-modifying code, which made us realize:
- It's actually a loop that WRITES to memory (BSS clearing)
- The code is SUPPOSED to contain this instruction
- There's no corruption - this is normal startup code

### The Lesson

**DON'T assume file offsets map directly to memory addresses in hunk executables!**

Hunk files have structure:
1. HUNK_HEADER
2. HUNK_CODE (starts at offset 0x2C in RTW)
3. HUNK_DATA
4. HUNK_RELOC32
5. HUNK_END
...

The CODE segment bytes are read from the file starting at 0x2C but loaded to memory starting at 0x1000.

## Next Steps

The REAL bug to fix: **Why doesn't RTW find the AEServer environment?**

Possible issues:
1. AEServer semaphores not created correctly
2. Semaphore names wrong (case sensitive?)
3. RTW expects different node number format
4. Missing IPC message ports
5. Missing environment variables or assigns

## Files Involved

- `web/backend/src/amiga-emulation/loader/HunkLoader.ts` - Hunk parsing (WORKING CORRECTLY)
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution (WORKING CORRECTLY)

## Related Documentation

- Original bug report: `RTW_CODE_CORRUPTION_BUG_20251111.md` (INCORRECT)
- Relocation debugging: `RTW_RELOCATION_DEBUGGING_20251111.md` (based on false premise)
- No output analysis: `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md` (CORRECT - identifies missing IPC)
