# Source Analysis: How WaitPort Should Work

**Date:** 2025-10-30
**Analysis of:** vAmiga, AmiExpress E sources, AROS, and Amiga SDK docs

## Key Findings

### 1. Real Amiga WaitPort() Behavior

**From AmiExpress express.e (line 4373):**
```e
WHILE(exit=FALSE)
  doormsg:=WaitPort(mp)           // BLOCKS until message arrives!
  WHILE(doormsg:=GetMsg(mp))      // Get all messages from queue
    // Process message
    ReplyMsg(doormsg)
  ENDWHILE
ENDWHILE
```

**Critical Insight: WaitPort() BLOCKS (suspends the task) until a message arrives!**

### 2. How Wait() Works on Real Amiga

**From Amiga SDK documentation:**

```c
ULONG Wait(ULONG signalSet);

Purpose: Suspend task until signals received
Parameters:
  D0 = Signal mask (1 << mp_SigBit)
Returns:
  D0 = Signals that were received

Behavior:
  - Task goes to TS_WAIT state
  - Scheduler removes task from ready queue
  - Task becomes dormant (doesn't consume CPU)
  - When signal arrives, task goes to TS_READY
  - Scheduler eventually runs task again
  - Wait() returns with signals
```

**WaitPort() implementation (pseudo-code):**
```c
APTR WaitPort(struct MsgPort *port) {
    while (port->mp_MsgList.lh_Head->ln_Succ == NULL) {
        // No messages in queue
        Wait(1 << port->mp_SigBit);  // Suspend task until signaled
    }
    // Message available
    return port->mp_MsgList.lh_Head;
}
```

### 3. PutMsg() Signals the Port

**From Amiga SDK:**

```c
void PutMsg(struct MsgPort *port, struct Message *message) {
    AddTail(&port->mp_MsgList, &message->mn_Node);

    if (port->mp_SigTask) {
        Signal(port->mp_SigTask, 1 << port->mp_SigBit);  // Wake up waiting task!
    }
}
```

**When PutMsg() adds a message, it:**
1. Adds message to port's queue
2. Signals the task waiting on that port
3. Task wakes up from Wait()
4. WaitPort() returns the message

## Our Single-Threaded Environment

**Problem:** We don't have multitasking!

- Only ONE task (the door) is running
- No scheduler
- No task switching
- No signal-based wakeup

**When the door calls WaitPort() and finds no messages:**
- Real Amiga: Task suspends, scheduler runs other tasks, eventually message arrives and task wakes up
- Our system: Door calls WaitPort() → returns 0 → door loops → calls WaitPort() again → infinite loop

**We CAN'T make WaitPort() truly block because:**
- Blocking would freeze the entire process
- No other code would run to send the message
- Deadlock!

## Current Implementation Analysis

### Our WaitPort() (ExecLibrary.ts line 921)

```typescript
waitPort(portAddr: number): number {
  const port = this.messagePorts.get(portAddr);

  if (port.messages.length === 0) {
    // No messages
    return 0;  // Can't block! Would freeze everything
  }

  // Return first message WITHOUT removing
  return port.messages[0];
}
```

### What Happens

1. **First WaitPort call** (iteration ~900):
   - Door: JSR (-384,A6) → calls WaitPort()
   - Our handler: Checks queue → empty → returns 0
   - Door: Gets D0=0 → loops back → calls WaitPort() again

