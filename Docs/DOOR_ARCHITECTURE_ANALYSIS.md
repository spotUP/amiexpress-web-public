# Door Architecture Analysis - October 30, 2025

## Current Status

GetAnswer door executes **203 instructions** successfully and exits cleanly. However, it does NO I/O because it exits before attempting communication.

## Why GetAnswer Exits Early

Analysis of the execution trace shows:

```
Inst 0-194: C runtime initialization, library calls (SetTaskPri, OpenLibrary, FreeMem)
Inst 195-198: Stack manipulation, calling stack-relative function
Inst 199-202: Function epilogue (MOVEM, RTS)
Inst 203: PC → 0x0 (exit via our detection)
```

**The door is completing its main() function WITHOUT doing any I/O work.**

## Root Cause Hypothesis

GetAnswer is **expecting command-line arguments or environment setup** that we're not providing:

1. **Missing argv[1]** - Node number parameter ("0", "1", etc.)
2. **Missing environment** - AmiExpress sets environment variables for doors
3. **Missing WorkbenchMsg** - Doors can be launched from Workbench OR CLI

From the SAS C example (simple.c line 53):
```c
d=CreateComm(argv[1][0]); // Takes node character from argv[1]
```

The door needs to know which node it's running on!

## AEDoor Message Port Protocol

Based on AEDoor.i and example code, here's how doors communicate:

### Architecture

```
Door Process                BBS Process (AmiExpress)
============                =======================
1. FindPort("AEDoorPort0")  <-- Public message port for node 0
2. CreateMsgPort()          --> Creates "DoorReplyPort0"
3. Build AMiXMessage
4. PutMsg(AEDoorPort0, msg) --> Sends to BBS
5. WaitPort(DoorReplyPort0) <-- Waits for reply
6. GetMsg(DoorReplyPort0)   <-- Receives reply
7. Process reply
8. Repeat 3-7 for each operation
9. DeleteMsgPort()
```

### Message Structure

From express.e lines 3350-3370, the AMiXMessage structure:

```c
struct AMiXMessage {
  struct Message msg;        // Standard Exec message (20 bytes)
  LONG   command;            // JH_WRITE, JH_PM, DT_NAME, etc.
  LONG   data;               // Numeric parameter
  UBYTE  string[256];        // String parameter/result
};
```

###Commands (from express.e):

- `JH_WRITE` (1) - Write string to terminal
- `JH_PM` (2) - Prompt for input
- `DT_NAME` (10) - Get user name
- `DT_LOCATION` (11) - Get user location
- etc.

## What We Need to Implement

### Phase 1: Fix Door Initialization ✅ (DONE)

- [x] Stack-relative JSR stub (inst 198)
- [x] Exit detection (PC < 0x100)
- [x] Door runs 203 instructions

### Phase 2: Provide Command-Line Arguments (NEXT)

GetAnswer needs:
```c
argc = 2
argv[0] = "GetAnswer"  (program name)
argv[1] = "0"           (node number as string)
```

Currently we provide:
```typescript
// AmigaDoorSession.ts line 211
const argc = 0;
this.emulator.setRegister(0, argc); // D0
```

**We need to:**
1. Allocate argv array in memory
2. Write "GetAnswer\0" string
3. Write "0\0" string (node number)
4. Set argc=2, argv pointer in registers
5. Set D0=argc, A0=argv (SAS C convention)

### Phase 3: Implement Message Port Functions

Once door has proper arguments, it will call:

**Already Implemented:**
- ✅ FindPort() - Returns fake MsgPort for "AEDoorPort0"

**Need to Implement:**
- ❌ CreateMsgPort() - LVO -666 (0xFFFFFD66)
- ❌ DeleteMsgPort() - LVO -672 (0xFFFFFD60)
- ❌ PutMsg() - LVO -366 (0xFFFFFE72)
- ❌ GetMsg() - LVO -372 (0xFFFFFE6C)
- ❌ WaitPort() - LVO -384 (0xFFFFFE80)

### Phase 4: Handle AEDoor Messages

When door calls PutMsg(), we need to:
1. Read the AMiXMessage from emulated memory
2. Parse command/data/string fields
3. Execute the command (write output, get input, etc.)
4. Build reply message
5. Queue reply on door's reply port
6. Signal door (so WaitPort() returns)

## Implementation Plan

### Step 1: Add Command-Line Arguments

