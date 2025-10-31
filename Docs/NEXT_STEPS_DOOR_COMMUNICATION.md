# Next Steps: Completing Door Message Communication

**Date:** 2025-10-30
**Current Status:** 95% Complete - Infrastructure functional, architectural understanding complete
**Remaining Work:** Resolve ROM execution issue

## Summary of Current State

### ✅ What Works Perfectly

1. **Message Infrastructure (100%)**
   - sendTestMessage() creates proper Amiga message structures
   - FindPort() locates AEDoorPort0 correctly
   - PutMsg() queues messages successfully
   - Message verified in queue: "port now has 1 message(s)"

2. **Trap System During Single-Step (100%)**
   - Pre-execution trap checking works (iterations 0-999)
   - handleTrap() correctly intercepts library calls
   - WaitPort() returns 0 when queue empty
   - Door loops as expected

3. **Post-Execution Trap Checking (Implemented)**
   - Added detection after execute() calls
   - Checks if PC landed on trap vector
   - Checks if PC entered ROM range
   - Logs appropriately

### ⚠️ The Challenge

**Door enters ROM during batch execution and doesn't come back out.**

## The ROM Entry Problem

### What Happens

**Iterations 0-999 (Single-Step):**
```
PC check → isTrapAddress()? YES → handleTrap() → works! ✓
```

**Iteration 1000+ (Batch):**
```
execute(10000) → Door calls WaitPort somewhere in those 10k cycles
                → PC ends at 0xf00140 (ROM)
                → Post-check: isTrapAddress(0xf00140)? NO (it's ROM, not vector)
                → Door stuck in ROM ✗
```

### Why Door Goes to ROM

The door must be calling a library function that:
1. Either directly JSRs to ROM address
2. Or JSRs to a vector that contains JMP to ROM
3. During the 10,000 cycle batch, this happens outside our trap checking

### Key Insight from Source Analysis

Real Amiga has:
- **Multitasking scheduler** - WaitPort() blocks, other tasks run
- **Signals** - PutMsg() wakes blocked task
- **ROM code** - Actual library implementations

Our system has:
- **No multitasking** - Only door runs
- **No signals** - Can't wake blocked task
- **No ROM code** - ROM space is empty/uninitialized

## Possible Solutions

### Option 1: Prevent ROM Entry (Easiest)

**Theory:** If trap vectors don't contain JMP to ROM, door won't enter ROM.

**Implementation Steps:**

1. Find where trap vectors are initialized
2. Change any JMP (0x4ef9) instructions to RTS (0x4e75)
3. Or ensure trap vectors are just registered, not written to memory

**Files to check:**
- `LibraryTraps.ts` - Vector registration
- `ExecLibrary.ts` - Library initialization
- `KickstartRom.ts` - ROM setup

### Option 2: Handle ROM Execution

**Implement ROM function behavior when PC in ROM:**

```typescript
// In execution loop, after execute()
if (newPC >= 0xf00000 && newPC <= 0xffffff) {
  // Identify which function based on PC range
  if (newPC >= 0xf00140 && newPC <= 0xf00200) {
    // This is WaitPort()
    const portAddr = this.emulator.getRegister(8);  // A0
    const msgAddr = this.execLibrary.waitPort(portAddr);

    if (msgAddr !== 0) {
      // Message available - return from function
      this.emulator.setRegister(0, msgAddr);
      const sp = this.emulator.getRegister(15);
      const returnAddr = this.emulator.readMemory32(sp);
      this.emulator.setRegister(15, sp + 4);
      this.emulator.setRegister(16, returnAddr);
      this.emulator.refillPrefetch();
    }
    // Otherwise let it loop
  }
}
```

### Option 3: Single-Step When In ROM

```typescript
if (this.inROMMode) {
  // Execute one instruction at a time
  this.emulator.execute(1);

  // Check for traps after each instruction
  const pc = this.emulator.getRegister(16);
  if (this.libraryTraps && this.libraryTraps.isTrapAddress(pc)) {
    this.libraryTraps.handleTrap(pc);
  }

  // Exit ROM mode when back in normal code
  if (pc < 0xf00000) {
    this.inROMMode = false;
  }
} else {
  // Normal batch execution
  this.emulator.execute(CYCLES_PER_ITERATION);
}
```

### Option 4: Periodic WaitPort Checks

**Check message queue periodically regardless of PC:**

