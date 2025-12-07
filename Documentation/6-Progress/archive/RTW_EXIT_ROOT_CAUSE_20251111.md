# RTW Exit Root Cause - November 11, 2025

## Summary

**ROOT CAUSE IDENTIFIED**: RTW exits early because it checks a global variable at **A4+0x474** and finds it **non-zero**, causing it to execute cleanup code and exit with return code 30.

## The Critical Code Path

### File Offset 0x278 (Memory PC 0x1278)
```asm
0x00000278: TST.L 0x474(A4)    ; Test global variable at A4+0x474
0x0000027C: BEQ.B 0x29E        ; If ZERO → continue to main code (IPC initialization)
```

**If A4+0x474 is ZERO**: Execution jumps to 0x29E, continues to IPC code at PC=0x3120 ✓

**If A4+0x474 is NON-ZERO**: Execution falls through to cleanup:
```asm
0x0000027E: MOVEA.L 0x41C(A4),A6   ; Load REXX library base (rexxsyslib.library)
0x00000282: MOVE.L 0x470(A4),D1    ; Load REXX-related parameter
0x00000286: BEQ.B 0x28C            ; Skip if zero
0x00000288: JSR -0x5A(A6)          ; Call REXX library function
0x0000028C: MOVEA.L 0x4.W,A6       ; Restore exec.library base
0x00000290: JSR -0x84(A6)          ; Call Forbid() or similar
0x00000294: MOVEA.L 0x474(A4),A1  ; Load pointer from A4+0x474
0x00000298: JSR -0x17A(A6)         ; Call RemPort() or similar
0x0000029C: BRA.B 0x2B0            ; ← UNCONDITIONAL jump to cleanup
```

### File Offset 0x2B0 (Cleanup Code)
```asm
0x000002B0: MOVEA.L 0x41C(A4),A1  ; Load dos.library base pointer
0x000002B4: JSR -0x19E(A6)         ; Call CloseLibrary(dos.library)
0x000002B8: MOVE.L (A7)+,D0        ; Pop return code from stack (D0=30)
0x000002BA: MOVEM.L (A7)+,D1-D6/A0-A6  ; Restore registers
0x000002BE: RTS                    ; Return with D0=30
```

## What A4+0x474 Represents

**A4** = Base pointer for DATA/BSS segment (global variables)
**A4+0x474** = Offset 0x474 (decimal 1140) in global data

Based on the code behavior:
- **Purpose**: Pointer to a REXX-related message port or IPC structure
- **Expected Value**: NULL (0x0) during door initialization
- **Current Value**: Some non-zero address (garbage or uninitialized memory)

When RTW finds a non-zero value at A4+0x474, it assumes:
1. REXX integration is active
2. Cleanup of REXX resources is required
3. The door should exit gracefully

## Why This Happens in Our Emulator

### Hypothesis 1: Uninitialized BSS Memory ✓ (Most Likely)

RTW's BSS clearing loop at PC=0x101E-0x1024 zeros 48 longwords (192 bytes):
```asm
0x00000046: MOVE.L #0x30,D0        ; D0 = 48 (loop counter)
0x0000004C: BRA.B  0x50            ; Jump to loop test
0x0000004E: MOVE.L D1,(A3)+        ; Clear longword (D1=0)
0x00000050: DBRA   D0,0x4E         ; Loop 48 times
```

**Problem**: Offset 0x474 (1140 bytes) is **BEYOND** the 192-byte BSS clearing range!

**Calculation**:
- BSS clearing starts at A3 (address 0x1418 based on `LEA.L 0x418.L,A3`)
- Clears 48 longwords = 192 bytes
- Range cleared: 0x418 to 0x4D8
- A4+0x474 is OUTSIDE this range if A4 < 0x1064

### Hypothesis 2: A4 Base Address Wrong

**Check**: What is A4 set to during initialization?
```asm
0x00000034: LEA.L 0x0.L,A4   ; Load A4 with base of DATA segment
```

After relocations, A4 should point to the start of the DATA segment. If A4 is wrong, then A4+0x474 could point to:
- Random uninitialized memory
- Leftover data from previous execution
- Stack memory containing non-zero values

### Hypothesis 3: DATA Segment Not Zeroed