```typescript
// In AmigaDoorSession.ts loadDoor():
const argvAddr = 0x0F0000;  // Argv array location
const arg0Addr = 0x0F0100;  // "GetAnswer" string
const arg1Addr = 0x0F0200;  // "0" string

// Write argv[0] = "GetAnswer"
this.writeStringToMemory(arg0Addr, "GetAnswer");
this.emulator.writeMemory32(argvAddr + 0, arg0Addr);

// Write argv[1] = "0" (node number)
const nodeStr = this.nodeId.toString();
this.writeStringToMemory(arg1Addr, nodeStr);
this.emulator.writeMemory32(argvAddr + 4, arg1Addr);

// Write argv[2] = NULL (end of array)
this.emulator.writeMemory32(argvAddr + 8, 0);

// Set argc=2, argv in registers
this.emulator.setRegister(0, 2);      // D0 = argc
this.emulator.setRegister(8, argvAddr); // A0 = argv
```

### Step 2: Implement CreateMsgPort()

```typescript
// In ExecLibrary.ts:
createMsgPort(): number {
  // Allocate 34 bytes for MsgPort structure
  const portAddr = this.allocMemory(34);

  // Initialize MsgPort structure (same as FindPort does)
  // ...

  // Add to our message port registry
  this.messagePorts.set(portAddr, {
    messages: [],  // Queue of pending messages
    signalBit: 1,
    task: this.currentTask
  });

  return portAddr;
}
```

### Step 3: Implement PutMsg()

```typescript
// In ExecLibrary.ts:
putMsg(portAddr: number, msgAddr: number): void {
  const port = this.messagePorts.get(portAddr);
  if (!port) {
    console.error(`PutMsg: Invalid port 0x${portAddr.toString(16)}`);
    return;
  }

  // Add message to port's queue
  port.messages.push(msgAddr);

  // Signal the waiting task (set flag so WaitPort returns)
  port.signaled = true;

  // If this is AEDoorPort, handle the message immediately
  if (portAddr >= 0x90000 && portAddr < 0xA0000) {
    this.handleAEDoorMessage(msgAddr);
  }
}
```

### Step 4: Implement GetMsg()

```typescript
// In ExecLibrary.ts:
getMsg(portAddr: number): number {
  const port = this.messagePorts.get(portAddr);
  if (!port || port.messages.length === 0) {
    return 0;  // No messages
  }

  // Dequeue first message
  const msgAddr = port.messages.shift();
  return msgAddr;
}
```

### Step 5: Implement WaitPort()

```typescript
// In ExecLibrary.ts:
waitPort(portAddr: number): number {
  const port = this.messagePorts.get(portAddr);
  if (!port) {
    return 0;
  }

  // Check if port has messages
  if (port.messages.length > 0) {
    return msgAddr;  // Return immediately
  }

  // In real Amiga, this BLOCKS until message arrives
  // In our emulator, we need to:
  // 1. Pause execution
  // 2. Wait for async event (socket input, etc.)
  // 3. Resume execution

  // For now, return 0 (no messages)
  // TODO: Implement proper async waiting
  return 0;
}
```

## Testing Strategy

1. **Test 1:** Add argv, run door, check if it tries to call FindPort()
2. **Test 2:** Implement CreateMsgPort(), check if door creates reply port
3. **Test 3:** Implement PutMsg/GetMsg/WaitPort(), check if door sends messages
4. **Test 4:** Handle JH_WRITE message, verify output appears on terminal
5. **Test 5:** Handle JH_PM message, verify door waits for input

## Expected Behavior After Implementation

```
[AmigaDoorSession] Door loaded with argc=2, argv[0]="GetAnswer", argv[1]="0"
[AmigaDoorSession] Inst 1-50: C runtime init
[ExecLibrary] FindPort("AEDoorPort0")
[ExecLibrary]   Returning fake MsgPort at 0x90000
[ExecLibrary] CreateMsgPort()
[ExecLibrary]   Created DoorReplyPort at 0xA0000
[ExecLibrary] PutMsg(0x90000, msgAddr=0xB0000)
[AEDoorHandler] Received JH_WRITE: "Welcome to GetAnswer!"
[Socket] Emit 'ansi-output': "Welcome to GetAnswer!\r\n"
[ExecLibrary] GetMsg(0xA0000)
[ExecLibrary]   Returning reply message at 0xB0000
[Door continues execution...]
```

##Metrics

**Current State:**
- Instructions executed: 203
- Library calls working: 3 (SetTaskPri, OpenLibrary, FreeMem)
- I/O operations: 0
- Door functionality: 0%

**Target State:**
- Instructions executed: Thousands (infinite loop for I/O)
- Library calls working: 8+ (add message port functions)
- I/O operations: Multiple (write, read, etc.)
- Door functionality: 100% (full interactive door)

---
*Analysis Date: 2025-10-30*
*Next Step: Implement command-line arguments (Phase 2)*