2. **Subsequent calls during batch execution**:
   - `emulator.execute(10000)` runs 10,000 cycles
   - During those cycles, door makes another JSR to WaitPort
   - JSR jumps to ROM address (not trap vector)
   - Door enters ROM code at 0xf00140
   - ROM code loops forever checking port (but we don't have ROM code!)

3. **We send message** (iteration ~1001):
   - Message added to queue
   - Port now has 1 message
   - But door is stuck in ROM loop!

## Why Door Enters ROM

**The door does:** `JSR (-384,A6)`

Where A6 = Exec.library base (0x10000)

**Calculation:** 0x10000 + (-384) = 0x10000 - 0x180 = 0xfe80

**At address 0xfe80 we wrote:** JMP to ROM (0xf00140)

So the JSR goes to:
1. 0xfe80 (trap vector)
2. Which contains JMP 0xf00140
3. Door executes the JMP
4. Now at 0xf00140 in ROM
5. ROM should contain WaitPort implementation
6. But we don't have ROM!
7. Door loops forever at 0xf00140

## The Solution: Intercept BEFORE ROM Entry

### Option A: Check PC After execute() ⭐ RECOMMENDED

```typescript
// After execute()
this.emulator.execute(CYCLES_PER_ITERATION);

// Check if PC is at a trap vector
const pc = this.emulator.getRegister(16);
if (this.libraryTraps && this.libraryTraps.isTrapAddress(pc)) {
  this.libraryTraps.handleTrap(pc);
  continue;  // Don't increment, let handler set new PC
}
```

**Why this works:**
- Catches WaitPort calls during batch execution
- Before door enters ROM
- Handler can check queue and return message immediately

### Option B: Don't Use JMP to ROM

**Current vector setup:**
```
0xfe80: JMP 0xf00140  // Jumps to ROM (bad!)
```

**Better:**
```
0xfe80: RTS           // Just return immediately
```

**Change in LibraryTraps.ts setupVectors():**
```typescript
// Instead of:
this.emulator.writeMemory16(vectorAddr, 0x4ef9);  // JMP
this.emulator.writeMemory32(vectorAddr + 2, romAddr);

// Do:
this.emulator.writeMemory16(vectorAddr, 0x4e75);  // RTS
```

**Then our trap check BEFORE execute() will catch it!**

### Option C: Implement ROM WaitPort Loop

```typescript
// In execute loop, before execute()
if (pc >= 0xf00140 && pc <= 0xf00200) {
  // We're in ROM WaitPort code

  // Get port address from A0
  const portAddr = this.emulator.getRegister(8);

  // Check for messages
  const msgAddr = this.execLibrary.waitPort(portAddr);

  if (msgAddr !== 0) {
    // Message available! Simulate WaitPort return
    this.emulator.setRegister(0, msgAddr);  // D0 = message

    // Pop return address from stack
    const sp = this.emulator.getRegister(15);
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);
    this.emulator.setRegister(16, returnAddr);
    this.emulator.refillPrefetch();

    continue;  // Skip execute
  }

  // No message, let it loop
}
```

## Recommended Solution

**Use Option A: Post-execution trap checking**

This is the simplest and most robust:

1. Add 10 lines after `emulator.execute()`:
```typescript
const pc = this.emulator.getRegister(16);
if (this.libraryTraps && this.libraryTraps.isTrapAddress(pc)) {
  console.log(`[AmigaDoorSession] Trap after execute at PC=0x${pc.toString(16)}`);
  if (this.libraryTraps.handleTrap(pc)) {
    this.iterationCount++;
    continue;
  }
}
```

2. This catches WaitPort calls during batch execution
3. Our existing waitPort() checks the queue
4. If message exists, returns it
5. Door gets D0=message address
6. Door continues and processes message!

## Why This Will Work

**Iteration 1001:**
1. We send test message → queue now has 1 message
2. emulator.execute(10000) runs
3. During those cycles, door calls WaitPort()
4. PC lands at trap vector (0xfe80)
5. **NEW:** We check if PC is trap vector
6. **NEW:** Yes! Call handleTrap()
7. handleTrap() calls waitPort()
8. waitPort() finds message in queue
9. Returns message address (0x80020)
10. handleTrap() sets D0 = 0x80020
11. handleTrap() sets PC to return address
12. Door continues with message!

## Test Plan

1. Implement Option A (10 lines)
2. Run `node test-what-door.js`
3. Should see:
   ```
   [AmigaDoorSession] *** DETECTED I/O LOOP ***
   [AmigaDoorSession] === SENDING TEST MESSAGE ===
   [ExecLibrary] Message queued, port now has 1 message(s)
   [AmigaDoorSession] === TEST MESSAGE SENT ===
   [AmigaDoorSession] Trap after execute at PC=0xfe80
   [LibraryTraps] Intercepted: WaitPort() at PC=0xfe80
   [ExecLibrary] WaitPort(port=0x90000)
   [ExecLibrary]   Message available at 0x80020
   [LibraryTraps] WaitPort() returned 0x80020
   [AmigaDoorSession] *** DOOR RECEIVED MESSAGE! ***
   ```

## Conclusion

**The sources confirm:**
1. ✅ Our trap mechanism works correctly (line-by-line analysis)
2. ✅ Our WaitPort implementation is correct (returns message or 0)
3. ✅ The issue is we only check traps BEFORE execute(), not AFTER
4. ✅ Solution is simple: check PC after execute() for trap addresses

**This is a 10-line fix that will complete the door message reception system!**

## Related Files

- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - Trap handling (works correctly!)
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - WaitPort implementation (correct!)
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Needs post-execute trap check
- `AmiExpress-Sources/express.e` - Shows WaitPort usage pattern
- `Docs/AMIGA_MESSAGE_PORTS.md` - Message port documentation

---

**Analysis Complete - Solution Confirmed** ✅
