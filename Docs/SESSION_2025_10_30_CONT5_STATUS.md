# Session 2025-10-30 Continuation 5: Door Communication Analysis

## Current Status

**Progress Made:**
- ✅ First delay loop fixed (3.7B iterations → 100)
- ✅ Second "loop" at PC=0x1156 completes naturally after ~1000 iterations
- ✅ Door progresses past initialization
- ✅ Door opens dos.library successfully
- ✅ Door finds AEDoorPort0 at 0xa0000
- ✅ Test passes (all 5 library trap messages detected)

**Current Problem:**
- ❌ Door ends up at invalid PC=0x3683af (beyond code range)
- ❌ Door never opens AEDoor.library or intuition.library
- ❌ Door never sends any messages via PutMsg()
- ❌ Door never enters proper communication loop

---

## Key Findings

### GetAnswer Door Type

From GetAnswer.doc:
> "This is a useful door so sysops and cosysops can look on new user's answers, just install as a XIM-door."

**GetAnswer is a DOORTYPE_XIM door** that communicates via direct message ports.

### Libraries Referenced

```bash
$ strings GetAnswer
dos.library
AEDoorPort
intuition.library
```

GetAnswer does NOT use AEDoor.library - it uses low-level message ports directly.

### Library Calls Made

Door execution shows:
1. SetTaskPri() - called twice
2. OpenLibrary("dos.library", 0) - success, returned 0x20000
3. AllocMem(12296, 0x10001) - success, returned 0x8000c

**No other library calls observed.**

### Final State

```
[AmigaDoorSession] Iteration 60000: 590.0M cycles, 73.75s virtual time, PC=0x3683af
[AmigaDoorSession] Door appears stuck in loop - likely waiting for message port I/O
```

PC=0x3683af is **invalid** - code segments end around 0x3000.

---

## Analysis

### Why PC=0x3683af is Invalid

The door's code segments are:
- Segment 0: 0x1000-0x2ba4 (CODE, 7076 bytes)
- Segment 1: 0x2c00-0x2e54 (DATA, 596 bytes)

PC=0x3683af is **3.4 MB beyond the code!** This suggests:

1. **Bad pointer dereference** - Door jumped through NULL or garbage pointer
2. **A6 register issue** - A6=0 when door tried indirect library call via JSR (offset,A6)
3. **Missing library** - Door tried to call unimplemented library function
4. **Stack corruption** - RTS popped garbage return address from stack

### A6 Register State

Throughout execution after first delay loop:
```
A6: 0x0
```

A6 was intentionally cleared by the door (saved/restored from stack). This is normal for some code patterns, but means the door **cannot use A6-relative library calls** after this point.

If the door tries `JSR (offset,A6)` with A6=0, it would jump to a small offset address, NOT 0x3683af. So this is NOT a direct A6 issue.

### Possible Root Causes

**Theory 1: Missing Library Function**
- Door tries to call a library function we haven't implemented
- Function stub returns garbage or doesn't set PC correctly
- Door jumps to invalid address

**Theory 2: Wait/Signal Mechanism**
- Door expects to use Wait() on signal bits
- We haven't implemented Wait() or signal handling
- Door times out or crashes waiting

**Theory 3: Intuition.library Requirement**
- Door tries to open intuition.library (we saw string reference)
- OpenLibrary fails (returns 0) because we don't have intuition
- Door tries to use it anyway → crash

**Theory 4: Message Port State**
- Door expects specific port state (signal bits, task pointers, etc.)
- Our createPublicPort() doesn't initialize everything correctly
- Door's port operations fail or behave incorrectly

---

## XIM Door Communication Protocol

From express.e lines 4352-4370, XIM door protocol:

**BBS Side (express.e):**
```e
IF type=DOORTYPE_XIM
  WHILE(exit=FALSE)
    signals:=Wait(ximSig)           <- Wait for signal from port
    WHILE(msg:=GetMsg(mp))          <- Get message FROM door
      msgcmd:=msg.command
      processXimMsg(msgcmd,msg,...)  <- Process door's request
      ReplyMsg(msg)                  <- Reply to door
    ENDWHILE
  ENDWHILE
```

**Door Side (typical XIM pattern):**
```e
port = FindPort("AEDoorPortN")
IF port = 0 THEN port = CreateMsgPort("AEDoorPortN")

msg = AllocMem(SIZEOF Message + extra)
msg.mn_ReplyPort = myReplyPort
msg.command = JH_REGISTER
PutMsg(port, msg)
WaitPort(myReplyPort)              <- Wait for BBS reply
reply = GetMsg(myReplyPort)
```

**Key Insight:** The door should SEND a message first (like JH_REGISTER), then wait for the BBS to reply!

---

## Why Our Door Isn't Sending Messages

GetAnswer opens dos.library, allocates memory, but then:
1. Never creates its own reply port
2. Never allocates a message structure
3. Never calls PutMsg()
4. Never reaches any communication code

**This suggests the door crashes BEFORE reaching its message-sending code.**

