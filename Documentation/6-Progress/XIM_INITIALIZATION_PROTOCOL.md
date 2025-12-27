# XIM Door Initialization Protocol - EXACT SEQUENCE

## Critical Discovery: The Door MUST Send First!

**ANSWER TO YOUR QUESTION**: The BBS does **NOT** send any initial messages to XIM doors. The BBS creates the port, launches the door process, and **WAITS** for the door to send the first message.

## Exact Initialization Sequence (from express.e and AEDoor.c)

### BBS Side (express.e lines 4316-4370)

```elan
1. BBS creates port name: StringF(doorPort, 'AEDoorPort\d', node)
   Example: "AEDoorPort1" for node 1

2. BBS checks if port already exists or creates new one:
   IF (mp := FindPort(doorPort))
     alreadyActive := TRUE
   ELSE
     mp := createPort(doorPort, 0)
   ENDIF

3. BBS calculates signal mask:
   ximSig := Shl(1, mp.sigbit)

4. BBS launches door process:
   temp := startProcess(exestring, stacksize, pri, async, doorTrap)

5. BBS enters message loop (WAITS for door to send first):
   IF type = DOORTYPE_XIM
     WHILE (exit = FALSE)
       signals := Wait(ximSig)          <- BBS WAITS here!
       WHILE (msg := GetMsg(mp))        <- Only processes INCOMING messages
         msgcmd := msg.command
         processXimMsg(msgcmd, msg, ...)
         ReplyMsg(msg)
       ENDWHILE
     ENDWHILE
```

**Key Point**: The BBS does **NOT** send any PutMsg() calls. It only calls `Wait(ximSig)` and `GetMsg(mp)` - meaning it's WAITING for messages FROM the door.

### Door Side (AEDoor.c template - lines 187-214)

```c
1. Door finds BBS port:
   sprintf(doorport, "AEDoorPort%d", line_num);
   DoorControlPort = FindPort(doorport);

2. Door creates reply port:
   DoorReplyPort = CreatePort(0, 0);

3. Door allocates XIM message:
   XIM_Msg = AllocMem(sizeof(struct XIM), MEMF_PUBLIC | MEMF_CLEAR);

4. Door sets up message structure:
   XIM_Msg->Msg.mn_Node.ln_Type = NT_MESSAGE;
   XIM_Msg->Msg.mn_Length = sizeof(struct XIM);
   XIM_Msg->Msg.mn_ReplyPort = DoorReplyPort;

5. Door sends FIRST message (JH_REGISTER):
   XIM_Msg->Command = 1;  <- JH_REGISTER
   CheckMessage();        <- Calls PutMsg(DoorControlPort, XIM_Msg)

6. Door waits for BBS reply:
   signals = Wait(usersig | portsig);
   reply = GetMsg(DoorReplyPort);
```

## The JH_REGISTER Message (Command = 1)

From axcommon.e line 73:
```elan
EXPORT CONST JH_REGISTER = 1
```

From express.e lines 3379-3381:
```elan
CASE JH_REGISTER
    msg.command := IF loggedOnUser <> NIL THEN userLineLen ELSE 29
    nodesPtr[] := nodesPtr[] + 1
```

**What happens**:
1. Door sends message with Command=1 (JH_REGISTER)
2. BBS receives it, increments node counter
3. BBS replies with msg.command set to:
   - `userLineLen` if user is logged on (typically 80)
   - `29` if no user logged on (guest mode)
4. Door receives reply and knows registration succeeded

## Why RTW Fails

RTW's behavior (from your logs):
1. RTW calls `FindPort("AEServer.1")` - WRONG! Should be "AEDoorPort1"
2. RTW polls with GetMsg() but NEVER calls PutMsg()
3. RTW never sends JH_REGISTER message
4. RTW shows error: "This is a XIM-DOOR for AmiExpress 3.x only"

**Problem**: RTW is looking for wrong port name and never initiates the handshake!

## Complete Message Flow

