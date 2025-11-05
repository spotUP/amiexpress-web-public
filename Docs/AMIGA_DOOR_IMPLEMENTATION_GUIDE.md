# Amiga Developer Documentation - Door Implementation Guide

**Generated:** 2025-11-01  
**Purpose:** Comprehensive reference for implementing door programs in AmiExpress-Web BBS

This document consolidates critical information from the official Amiga Developer Documentation (ADCD 2.1) for implementing accurate door program emulation in our TypeScript/JavaScript environment.

---

## Table of Contents

1. [Message Port Communication](#message-port-communication)
2. [Signal Management](#signal-management)
3. [Memory Management](#memory-management)
4. [Process Management](#process-management)
5. [Critical Implementation Details](#critical-implementation-details)
6. [Common Patterns](#common-patterns)
7. [Reference Paths](#reference-paths)

---

## Message Port Communication

### Overview

AmigaOS uses a message-based interprocess communication system built on top of task signaling. Messages are NOT copied - only pointers are passed between tasks. This is a zero-copy, shared-memory system.

### Key Concepts

1. **Message Ownership**: When Task A sends a message to Task B, Task A **relinquishes control** of that memory until Task B calls `ReplyMsg()`.
2. **FIFO Ordering**: Messages in a port's queue are processed first-in-first-out.
3. **Non-blocking**: `GetMsg()` returns NULL immediately if no messages are available.
4. **Signal-based Notification**: Ports use task signals to wake waiting tasks when messages arrive.

### Critical Structures

#### MsgPort Structure
```c
struct MsgPort {
    struct Node  mp_Node;      // Standard node (name, priority, type)
    UBYTE        mp_Flags;     // Message arrival action flags
    UBYTE        mp_SigBit;    // Signal bit number (0-31)
    void        *mp_SigTask;   // Task to signal (or SoftInt structure)
    struct List  mp_MsgList;   // Linked list of messages
};
```

**Field Details:**
- `mp_Node.ln_Name`: Port name (NULL for private ports)
- `mp_Node.ln_Pri`: Priority for public port list
- `mp_Node.ln_Type`: Must be `NT_MSGPORT` (value: 4)
- `mp_Flags`: Contains `PA_SIGNAL`, `PA_SOFTINT`, or `PA_IGNORE`
- `mp_SigBit`: Signal number allocated for this port
- `mp_SigTask`: Pointer to task structure (from `FindTask(NULL)`)
- `mp_MsgList`: Must be initialized with `NewList()` or by `AddPort()`

#### Message Structure
```c
struct Message {
    struct Node     mn_Node;       // Standard node
    struct MsgPort *mn_ReplyPort;  // Where to send reply
    UWORD           mn_Length;     // Total message size (bytes)
};
```

**Field Details:**
- `mn_Node.ln_Type`: Set to `NT_MESSAGE` by `PutMsg()`, `NT_REPLYMSG` by `ReplyMsg()`
- `mn_ReplyPort`: If non-NULL, message will be replied here when done
- `mn_Length`: Includes size of Message structure itself

### Port Arrival Actions (mp_Flags)

**PA_SIGNAL (0)** - Signal task when message arrives
- Most common type for door programs
- Signals `mp_SigTask` using signal bit `mp_SigBit`
- Every message causes a signal (signals may coalesce)

**PA_SOFTINT (1)** - Trigger software interrupt
- For interrupt-driven processing
- `mp_SigTask` points to Interrupt structure (not Task)

**PA_IGNORE (2)** - No action
- Message queued but no notification
- Used to temporarily disable signaling

### Core Functions

#### CreateMsgPort() - V36+
```c
struct MsgPort *CreateMsgPort(void);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node01FC.html`

**Function:**
- Allocates MsgPort structure
- Initializes message list (via NewList)
- Allocates a signal bit
- Sets up PA_SIGNAL arrival action
- Sets mp_SigTask to current task

**Returns:**
- Pointer to MsgPort, or NULL if out of memory/signals

**Critical Notes:**
- MUST use `DeleteMsgPort()` to free (not regular FreeMem)
- Port is PRIVATE by default (not in public list)
- To make public: Fill ln_Name and ln_Pri, then call `AddPort()`
- Signal bit is automatically allocated

**Implementation Pattern:**
```c
struct MsgPort *port = CreateMsgPort();
if (port) {
    // Port is ready to use
    // To make public:
    port->mp_Node.ln_Name = "MyPort";
    port->mp_Node.ln_Pri = 0;
    AddPort(port);
}
```

#### DeleteMsgPort() - V36+
```c
void DeleteMsgPort(struct MsgPort *port);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0201.html`

**Function:**
- Frees message port created by CreateMsgPort()
- Frees the allocated signal bit
- Frees the MsgPort structure

**Critical Notes:**
- All messages MUST be replied before calling
- Accepts NULL (no-op)
- If port was made public, call `RemPort()` first

#### AddPort() - Add to public list
```c
void AddPort(struct MsgPort *port);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node01DE.html`

**Function:**
- Adds port to system's public port list
- Makes port findable via `FindPort()`
- Uses ln_Name for identification
- Uses ln_Pri for list ordering

**Critical Notes:**
- ln_Name and ln_Pri MUST be set before calling
- Do NOT AddPort() an active port
- Port priority: 0 for unused, 1+ for searchable, 50-100 for frequent use
- MUST call `RemPort()` before deleting port

#### RemPort() - Remove from public list
```c
void RemPort(struct MsgPort *port);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0230.html`

**Function:**
- Removes port from public list
- Subsequent `FindPort()` calls will fail

**Critical Notes:**
- Call before DeleteMsgPort() if port was made public
- Does not free the port structure

#### FindPort() - Locate public port
```c
struct MsgPort *FindPort(STRPTR name);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0208.html`

**Function:**
- Searches system port list by name
- Returns first matching port

**Returns:**
- Pointer to MsgPort, or NULL if not found

**CRITICAL NOTES:**
- MUST be protected with `Forbid()/Permit()` pair\!
- Port may be removed by owner at any time
- Returned pointer only valid until `Permit()` is called
- No arbitration - multiple tasks can find same port

**Safe Usage Pattern:**
```c
struct MsgPort *port;
Forbid();
    port = FindPort("DoorPort");
    if (port) {
        PutMsg(port, myMessage);
    }
Permit();
// Port pointer is now invalid\!
```

#### PutMsg() - Send message to port
```c
void PutMsg(struct MsgPort *port, struct Message *message);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0226.html`

**Function:**
- Attaches message to end of port's message list
- Triggers port's arrival action (signal/softint/ignore)
- Non-copying - passes pointer only

**Implementation:**
1. Sets message LN_TYPE to NT_MESSAGE
2. Appends message to port's mp_MsgList
3. Performs arrival action (e.g., Signal task)

**Critical Notes:**
- Message can only be at ONE port at a time
- Sender must NOT modify message until ReplyMsg() received
- ReplyPort field determines where reply goes (can be NULL)
- Can be called from interrupts
- Fast operation - no memory copying

#### GetMsg() - Receive message from port
```c
struct Message *GetMsg(struct MsgPort *port);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0214.html`

**Function:**
- Removes and returns first message from port
- Non-blocking - returns NULL if empty
- Removes message from queue

**Returns:**
- Pointer to Message, or NULL if port is empty

**CRITICAL NOTES:**
- Does NOT wait - returns immediately
- Multiple messages may arrive per signal
- Signals may occur WITHOUT messages
- **ALWAYS loop** until GetMsg() returns NULL
- Getting message does NOT imply sender can reuse it (must ReplyMsg)

**Standard Pattern:**
```c
struct Message *msg;
WaitPort(port);  // Wait for signal
while (msg = GetMsg(port)) {
    // Process message
    // ...
    ReplyMsg(msg);  // Return to sender
}
```

#### ReplyMsg() - Return message to sender
```c
void ReplyMsg(struct Message *message);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0235.html`

**Function:**
- Sends message to its reply port (mn_ReplyPort)
- Allows sender to reuse/deallocate message

**Implementation:**
1. Sets LN_TYPE to NT_REPLYMSG
2. Calls PutMsg(mn_ReplyPort, message)
3. If mn_ReplyPort is NULL, sets LN_TYPE to NT_FREEMSG

**Critical Notes:**
- Can be called from interrupts
- Receiver MUST reply when finished with message
- If mn_ReplyPort is NULL, special handling (use with extreme care)

#### WaitPort() - Wait for messages
```c
struct Message *WaitPort(struct MsgPort *port);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0248.html`

**Function:**
- Waits until port is non-empty
- Returns pointer to first message (does NOT remove it)
- If messages already present, returns immediately

**Returns:**
- Pointer to first message in queue (NOT removed)

**CRITICAL NOTES:**
- Returns pointer but does NOT remove message
- Must call GetMsg() to actually retrieve messages
- More than one message may be present when this returns
- Possible to get signal WITHOUT message (plan for this)
- **Always use GetMsg() loop after WaitPort()**

**Standard Pattern:**
```c
struct Message *msg;
WaitPort(myPort);  // Wait for activity
while (msg = GetMsg(myPort)) {
    // Process msg
    ReplyMsg(msg);
}
```

---

## Signal Management

### Overview

Signals are single-bit flags used for task synchronization. Each task has 32 signal bits (0-31). Signals are the foundation of AmigaOS's multitasking and message passing.

### Key Concepts

1. **Signal Bits**: Each task has 32 signals (ULONG bitmask)
2. **No Counting**: Signals are flags, not counters (multiple Signal() calls = one bit set)
3. **Task-Specific**: Signals belong to tasks, not processes
4. **Non-Blocking**: SetSignal() for query, Wait() for blocking

### Core Functions

#### AllocSignal() - Allocate signal bit
```c
BYTE AllocSignal(BYTE signalNum);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node01E9.html`

**Function:**
- Allocates a signal bit from current task's pool
- Can request specific bit or any free bit

**Inputs:**
- `signalNum`: Desired bit (0-31) or -1 for any free bit

**Returns:**
- Allocated signal bit number (0-31), or -1 if none available

**Critical Notes:**
- At least 16 user signals available per task
- Signal is cleared when allocated
- Must be freed with FreeSignal() before task exits
- Allocated signals only valid for allocating task
- Cannot be called from exception handlers

#### FreeSignal() - Free signal bit
```c
void FreeSignal(BYTE signalNum);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0210.html`

**Function:**
- Frees previously allocated signal bit
- Must be called in same task that allocated it

**Inputs:**
- `signalNum`: Signal bit to free (0-31)

**Critical Notes:**
- Cannot be called from exception handlers
- V37+: Freeing signal -1 is harmless (no-op)

#### Signal() - Signal a task
```c
void Signal(struct Task *task, ULONG signals);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node023D.html`

**Function:**
- Signals a task with given signals
- If task is waiting for any of these signals, it becomes ready
- If task not waiting, signals are posted for later

**Inputs:**
- `task`: Task to signal
- `signals`: Signal bits to set (bitmask)

**Critical Notes:**
- Can signal task in any state (running, ready, waiting)
- Can be called from interrupts (interrupt-safe)
- Low-level function (supports higher-level functions like PutMsg)
- May cause task reschedule if waiting task becomes ready

#### Wait() - Wait for signals
```c
ULONG Wait(ULONG signalSet);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0246.html`

**Function:**
- Suspends current task until one or more specified signals occur
- Clears the received signals
- Returns immediately if signal already set

**Inputs:**
- `signalSet`: Bitmask of signals to wait for

**Returns:**
- Bitmask of signals that were active

**CRITICAL NOTES:**
- Cannot be called from supervisor mode or interrupts
- Breaks Forbid()/Disable() state
- If signal already occurred, returns immediately without blocking
- Multiple signals can be satisfied simultaneously

#### SetSignal() - Query/modify signals
```c
ULONG SetSignal(ULONG newSignals, ULONG signalMask);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node023A.html`

**Function:**
- Queries or modifies current task's signal state
- Can read signals safely
- Modifying signals is dangerous

**Inputs:**
- `newSignals`: New values for masked signals
- `signalMask`: Which signals to affect

**Returns:**
- Previous state of ALL signals (before modification)

**Examples:**
```c
// Query all signals (safe):
ULONG current = SetSignal(0L, 0L);

// Clear a specific signal:
SetSignal(0L, SIGBREAKF_CTRL_C);

// Check and clear CTRL-C:
if (SetSignal(0L, SIGBREAKF_CTRL_C) & SIGBREAKF_CTRL_C) {
    // CTRL-C was pressed
}
```

**Critical Notes:**
- Reading signals is safe
- Setting signals is dangerous (use with caution)
- Returns OLD state before modification

---

## Memory Management

### Overview

AmigaOS provides sophisticated memory management with support for different memory types (chip, fast, public, etc.) and automatic alignment.

### Memory Types (MEMF flags)

**Requirements (must be met):**
- `MEMF_CHIP` (1<<1): DMA-accessible memory (screen, audio, blitter, copper, sprites)
- `MEMF_FAST` (1<<2): Non-chip memory (DO NOT use unless you know what you're doing\!)
- `MEMF_PUBLIC` (1<<0): Cannot be swapped/mapped - REQUIRED for interrupt/shared code/data
- `MEMF_LOCAL`: Survives CPU RESET (auto-set in V36+)
- `MEMF_24BITDMA`: Within 24-bit address range for Zorro-II DMA (auto-set in V36+)
- `MEMF_KICK`: Accessible during KickMem/KickTag processing (auto-set in V39+)

**Options (applied regardless):**
- `MEMF_CLEAR` (1<<16): Zero-initialize memory before returning
- `MEMF_REVERSE`: Allocate from top of pool (V36+, buggy in pre-V39)
- `MEMF_NO_EXPUNGE`: Don't trigger expunge on failure (V39+)

### Core Functions

#### AllocMem() - Allocate memory
```c
void *AllocMem(ULONG byteSize, ULONG attributes);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node01E7.html`

**Function:**
- Allocates memory with specific requirements
- Rounds size to system memory chunk size
- Returns long-word aligned pointer

**Inputs:**
- `byteSize`: Size in bytes (rounded up automatically)
- `attributes`: MEMF flags (requirements + options)

**Returns:**
- Pointer to allocated block, or NULL if failed

**Examples:**
```c
// Best available memory:
ptr = AllocMem(64, 0L);

// Cleared memory:
ptr = AllocMem(25, MEMF_CLEAR);

// Chip memory:
ptr = AllocMem(128, MEMF_CHIP);

// Cleared chip memory:
ptr = AllocMem(128, MEMF_CHIP | MEMF_CLEAR);

// Public, cleared chip memory:
ptr = AllocMem(821, MEMF_CHIP | MEMF_PUBLIC | MEMF_CLEAR);
```

**CRITICAL NOTES:**
- ALWAYS check result for NULL before use
- Cannot be called from interrupts
- Corrupt free list triggers Alert AN_MemCorrupt ($01000005)
- DOS processes: pr_Result2 = ERROR_NO_FREE_STORE on failure
- Default: Searches fast memory first, then chip
- MEMF_FAST: Will FAIL on chip-only machines\!

#### FreeMem() - Free memory
```c
void FreeMem(void *memoryBlock, ULONG byteSize);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node020E.html`

**Function:**
- Deallocates memory block
- Returns memory to system pool

**Inputs:**
- `memoryBlock`: Pointer to memory block
- `byteSize`: Size of block (same as AllocMem)

**CRITICAL NOTES:**
- Freeing twice triggers Alert AN_FreeTwice ($01000009)
- Wrong pointer triggers Alert AN_MemCorrupt ($01000005)
- Size must match original allocation
- Do not free partial blocks

#### AllocVec() - Allocate with size tracking (V36+)
```c
void *AllocVec(ULONG byteSize, ULONG attributes);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node01EB.html`

**Function:**
- Identical to AllocMem() but tracks size automatically
- Simplifies cleanup code

**Critical Notes:**
- MUST use FreeVec() to free (not FreeMem)
- Same attributes as AllocMem()
- Preferred for V36+ code

#### FreeVec() - Free AllocVec memory (V36+)
```c
void FreeVec(void *memoryBlock);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0212.html`

**Function:**
- Frees memory allocated by AllocVec()
- No size parameter needed

**Inputs:**
- `memoryBlock`: Pointer from AllocVec(), or NULL

**Critical Notes:**
- Accepts NULL (no-op)
- Same alerts as FreeMem() for errors

---

## Process Management

### Overview

AmigaOS distinguishes between Tasks (basic execution units) and Processes (tasks with DOS context). Door programs run as Processes.

### Core Functions

#### FindTask() - Find task by name or self
```c
struct Task *FindTask(STRPTR name);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node020B.html`

**Function:**
- Finds task by name or returns current task
- NULL name = current task (very fast)

**Inputs:**
- `name`: Task name, or NULL for self

**Returns:**
- Pointer to Task (or Process) structure

**Critical Notes:**
- FindTask(NULL) is VERY fast (recommended for self)
- FindTask(name) is VERY slow and disables interrupts
- May need Forbid()/Permit() if task might be removed
- Tasks can remove themselves at any time

#### Exit() - Terminate process (DOS)
```c
void Exit(LONG returnCode);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node015F.html`

**Function:**
- Exits from BCPL-style programs
- Behavior depends on CLI vs standalone process

**Inputs:**
- `returnCode`: Exit code value

**Implementation:**
- If running under CLI: Returns control to CLI with return code
- If standalone process: Deletes process, frees stack/seglist/structure

**CRITICAL NOTES:**
- For C programs: Use C `exit()` function (lowercase e)
- For assembly: Place return code in D0, execute RTS with original stack
- DO NOT CALL THIS FROM C PROGRAMS\!
- Only for BCPL compatibility

#### CreateNewProc() - Create process (V36+)
```c
struct Process *CreateNewProc(struct TagItem *tags);
```

**Location:** `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node014C.html`

**Function:**
- Creates new process with tag-based parameters
- Must specify NP_Seglist or NP_Entry

**Inputs:**
- `tags`: TagItem array with configuration

**Returns:**
- Process pointer, or NULL on failure

**Critical Notes:**
- If NULL returned, caller must free passed resources
- V36 NP_Arguments was broken (use V37+)
- If using NP_Arguments, must NOT specify NP_Input as NULL
- Callable from tasks (though I/O operations may not work)
- See `<dos/dostags.h>` for all available tags

**Default Settings:**
- Non-CLI process
- Copies of CurrentDir, HomeDir (PROGDIR:)
- Copy of caller's priority, consoletask, windowptr, variables
- Input/Output: Opens of NIL:
- Stack: 4000 bytes

---

## Critical Implementation Details

### Message Passing Gotchas

1. **Signals ≠ Messages**
   - One signal can represent multiple messages
   - Signals can occur without messages
   - Always loop GetMsg() until NULL

2. **Message Ownership**
   - Sender loses control after PutMsg()
   - Receiver gains control until ReplyMsg()
   - Never modify sent messages until replied

3. **Port Lifetime**
   - Public ports can disappear at any time
   - Use Forbid()/Permit() around FindPort() + PutMsg()
   - Port pointer invalid after Permit()

4. **Reply Port Requirements**
   - Sender must create own reply port
   - Reply port must exist until all replies received
   - Set mn_ReplyPort in messages

### Signal Gotchas

1. **No Signal Counting**
   - Signal(task, bit) 10 times = one bit set
   - Use messages or semaphores if counting needed

2. **Wait() Clears Signals**
   - Returned signals are automatically cleared
   - If checking without waiting, use SetSignal(0,0)

3. **Signal Exhaustion**
   - Only 32 signals per task
   - System uses some (CTRL-C, CTRL-D, CTRL-E, CTRL-F)
   - CreateMsgPort() fails if no signals available

### Memory Gotchas

1. **MEMF_FAST Danger**
   - NEVER use MEMF_FAST unless absolutely necessary
   - Will FAIL on chip-only Amigas (A500, A600, etc.)
   - Default (0) is safer - tries fast first, falls back to chip

2. **MEMF_PUBLIC Requirement**
   - ALL code/data referenced by interrupts MUST be MEMF_PUBLIC
   - ALL shared task data MUST be MEMF_PUBLIC
   - Prevents swapping/paging issues

3. **Size Tracking**
   - FreeMem() requires exact size from AllocMem()
   - Use AllocVec()/FreeVec() to avoid tracking (V36+)
   - Freeing with wrong size = corruption

---

## Common Patterns

### Door Program Message Port Setup

```c
// 1. Create reply port for door
struct MsgPort *replyPort = CreateMsgPort();
if (\!replyPort) {
    // Handle error - no signals available
    return ERROR;
}

// 2. Find BBS port
struct MsgPort *bbsPort;
Forbid();
    bbsPort = FindPort("AMIEXPRESS_BBS");
    if (\!bbsPort) {
        Permit();
        DeleteMsgPort(replyPort);
        return ERROR;
    }
Permit();

// Note: bbsPort pointer now potentially invalid\!
// For door startup, BBS port should remain stable
```

### Sending Messages to BBS

```c
// 1. Allocate message
struct MyMessage *msg = AllocVec(sizeof(struct MyMessage), MEMF_PUBLIC | MEMF_CLEAR);
if (\!msg) return ERROR;

// 2. Initialize message
msg->msg.mn_Node.ln_Type = NT_MESSAGE;
msg->msg.mn_ReplyPort = replyPort;
msg->msg.mn_Length = sizeof(struct MyMessage);
msg->command = CMD_DOOR_OUTPUT;
// ... fill in custom fields

// 3. Send to BBS
Forbid();
    bbsPort = FindPort("AMIEXPRESS_BBS");
    if (bbsPort) {
        PutMsg(bbsPort, &msg->msg);
    }
Permit();

// 4. Wait for reply
WaitPort(replyPort);
struct Message *reply;
while (reply = GetMsg(replyPort)) {
    // Process reply
    // Note: reply == msg (same message returned)
    FreeVec(reply);
}
```

### Receiving Messages from BBS

```c
// Door's main message loop
ULONG portSignal = 1L << replyPort->mp_SigBit;
ULONG ctrlCSignal = SIGBREAKF_CTRL_C;
BOOL running = TRUE;

while (running) {
    ULONG signals = Wait(portSignal | ctrlCSignal);
    
    if (signals & ctrlCSignal) {
        // User break
        running = FALSE;
    }
    
    if (signals & portSignal) {
        struct Message *msg;
        while (msg = GetMsg(replyPort)) {
            // Process message from BBS
            struct MyMessage *myMsg = (struct MyMessage *)msg;
            
            switch (myMsg->command) {
                case CMD_DOOR_INPUT:
                    // Handle input from BBS
                    break;
                case CMD_DOOR_DISCONNECT:
                    // User disconnected
                    running = FALSE;
                    break;
            }
            
            // Reply to BBS
            ReplyMsg(msg);
        }
    }
}
```

### Cleanup on Exit

```c
void cleanup(void) {
    // 1. Reply to any pending messages
    struct Message *msg;
    while (msg = GetMsg(replyPort)) {
        ReplyMsg(msg);
    }
    
    // 2. Wait for any outstanding replies
    // (Messages we sent but haven't been replied to yet)
    // Track outstanding count in your code
    while (outstandingMessages > 0) {
        WaitPort(replyPort);
        while (msg = GetMsg(replyPort)) {
            outstandingMessages--;
            FreeVec(msg);
        }
    }
    
    // 3. Remove from public list if added
    if (portWasPublic) {
        Forbid();
        RemPort(myPublicPort);
        Permit();
    }
    
    // 4. Delete port (frees signal automatically)
    DeleteMsgPort(replyPort);
    
    // 5. Free other resources
    // ...
}
```

### Public Port Registration

```c
// Door wants to advertise a service
struct MsgPort *servicePort = CreateMsgPort();
if (servicePort) {
    servicePort->mp_Node.ln_Name = "MyDoorService";
    servicePort->mp_Node.ln_Pri = 50;  // Moderate priority
    
    Forbid();
    AddPort(servicePort);
    Permit();
    
    // Now other tasks can FindPort("MyDoorService")
}

// Cleanup:
Forbid();
RemPort(servicePort);
Permit();
DeleteMsgPort(servicePort);
```

---

## Reference Paths

All paths are relative to: `~/Code/amigadeveloperdocs/ADCD_2.1/`

### exec.library Functions

| Function | File Path |
|----------|-----------|
| CreateMsgPort | `Includes_and_Autodocs_3._guide/node01FC.html` |
| DeleteMsgPort | `Includes_and_Autodocs_3._guide/node0201.html` |
| AddPort | `Includes_and_Autodocs_3._guide/node01DE.html` |
| RemPort | `Includes_and_Autodocs_3._guide/node0230.html` |
| FindPort | `Includes_and_Autodocs_3._guide/node0208.html` |
| PutMsg | `Includes_and_Autodocs_3._guide/node0226.html` |
| GetMsg | `Includes_and_Autodocs_3._guide/node0214.html` |
| ReplyMsg | `Includes_and_Autodocs_3._guide/node0235.html` |
| WaitPort | `Includes_and_Autodocs_3._guide/node0248.html` |
| AllocSignal | `Includes_and_Autodocs_3._guide/node01E9.html` |
| FreeSignal | `Includes_and_Autodocs_3._guide/node0210.html` |
| Signal | `Includes_and_Autodocs_3._guide/node023D.html` |
| Wait | `Includes_and_Autodocs_3._guide/node0246.html` |
| SetSignal | `Includes_and_Autodocs_3._guide/node023A.html` |
| FindTask | `Includes_and_Autodocs_3._guide/node020B.html` |
| AllocMem | `Includes_and_Autodocs_3._guide/node01E7.html` |
| FreeMem | `Includes_and_Autodocs_3._guide/node020E.html` |
| AllocVec | `Includes_and_Autodocs_3._guide/node01EB.html` |
| FreeVec | `Includes_and_Autodocs_3._guide/node0212.html` |

### dos.library Functions

| Function | File Path |
|----------|-----------|
| Exit | `Includes_and_Autodocs_3._guide/node015F.html` |
| CreateNewProc | `Includes_and_Autodocs_3._guide/node014C.html` |

### Structure Definitions

| Structure | File Path |
|-----------|-----------|
| MsgPort | `Includes_and_Autodocs_3._guide/node062E.html` |
| Message | `Includes_and_Autodocs_3._guide/node062E.html` |

### Library Manual Chapters

| Topic | File Path |
|-------|-----------|
| Interprocess Communications | `Libraries_Manual_guide/node028C.html` |
| Message Ports | `Libraries_Manual_guide/node02EB.html` |
| Creating Message Port | `Libraries_Manual_guide/node02EC.html` |
| Port Rendezvous | `Libraries_Manual_guide/node02EE.html` |

### Full Documentation Index

Main index: `Includes_and_Autodocs_3._guide/node0000.html`  
exec.library index: `Includes_and_Autodocs_3._guide/node01D6.html`  
dos.library index: `Includes_and_Autodocs_3._guide/node0138.html`

---

## Implementation Notes for AmiExpress-Web

### TypeScript/JavaScript Emulation Considerations

1. **Message Structure Storage**
   - Use TypeScript classes/interfaces for message structures
   - Implement mn_Length tracking (includes header size)
   - Track ln_Type changes (NT_MESSAGE vs NT_REPLYMSG)

2. **Signal Emulation**
   - Map signals to JavaScript Events or Promises
   - Implement 32-bit signal mask per task
   - Remember signals don't count (coalesce duplicates)

3. **Memory Management**
   - Not critical in JS environment (garbage collected)
   - Track allocation/free for debugging
   - Simulate MEMF_PUBLIC for shared structures

4. **Port Management**
   - Maintain global public port registry (Map by name)
   - Implement Forbid()/Permit() as critical sections
   - FIFO queue for messages (Array.push/shift)

5. **Task/Process Emulation**
   - Map AmigaOS tasks to JavaScript async contexts
   - Each door = separate task context
   - Maintain task structure with signal state

### Critical Behaviors to Emulate

1. **Non-Copying Message Passing**
   - Pass object references, not deep copies
   - Sender must not modify until reply received
   - Receiver owns message until ReplyMsg

2. **Signal Semantics**
   - Multiple signals coalesce to single bit
   - Wait() clears returned signals
   - Signals persist if not waited on

3. **Port Lifetime**
   - FindPort() can return NULL at any time
   - Public ports persist in registry
   - Private ports only accessible via direct reference

4. **Error Conditions**
   - AllocSignal() fails if all 32 bits used
   - CreateMsgPort() fails if no signals available
   - FindPort() fails if port removed or never added

---

## Debugging Tips

### Common Alerts

- **AN_MemCorrupt ($01000005)**: Memory list corrupted (wrong FreeMem size, buffer overrun)
- **AN_FreeTwice ($01000009)**: Memory freed twice (tracking error)

### Validation Checks

1. **Message Port**
   - ln_Type == NT_MSGPORT (4)
   - mp_Flags contains valid PA_* value
   - mp_SigTask \!= NULL if PA_SIGNAL
   - mp_MsgList initialized

2. **Message**
   - ln_Type == NT_MESSAGE or NT_REPLYMSG
   - mn_ReplyPort valid if expecting reply
   - mn_Length includes Message header

3. **Signals**
   - Signal bit 0-31 range
   - Signal mask non-zero for Wait()
   - Task pointer valid for Signal()

---

## Summary

This guide provides the foundation for implementing accurate AmigaOS door emulation in AmiExpress-Web. The key principles:

1. **Message passing is zero-copy** - only pointers move, ownership transfers
2. **Signals are flags, not counters** - they coalesce
3. **Ports use signals** - message arrival triggers task signal
4. **Always protect FindPort()** with Forbid()/Permit()
5. **Loop GetMsg() until NULL** - multiple messages may arrive per signal
6. **Reply all messages** - receiver must ReplyMsg() when done

For complete details, consult the original documentation at the paths listed above.

**End of Guide**
