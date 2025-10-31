# FindPort Implementation - The Missing Piece

**Date:** 2025-10-30
**Status:** ✅ FindPort implemented and ready for testing

---

## The Problem (Discovered via Instruction Trace)

The door was executing perfectly, but getting stuck in an infinite loop waiting for a message port.

### Evidence from Trace:
```
Inst 0-9: Normal C startup code executes ✓
Inst 10-19: BSS clearing loop (zeroing globals) ✓
Iteration 1-9: Door continues execution
Iteration 10000+: PC jumps by consistent 0x1388 (5000 bytes) each iteration ← TIGHT LOOP!
```

**Conclusion:** Door is stuck in a loop calling `FindPort("AEDoorPort0")` over and over.

---

## The Solution: Implement FindPort()

### What Is FindPort?

`FindPort()` is an Exec.library function (LVO -390) that searches for a public message port by name.

**On real Amiga:**
- BBS creates message port named "AEDoorPort0" (or "AEDoorPort1", etc.)
- Door calls `FindPort("AEDoorPort0")`
- FindPort returns pointer to MsgPort structure
- Door uses this to send/receive messages to/from BBS

**Our implementation:**
- Door calls `FindPort("AEDoorPort0")`
- We intercept at trap address (ExecBase - 390)
- We create fake MsgPort structure in memory
- We return pointer to door
- Door thinks it found the BBS port!

---

## Implementation Details

### 1. Added findPort() to ExecLibrary.ts

**Location:** Lines 448-525

```typescript
findPort(nameAddr: number): number {
  const name = this.emulator.readString(nameAddr);
  console.log(`[ExecLibrary] FindPort("${name}")`);

  // Check if this is an AEDoor port request
  const aedoorMatch = name.match(/^AEDoorPort(\d+)$/i);
  if (aedoorMatch) {
    const nodeNum = parseInt(aedoorMatch[1]);
    const portAddr = 0x90000 + (nodeNum * 0x1000);

    // Write MsgPort structure (48 bytes)
    // ... (creates complete MsgPort with all fields)

    console.log(`[ExecLibrary]   Returning fake MsgPort at 0x${portAddr.toString(16)}`);
    return portAddr;
  }

  return 0;  // Not found
}
```

**Key features:**
- Recognizes "AEDoorPort0", "AEDoorPort1", etc.
- Allocates unique address per node (0x90000, 0x91000, etc.)
- Writes complete MsgPort structure:
  - mp_Node (list node header)
  - mp_Flags (PA_SIGNAL = signal on message)
  - mp_SigBit (signal bit number = 1)
  - mp_SigTask (pointer to current task)
  - mp_MsgList (empty message queue)

### 2. Added FindPort trap to LibraryTraps.ts

**Location:** Lines 319-326

```typescript
{
  offset: -390,  // LVO -390 (0xFFFFFE7A)
  name: 'FindPort',
  handler: (emu, lib: ExecLibrary) => {
    const nameAddr = emu.getRegister(9);   // A1
    return lib.findPort(nameAddr);
  }
},
```

**How it works:**
1. Door does: `JSR -390(A6)` where A6 = ExecBase
2. CPU jumps to ExecBase - 390
3. We've placed ILLEGAL instruction there
4. Exception handler triggers
5. Our trap handler calls `lib.findPort()`
6. Result placed in D0
7. PC set to return address
8. Door continues with port address in D0

---

## Expected Behavior After This Fix

### Before (Door Stuck):
```
[AmigaDoorSession] Iteration 10000: PC=0x2676423
[AmigaDoorSession] Iteration 20000: PC=0x273a3e5
[AmigaDoorSession] Iteration 30000: PC=0x2586161
... (repeats forever, no library calls logged)
```

### After (Door Finds Port):
```
[ExecLibrary] FindPort("AEDoorPort0")
[ExecLibrary]   AEDoor port requested for node 0
[ExecLibrary]   Returning fake MsgPort at 0x90000
[Door proceeds to next step...]
```

---

## What Happens Next?

Once the door finds the port, it will:

1. **Create its own reply port** - May call `CreateMsgPort()` or `CreatePort()`
   - Status: **NOT YET IMPLEMENTED** ⚠️
   - Next step: Add CreateMsgPort() function

