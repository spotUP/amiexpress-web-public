# Session 2025-10-31: Critical Discovery - A1 Register Corruption

## Major Breakthrough

**Found the smoking gun!** The door's polling loop at PC=0x1156 is reading from **A1=0x1** (essentially NULL), which is part of the exception vector table. This is clearly wrong and explains the entire crash sequence.

---

## The Polling Loop Analyzed

### Code at PC=0x1156:
```
0x1156: MOVE.B (A1),D0     ; Read byte from address in A1
0x115c: DBRA D0,-10        ; Decrement and branch
```

### What We Discovered:
```
[1100] PC=0x1156, A1=0x1
Memory at (A1=0x1): 0xf0
Door is reading this byte, expecting it to change
```

**The door is polling memory address 0x1, which contains 0xf0 (part of exception vector).**

This byte will NEVER change because it's static exception vector data, so the door loops 65,535 times (D0=0xffff) until timeout, then crashes with corrupted state.

---

## Why A1=0x1 is Wrong

A1 should point to one of:
1. **Message port mp_SigRecvd byte** - Task checks if signals received
2. **Task structure tc_SigRecvd field** - Which signals are set
3. **Shared memory flag** - Communication with BBS
4. **Hardware register** - But we're not emulating hardware

**Root Cause:** A1 was never properly initialized by our setup code, or was corrupted during door initialization.

---

## The Complete Failure Chain

1. Door starts execution normally
2. Opens dos.library ✅
3. Allocates memory ✅  
4. Enters polling loop at PC=0x1156
5. **A1=0x1 (WRONG!)** - Should point to valid structure
6. Reads byte at address 0x1 (gets 0xf0)
7. Loops 65,535 times waiting for byte to change
8. Byte never changes (it's static exception vector data)
9. Loop times out, D0 decrements to 0x27
10. Door tries to continue but state is corrupted
11. Jumps to invalid address 0x10226 (ExecBase + offset)
12. Executes garbage memory for 58,000 iterations
13. SP corrupts to 0
14. Final crash

---

## What We Implemented (But Door Didn't Reach)

✅ Wait() function - LVO -318
✅ Signal() function - LVO -324

These are correctly implemented but the door crashes BEFORE reaching any library calls that would use them. The door is stuck in a manual polling loop with a corrupted A1 register.

---

## Next Steps

The real fix is NOT Wait()/Signal() (though those are good to have). The real fix is:

### Priority 1: Fix A1 Register Initialization

Find where A1 should be set and what it should point to:

1. **Check door startup code** - What does door expect in A1?
2. **Check if A1 should point to task structure** - tc_SigRecvd at specific offset
3. **Check if we're missing task structure initialization**
4. **Verify all registers are properly set before door starts**

### Priority 2: Analyze Door Binary

Disassemble the area before PC=0x1156 to see where A1 gets set:
```bash
# Check code before the polling loop
xxd -s $((0x1140 - 0x1000)) -l 32 GetAnswer
```

Look for instructions that load A1 (LEA, MOVEA, etc.)

### Priority 3: Check Task Structure

Our task structure at 0x70000 might be missing fields:
- tc_SigWait - Signals task is waiting for
- tc_SigRecvd - Signals received
- tc_SigAlloc - Allocated signal bits

Door might expect A1 to point to tc_SigRecvd field.

---

## Files Modified This Session

1. **ExecLibrary.ts**: Added wait() and signal() functions
2. **LibraryTraps.ts**: Added Wait and Signal vector handlers  
3. **AmigaDoorSession.ts**: Enhanced logging to show A1 register

---

## Key Insight

The door doesn't need Wait()/Signal() library calls - it's using manual polling. But it's polling the WRONG memory address because A1 is corrupted/uninitialized.

**Fix A1, fix the crash.**

---

## Test Results

Door still crashes at same location:
- Iteration 1165: Jump to 0x10226
- Iteration 60000: PC=0x3683af, SP=0x0

Wait() and Signal() vectors installed but never called.

---

## Conclusion

Implementing Wait()/Signal() was necessary for completeness but doesn't fix THIS door's issue. GetAnswer uses manual polling, and A1=0x1 is the bug.

**Next session: Find where A1 should be initialized and fix it.**

---

## UPDATE: Message Passing Breakthrough!

**Date**: 2025-10-31 (continued)

### Major Discovery: Message Infrastructure Works!

**Startup message successfully sent and received!**

```
[AmigaDoorSession] === SENDING STARTUP MESSAGE TO DOOR ===
[AmigaDoorSession] Target port: AEDoorPort0 at 0xa0000
[AmigaDoorSession] Allocated startup message at 0x80014
[ExecLibrary] PutMsg(port=0xa0000, msg=0x80014)

[ExecLibrary] GetMsg(port=0xa0000)
[ExecLibrary]   Returning message at 0x80014, 0 remaining
[AmigaDoorSession] *** DOOR MESSAGE RECEIVED! ***
```

**The message passing WORKS!** PutMsg/GetMsg are functional!

### The Protocol Misunderstanding

However, we discovered we had the XIM protocol backwards:

**WRONG Understanding**:
- BBS sends startup message TO door
- Door receives and starts communication

**CORRECT Protocol (express.e)**:
- **Door sends FIRST** message to BBS (via AEDoorPort)
- **BBS receives and replies** (via door's reply port)
- Loop continues with door initiating requests

### Why Our Test Seemed To Work

We saw "message received" but it was **US receiving OUR OWN message**!

The flow:
1. We: PutMsg(AEDoorPort, startupMsg)
2. Door: GetMsg(AEDoorPort) - returns it
3. **Our processDoorMessages()**: GetMsg(AEDoorPort) - steals it!
4. We process our own message
5. Door never sees it in its code flow

### The Real Problem

Line 1199 in AmigaDoorSession.ts:
```typescript
const msgAddr = this.execLibrary.getMsg(this.doorPortAddress);
```

**We're consuming messages FROM AEDoorPort that the door is trying to send TO us!**

Every 10 iterations (line 870), our code calls GetMsg() on AEDoorPort, stealing any messages the door put there before the door's processing completes.

### Solution Options

**Option 1**: Remove processDoorMessages() interference
- Let door send first message naturally
- Process when PutMsg() trap fires (don't poll)
- Reply back to door's port

**Option 2**: Send to correct port
- Find door's reply port (door creates it, not us)
- Send startup message there
- Door's GetMsg() on ITS port will retrieve it

**Option 3**: Disable polling, use trap interception
- Don't call GetMsg() from our side at all
- Intercept PutMsg() trap when door sends to us
- Process message in trap handler
- Queue reply to door's port

### Status

✅ HunkLoader completely fixed
✅ PutMsg/GetMsg working perfectly
✅ Message structure correct
✅ Reply mechanism functional
❌ Protocol direction wrong
⏭️ **One fix away from full XIM communication!**

### Next Session

1. Comment out processDoorMessages() polling
2. Let door naturally send first message
3. Process it via PutMsg() trap interception
4. Reply to door's port
5. Observe full request/reply cycle

**We're incredibly close to success!**
