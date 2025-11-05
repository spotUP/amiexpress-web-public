# Session 2025-10-31: WaitPort Breakthrough Discovery

## Summary

**MAJOR BREAKTHROUGH**: Discovered the real cause of door polling loop timeout - door is calling **WaitPort()** with an invalid port address!

## Investigation Approach

After reverting the D2=0xFFFF manipulation (which was forcing premature timeout), we implemented comprehensive monitoring:

1. **Memory change detection** - Monitor address 0x2001 for changes
2. **Library call monitoring** - Track all library calls during polling loop
3. **Natural loop execution** - Let timeout mechanism run naturally

## Key Findings

### Library Calls During Polling Loop

Door is calling these library functions repeatedly:

```
Iteration 8133:  GetMsg(port=0x7500002f)      - First call
Iteration 8857:  WaitPort(port=0x7500002f)    - Port not found!
Iteration 9581:  WaitPort(port=0x7500002f)    - Port not found!
Iteration 10305: WaitPort(port=0x7500002f)    - Port not found!
Iteration 11029: WaitPort(port=0x7500002f)    - Port not found!
Iteration 11753: WaitPort(port=0x7500002f)    - Port not found!
Iteration 12477: WaitPort(port=0x7500002f)    - Port not found!
```

### The Root Cause

**WaitPort() is failing with "Port not found: 0x7500002f"**

The port address `0x7500002f` is clearly invalid (garbage value). This indicates:

1. Door is trying to wait for a message port
2. The port address it's using is corrupted or uninitialized
3. WaitPort() fails because the port doesn't exist
4. Door falls back to timeout loop (the PC=0x1156 polling we've been seeing)

## Memory Monitoring Results

- **NO memory changes detected at address 0x2001**
- The memory read in the polling loop (MOVE.B ($2000,A1),D0) is immediately overwritten
- Memory value is irrelevant to loop exit - it's a red herring!

## What Door Is Actually Waiting For

The door expects:

1. Valid AEDoorPort message port to be set up
2. Startup message to arrive at that port
3. Wait/Port() to succeed and return the message
4. If WaitPort fails → Fall back to timeout polling loop

## Next Steps

### Immediate Fix

Check where we create the AEDoorPort and verify:

1. Port address is valid
2. Port is properly registered with Exec
3. Door receives correct port address
4. WaitPort() can find the port

### Files to Investigate

- `ExecLibrary.ts` - WaitPort() implementation (lines 1033-1065)
- `AmigaDoorSession.ts` - AEDoorPort creation
- `AEDoorLibrary.ts` - How door gets port address

### Root Cause Hypothesis

The door is likely getting the port address from:
- CreateComm() return value, OR
- Global variable/memory location, OR
- Environment variable

We need to trace where `0x7500002f` comes from and why it's invalid.

## Code Changes Made

### AmigaDoorSession.ts

**Removed D2 manipulation** (lines 791-801):
```typescript
// REMOVED: Setting D2=0xFFFF to force loop exit
// This was the wrong approach - we need to fix WaitPort instead
```

**Added memory change detection** (lines 48-50, 819-829):
```typescript
private lastMemoryValue: number = 0;
private memoryChangeCount: number = 0;

// Detect memory changes at 0x2001
if (byteRead !== this.lastMemoryValue) {
  this.memoryChangeCount++;
  console.log(`[AmigaDoorSession] *** MEMORY CHANGE DETECTED ***`);
  // ... logging
}
```

**Added library call monitoring** (lines 52-53, 236-247):
```typescript
private libraryCallsInLoop: number = 0;

this.libraryTraps.setLibraryCallMonitor((functionName: string, pc: number) => {
  if (this.startupMessageSent && this.iterationCount >= 1000) {
    this.libraryCallsInLoop++;
    console.log(`[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***`);
    console.log(`[AmigaDoorSession]   Function: ${functionName}`);
    console.log(`[AmigaDoorSession]   PC: 0x${pc.toString(16)}`);
    console.log(`[AmigaDoorSession]   Iteration: ${this.iterationCount}`);
    console.log(`[AmigaDoorSession]   Total calls in loop: ${this.libraryCallsInLoop}`);
  }
});
```

### LibraryTraps.ts

**Added library call monitoring callback** (lines 425-437):
```typescript
private onLibraryCall?: (functionName: string, pc: number) => void;

setLibraryCallMonitor(callback: (functionName: string, pc: number) => void): void {
  this.onLibraryCall = callback;
}

// In handleTrap():
if (this.onLibraryCall) {
  this.onLibraryCall(vector.name, pc);
}
```

## Testing Infrastructure

### Created test-door-natural-fixed.js

Proper puppeteer test that:
- Logs in as sysop
- Executes GA command directly
- Waits 60 seconds for natural completion
- Monitors backend logs for all events

**Key lesson**: Always use puppeteer for BBS testing (not socket.io-client)

Reference implementation: `test-getanswer-door.js`

## Session Statistics

- **Duration**: ~2 hours (continued from previous session)
- **Files modified**: 2 (AmigaDoorSession.ts, LibraryTraps.ts)
- **Lines added**: ~50
- **Tests created**: 1 (test-door-natural-fixed.js)
- **Major discoveries**: 1 (WaitPort failure is root cause)

## Breakthrough Significance

This finding changes everything:

**Before**: "Door is polling at PC=0x1156 for unknown reason"
**After**: "Door falls back to polling because WaitPort(0x7500002f) fails - invalid port address"

Now we know exactly what to fix: Make WaitPort() succeed by ensuring the port exists and door has correct address.

## Related Documentation

- SESSION_2025_10_31_A1_REGISTER_BREAKTHROUGH.md - A1 investigation
- SESSION_2025_10_31_FINAL_SUMMARY.md - Previous session summary
- CRITICAL_RULES.md - vAmiga reference rules
- AEDOOR_IMPLEMENTATION_LOG.md - AEDoor.library implementation

---

**Next Session Priority**: Fix WaitPort() by investigating port creation and address passing.