---

## Second Loop at PC=0x1156 Analysis

Initially thought this was a delay loop, but:
- D0 starts at 0xffff (65,535)
- Opcode 0x11b1 is `MOVE.B` (not a loop instruction like DBRA)
- Loop completes naturally after ~1000 iterations
- Door progresses to PC=0x115c after loop

**This was likely a polling/retry loop**, possibly:
- Waiting for a resource to become available
- Retrying a failed operation
- Initializing hardware/system state

Removing the "fix" for this loop made no difference - door still progresses past it naturally.

---

## Next Steps

### Immediate Investigation Needed

1. **Add detailed PC tracking** around where door jumps to 0x3683af
   - Log every instruction from PC=0x1000 to crash
   - Identify exact instruction that causes bad jump
   - Check what that instruction is trying to do

2. **Check for missing library functions**
   - Door might call a library function we haven't trapped
   - Add logging for ALL JSR instructions to library space (0xf00000+)
   - Verify all Exec.library functions door needs are implemented

3. **Implement Wait() and signal handling**
   - Doors typically use Wait() to block on port signals
   - Our message ports have signal bits but no Wait() implementation
   - Add Wait() to ExecLibrary with proper signal handling

4. **Test with simpler door**
   - GetAnswer might be complex or buggy
   - Try with example.e from AEDOORS (uses AEDoor.library)
   - Compare execution patterns

### Implementation Tasks

1. **Add Wait() library function:**
   ```typescript
   wait(signalMask: number): number {
     // Block until one of the signal bits in mask is set
     // Return which signals were received
     // For now, return immediately with mask (non-blocking)
     console.log(`[ExecLibrary] Wait(0x${signalMask.toString(16)})`);
     return signalMask;  // Fake success
   }
   ```

2. **Add Signal() library function:**
   ```typescript
   signal(task: number, signals: number): void {
     // Set signal bits on a task
     console.log(`[ExecLibrary] Signal(task=0x${task.toString(16)}, signals=0x${signals.toString(16)})`);
   }
   ```

3. **Improve MsgPort structure:**
   ```typescript
   // Add to createPublicPort():
   this.emulator.write16(portAddr + 8, 0x04);  // NT_MSGPORT
   this.emulator.write8(portAddr + 9, 0);       // priority
   this.emulator.write32(portAddr + 10, 0);     // name pointer (set later)
   this.emulator.write8(portAddr + 14, PA_SIGNAL);  // flags
   this.emulator.write8(portAddr + 15, sigBit);     // sigBit
   this.emulator.write32(portAddr + 16, taskAddr);  // sigTask
   ```

4. **Add comprehensive logging:**
   ```typescript
   // Log EVERY instruction around crash point
   if (this.iterationCount >= 59900 && this.iterationCount <= 60100) {
     console.log(`[${this.iterationCount}] PC=0x${tracePc.toString(16)}, ` +
                 `opcode=0x${opcode.toString(16)}, ` +
                 `A6=0x${a6.toString(16)}, ` +
                 `SP=0x${sp.toString(16)}`);
   }
   ```

---

## Questions to Answer

1. **What instruction causes the jump to 0x3683af?**
   - Need detailed instruction log before crash

2. **Is the door trying to call a library function we haven't implemented?**
   - Check for JSR to unmapped addresses

3. **Does GetAnswer actually work on real AmiExpress?**
   - Maybe the door binary is corrupt or incompatible

4. **What does PC=0x3683af actually point to in memory?**
   - Is there valid code there?
   - Is it random garbage?
   - Is it part of our ROM or data?

---

## Code Changes This Session

### Removed Second Loop "Fix"

`AmigaDoorSession.ts` lines 427-429:
```typescript
// NOTE: Removed second loop detection at PC=0x1156
// This was NOT a delay loop but rather a polling/retry loop
// The door needs to run this naturally to complete initialization
```

The door completes this loop naturally in ~1000 iterations. No acceleration needed.

---

## Files to Reference

- **Express.e door handling**: Lines 4300-4450 (door execution flow)
- **Express.e XIM processing**: Lines 4352-4370 (XIM message loop)
- **Express.e message handling**: Lines 3370-3500 (processXimMsg)
- **AEDoor.doc**: Full AEDoor.library API documentation
- **example.e**: Working door source using AEDoor.library
- **GetAnswer binary**: ~/Code/amiexpress-web/doors/GetAnswer/GetAnswer

---

## Conclusion

The door successfully completes initialization but crashes before reaching message communication code. The crash occurs at iteration 60000 with PC jumping to invalid address 0x3683af.

**Root cause unknown** - needs detailed instruction-level debugging to identify what causes the jump.

**Next session should focus on:**
1. Adding comprehensive logging around iteration 59000-60000
2. Identifying the exact instruction that causes bad jump
3. Implementing missing library functions (Wait, Signal)
4. Testing with a simpler, known-working door

The delay loop fixes are working correctly. The issue is now in the door's main execution logic, not initialization.
