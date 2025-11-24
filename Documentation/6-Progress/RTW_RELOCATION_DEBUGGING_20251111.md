# RTW Relocation Debugging - November 11, 2025

## Summary

Added comprehensive debugging to HunkLoader.ts to detect which specific relocation is corrupting PC=0x1022 in RTW's code segment.

## Changes Made

### File: `web/backend/src/amiga-emulation/loader/HunkLoader.ts`

**Lines 232, 237, 247-277**: Added corruption detection and memory address logging

#### Key Features:

1. **Memory Address Logging**: Shows actual memory addresses (segment.address + offset) instead of just offsets
2. **0x1022 Detection**: Special logging when any relocation targets address 0x1022
3. **Byte-Level Analysis**: Shows bytes before and after relocation application
4. **Expected vs Actual**: Compares corrupted bytes to expected file contents

## Expected Log Output

When RTW door loads, you should see:

```
[HunkLoader] Applying relocations to segment data...
[HunkLoader] Applying 427 relocations to segment 0 @ 0x1000
[HunkLoader]   Reloc @ 0x1052 (seg+0x52): 0x... -> 0x... (target seg 0 @ 0x1000)
...
[CORRUPTION] *** FOUND RELOCATION AT 0x1022 ***
[CORRUPTION]   Segment: 0, Offset: 0x22
[CORRUPTION]   Current bytes: b8 80 xx xx
[CORRUPTION]   Current value: 0xb880xxxx
[CORRUPTION]   Target segment: X @ 0xXXXX
[CORRUPTION]   Will add base: 0xXXXX
[CORRUPTION]   New bytes: 26 c1 xx xx
[CORRUPTION]   New value: 0x26c1xxxx
[CORRUPTION]   Expected bytes (from file): b8 80 (CMP.L D0,D4)
[CORRUPTION] *** THIS RELOCATION CORRUPTS 0x1022 ***
```

## What This Tells Us

The `[CORRUPTION]` logs will reveal:

1. **Which relocation** is corrupting 0x1022 (offset 0x22 in segment 0)
2. **What the bytes were** before relocation (should be `b8 80` = CMP.L D0,D4)
3. **What they became** after relocation (currently `26 c1` = MOVE.L D1,(A3)+)
4. **Which segment** the relocation is trying to point to
5. **What address** is being added (the "base" that corrupts the code)

## Root Cause Hypotheses

Once we see the corruption logs, we can determine:

### Hypothesis 1: Wrong Relocation Offset
- The relocation table has offset 0x22, but this is executable code, not a data pointer
- The `.info` file or hunk file might have incorrect relocation entries
- SAS/C compiler may have emitted wrong relocation offsets

### Hypothesis 2: Relocation Already Applied
- Offset 0x22 might contain a pointer that was already relocated by the linker
- Our loader is double-relocating, causing corruption
- We should check if `currentValue` looks like an already-relocated pointer

### Hypothesis 3: Wrong Base Address
- Relocation might be correct, but we're adding the wrong segment base address
- Target segment calculation might be off

## Testing Instructions

1. **Start servers**: `./dev/scripts/start-servers.sh`
2. **Run RTW test**: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test_rtw.ts`
   - OR connect to BBS and run `RTW` command
3. **Check logs**: `grep -A20 "CORRUPTION" logs/backend.log`

## Next Steps

After identifying the specific relocation:

### Option A: Skip Invalid Relocations
If offset 0x22 contains executable code (opcode bytes), skip this relocation:
```typescript
// Skip relocations that target executable code
const currentWord = (b0 << 8) | b1;
if (isValidOpcode(currentWord)) {
  console.log(`[HunkLoader] Skipping relocation at 0x${memoryAddress.toString(16)} - targets executable code`);
  continue;
}
```

### Option B: Validate Relocation Values
Only apply relocations where the current value looks like a valid pointer:
```typescript
// Only relocate if value is in valid range (0x0 - 0x10000)
if (currentValue > 0x10000) {
  console.log(`[HunkLoader] Skipping relocation - value 0x${currentValue.toString(16)} out of range`);
  continue;
}
```

### Option C: Compare with Vamos
Run RTW under vamos with memory dumps to see how it handles relocations:
```bash
vamos --memory-dump doors/RTW/rtw 2
```

## Files Modified

- `web/backend/src/amiga-emulation/loader/HunkLoader.ts:225-284` - Added corruption detection

## Related Documentation

- Root cause analysis: `RTW_CODE_CORRUPTION_BUG_20251111.md`
- Stack fix: `RTW_WHO_STACK_CORRUPTION_FIX_20251111.md`
- No output analysis: `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md`
