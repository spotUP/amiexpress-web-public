# GA Door A1 Register Fix - Progress Report

**Date:** 2025-10-31
**Status:** PARTIAL SUCCESS - Door now initializes correctly but stuck in signal polling loop

## Problem Solved

### Original Issue
Door was stuck in infinite loop or failing to execute properly. Root cause analysis revealed:
- Register A1 was not initialized before door execution
- A1 should point to end of DATA segment for C runtime BSS initialization
- Without proper A1, door's startup code would fail or loop infinitely

### Solution Implemented
Modified `AmigaDoorSession.ts` loadDoor() method to initialize A1:

```typescript
// CRITICAL FIX: Initialize A1 for C runtime BSS initialization
const dataSegment = hunkFile.segments.find(s => s.type === SegmentType.DATA);
if (dataSegment) {
  const dataEnd = dataSegment.address + dataSegment.size;
  this.emulator.setRegister(9, dataEnd);  // A1 = end of DATA segment
  console.log(`  A1 (DATA segment end): 0x${dataEnd.toString(16)}`);
}
```

**For GetAnswer door:**
- DATA segment: 0x2C00 to 0x2E54 (596 bytes)
- A1 set to: 0x2E54

### Results
✅ Door now progresses past initialization code
✅ No more infinite loops at startup
✅ Door reaches main polling loop at PC=0x1156
✅ Startup message is sent successfully via PutMsg()

## New Issue Discovered

### Current Behavior
Door is now stuck in a **signal polling loop** at PC=0x1156:

```
Instruction: MOVE.B ($2000,A1), D0
Where: A1 = 0x1
Effective Address: 0x2001
```

The door repeatedly reads byte at memory address 0x2001, expecting it to change when a message arrives.

### Root Cause
**The door uses Signal-based synchronization, not direct GetMsg() polling:**

1. Door calls WaitPort() or Wait() on a signal mask
2. When message is posted via PutMsg(), the system should:
   - Signal the waiting task
   - Update the task's signal mask in memory
   - Door detects signal by reading memory at 0x2001

3. Our current implementation:
   - ✅ PutMsg() adds message to port's message list
   - ❌ PutMsg() does NOT signal the waiting task
   - ❌ Memory at 0x2001 never changes
   - ❌ Door loops forever

### Classic Amiga Signal Mechanism
From Amiga OS documentation:
- Each MsgPort has a signal bit (mp_SigBit) and task (mp_SigTask)
- When message arrives, Exec calls `Signal(mp_SigTask, 1 << mp_SigBit)`
- Task's signal mask is updated in its task structure
- Door reads task signal mask from memory to detect arrival

## Next Steps to Fix

### 1. Implement Signal Delivery in PutMsg()
```typescript
// In ExecLibrary.ts PutMsg():
PutMsg(portAddr: number, msgAddr: number): void {
  // ... existing code to add message to list ...

  // NEW: Signal the waiting task
  const sigTask = this.emulator.readMemory32(portAddr + OFFSET_MP_SIGTASK);
  const sigBit = this.emulator.readMemory(portAddr + OFFSET_MP_SIGBIT);

  if (sigTask !== 0 && sigBit !== 0) {
    const signalMask = 1 << sigBit;
    this.Signal(sigTask, signalMask);
  }
}
```

### 2. Implement Signal() System Call
```typescript
Signal(taskAddr: number, signalMask: number): void {
  // Read current signal mask
  const currentSignals = this.emulator.readMemory32(taskAddr + OFFSET_TC_SIGRECVD);

  // Set the signal bit
  const newSignals = currentSignals | signalMask;
  this.emulator.writeMemory32(taskAddr + OFFSET_TC_SIGRECVD, newSignals);

  console.log(`[ExecLibrary] Signal(task=0x${taskAddr.toString(16)}, mask=0x${signalMask.toString(16)})`);
}
```

### 3. Ensure Task Structure is at Known Location
The door reads from 0x2001, which suggests:
- Task structure might be at 0x2000
- Or tc_SigRecvd field is at offset 0x01 within task structure
- Need to verify ExecLibrary creates task at expected address

### 4. Verify Signal Bit Configuration
Check that AEDoorPort0 has:
- mp_SigTask pointing to door's task
- mp_SigBit set to valid signal number (1-31)

## Testing Plan

1. Add Signal() implementation to ExecLibrary
2. Modify PutMsg() to call Signal() when message arrives
3. Verify task structure location matches door's expectations
4. Run test-ga-command.js and monitor:
   - Memory at 0x2001 changing
   - Door exiting polling loop
   - Door calling GetMsg()
   - XIM output appearing

## Files Modified

### `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
- Added A1 register initialization in loadDoor()
- Added import for SegmentType enum

**Lines changed:** ~340-355

## References

- **Amiga ROM Kernel Reference Manual** - MsgPort and Signal documentation
- **Classic Amiga BBS Source Code** - How doors poll for messages
- **express.e** - Original AmiExpress door handling code
- **vAmiga sources** - Reference Amiga emulator implementation

## Conclusion

Setting A1 to the DATA segment end was the correct fix for door initialization. The door now starts properly but needs Signal() implementation to receive messages and produce output.

**Estimated completion:** 1-2 hours to implement Signal mechanism and test.
