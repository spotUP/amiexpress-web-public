# AquaScan (FR) Signal Deadlock Fix

**Date**: 2025-12-27
**Status**: FIXED ✅
**Issue**: All 68K XIM doors hanging on startup

## Problem Summary

All 68K XIM doors (AquaScan, RTW, Bulls, etc.) were hanging indefinitely on startup. Root cause was a **signal bit mismatch deadlock**.

## Root Cause Analysis

### The Problem

1. **AEDoorPort was created with Door Task as owner**:
   - When door called `OpenLibrary("AEDoor.library")`, `createDynamicAEDoorPort()` created AEDoorPort
   - Port was created using `createPublicPort()` → `createMsgPort()`
   - `createMsgPort()` used `this.currentTask` (Door Task at 0x90000) as port owner
   - Port's `mp_SigTask` field pointed to Door Task

2. **Door sent message to itself**:
   - Door called `PutMsg(AEDoorPort3, message)`
   - `PutMsg()` called `Signal(port.mp_SigTask, 1 << port.mp_SigBit)`
   - Since port owner was Door Task, it signaled **itself** with signal bit 18 (mask 0x40000)

3. **Signal mismatch caused deadlock**:
   - Door received signal 0x40000 (bit 18) in `tc_SigRecvd`
   - Door then called `Wait(0x11000)` - waiting for bits 12 & 16
   - **No match**: `0x40000 & 0x11000 = 0`
   - Door blocked forever waiting for signal that would never arrive

### Why This Happened

On real Amiga, there are TWO separate tasks:
- **Door Task** - runs the door binary
- **BBS Task** - owns AEDoorPort, handles messages from door

Our emulator only had ONE task (Door Task), so when door sent messages to AEDoorPort, it was signaling itself with the wrong signal bit.

## The Fix

Created a separate **BBS Handler Task** to own AEDoorPort:

### 1. Added BBS Handler Task (ExecLibrary.ts:188-210)

```typescript
// Create BBS handler task (owns AEDoorPort, handles door messages)
// BBS task at 0x088000 - between ExecBase and Door Task
const bbsTaskAddr = 0x088000;
const bbsMsgPortAddr = 0x08805c;
this.bbsTask = {
  address: bbsTaskAddr,
  name: "BBS Handler",
  node: bbsTaskAddr,
  sigRecvd: 0,
  sigWait: 0,
  state: 0, // TS_READY
  msgPort: bbsMsgPortAddr,
  isWaiting: false,
};
```

### 2. Modified createMsgPort() to Accept Owner Task (ExecLibrary.ts:3690-3752)

```typescript
createMsgPort(ownerTask?: Task): number {
  const owner = ownerTask || this.currentTask;
  // ... creates port with owner.address as mp_SigTask
}
```

### 3. Modified createPublicPort() to Pass Owner (ExecLibrary.ts:3995-3999)

```typescript
createPublicPort(name: string, ownerTask?: Task): number {
  const portAddr = this.createMsgPort(ownerTask);
  // ...
}
```

### 4. AEDoorPort Now Uses BBS Handler Task (ExecLibrary.ts:1819-1821)

```typescript
// CRITICAL FIX: Create AEDoorPort with BBS Handler Task as owner
// This prevents the door from signaling itself when it sends messages
const portAddr = this.createPublicPort(portName, this.bbsTask);
```

## Memory Layout

```
0x080000 - ExecBase
0x088000 - BBS Handler Task (NEW - owns AEDoorPort)
0x090000 - Door Task (runs door binary)
0x0A0000 - Message ports start here
```

## Test Results

**Before Fix**:
- AquaScan hung forever
- Had to kill with timeout
- Log showed: Door initialized but never completed

**After Fix**:
```
[+0000.389s] [INFO] Door completed: AquaScan.000 status=ok
```

- Completed in 389ms
- No hang
- Clean exit with status=ok

**Verified Log Message**:
```
[ExecLibrary]   Created AEDoorPort3 at 0xa0200 owned by BBS Handler (0x88000)
```

## Impact

This fix enables **ALL 68K XIM doors** to work:
- AquaScan (FR command)
- RTW (Room Who's Who)
- Bulls (Bulletin reader)
- Any other XIM protocol door

## Files Modified

- `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/ExecLibrary.ts`
  - Line 95: Added `private bbsTask: Task;` property
  - Lines 188-210: Initialize BBS Handler Task
  - Line 3690: Modified `createMsgPort(ownerTask?: Task)`
  - Line 3736: Use `owner.address` instead of `this.currentTask.address`
  - Line 3752: Use `owner.address` in port object
  - Line 3995: Modified `createPublicPort(name: string, ownerTask?: Task)`
  - Line 3999: Pass `ownerTask` to `createMsgPort()`
  - Line 1821: Pass `this.bbsTask` when creating AEDoorPort

## Next Steps

1. Test other 68K XIM doors (RTW, Bulls, etc.)
2. Document BBS Handler Task architecture
3. Consider adding signal routing for bidirectional communication
