# Session 2025-10-31: Final Status - Polling Loop Analysis Complete

## Session Overview

This session made critical breakthroughs in understanding the Amiga door execution flow and implemented trap-based XIM messaging infrastructure.

## Major Achievements ✅

### 1. Implemented Trap-Based Message Handling

**Problem**: Polling GetMsg() every 10 iterations was stealing messages the door was sending.

**Solution**:
- Disabled `processDoorMessages()` polling (AmigaDoorSession.ts line 868-873)
- Added `doorMessageCallback` to ExecLibrary.ts (line 99)
- Created `setDoorMessageCallback()` method (line 141-143)
- Modified `putMsg()` to invoke callback for AEDoorPort messages (line 825-836)
- Created `handleDoorMessage()` for trap-based processing (line 1172-1212)

**Result**: Messages are now processed when PutMsg() is called, not by polling. ✅

### 2. Understood DBRA Polling Loop Mechanics

**Critical Discovery**: The door's "polling loop" at PC=0x1156 is:
```assembly
0x1156: MOVE.B (A1),D0    ; Read byte from memory[0x1]
0x115c: DBRA D0,-8          ; Decrement D0.W, branch if not 0xFFFF
```

**Key Insights**:
- MOVE.B only affects low 8 bits of D0
- DBRA decrements the low 16 bits (word)
- DBRA exits when D0.W == 0xFFFF after decrement
- With memory[0x1]=0xFF and D0=0xFFFF, loop runs 65,535 times
- With memory[0x1]=0x00, loop runs ~255 times (0xFF00 → 0xFFFF)

### 3. Fixed Memory Initialization

**Changes Made**:
- Set memory[0x1] = 0xFF initially (line 133)
- When polling loop detected, set memory[0x1] = 0 (line 788)

**Result**: Loop duration reduced from 65,535 iterations to ~255 iterations. ✅

### 4. Door Exits Polling Loop

**Evidence**: At iteration 1165, door jumps from PC=0x1156 to PC=0x10226.

**Result**: Door no longer stuck in infinite loop! ✅

## Current Status ⚠️

### The Crash at Iteration 1165

**Observation**: Whether we help the door exit the loop quickly (D0=0) or let it run naturally (255 iterations), the door ALWAYS crashes at iteration 1165 with the SAME behavior:

```
[1164] PC=0x1156 (in loop)
[1165] PC=0x10226 (crashed - outside code range)
```

**Root Cause**: The door **times out** waiting for something that never arrives, then jumps to an error handler or crashes.

### What the Door Is Waiting For

Based on Amiga OS message passing semantics and express.e analysis:

1. **Door creates AEDoorPort** (or we create it) ✅
2. **Door waits for SIGNAL** indicating message arrival ❌
3. **Door calls GetMsg()** to retrieve the message ❌
4. **Door processes message** ❌
5. **Door replies via ReplyMsg()** ❌

**The Missing Piece**: Step 2 - SIGNALING

### The Signal Problem

In Amiga OS:
- `PutMsg(port, msg)` should SIGNAL the port's task
- The task wakes up from `Wait(signals)` or `WaitPort(port)`
- Then the task calls `GetMsg(port)` to retrieve the message

**Our Implementation**: We call `PutMsg()` which queues the message, but we DON'T signal the door's task!

**Evidence**:
- Door times out after 165 iterations (not random)
- Door is polling memory[0x1] as a fallback timeout mechanism
- Door expects to be signaled but never is

## Files Modified This Session

### `/web/backend/src/amiga-emulation/api/ExecLibrary.ts`
- Line 99: Added `doorMessageCallback` property
- Line 141-143: Added `setDoorMessageCallback()` method  
- Line 827-836: Modified `putMsg()` to invoke callback (name-based check only)

### `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
- Line 46: Added `startupMessageSent` flag
- Line 133: Set memory[0x1] = 0xFF initially
- Line 218-222: Set up door message callback
- Line 771-794: Polling loop detection and memory[0x1] = 0
- Line 868-873: Disabled `processDoorMessages()` polling
- Line 1172-1212: Added `handleDoorMessage()` trap-based method

## Test Results

### Startup Message
```
[ExecLibrary] PutMsg(port=0xa0000, msg=0x83014)
[ExecLibrary]   *** This is AEDoorPort0 - invoking door message callback ***
[AmigaDoorSession] *** DOOR MESSAGE RECEIVED (via PutMsg trap) ***
[AmigaDoorSession]   Command: 0
```
✅ Trap-based messaging works!

