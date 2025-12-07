# RTW Door - True Root Cause - November 11, 2025

## Summary

RTW door exits with code 30 because it **exits before reaching any PutMsg calls**. There is NO code corruption. The previous analysis was based on incorrect disassembly offsets.

## The Mistake

Previous analysis used `r2 -c "s 0x116C"` which seeks to **FILE offset 0x116C**, not **memory address 0x116C**.

Correct mapping:
- RTW CODE hunk starts at file offset 0x2C
- CODE hunk loads to memory address 0x1000
- Memory address 0x116C = file offset 0x2C + (0x116C - 0x1000) = **file offset 0x198**

## What's Actually at Memory 0x116C

**File bytes at offset 0x198:**
```
11bc 0022 2002 11b1 2000 2001 51ca fff8
```

**Correct disassembly:**
```
0x116C: move.b 0x22, 0x2(a0,d2.w)    ; 11bc 0022 2002
0x1172: move.b (a1,d2.w), 0x1(a0,d2.w) ; 11b1 2000 2001
0x1178: dbra d2, 0x1172               ; 51ca fff8
```

This is a **BYTE-COPY DBRA LOOP**, not a PutMsg call! There is NO JSR instruction here.

## Where Are The PutMsg Calls?

RTW binary contains **41 PutMsg calls** (`4eae fe92`). The first one is at:
- File offset: 0xC50
- Memory address: 0x1C24

But RTW **exits at PC 0x117C**, which is at file offset 0x1A8, long before reaching any PutMsg calls.

## RTW Execution Path

From logs, last 50 PCs before exit:
```
... -> 0x1164 -> 0x116a -> 0x116c -> 0x1172 -> 0x1178 ->
0x1172 -> 0x1178 -> 0x1172 -> 0x1178 -> 0x1172 -> 0x1178 ->
0x1172 -> 0x1178 -> 0x117c
```

Analysis:
1. RTW enters DBRA loop at 0x1172-0x1178
2. Loop executes 5 times (D2 = 4 initially)
3. After loop exits, PC = 0x117C
4. RTW exits with code 30 at 0x117C

## The Real Question

**Why does RTW exit at 0x117C instead of continuing to 0x1C24 where the first PutMsg call is?**

Possible reasons:
1. **Conditional branch at 0x117C** - Takes wrong path, exits instead of continuing
2. **Failed initialization check** - Some test fails, causes early exit
3. **Missing file/data** - RTW checks for required resource, doesn't find it, exits
4. **Stack/memory issue** - Crash or RTS to wrong address at 0x117C

## Next Steps

1. **Disassemble at file offset 0x1A8** (memory 0x117C) to see what instruction causes exit
2. **Check what comes before** - Disassemble 0x1140-0x117C to understand initialization logic
3. **Check register values** - What is A0, A1, D2 in the DBRA loop? Are they correct?
4. **Add debugging at 0x117C** - Log instruction and all registers when RTW exits

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:3033` - Execution path log
- `doors/RTW/rtw` - RTW binary (CODE hunk at file 0x2C → memory 0x1000)
- Previous wrong analysis:  `RTW_LIBRARY_TRAP_BUG_20251111.md`

## Confidence Level

**VERY HIGH** - This time we verified:
- ✓ Checked actual file bytes with xxd
- ✓ Used correct file offset for disassembly
- ✓ Confirmed no corruption - memory matches file
- ✓ Found all 41 PutMsg calls in binary
- ✓ Confirmed RTW exits BEFORE first PutMsg at 0x1C24
- ✓ The problem is early exit, not missing calls

## Key Lesson

**ALWAYS verify file offsets when disassembling!** `r2 -c "s ADDR"` seeks to file offset, not memory address.
