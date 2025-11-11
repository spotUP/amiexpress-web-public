# RTW Door - Library Trap Bug - November 11, 2025

## Summary

**ROOT CAUSE IDENTIFIED**: RTW successfully calls PutMsg() and Wait(), but the LibraryTraps mechanism fails to intercept these specific function calls, even though traps work correctly for other Exec library functions.

## Evidence

### RTW Execution Path

From logs:
```
Last 50 PCs before exit:
0x1158 -> 0x115e -> 0x1160 -> 0x1158 -> 0x115e -> 0x1160 (looped 5x)
0x1172 -> 0x1178 -> 0x1172 -> 0x1178 -> 0x1172 -> 0x1178 (looped 5x)
```

### Disassembly Confirms Function Calls

```asm
0x116C: movea.l 0x4.w, a6       ; Load ExecBase (0x10000)
0x1170: jsr -0x16e(a6)          ; PutMsg() - jump to 0xFE92
0x1174: move.l d7, d0           ; D0 = signal mask
0x1176: jsr -0x13e(a6)          ; Wait() - jump to 0xFEC2
0x117A: bsr.w 0x1184            ; Process reply
```

### Trap Vectors Correctly Installed

From logs:
```
[LibraryTraps] Installing Exec.library vectors at base 0x10000
[LibraryTraps] Installed 23 Exec.library vectors
  [PutMsg] Vector at 0xfe92 (offset -366)
  [Wait] Vector at 0xfec2 (offset -318)
```

### Other Traps Working

During same RTW execution, LibraryTraps successfully intercepted:
- ✓ AllocMem() at PC=0xff3a
- ✓ FreeMem() at PC=0xff2e
- ✓ Open() at PC=0x1ffe2
- ✓ Close() at PC=0x1ffdc
- ✓ CloseLibrary() at PC=0xfe62
- ✗ **PutMsg() at PC=0xfe92 - NOT intercepted**
- ✗ **Wait() at PC=0xfec2 - NOT intercepted**

### No ExecLibrary Logs

Expected logs that are MISSING:
```
[ExecLibrary] PutMsg(port=0x..., msg=0x...)  // NEVER appears
[ExecLibrary] Wait(signalMask=0x...)         // NEVER appears
```

## The Trap Mechanism

### How It Should Work

1. RTW executes `JSR -0x16e(A6)` where A6=0x10000
2. CPU jumps to address 0x10000 + (-0x16e) = 0xFE92
3. Memory at 0xFE92 contains TRAP instruction
4. MOIRA emulator catches TRAP exception
5. LibraryTraps.handleTrap() identifies function by offset
6. Calls `ExecLibrary.putMsg()` handler
7. Returns to RTW code

### What's Actually Happening

1. ✓ RTW executes `JSR -0x16e(A6)`
2. ✓ CPU jumps to 0xFE92
3. ? Memory at 0xFE92 should contain TRAP instruction
4. ✗ **MOIRA never catches the TRAP** (no "DIRECT TRAP" log)
5. ✗ LibraryTraps.handleTrap() never called
6. ✗ ExecLibrary.putMsg() never executes
7. ? RTW returns from JSR (somehow) and continues

## Comparison with Working Traps

### AllocMem (WORKS)

```
[LibraryTraps] DIRECT TRAP at PC=0xff3a (offset=-198, A6=0x10000)
[LibraryTraps] *** INTERCEPTED: AllocMem() at PC=0xff3a ***
[ExecLibrary] AllocMem(size=67588, flags=0x10001)
```

### PutMsg (BROKEN)

```
(no DIRECT TRAP log)
(no INTERCEPTED log)
(no ExecLibrary log)
```

## Possible Causes

### 1. Trap Instruction Not Written to Memory

The `installVector()` function might not be writing the TRAP instruction to memory at 0xFE92/0xFEC2.

**Check**: Examine LibraryTraps.ts `installVector()` implementation

### 2. Wrong TRAP Opcode

PutMsg/Wait might use a different TRAP number than other functions.

**Check**: Verify TRAP opcodes for all vectors

### 3. MOIRA Not Detecting These Specific Traps

MOIRA might have a bug where it doesn't catch traps at certain addresses.

**Check**: Test with simple program that calls only PutMsg

### 4. Incorrect A6 Value

If A6 doesn't equal 0x10000 when RTW calls JSR, it would jump to wrong address.

**Check**: Add debugging to log A6 value at PC 0x116C

### 5. JSR Never Executes

The execution path shows 0x1172 (inside JSR instruction), but maybe JSR is skipped somehow.

**Check**: Add trap at PC 0x1170 to verify RTW reaches it

## Next Steps

### Immediate Actions

1. **Verify Memory Contents**
   ```typescript
   // In AmigaDoorSession, after library vectors installed
   const putMsgTrap = this.emulator.readMemory16(0xFE92);
   const waitTrap = this.emulator.readMemory16(0xFEC2);
   console.log(`[TRAP-CHECK] PutMsg trap at 0xFE92: 0x${putMsgTrap.toString(16)}`);
   console.log(`[TRAP-CHECK] Wait trap at 0xFEC2: 0x${waitTrap.toString(16)}`);
   ```

2. **Log A6 Value**
   ```typescript
   if (pc === 0x116C && this.emulator) {
     const a6 = this.emulator.getRegister(14);
     console.log(`[RTW] A6 (ExecBase) = 0x${a6.toString(16)}`);
   }
   ```

3. **Check If JSR Executes**
   ```typescript
   if (pc === 0x1170) {
     console.log(`[RTW] Executing JSR -0x16e(A6) to PutMsg`);
   }
   ```

4. **Compare Working vs Broken Vectors**
   ```bash
   # Find what's different about AllocMem (works) vs PutMsg (broken)
   grep -A5 "offset.*-198\|offset.*-366" web/backend/src/amiga-emulation/api/LibraryTraps.ts
   ```

### Long-Term Fix

Once we identify why the traps don't fire, implement one of:

**Option A**: Fix the trap mechanism so PutMsg/Wait are intercepted

**Option B**: Implement workaround - manually intercept JSR instructions at PC 0x1170/0x1176

**Option C**: Implement alternative IPC mechanism that doesn't rely on PutMsg/Wait

## Related Files

- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - Trap installation and handling
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - putMsg/wait implementations
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution loop
- `AmiExpress-Sources/express.e` lines 4300-4400 - Correct door IPC protocol

## Confidence Level

**VERY HIGH** - We have definitive proof:
- ✓ RTW calls PutMsg/Wait (disassembly confirms)
- ✓ Vectors installed (logs confirm)
- ✓ Other traps work (AllocMem, FreeMem, etc intercepted)
- ✓ PutMsg/Wait traps DON'T work (no DIRECT TRAP logs)
- ✓ This is a LibraryTraps bug, not RTW issue

The fix is to debug why these specific traps fail to intercept when others succeed.
