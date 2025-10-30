# Amiga Message Port System - Implementation Guide

## Overview

Amiga message ports are a fundamental IPC (Inter-Process Communication) mechanism used by many BBS doors, including AquaWho and the Tempest door family. This document explains how they work and how to implement them for door communication.

## Message Port Architecture

### Key Concepts

1. **Message Ports** - Named communication endpoints that processes can find and send messages to
2. **Messages** - Data structures containing commands and data passed between processes
3. **Port Names** - String identifiers used to locate message ports (e.g., "AEDoorPort1", "TEMPEST_DOOR")
4. **Reply Ports** - Return address for message responses

### Door Communication Flow

```
Door Process                    BBS Process
     |                               |
     |  1. FindPort("AEDoorPort1")   |
     |------------------------------>|
     |  <---- Returns MsgPort ptr    |
     |                               |
     |  2. CreatePort("MyDoor-1")    |
     |  (Creates reply port)         |
     |                               |
     |  3. Build message structure   |
     |     - Command                 |
     |     - Data pointers           |
     |     - Reply port              |
     |                               |
     |  4. PutMsg(AEDoorPort, msg)   |
     |------------------------------>|
     |                               | Process request
     |  5. WaitPort(MyReplyPort)     | Fill response data
     |     <waits for response>      |
     |  <-----------ReplyMsg()-------|
     |                               |
     |  6. GetMsg(MyReplyPort)       |
     |     <--- Returns message      |
     |                               |
     |  7. Process response data     |
     |                               |
```

## Message Structure

Based on Tempest door sources (headers.h):

```c
struct MyMessage {
    struct Message Msg;          // Standard Amiga message header
    ULONG  Command;              // Command to execute

    char   *text1;               // Text pointer 1
    char   *text2;               // Text pointer 2
    char   *text3;               // Text pointer 3
    int    Value1;               // Integer value 1
    int    Value2;               // Integer value 2
    ULONG  LongValue;            // Long value
    LONGBITS Flags;              // Flag bits
    int    carrier;              // Carrier status

    struct User       *User;     // Pointer to user data
    struct SystemData *SystemData; // Pointer to system data
    struct NodeData   *NodeData;   // Pointer to node data
};
```

### Standard Amiga Message Header

```c
struct Message {
    struct Node mn_Node;         // Intrusive list node
    struct MsgPort *mn_ReplyPort; // Where to send reply
    UWORD mn_Length;             // Message length in bytes
};

struct Node {
    struct Node *ln_Succ;        // Next node in list
    struct Node *ln_Pred;        // Previous node in list
    UBYTE ln_Type;               // Node type (NT_MESSAGE = 0)
    BYTE ln_Pri;                 // Priority
    char *ln_Name;               // Optional name
};
```

## Port Naming Conventions

### AmiExpress Ports

```
AEDoorPort%d      - AmiExpress door port (e.g., "AEDoorPort1")
                    %d = node number
```

### Tempest BBS Ports

```
NODE:TEMPEST_DOOR - Tempest BBS main door port
                    NODE = node identifier (e.g., "Node1:")

NODE-X:DOOR_PORT  - Door reply port
                    NODE = node identifier
                    X = unique number (0-199)
```

## Door Communication Pattern

### Initialization (from T-TopCPS door)

```c
int DoorStart(TEXT *node) {
    struct MsgPort *HisPort;

    // Find BBS port
    sprintf(st, "%s:TEMPEST_DOOR", node);
    HisPort = FindPort(st);
    if (HisPort == NULL) return FALSE;

    // Find unique name for door port
    for (x = 0; x < 200; x++) {
        sprintf(MyName, "%s-%d:DOOR_PORT", node, x);
        if (FindPort(MyName) == NULL) break;
    }
    if (x >= 200) return FALSE;

    // Create door's reply port
    MyPort = CreatePort(MyName, 0L);
    if (MyPort == NULL) {
        PutStr("Can't open port");
        return FALSE;
    }

    // Send initial command (0)
    DOORIO(0);

    // Extract user/system/node data from response
    User = *&send.User;
    SystemData = *&send.SystemData;
    NodeData = *&send.NodeData;

    return TRUE;
}
```

### Door I/O Function

```c
int DOORIO(WORD Command) {
    struct MsgPort *HisPort;

    if (send.carrier) return 0;  // Carrier lost

    send.Command = Command;
    HisPort = FindPort(st);
    if (HisPort != NULL) {
        // Setup message header
        send.Msg.mn_Node.ln_Type = NT_MESSAGE;
        send.Msg.mn_Length = sizeof(send);
        send.Msg.mn_ReplyPort = MyPort;
        send.carrier = 0;

        // Send message
        PutMsg((struct MsgPort *)HisPort, (struct Message *)&send);

        // Wait for reply
        Wait(1 << MyPort->mp_SigBit);

        // Get reply
        GetMsg(MyPort);

        // Check carrier
        if ((send.carrier) && (send.Command != 999)) {
            CloseStuff();
        }
        return 1;
    }
    return 0;
}
```

### Cleanup

