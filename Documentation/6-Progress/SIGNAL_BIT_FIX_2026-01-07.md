# Critical Signal Bit Mismatch Fix - 2026-01-07

## Summary

Fixed critical bug causing 68K doors to hang after sending JH_REGISTER. The issue was a signal bit mismatch between Wait() and Signal() calls in the PutMsg implementation.

## The Problem

When a door called Wait() with signalMask=0x10000 (bit 16), but PutMsg allocated a NEW signal bit 17 and called Signal(0x20000), the bits didn't match and Wait() never woke up.

### Root Cause

In `ExecLibrary.ts` PutMsg(), when upgrading a lightweight port to a signaling port by setting PA_SIGNAL:

```typescript
// WRONG - Always allocates NEW signal bit
if (!port.sigBit || port.sigBit === 0) {
  port.sigBit = this.AllocSignal(-1);
}
```

The problem: The native 68K code (AEDoor.library) had ALREADY called AllocSignal() and written the bit to mp_SigBit (offset +15 in MsgPort structure). When we allocated a NEW bit, the door's Wait() was waiting for the OLD bit, but our Signal() used the NEW bit - they never matched!

## The Fix

Modified PutMsg to READ the existing sigBit from the port structure instead of allocating a new one:

```typescript
// CORRECT - Read existing sigBit from port memory
const existingSigBit = this.emulator.readMemory(portAddr + 15);
if (existingSigBit > 0 && existingSigBit <= 31) {
  // Port already has a valid signal bit - use it!
  port.sigBit = existingSigBit;
  console.log(
    `[ExecLibrary]   Using existing sigBit ${existingSigBit} from port structure`
  );
} else if (port.sigBit === 0) {
  // No valid signal bit - allocate one
  port.sigBit = this.AllocSignal(-1);
  if (port.sigBit < 0 || port.sigBit > 31) {
    port.sigBit = 1;
  }
  this.emulator.writeMemory(portAddr + 15, port.sigBit);
}
```

## File Modified

- `/web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Lines 4951-4989 in PutMsg()

## Test Results

### Before Fix
- joincnf door: Sent JH_REGISTER (1), then hung in Wait() forever
- Door never sent subsequent XIM messages

### After Fix
- joincnf door: Successfully sends complete XIM message sequence:
  - JH_REGISTER (1)
  - RAWARROW (501)
  - SV_NEWMSG (177) - "JoinCnf 4.0"
  - JH_SYSOP (12)
  - DT_NAME (100) - "Sysop"
  - DT_SECSTATUS (105) - "sysop"
  - DT_SLOTNUMBER (104) - "255"
  - BB_MAINLINE (131) - "2"
  - EXPRESS_VERSION (152) - "J"
  - DT_CONFACCESS (146) - "v5.3"
  - DT_LINELENGTH (122) - "XXXXXXXXX"
  - BB_CONFNUM (510) - "23"

- Bulls door: Works correctly, displays ASCII art logo and menu

### Comparison with Real Amiga Log

Checked against `/Documentation/4-Door-Developers/joinconf_j_2_and_j.log` - message sequence is IDENTICAL to real Amiga hardware!

## Technical Details

### MsgPort Structure (exec/ports.h)

```c
struct MsgPort {
    struct Node mp_Node;      // +0
    UBYTE mp_Flags;           // +14 (PA_SIGNAL = 0x01)
    UBYTE mp_SigBit;          // +15 (Signal bit number 0-31)
    struct Task *mp_SigTask;  // +16 (Task to signal)
    struct List mp_MsgList;   // +20
} // Size: 34 bytes
```

### Signal Bit Allocation Flow

1. **Door creates reply port (native AEDoor.library)**:
   - Calls Exec AllocSignal(-1) → gets bit 16
   - Writes 16 to mp_SigBit (portAddr + 15)
   - Creates lightweight port (mp_Flags = 0, no PA_SIGNAL)

2. **BBS sends reply via PutMsg**:
   - Detects lightweight port needs upgrade
   - Sets PA_SIGNAL flag
   - **MUST read existing sigBit from portAddr + 15**
   - Calls Signal(task, 1 << existingSigBit)

3. **Door waits for reply**:
   - Calls Wait(1 << 16) = Wait(0x10000)
   - When Signal(task, 0x10000) is called, Wait() returns

## Related Bugs Fixed Previously

1. **PA_SIGNAL flag not set** (previous session):
   - Lightweight ports created via createLightweightPort() had mp_Flags=0
   - PutMsg wouldn't call Signal() without PA_SIGNAL
   - Fixed by upgrading ports in PutMsg when used as reply ports

## Impact

This fix enables ALL XIM doors to work correctly. Without it, any door that:
- Creates a reply port via AEDoor.library
- Calls Wait() after sending XIM messages
- Expects Signal() from BBS reply

...would hang forever. This includes critical doors like joincnf, Bulls, and likely hundreds of other AmiExpress doors.

## Verification

To verify this fix:

```bash
# Test joincnf door
BBS_DATA_DIR=~/Code/amiexpress-web timeout 15 \
  npx tsx web/backend/src/scripts/run-amiga-door.ts doors/emp_tools/joincnf 1

# Should see complete XIM message sequence in logs/xim-debug.json

# Test Bulls door
BBS_DATA_DIR=~/Code/amiexpress-web timeout 5 \
  npx tsx web/backend/src/scripts/run-amiga-door.ts doors/emp_tools/Bulls 1

# Should see ASCII art logo and menu
```

## References

- Real Amiga log: `/Documentation/4-Door-Developers/joinconf_j_2_and_j.log`
- AEDoor.library disassembly: `/Documentation/7-Reference Sources/disasm/aedoor.library.COMMENTED.asm`
- exec.library MsgPort docs: NDK 3.2 autodocs
