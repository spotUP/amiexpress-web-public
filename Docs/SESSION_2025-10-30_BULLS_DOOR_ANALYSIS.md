# Bulls Door Analysis - Session 2025-10-30

## Summary

The Bulls door (`doors/EmP_Tools/Bulls`) successfully demonstrates:
- ✅ Door loading and execution
- ✅ Text output via `aePuts()` - "dos.library" string is displayed
- ✅ Library function calls (Output, Input, Open, etc.)
- ✅ ROM space reads are handled (`0xFF0000-0xFF00FF`)

## Problem: NULL Pointer Crash

The door crashes by jumping to address `0x0` (NULL) after reading from ROM space.

### Execution Flow:
1. ✅ Door loads successfully (21,828 bytes, 2 segments)
2. ✅ Door outputs "dos.library" via `aePuts()`
3. ✅ Door calls dos.library functions (Output, Input, Open)
4. ✅ Door reads ROM at `0xFF0000` and `0xFF0002`
5. ❌ Door jumps to address `0x0` → **CRASH**
6. ❌ Infinite loop at PC=0x0

### Root Cause

The Bulls door reads from ROM addresses `0xFF0000` and `0xFF0002`, likely looking for function pointers or ROM vectors. We return 0, which causes the door to jump to NULL (0x0).

### What the Door Needs

The Bulls door is a complex XIM door that requires:
1. **Proper ROM emulation** with valid function pointers at specific addresses
2. **Complete Kickstart ROM data** (256KB at 0xFC0000-0xFFFFFF)
3. **Hardware register emulation** for CIA chips, custom chips, etc.
4. **Vector table** at low memory with exception handlers

This is beyond a simple stub implementation - it needs full Amiga system emulation.

## Recommendation

**Try a simpler door first** to validate the door execution infrastructure. Good candidates:
- `hello-door` (TypeScript door)
- `GetAnswer` (simple query door)
- `FastDupe` (simple file check)
- Any REXX-based door (ansiskip, etc.)

The Bulls door should be revisited after:
1. Simpler doors work successfully
2. Basic ROM emulation is implemented
3. Hardware register emulation is complete

## Implementation Progress

### What Works:
- Complete dos.library (33 functions)
- AEDoor.library (aePuts, aeGetCh, etc.)
- exec.library basic functions
- Message port system
- Door loading (hunk format)
- 68k CPU emulation (Moira)
- Library trap mechanism
- ROM space filtering (0xFF0000-0xFF00FF)

### What's Missing:
- Kickstart ROM data
- ROM function pointers/vectors
- CIA chip emulation
- Custom chip emulation
- Complete hardware register map
- Exception vector table

## Technical Details

### ROM Space on Amiga:
- `0xFC0000-0xFFFFFF`: 256KB Kickstart ROM (A500/A1000/A2000)
- `0xFF0000-0xFF00FF`: Upper 256 bytes of ROM (Bulls door reads here)
- Contains: ROM routines, function tables, version info, vectors

### What Bulls Door Reads:
- `0xFF0000`: Likely a function pointer or ROM vector
- `0xFF0002`: Next word of function pointer or data

### Current Implementation:
```typescript
// AmigaDosEnvironment.ts:322-338
private handleHardwareRegister(address: number): void {
  // Returns 0 for all ROM reads
  // This causes NULL pointer jumps
  this.emulator.setRegister(CPURegister.D0, 0);
  console.log(`[ROM Read] Address 0x${address.toString(16)} (ROM space): returning 0`);
}
```

### vAmiga Approach:
vAmiga loads an actual Kickstart ROM file and serves real ROM data at these addresses. This is the proper solution but requires:
1. Kickstart ROM file (copyright/legal issues)
2. ROM loading infrastructure
3. Memory mapping at 0xFC0000-0xFFFFFF

## Next Steps

1. **Test a simpler door** to validate current implementation
2. Consider implementing minimal ROM stubs (fake vectors pointing to RTS instructions)
3. Or: Skip complex XIM doors and focus on REXX/TypeScript doors that don't need ROM

## Logs

Final execution trace:
```
[AmiExpress] aePuts() output: "dos.library"
[AmigaDoorSession] Sending output to client: "dos.library"
[dos.library] Output() called
[dos.library] Input() called
[dos.library] Open(filename="*", mode=1005) - returned 2
[dos.library] WARNING: Offset -28 called
[ROM Read] Address 0xff0000 (ROM space): returning 0
[ROM Read] Address 0xff0002 (ROM space): returning 0
[Door Trace] PC=0x0, SP=0xf5f10, D0=0x75
⚠️ POSSIBLE INFINITE LOOP: PC 0x0 seen 57 times
```

## File Sizes

- Bulls door: 21,828 bytes
- Kickstart 1.3 ROM: 262,144 bytes (256KB)
- Required implementation: ~5,000+ lines of ROM emulation code

**Conclusion**: Bulls door is too complex for current implementation level. Test simpler doors first.