```c
VOID CloseStuff(void) {
    // Send termination command
    DOORIO(999);

    // Drain any pending messages
    while (msg = (struct MyMessage *)GetMsg(MyPort)) {
        ReplyMsg((struct Message *)msg);
    }

    // Delete port
    if (MyPort) DeletePort(MyPort);

    exit(0);
}
```

## exec.library Functions Required

### CreateMsgPort() / CreatePort()

```
Offset: -666 (0xFFFFFD66)
Purpose: Create a message port with a given name
Params:
  D0 = Name (BSTR or C-string pointer)
  D1 = Priority (usually 0)
Returns:
  D0 = MsgPort pointer (0 if failed)
```

### DeleteMsgPort() / DeletePort()

```
Offset: -672 (0xFFFFFD60)
Purpose: Delete a message port
Params:
  A1 = MsgPort pointer
Returns:
  None
```

### FindPort()

```
Offset: -390 (0xFFFFFE7A)
Purpose: Find a public message port by name
Params:
  A1 = Name (C-string pointer)
Returns:
  D0 = MsgPort pointer (0 if not found)
```

### PutMsg()

```
Offset: -366 (0xFFFFFE92)
Purpose: Send a message to a port
Params:
  A0 = MsgPort pointer
  A1 = Message pointer
Returns:
  None
```

### GetMsg()

```
Offset: -372 (0xFFFFFE8C)
Purpose: Get a message from a port
Params:
  A0 = MsgPort pointer
Returns:
  D0 = Message pointer (0 if no messages)
```

### ReplyMsg()

```
Offset: -378 (0xFFFFFE86)
Purpose: Reply to a message
Params:
  A1 = Message pointer
Returns:
  None
```

### WaitPort()

```
Offset: -384 (0xFFFFFE80)
Purpose: Wait for a message to arrive at a port
Params:
  A0 = MsgPort pointer
Returns:
  D0 = Message pointer (first message in queue)
```

### Wait()

```
Offset: -318 (0xFFFFFEC2)
Purpose: Wait for signal bits
Params:
  D0 = Signal mask (1 << mp_SigBit)
Returns:
  D0 = Signals received
```

## MsgPort Structure

```c
struct MsgPort {
    struct Node mp_Node;         // Intrusive list node
    UBYTE mp_Flags;              // Port flags
    UBYTE mp_SigBit;             // Signal bit number (for Wait())
    struct Task *mp_SigTask;     // Task to signal
    struct List mp_MsgList;      // List of messages
};

// mp_Flags values
#define PF_ACTION   (1<<0)       // Port has action routine
#define PA_SIGNAL   (1<<1)       // Signal task when message arrives
#define PA_SOFTINT  (1<<2)       // Cause software interrupt
#define PA_IGNORE   (1<<3)       // Ignore messages
```

## Implementation Strategy

### Phase 1: Basic Message Port Registry

Create a global registry of message ports:
- Map port names to Port objects
- Support FindPort() lookup
- Support CreatePort() registration
- Support DeletePort() removal

### Phase 2: Message Queue

Implement message queuing:
- Each port has a list of pending messages
- PutMsg() adds to queue
- GetMsg() removes from queue
- WaitPort() blocks until message arrives

### Phase 3: Door Message Handler

Create AEDoorPort handler:
- Registers "AEDoorPort%d" for each node
- Handles incoming door commands
- Fills User/SystemData/NodeData structures
- Returns responses via ReplyMsg()

### Phase 4: Command Processing

Implement door commands:
- Command 0: Initialize (return user/system/node data)
- Command 999: Terminate door
- Other commands: I/O operations, etc.

## Door Commands (Observed)

```
0   - Initialize door (returns user/system/node pointers)
999 - Terminate door
```

## Memory Layout Considerations

### Pointer Sharing

Doors expect to receive POINTERS to User/SystemData/NodeData structures:
- These pointers must point to valid memory in the emulated address space
- Structures must be properly serialized to Amiga format
- Endianness must be handled correctly (Motorola 68k is big-endian)

### Structure Sizes (from headers.h)

```
struct User       = 710 bytes
struct SystemData = 5006 bytes
struct NodeData   = 4296 bytes
struct Globals    = 3200 bytes (inside NodeData)
```

## Testing Strategy

1. Implement basic FindPort/CreatePort/DeletePort
2. Test with simple port creation and lookup
3. Implement PutMsg/GetMsg/ReplyMsg
4. Test with simple message passing
5. Create AEDoorPort handler
6. Test with AquaWho door:
   - Should find "AEDoorPort1"
   - Should create reply port
   - Should send command 0
   - Should receive user data
   - Should NOT output "Couldn't find multicom port!"

## Success Criteria

- AquaWho door successfully finds AEDoorPort
- Door creates its reply port
- Door sends/receives messages
- Door displays user information instead of error message
- No "dos.library" spam in output

## References

- Tempest door sources: `/Docs/Doors_with_Source/1OO-TJ20/` (T-Join)
- Tempest door sources: `/Docs/Doors_with_Source/1OOTTC10/` (T-TopCPS)
- Header definitions: `/Docs/Doors_with_Source/1OO-TJ20/Sources/Include/Tempest/headers.h`
- AquaWho binary: `/Doors/AquaWho/AquaWho`