```
TIME  | BBS (AEDoorPort1)           | DOOR (Reply Port)
------|------------------------------|---------------------------
  0   | CreatePort("AEDoorPort1")   |
  1   | StartProcess("rtw 1")       |
  2   | Wait(ximSig) [BLOCKED]      | CreatePort(0, 0)
  3   |                              | FindPort("AEDoorPort1")
  4   |                              | XIM_Msg->Command = 1
  5   |                              | PutMsg(AEDoorPort1, XIM_Msg)
  6   | Wait() returns, GetMsg()    |
  7   | Process JH_REGISTER         |
  8   | msg.command = userLineLen   |
  9   | ReplyMsg(msg)               |
 10   |                              | GetMsg(DoorReplyPort)
 11   |                              | [Registration complete!]
 12   | Wait(ximSig) [BLOCKED]      | [Door can now use XIM API]
```

## All XIM Message Commands (from axcommon.e)

```
JH_LI           = 0   - Line Input
JH_REGISTER     = 1   - Register door (FIRST MESSAGE!)
JH_SHUTDOWN     = 2   - Shutdown notification
JH_WRITE        = 3   - Write text
JH_SM           = 4   - Screen Message
JH_PM           = 5   - Prompt Message
JH_HK           = 6   - Hot Key
JH_SG           = 7   - Show Graphic
JH_SF           = 8   - Show File
JH_EF           = 9   - Edit File
JH_CO           = 10  - Console Output
JH_BBSNAME      = 11  - Get BBS Name
JH_SYSOP        = 12  - Get Sysop Name
JH_FLAGFILE     = 13  - Flag File
JH_SHOWFLAGS    = 14  - Show Flags
JH_ExtHK        = 15  - Extended Hot Key
JH_SIGBIT       = 16  - Get Signal Bit
JH_FetchKey     = 17  - Fetch Key
JH_SO           = 18  - Serial Output
JH_SMPTR        = 19  - Screen Message Pointer
JH_20           = 20  - (Reserved)
JH_MCI          = 507 - MCI Processing
QUICK_KEY       = 608 - Quick Key Input
```

## Critical Rules for XIM Door Implementation

1. **Door MUST send first** - BBS never initiates
2. **First message MUST be JH_REGISTER** (Command=1)
3. **Door MUST use correct port name**: "AEDoorPort{N}" where N is node number
4. **Door MUST create reply port** before sending messages
5. **Every PutMsg() requires Wait() + GetMsg()** to receive reply
6. **BBS replies with ReplyMsg()** - door gets message back on reply port
7. **Door MUST send JH_SHUTDOWN** (Command=2) before exit

## Fix for Our Emulator

The BBS emulator needs to:
1. Create "AEDoorPort{N}" port BEFORE launching door
2. Start door process with node number as argv[1]
3. **WAIT** for door to send JH_REGISTER - do NOT send anything first!
4. When JH_REGISTER received:
   - Set msg.command to line length (80)
   - Call ReplyMsg() to send back to door
5. Continue Wait() + GetMsg() loop for all subsequent messages

## Why "AEServer.1" is Wrong

**CRITICAL DISTINCTION**:
- **AEDoorPort{N}** (no dot) - XIM door communication port (express.e:4317)
- **AEServer.{N}** (with dot) - Inter-node communication port (ACP.e:1006)

RTW is looking for "AEServer.1" which is the **wrong port type**!
- AEServer.1 is used for node-to-node messaging (chat, sysop alerts, etc.)
- XIM doors MUST use AEDoorPort1 (or AEDoorPort2, etc.)

From express.e line 4317:
```elan
IF type=DOORTYPE_XIM
  StringF(doorPort,'\s\d','AEDoorPort',node)
```

Result: "AEDoorPort1" (no dot separator)

**Why RTW fails**:
1. RTW compiled to look for "AEServer.1"
2. This port exists but is for ACP (node control), not door protocol
3. Even if port is found, it's the wrong message protocol
4. Door never finds correct AEDoorPort1 port
5. Door shows error: "This is a XIM-DOOR for AmiExpress 3.x only"

**Solution Options**:
1. Patch RTW binary to change "AEServer.1" string to "AEDoorPort1"
2. Recompile RTW from source (if available)
3. Create compatibility shim that mirrors messages between ports

## References

- express.e lines 4316-4370: BBS XIM message loop
- express.e lines 3372-3571: processXimMsg() implementation
- axcommon.e lines 72-250: XIM message command constants
- AEDoor.c lines 187-229: Standard XIM door initialization template
