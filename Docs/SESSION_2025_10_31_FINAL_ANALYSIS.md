# Session 2025-10-31: Final Analysis - Delay vs Polling Loops

## Critical Clarification: Two Different Loops

### Loop 1: Delay Loop (PC=0x113c) ✅

**Characteristics**:
- DBRA instruction with D0 = 0xdeadbeec (3.7 billion iterations)
- Pure busy-wait, NO library calls
- Intentional delay for initialization timing
- **Our fix**: Reduce D0 to 100 iterations
- **Result**: Loop completes in milliseconds instead of minutes

### Loop 2: Polling Loop (PC=0x1156) ❌

**Characteristics**:
- Calls GetMsg(AEDoorPort0) every ~10 iterations
- D0 = 0xffff (65,535) as retry/timeout counter
- Waiting for MESSAGE from BBS
- **NOT a delay loop** - actively polling for IPC
- **Current behavior**: Times out after 65K iterations, crashes

## Evidence: GetMsg() Calls During "Loop 2"

```
[1001] PC=0x1156, opcode=0x11b1 (MOVE.B (A1),D0)
[1009] PC=0x1156, opcode=0x11b1
[ExecLibrary] GetMsg(port=0xa0000)  <-- CALLED HERE
[1010] PC=0x115c, opcode=0x51ca (DBRA)
[1019] PC=0x1156, opcode=0x11b1
[ExecLibrary] GetMsg(port=0xa0000)  <-- CALLED AGAIN
```

**GetMsg() called every ~10 iterations** = This is a **polling loop**, not a delay loop!

## XIM Protocol Mismatch

### Expected (from express.e lines 4364-4373)

```e
// BBS side:
WHILE(exit=FALSE)
  signals:=Wait(ximSig)      // WAIT for door to signal
  WHILE(msg:=GetMsg(mp))     // GET message FROM door
    processXimMsg(...)       // PROCESS door request
    ReplyMsg(msg)            // REPLY to door
  ENDWHILE
ENDWHILE
```

**Protocol**: Door sends FIRST, BBS waits and replies

### Actual (observed in MultiTop/GetAnswer)

```
// Door side:
Loop {
  msg = GetMsg(AEDoorPort0)  // WAIT for message FROM BBS
  if (msg != NULL) break
  retries--
}
```

**Behavior**: Door waits for FIRST message from BBS

## Root Cause

**Deadlock**:
- Door polls GetMsg() waiting for BBS message
- BBS (express.e) waits for door message
- Neither sends first
- Door times out after 65,535 iterations
- Door crashes jumping to invalid address

## Solution: Send Startup Message

The door expects an initial message to trigger communication. Once received:
1. Door exits polling loop
2. Door enters normal request/reply cycle
3. Door sends PutMsg() with JH_WRITE, JH_PM, etc.
4. BBS receives and replies
5. Full XIM protocol works

## Implementation

```typescript
// In AmigaDoorSession.ts
// Detect polling loop entry
if (this.iterationCount === 1000 && pc === 0x1156) {
  console.log('[AmigaDoorSession] Door polling for startup message');

  // Send initial message
  const msgAddr = this.allocateMessage();
  this.writeMessage(msgAddr, {
    command: 0,  // Startup/init command
    data: this.nodeId,
    string: ""
  });

  this.execLibrary.putMsg(0xa0000, msgAddr);
  console.log('[AmigaDoorSession] Startup message sent');
}
```

## Recommendation

**Send startup message when door enters polling loop.**

This unblocks door execution and allows testing of full XIM protocol.

## References

- express.e runDoor: lines 4231-4450
- express.e XIM loop: lines 4364-4373
- GetMsg() polling evidence: test-multitop.js output
- vAmiga sources: `/Docs/vAmiga/`

## Status

✅ HunkLoader fixed and tested
✅ Both doors load completely
✅ Delay loop vs polling loop clarified
✅ Root cause identified (missing startup message)
⏭️ Next: Implement startup message send
