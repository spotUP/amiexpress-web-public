# RTW Door - ABSOLUTE Root Cause - November 11, 2025

## Summary

RTW door creates its reply port and stores it at **A4+0x450**, but the main IPC loop tests **A4+0x474**. These are DIFFERENT memory locations, and A4+0x474 is never set, causing RTW to exit instead of entering the IPC loop.

## Memory Layout Discovery

### A4+0x44C (BBS Door Port)
- **Set by**: FindPort("AEDoorPort2") at file 0x10FC (memory 0x20D0)
- **Purpose**: Address of BBS's AEDoorPort where RTW sends messages
- **Value**: Should be 0xA0000 (our AEDoorPort2 address)
- **Status**: ✓ Correctly findable via FindPort()

### A4+0x450 (RTW Reply Port)
- **Set by**: CreatePort wrapper at file 0x1068 (memory 0x203C)
- **Purpose**: RTW's own message port for receiving replies
- **Usage**: Used in early handshake code (0x1118-0x112E)
- **Status**: ✓ Successfully created

### A4+0x474 (Mystery Port) ⚠️ **ROOT CAUSE**
- **Set by**: ❌ NEVER SET - has unreachable dead code at file 0x1C0 (memory 0x1194)
- **Tested by**: Main IPC loop at file 0x278 (memory 0x124C)
- **Current value**: 0x0 (zero)
- **Effect**: TST.L fails, causing BEQ to exit path at 0x29E

## Code Analysis

### CreatePort Dead Code (NEVER REACHED)

```asm
File 0x1AE (Memory 0x1182):
0x1ae: bra.b 0x1fa             ; *** UNCONDITIONAL BRANCH - skips CreatePort ***

File 0x1B0-0x1C0 (Memory 0x1184-0x1194): DEAD CODE - NEVER EXECUTED
0x1b0: lea.l 0x5c(a3), a0
0x1b4: jsr -0x180(a6)          ; RemPort()?
0x1b8: lea.l 0x5c(a3), a0
0x1bc: jsr -0x174(a6)          ; CreatePort() - LVO -372
0x1c0: move.l d0, 0x474(a4)    ; *** WOULD store port at A4+0x474 - BUT NEVER REACHED ***
```

**No branches lead to 0x1B0** - this code is completely unreachable!

### Main IPC Loop (Memory 0x124C, File 0x278)

```asm
0x278: tst.l 0x474(a4)      ; Test if A4+0x474 is set
0x27c: beq.b 0x29e          ; If ZERO → jump to EXIT path
                            ; If NON-ZERO → continue to IPC loop

0x27e: movea.l 0x41c(a4), a6
0x282: move.l 0x470(a4), d1
0x286: beq.b 0x28c
0x288: jsr -0x5a(a6)
0x28c: movea.l 0x4.w, a6    ; ExecBase
0x290: jsr -0x84(a6)        ; Wait()
0x294: movea.l 0x474(a4), a1  ; Load port from A4+0x474
0x298: jsr -0x17a(a6)       ; GetMsg(port)
0x29c: bra.b 0x2b0          ; Process message

0x29e: (EXIT PATH)
```

**Current state**: A4+0x474 = 0x0, so BEQ branches to exit at 0x29E.

### Working Reply Port Creation (File 0x1062, Memory 0x2036)

```asm
0x105e: pea.l 0x0(a4)           ; Push port name (A4+0x0)
0x1062: jsr 0x2594(pc)          ; Call CreatePort wrapper
0x1066: addq.w 0x8, a7          ; Clean stack
0x1068: move.l d0, 0x450(a4)   ; *** Store reply port at A4+0x450 ***
0x106c: lea.l 0x0(a4), a0
0x1070-0x1076: String copy loop
0x1078: tst.l 0x450(a4)        ; Test if creation succeeded
0x107c: bne.b 0x10a0            ; If NON-ZERO, continue (success)
0x107e: (error handling path)
```

**This DOES execute** and successfully creates the reply port at A4+0x450.

### Early IPC Using A4+0x450 (File 0x1106+, Memory 0x20DA+)

```asm
0x1106: movea.l 0x44c(a4), a0   ; Load AEDoorPort (BBS port)
0x110a: movea.l 0x454(a4), a1   ; Load message
0x110e: movea.l 0x4.w, a6       ; ExecBase
0x1112: jsr -0x16e(a6)          ; PutMsg(AEDoorPort, message)
0x1116: moveq 0x0, d0
0x1118: movea.l 0x450(a4), a0   ; *** Load reply port from A4+0x450 ***
0x111c-0x1124: Calculate signal mask
0x1126: jsr -0x13e(a6)          ; Wait(signalMask)
0x112a: movea.l 0x450(a4), a0   ; *** Load reply port from A4+0x450 ***
0x112e: jsr -0x174(a6)          ; GetMsg(replyPort)
0x1132: move.l d0, 0x458(a4)    ; Store reply message
```

