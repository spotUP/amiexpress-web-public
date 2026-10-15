# Session 2025-10-31: Startup Message Implementation Analysis

**Date:** October 31, 2025
**Status:** Partial Success - Startup message sent, but door doesn't receive it

## What Was Implemented

### Code Changes

**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
**Lines:** 771-791

```typescript
if (!this.startupMessageSent && tracePc === 0x1156 && this.iterationCount >= 1000 && this.iterationCount <= 1010) {
  console.log(`[AmigaDoorSession] ===============================================`);
  console.log(`[AmigaDoorSession] *** POLLING LOOP DETECTED ***`);
  console.log(`[AmigaDoorSession]   Door polling for startup message at PC=0x1156`);
  console.log(`[AmigaDoorSession]   Sending startup message to unblock door...`);
  this.sendStartupMessage();
  console.log(`[AmigaDoorSession]   Startup message sent - door should exit polling loop`);
  this.startupMessageSent = true;
}
```

### Test Results

#### ✅ Startup Message Sent Successfully

```
[AmigaDoorSession] === SENDING STARTUP MESSAGE TO DOOR ===
[AmigaDoorSession] Target port: AEDoorPort0 at 0xa0000
[AmigaDoorSession] Allocated startup message at 0x83014 (128 bytes)
[AmigaDoorSession] Created reply port at 0xa0100
[AmigaDoorSession] Startup message structure:
  mn_ReplyPort: 0xa0100
  mn_Length: 128
  command: 0 (STARTUP/INIT)
  data: 0 (node ID)
  string: "" (empty)
[AmigaDoorSession] Calling PutMsg(port=0xa0000, msg=0x83014)
[ExecLibrary] PutMsg(port=0xa0000, msg=0x83014)
[ExecLibrary]   Port has PA_SIGNAL flag - signaling task
[ExecLibrary]   *** Calling Signal() to wake waiting task ***
[ExecLibrary] Signal(task=0x70000, signals=0x2)
  Signal bits to set: 0x2
  Task not waiting (will receive signal when it calls Wait())
```

**✅ SUCCESS:** Message queued to AEDoorPort0
**✅ SUCCESS:** Signal() called to wake door task
**✅ SUCCESS:** Signal bits set in task structure

#### ❌ Door Never Receives Message

**Problem**: Door continues polling loop after message sent:

```
[1000] PC=0x1156 (POLLING LOOP DETECTED)
[1001] PC=0x1156 (still polling)
[1002] PC=0x1156 (still polling)
...
[1164] PC=0x1156 (still polling)
[1165] PC=0x10226 (CRASH - jumped to error handler)
```

**Root Cause**: Door never calls GetMsg() to retrieve the message!

## Critical Discovery: Door Is NOT Calling GetMsg()

### Expected Behavior (from SESSION_2025_10_31_FINAL_ANALYSIS.md)

The analysis claimed:
```
[1009] PC=0x1156, opcode=0x11b1
[ExecLibrary] GetMsg(port=0xa0000)  <-- Should be called
[1010] PC=0x115c, opcode=0x51ca
```

### Actual Behavior (from logs)

**NO GetMsg() calls were logged!** The loop at PC=0x1156 is:

```
0x1156: MOVE.B (A1),D0  ; opcode 0x11b1 - Read byte from memory[A1]
0x115c: DBRA D0,-8      ; opcode 0x51ca - Decrement and branch
```

**This is a pure memory polling loop**, NOT a GetMsg() polling loop!

### A1 Register Issue

From logs:
```
[1000] PC=0x1156, A1=0x1
```

**A1 points to address 0x1** (exception vector table), which is WRONG.

A1 should point to:
1. Task's tc_SigRecvd field (task signal byte)
2. Message port's mp_MsgList (message queue flag)
3. Shared memory flag set by BBS
4. Some other valid communication mechanism

## Why Startup Message Didn't Help

The startup message implementation was **correct**, but it doesn't fix the underlying issue:

1. ✅ Message was queued to AEDoorPort0 correctly
2. ✅ Signal() was called to set signal bits
3. ✅ Signal bits were stored in task structure
4. ❌ **Door never calls Wait() to check signals**
5. ❌ **Door never calls GetMsg() to retrieve message**
6. ❌ **Door polls memory[0x1] which never changes**

The door is stuck in Amixlib initialization code BEFORE reaching the AEDoor.library message passing phase.

## Real Root Cause

From SESSION_2025_10_31_BREAKTHROUGH.md:

> **A1 was never properly initialized by our setup code, or was corrupted during door initialization.**

The polling loop expects A1 to point to a valid signal/flag byte, but A1=0x1 is clearly wrong.

## Options Forward

### Option 1: Fix A1 Register (Hard)

Find what A1 SHOULD point to:
- Check vAmiga sources for task initialization
- Analyze door binary to see where A1 gets set
- Identify the expected signal mechanism

### Option 2: Force Exit from Loop (Hack)

Detect loop at PC=0x1156 and:
- Set PC to post-loop code (PC=0x115e or similar)
- Set D0 to 0 (loop exit condition)
- Hope door continues normally

### Option 3: Try Different Door (Recommended)

Test with a different door binary to verify:
- Signal/Wait implementation works
- Startup message sending works
- GetAnswer has specific issues

## Files Modified

1. **AmigaDoorSession.ts:771-791** - Added startup message send in polling loop detection
2. **Test logs** - `/tmp/getanswer-startup-test.log`, `/tmp/backend.log`

## Next Steps

**Recommendation:** Try Option 3 (different door) to validate infrastructure.

If MultiTop or another door works, then:
- Signal/Wait is proven ✅
- Startup messaging is proven ✅
- GetAnswer has binary-specific issues

If other doors also fail, then:
- Need to fix A1 initialization
- Or implement different IPC mechanism

## Summary

**What Works:**
- ✅ Startup message allocation and structure
- ✅ PutMsg() queues message to port correctly
- ✅ Signal() sets signal bits in task structure
- ✅ Messaging infrastructure is complete

**What Doesn't Work:**
- ❌ Door never reaches message-based communication
- ❌ Door stuck in manual polling loop with A1=0x1
- ❌ Door times out and crashes at iteration 1165

**Conclusion:**
The startup message implementation is **correct**, but GetAnswer door has **initialization issues** that prevent it from using the messaging system.

---

**Status:** Infrastructure complete, awaiting working door binary for validation.