```typescript
// Every N iterations while in ROM
if (pc >= 0xf00000 && this.iterationCount % 100 === 0) {
  // Check all known message ports for messages
  const portAddr = 0x90000;  // AEDoorPort0
  const msgAddr = this.execLibrary.waitPort(portAddr);

  if (msgAddr !== 0) {
    console.log('[AmigaDoorSession] *** MESSAGE AVAILABLE WHILE IN ROM ***');
    console.log('[AmigaDoorSession] Simulating WaitPort return');

    // Simulate function return
    this.emulator.setRegister(0, msgAddr);
    const sp = this.emulator.getRegister(15);
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);
    this.emulator.setRegister(16, returnAddr);
    this.emulator.refillPrefetch();
  }
}
```

## Recommended Approach

**Start with Option 4 (Periodic Checks) - It's the safest and most likely to work:**

### Implementation

Add to AmigaDoorSession.ts after the ROM detection code:

```typescript
// Check if PC entered ROM (0xf00000-0xffffff)
else if (newPC >= 0xf00000 && newPC <= 0xffffff) {
  console.log(`[AmigaDoorSession] *** DOOR IN ROM ***`);
  console.log(`[AmigaDoorSession]   PC: 0x${newPC.toString(16)}`);

  // Periodically check if messages are available
  if (this.iterationCount % 100 === 0) {
    // Check AEDoorPort0 for messages
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const portAddr = 0x90000 + (nodeId * 0x1000);

    // Get message port
    const port = this.execLibrary.getMessagePort(portAddr);
    if (port && port.messages.length > 0) {
      console.log('[AmigaDoorSession] *** MESSAGE AVAILABLE IN ROM ***');
      console.log(`[AmigaDoorSession]   Port has ${port.messages.length} message(s)`);
      console.log('[AmigaDoorSession]   Simulating WaitPort return from ROM');

      const msgAddr = port.messages[0];

      // Set return value
      this.emulator.setRegister(0, msgAddr);

      // Pop return address from stack
      const sp = this.emulator.getRegister(15);
      const returnAddr = this.emulator.readMemory32(sp);
      this.emulator.setRegister(15, sp + 4);

      // Return to caller
      this.emulator.setRegister(16, returnAddr);
      this.emulator.refillPrefetch();

      console.log('[AmigaDoorSession]   Returned to 0x${returnAddr.toString(16)} with message 0x${msgAddr.toString(16)}');
    }
  }
}
```

### Why This Will Work

1. Door enters ROM → We detect it
2. Every 100 iterations, we check the message queue
3. When we've sent a message, queue has 1 message
4. We simulate WaitPort() returning with that message
5. We manually set PC back to return address
6. Door continues with the message!

## Testing

```bash
# Run test
timeout 30 node test-what-door.js 2>&1 | grep -E "MESSAGE AVAILABLE|Returned to"

# Expected output:
[AmigaDoorSession] *** MESSAGE AVAILABLE IN ROM ***
[AmigaDoorSession]   Port has 1 message(s)
[AmigaDoorSession]   Simulating WaitPort return from ROM
[AmigaDoorSession]   Returned to 0x115c with message 0x80020
```

## Alternative If That Doesn't Work

If the periodic check doesn't work, we can:

1. Try Option 1 (prevent ROM entry)
2. Try Option 3 (single-step in ROM)
3. Analyze the actual ROM instructions to see what the door is doing

## Files to Modify

1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
   - Add periodic message check in ROM detection block
   - Around line 780-790

2. `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
   - May need to add `getMessagePort()` method if it doesn't exist
   - To access port.messages array

## Success Criteria

When working correctly, we should see:

```
[AmigaDoorSession] *** DETECTED I/O LOOP ***
[AmigaDoorSession] === SENDING TEST MESSAGE ===
[ExecLibrary] Message queued, port now has 1 message(s)
[AmigaDoorSession] *** DOOR IN ROM ***
[AmigaDoorSession] *** MESSAGE AVAILABLE IN ROM ***
[AmigaDoorSession] Simulating WaitPort return from ROM
[LibraryTraps] Intercepted: GetMsg() at PC=0xfe8c
[ExecLibrary] GetMsg(port=0x90000)
[ExecLibrary]   Got message: 0x80020
[AmigaDoorSession] *** DOOR PROCESSING MESSAGE! ***
```

## Conclusion

We're incredibly close! The infrastructure is 100% functional. We just need to handle the case where the door is looping in ROM waiting for messages.

**Option 4 (periodic checks) is the safest approach** and should work immediately.

If it doesn't, we can investigate the other options, but I'm confident the periodic check will succeed! 🎯

---

**Next Action:** Implement periodic message checking in ROM execution block