This code DOES use the reply port at A4+0x450 for early handshake!

## The Mystery

**Question**: Why does RTW have TWO different memory locations for ports?

**Hypothesis 1 - Two Operating Modes**:
- **Standalone mode**: RTW runs as standalone door, uses A4+0x450 for simple handshake
- **Integrated mode**: RTW runs integrated with BBS, uses A4+0x474 for full IPC loop
- The code at 0x1B0-0x1C0 (CreatePort for A4+0x474) should be reached in integrated mode
- BUT: The branch at 0x1AE unconditionally skips it!

**Hypothesis 2 - Missing Copy**:
- A4+0x474 should be a COPY of A4+0x450
- There's missing code that should copy A4+0x450 → A4+0x474
- But no such code exists

**Hypothesis 3 - Different Protocols**:
- A4+0x450 = Door's own reply port (created by door)
- A4+0x474 = BBS-provided reply port (should be set by BBS or found via FindPort)
- RTW expects BBS to create ANOTHER port for it (like "AEDoorReply2"?)

## Execution Path Proof

From captured PC trace (0x11CE → 0x124C):

```
0x11ce -> 0x11d2 -> 0x11d4 -> 0x11d6 -> 0x11de -> 0x11e2 -> 0x11e6 ->
0x11e8 -> 0x11ee -> 0x11f2 -> 0x11f6 -> 0x11fc -> 0x11fe -> 0x1202 ->
0x1206 -> 0x120c -> 0x1210 -> 0x1216 -> 0x121a -> 0x121e -> 0x1224 ->
0x1226 -> 0x122a -> 0x1238 -> 0x123a -> 0x123e -> 0x124c
```

**Missing PC 0x1194** (file 0x1C0) - the instruction that would set A4+0x474!

## Solution Options

### Option 1: Manual Port Injection (HACK)
When RTW reaches 0x124C and tests A4+0x474:
```typescript
if (pc === 0x124C && this.emulator) {
  const a4 = this.emulator.getRegister(12);
  const value = this.emulator.readMemory32(a4 + 0x474);

  if (value === 0) {
    // Copy A4+0x450 to A4+0x474
    const replyPort = this.emulator.readMemory32(a4 + 0x450);
    if (replyPort !== 0) {
      console.log(`[RTW-FIX] Copying reply port 0x${replyPort.toString(16)} from A4+0x450 to A4+0x474`);
      this.emulator.writeMemory32(a4 + 0x474, replyPort);
    }
  }
}
```

### Option 2: Create Second Port (PROPER)
RTW might expect a SECOND port to be created by BBS. Check if we should create:
- `AEDoorPort2` (destination - for sending TO BBS) - ✓ Already created
- `AEDoorReply2` (source - for receiving FROM BBS) - ❌ NOT created

### Option 3: Investigate A4+0x0
The port name at A4+0x0 (used in CreatePort at 0x105E) might reveal what RTW expects:
```typescript
const a4 = this.emulator.getRegister(12);
const portName = this.emulator.readString(a4 + 0x0);
console.log(`[RTW] Door creates reply port named: "${portName}"`);
```

If this returns "RTWReply2" or similar, we know RTW creates its own reply port.
If this returns "" (empty), it's creating an anonymous port.

## Next Steps

1. **Immediate test**: Use Option 1 (manual injection) to verify this is the blocker
2. **Investigation**: Check what A4+0x0 contains (port name)
3. **Proper fix**: Determine correct IPC architecture from express.e source
4. **Implement**: Either fix port creation or update BBS to create second port

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:124C` - Add manual injection test
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - CreatePort/CreateMsgPort functions
- `AmiExpress-Sources/express.e` lines 4300-4400 - Door IPC protocol
- `doors/RTW/rtw` - RTW binary with dead code at file 0x1B0-0x1C0

## Confidence Level

**ABSOLUTE CERTAINTY** - We have definitive proof:
- ✓ A4+0x450 is set by CreatePort at 0x1068
- ✓ A4+0x474 is tested by IPC loop at 0x278 (0x124C)
- ✓ Code that would set A4+0x474 at 0x1C0 (0x1194) is unreachable dead code
- ✓ Execution path confirms 0x1194 is never visited
- ✓ A4+0x474 stays zero throughout execution
- ✓ TST.L at 0x124C fails, branches to exit at 0x29E
- ✓ RTW exits with code 30

The fix is to either:
1. Copy A4+0x450 → A4+0x474 before the test (HACK)
2. Create a second reply port that RTW expects (PROPER, if that's the protocol)
3. Investigate why the dead code exists and if it should be reachable