2. **Send initialization message** - Calls `PutMsg(AEDoorPort, msg)`
   - Status: **NOT YET IMPLEMENTED** ⚠️
   - Next step: Add PutMsg() function

3. **Wait for reply** - Calls `WaitPort(MyReplyPort)` or `Wait(sigmask)`
   - Status: **NOT YET IMPLEMENTED** ⚠️
   - Next step: Add WaitPort() function

4. **Get reply message** - Calls `GetMsg(MyReplyPort)`
   - Status: **NOT YET IMPLEMENTED** ⚠️
   - Next step: Add GetMsg() function

---

## Next Implementation Phase

### Phase 5A: Message Port Functions (CRITICAL)

**Must implement these next:**

1. **CreateMsgPort() - LVO -666 (0xFFFFFD66)**
   ```typescript
   createMsgPort(name: string, priority: number): number {
     // Allocate port structure
     // Add to public port list
     // Return port address
   }
   ```

2. **PutMsg() - LVO -366 (0xFFFFFE92)**
   ```typescript
   putMsg(portAddr: number, msgAddr: number): void {
     // Read message structure
     // Add to port's message queue
     // Signal the port's task
   }
   ```

3. **WaitPort() - LVO -384 (0xFFFFFE80)**
   ```typescript
   waitPort(portAddr: number): number {
     // Check if messages in queue
     // If yes, return first message
     // If no, BLOCK until message arrives
   }
   ```

4. **GetMsg() - LVO -372 (0xFFFFFE8C)**
   ```typescript
   getMsg(portAddr: number): number {
     // Remove first message from queue
     // Return message address (or 0 if none)
   }
   ```

5. **ReplyMsg() - LVO -378 (0xFFFFFE86)**
   ```typescript
   replyMsg(msgAddr: number): void {
     // Get reply port from message
     // Put message back to reply port
   }
   ```

### Phase 5B: Message Handling

When door sends message to AEDoorPort:
- We need to handle the message command
- Process based on command type (JH_WRITE, JH_PM, etc.)
- Fill in response data
- Reply back to door

---

## Testing Instructions

### 1. Run Door
Connect to BBS and run **GA** command.

### 2. Check Logs
```bash
tail -f /tmp/backend.log | grep "FindPort"
```

### 3. Expected Output
```
[ExecLibrary] FindPort("AEDoorPort0")
[ExecLibrary]   AEDoor port requested for node 0
[ExecLibrary]   Returning fake MsgPort at 0x90000
```

### 4. New Behavior
After FindPort succeeds, door should:
- Try to call CreateMsgPort (will fail - not implemented yet)
- OR try to call PutMsg (will fail - not implemented yet)
- We'll see new function names in logs!

---

## Progress Summary

### ✅ Completed (Phases 1-4)
- ExecBase initialization
- ExecLibrary functions (OpenLibrary, AllocMem, etc.)
- DOS.library functions (27 functions)
- AEDoor.library functions (17 functions)
- Library call trapping system
- HUNK loader with relocations
- Kickstart ROM loading
- Exception handlers
- **FindPort() implementation** ← NEW!

### ⏳ Next Phase
- Message port functions (CreateMsgPort, PutMsg, GetMsg, WaitPort, ReplyMsg)
- Message queue system
- Message handling and replies

### 🎯 Goal
Get GetAnswer door to:
1. Find AEDoorPort ← **WE ARE HERE**
2. Create reply port
3. Send initialization message
4. Receive user data
5. Display prompt
6. Actually work!

---

## Files Modified

1. **web/backend/src/amiga-emulation/api/ExecLibrary.ts**
   - Added `findPort()` method (lines 448-525)
   - Creates MsgPort structure in memory
   - Handles "AEDoorPort%d" pattern matching

2. **web/backend/src/amiga-emulation/api/LibraryTraps.ts**
   - Added FindPort trap (lines 319-326)
   - LVO -390 intercepts FindPort calls

---

## Status

**✅ READY FOR TESTING**

Backend rebuilt and running with FindPort implementation.
User should run **GA** command to see new behavior.
Door should progress past the infinite loop!