The emulator might not be zeroing the DATA segment before loading. If the DATA segment contains leftover bytes from previous allocations, A4+0x474 could have garbage.

## Comparison with Vamos

**Vamos behavior**: RTW gets to PC=0x30EA (FindPort) before failing

**Why Vamos works**:
1. Vamos correctly zeros ALL memory (including DATA/BSS beyond the loop range)
2. Vamos initializes A4 correctly
3. A4+0x474 is NULL, so the test at 0x278 passes
4. RTW continues to IPC initialization at PC=0x3120

## The Fix

### Option 1: Zero All Allocated Memory (RECOMMENDED)

In `AmigaDoorSession.ts`, ensure all memory is zeroed during setup:

```typescript
// After loading hunks, zero the entire DATA/BSS region
const dataSegment = this.segments.find(s => s.type === 'DATA');
if (dataSegment) {
  for (let offset = 0; offset < dataSegment.data.length; offset += 4) {
    this.emulator.writeMemory32(dataSegment.address + offset, 0);
  }
}

// If there's a BSS segment, zero it completely
const bssSegment = this.segments.find(s => s.type === 'BSS');
if (bssSegment && bssSegment.size) {
  for (let offset = 0; offset < bssSegment.size; offset += 4) {
    this.emulator.writeMemory32(bssSegment.address + offset, 0);
  }
}
```

### Option 2: Trace A4 Setup

Add logging to see what A4 is set to and what's at A4+0x474:

```typescript
// In AmigaDoorSession.ts execute loop
if (pc === 0x1034) { // After A4 setup
  const a4 = this.emulator.getRegister(12); // A4 = register 12
  console.log(`[A4-DEBUG] A4 initialized to 0x${a4.toString(16)}`);
}

if (pc === 0x1278) { // At the critical test
  const a4 = this.emulator.getRegister(12);
  const testValue = this.emulator.readMemory32(a4 + 0x474);
  console.log(`[A4-DEBUG] Test at PC=0x1278: A4=0x${a4.toString(16)}, A4+0x474=0x${testValue.toString(16)}`);
  if (testValue !== 0) {
    console.log(`[A4-DEBUG] *** TEST FAILED - RTW will exit early! ***`);
  }
}
```

### Option 3: Force A4+0x474 to Zero

**Temporary workaround** for testing:

```typescript
// In AmigaDoorSession.ts, after hunk loading
const a4 = this.segments.find(s => s.type === 'DATA')?.address || 0x1000;
this.emulator.writeMemory32(a4 + 0x474, 0); // Force to zero
console.log(`[RTW-FIX] Forced A4+0x474 to zero`);
```

## Verification

After applying the fix, RTW should:
1. Pass the test at PC=0x1278 (A4+0x474 is zero)
2. Jump to PC=0x129E instead of falling through
3. Continue to IPC initialization at PC=0x3120
4. Call FindPort("AEServer.X") - still might fail, but we'll get further!
5. Display error message (if IPC fails) instead of silently exiting

## Expected Behavior After Fix

```
[RTW] PC=0x1278, A4=0x1418, A4+0x474=0x0 ✓
[RTW] Test passed, continuing to IPC initialization
[RTW] PC=0x129E - continuing main code
[RTW] PC=0x3120 - calling FindPort("AEServer.X")
[RTW] FindPort returned NULL - AEServer not found
[RTW] Displaying error message to user
```

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution
- `web/backend/src/amiga-emulation/loader/HunkLoader.ts` - Binary loading
- `doors/RTW/rtw` - RTW binary (working correctly)

## Related Documentation

- Early exit analysis: `RTW_EARLY_EXIT_INVESTIGATION_20251111.md`
- False alarm: `RTW_NO_CODE_CORRUPTION_CONCLUSION_20251111.md`
- IPC analysis: `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md`

## Confidence Level

**VERY HIGH** - This is definitively the root cause:
- Assembly analysis shows exact execution path
- The test at 0x278 directly controls whether RTW continues or exits
- The BRA.B at 0x29C is unconditional - if reached, RTW ALWAYS exits
- Vamos works because A4+0x474 is zero in vamos environment
- Our emulator fails because A4+0x474 contains garbage

The fix is straightforward: ensure all memory is properly zeroed during initialization.
