# RTW/WHO Stack Corruption Fix - November 11, 2025

## Summary

**FIXED**: RTW and WHO doors were crashing at PC=0x0 due to insufficient stack exit trap coverage. The fix extended coverage from 64 bytes to 128 bytes to catch return addresses up to SP+60.

## Root Cause

RTW's cleanup code at PC=0x128c executes:
```asm
0x128c: MOVE.L (A7)+,D0         ; pop 1 longword (SP -> SP+4)
0x128e: MOVEM.L (A7)+,D1-D7/A1-A6 ; pop 13 longwords (SP+4 -> SP+56)
0x1292: RTS                      ; pop return address from SP+56
```

The RTS instruction pops the return address from SP+56 bytes above the initial SP (0xFDFF8 + 56 = 0xFE030).

**The Problem**: Exit trap addresses were only written from (finalSP-60) to finalSP (0xFDFC0-0xFDFFC), but the RTS tried to pop from 0xFE030, which was outside the coverage and contained 0x00000000.

## The Fix

Extended exit trap address coverage from 64 bytes to 128 bytes:

**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:540-544`

**Before**:
```typescript
for (let offset = 0; offset < 64; offset += 4) {
  this.emulator.writeMemory32(finalSP - offset, exitTrapAddress);
}
// Coverage: 0xFDFC0 to 0xFDFFC (64 bytes below SP)
```

**After**:
```typescript
for (let offset = -64; offset < 64; offset += 4) {
  this.emulator.writeMemory32(finalSP + offset, exitTrapAddress);
}
// Coverage: 0xFDF98 to 0xFE038 (128 bytes: 64 below + 64 above SP)
```

## Test Results

### Before Fix
```
[AmigaDoorSession] PC in low memory (0x0) - likely stack corruption
[AmigaDoorSession] Total iterations: 1134
```

### After Fix
```
[AmigaDoorSession] === DOOR EXITED CLEANLY ===
[AmigaDoorSession] Return code (D0): 30
[AmigaDoorSession] Total iterations: 1134
```

## Technical Details

### Stack Analysis
- Initial SP: 0xFDFF8
- CloseLibrary returns to: 0x128c
- Code at 0x128c pops 14 longwords before RTS (1 + 13 = 56 bytes)
- RTS pops from: 0xFDFF8 + 56 = 0xFE030
- Old coverage: 0xFDFC0-0xFDFFC (missed 0xFE030 by 52 bytes)
- New coverage: 0xFDF98-0xFE038 (includes 0xFE030)

### Why 128 Bytes?
- C startup code and cleanup routines can push/pop many registers
- SAS/C uses MOVEM to save/restore D1-D7/A1-A6 (13 registers = 52 bytes)
- Additional overhead for return addresses and temporaries
- 128 bytes (64 below + 64 above) provides safe margin

## Remaining Issues

**RTW still produces no output** after this fix. This is a separate issue:
- Door executes successfully (1134 iterations)
- Door opens console (`*`) successfully (BPTR 2)
- Door never calls Write() or AEDoor I/O functions
- Door exits cleanly with return code 30

**Next Steps**: Investigate why RTW doesn't produce output despite clean execution.

## Files Modified

1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts:540-544`
   - Extended exit trap coverage from 64 to 128 bytes

2. `web/backend/src/amiga-emulation/api/LibraryTraps.ts:986-990`
   - Removed temporary stack debugging code

## References

- Original bug report: `RTW_DOOR_DEBUGGING_SESSION_20251111.md`
- DBRA analysis: `RTW_WHO_DBRA_LOOP_BUG_20251111.md`
- Stack dump showed SP=0xFDFF8, return address needed at SP+0x38 (0xFE030)