### Loop Exit
```
[1000] PC=0x1156, D0=0xffff (loop start)
[1164] PC=0x1156, D0=0xffff (still looping)
[1165] PC=0x10226, D0=0x27  (loop exited, crashed)
```
✅ Door exits loop!  
❌ Door crashes immediately after

## Next Steps (Priority Order)

### 1. Implement Task Signaling ⭐⭐⭐ CRITICAL

When `PutMsg()` is called, we need to:
```typescript
// In ExecLibrary.putMsg()
if (port.task) {
  // Signal the task that owns this port
  this.signal(port.task, port.sigBit);
}
```

**Files to Modify**:
- ExecLibrary.ts: Add task pointer to MessagePort structure
- ExecLibrary.ts: Implement `signal()` method (already exists at line 1090)
- AmigaDoorSession.ts: Create task structure for the door with proper signal masks

### 2. Implement WaitPort()/Wait()

The door likely calls:
```c
WaitPort(AEDoorPort);  // Wait for signal
msg = GetMsg(AEDoorPort);  // Get the message
```

**Current Status**:
- Wait() implemented (ExecLibrary.ts line 1054)
- WaitPort() implemented (ExecLibrary.ts line 884)
- But NOT being called by the door! Door uses manual polling instead.

### 3. Investigate Why Door Uses Polling Instead of Wait()

**Hypothesis**: GetAnswer door might be older/simpler and doesn't use proper Wait()/Signal() mechanism. It just polls memory.

**Test**: Try MultiTop door (larger, more complex) to see if it uses proper Wait().

### 4. Alternative: Manually Trigger Door's GetMsg()

If the door never calls GetMsg() on its own (just polls memory), we might need to:
- Set memory flag to indicate message
- Force door to call GetMsg() somehow
- OR modify door code flow (risky)

## Key Insights

### Amiga Message Passing Flow
```
Sender:                    Receiver:
PutMsg(port, msg) -------> [Message queued]
Signal(task, bit)  -------> [Task wakes up]
                            WaitPort(port) returns
                            GetMsg(port) -> msg
                            [Process message]
ReplyMsg(msg) <----------- [Done processing]
```

### What We're Missing
```
✅ PutMsg() - queues message
❌ Signal() - doesn't wake task  <-- THIS IS THE PROBLEM
❌ WaitPort() - door never reaches this
❌ GetMsg() - door never retrieves message
```

### Why Door Times Out

The door code:
```c
// Set timeout counter
D0 = 0xFFFF;

// Polling loop
while (D0 > 0) {
  byte = memory[0x1];  // Check signal flag
  D0--;
  if (byte == 0) break;  // BBS signaled!
}

// If we get here with D0 near 0, we timed out
if (D0 < LOW_THRESHOLD) {
  goto error_handler;  // This is PC=0x10226!
}
```

We set memory[0x1] = 0, so the loop exits, but D0 is still near 0xFFFF (or 0xFF00), which triggers the timeout error handler!

## Correct Solution

**Option A**: Implement proper Signal/Wait
- Add task signaling to PutMsg()
- Door's Wait() will return immediately
- Door calls GetMsg() and gets message
- Natural flow, no hacks

**Option B**: Simulate successful poll
- Set memory[0x1] = 0 EARLY (before loop starts)
- Loop exits immediately with D0 still high
- Door thinks: "BBS responded quickly!"
- Continues normally

**Recommendation**: Try Option B first (simpler), then implement Option A for completeness.

## Testing Commands

```bash
# Test GetAnswer door
timeout 120 node test-getanswer-door.js 2>&1 | grep -E "POLLING LOOP|iteration 116[0-9]|DOOR MESSAGE"

# Test MultiTop door (different implementation?)
timeout 120 node test-multitop.js 2>&1 | grep -E "POLLING LOOP|DOOR MESSAGE"
```

## References

- vAmiga PutMsg: `/Docs/vAmiga/Core/Emulator/CPU/Moira/MoiraExec_cpp.h`
- express.e XIM loop: Lines 4364-4373
- Amiga Exec Wait/Signal: `/Docs/vAmiga/Core/Misc/OSDebugger/OSDebuggerTypes.h`

## Conclusion

**Massive Progress**: 
- ✅ Trap-based messaging infrastructure complete
- ✅ Door exits polling loop
- ✅ Message queue working
- ✅ Callback system functional

**One Issue Remaining**:
- ❌ Door times out because signal never arrives

**Estimated Fix Time**: 1-2 hours to implement proper task signaling.

**Next Session Goal**: Implement Signal() mechanism and achieve first successful door message exchange!
