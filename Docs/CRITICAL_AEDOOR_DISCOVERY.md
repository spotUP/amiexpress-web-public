# CRITICAL: AEDoor.library Uses Message Ports, Not Simple Function Calls!

**Date:** 2025-10-30
**Discovery:** From AmiExpress-Sources/express.e lines 3379-3500
**Impact:** Complete implementation approach change required

---

## The Discovery

**I was WRONG about how AEDoor.library works!**

### What I Thought:
AEDoor functions like `WriteStr()`, `Prompt()`, `GetDT()` were simple library calls that directly executed code.

### What's Actually True:
AEDoor.library uses **Amiga Message Ports** for IPC (Inter-Process Communication) between the door and the BBS!

---

## How It Actually Works

### Architecture

```
┌─────────────────┐                    ┌──────────────────────┐
│  Door Program   │                    │   BBS (express.e)    │
│                 │                    │                      │
│  WriteStr()  ───┼──┐              ┌──┼─ FindPort()         │
│  Prompt()    ───┼──│ Message Port │──┼─ GetMsg()           │
│  GetDT()     ───┼──│ (IPC)        │──┼─ Process Command    │
│                 │  │              │  │  - JH_WRITE         │
└─────────────────┘  │              │  │  - JH_PM            │
                     │              │  │  - DT_NAME          │
                     └──────────────┘  │  - etc.             │
                                       │                      │
                                       │  ReplyMsg()          │
                                       └──────────────────────┘
```

### Message Protocol (from express.e)

**From express.e line 4317:**
```e
StringF(doorPort,'\s\d','AEDoorPort',node)  // Creates "AEDoorPort0", "AEDoorPort1", etc.
```

**Door side (AEDoor.library):**
1. `CreateComm(nodeNum)` - Creates message port, finds BBS port
2. `WriteStr(diface, string, mode)` - Sends `JH_WRITE` message to BBS
3. `PutMsg(BBSPort, msg)` - Sends message
4. `WaitPort(replyPort)` - Waits for response
5. `GetMsg(replyPort)` - Gets reply

**BBS side (express.e lines 3382-3388):**
```e
CASE JH_WRITE
  IF (transfering=FALSE) AND (doorSilent=FALSE)
    aePuts(msg.string)  // Output to user's terminal
  ENDIF
```

---

## Complete Message Command List

From express.e, here are ALL the door commands:

### Output Commands
- `JH_WRITE` (3382) - Write text to user
- `JH_CO` (3395) - Console output
- `JH_SO` (3401) - Serial output
- `JH_SM` (3406) - Show message
- `JH_SMPTR` (3412) - Show message (pointer)
- `JH_MCI` (3456) - Process MCI codes

### Input Commands
- `JH_PM` (3418) - Prompt for input (line input)
- `JH_LI` (3425) - Line input
- `JH_HK` (3436) - HotKey (read single character)
- `JH_ExtHK` (3432) - Extended HotKey
- `JH_20` (3448) - Read character (variant)
- `QUICK_KEY` - Quick key read
- `JH_FetchKey` (3465) - Fetch key if available

### File Display
- `JH_SG` (3473) - Show security file
- `JH_SF` (3475) - Show file
- `JH_EF` (3477) - Edit file

### System Info
- `JH_BBSNAME` (3486) - Get BBS name
- `JH_SYSOP` (3488) - Get sysop name
- `JH_FLAGFILE` (3490) - Add flag file
- `JH_SIGBIT` (3463) - Get signal bit

### User Data (DT_* commands)
All handled by passing `DT_NAME`, `DT_PASSWORD`, etc. in msg.command

### Control Commands
- `JH_REGISTER` (3379) - Register door
- `JH_SHUTDOWN` (3388) - Shutdown door
- `CHAIN` - Chain to another door
- `RETURNCOMMAND` - Return command to BBS

---

## Why GetAnswer Door Hangs

**Now it makes sense!**

GetAnswer door is:
1. Calling `CreateComm()` to create message port
2. Trying to find `"AEDoorPort0"` message port (doesn't exist!)
3. Hanging forever waiting for port

**The door is NOT executing random code** - it's stuck in a `FindPort()` loop!

---

## Correct Implementation Approach

### Option 1: Full Message Port Emulation (Complex)

Implement Amiga message ports in our emulator:
1. Create `FindPort()` trap
2. Create `CreateMsgPort()` trap
3. Create `PutMsg()` / `GetMsg()` / `ReplyMsg()` traps
4. Implement message queue system
5. Process messages asynchronously

**Complexity:** VERY HIGH - Need full Exec message port system

### Option 2: Intercept AEDoor.library Functions (Medium)

Keep library trap approach but understand they send messages:
1. Trap `WriteStr()` at LVO -84
2. Instead of sending message, directly call our handler
3. Return synchronously (fake the reply)

**This is what we should do!**

The AEDoor.library functions internally do:
```c
WriteStr(diface, string, mode) {
    msg.command = JH_WRITE;
    msg.string = string;
    msg.data = mode;
    PutMsg(BBSPort, msg);
    WaitPort(replyPort);
    return GetMsg(replyPort);
}
```

We intercept `WriteStr()` and skip the message passing:
```typescript
writeStr(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const stringAddr = this.emulator.getRegister(10);  // A2
    const mode = this.emulator.getRegister(0);         // D0

    const str = this.emulator.readString(stringAddr);

    // Instead of sending message, directly output
    this.socket.emit('ansi-output', str + (mode ? '\r\n' : ''));

    return 0;  // Success
}
```

### Option 3: Hybrid (BEST)

1. Implement critical AEDoor.library functions as traps
2. For functions like `CreateComm()`, return fake interface pointer
3. For `WriteStr()`, `Prompt()`, etc., execute directly (no messages)
4. Door thinks it's using message ports, but we handle synchronously

---

## Implementation Plan

### Phase 3A: Minimal AEDoor Functions

**Trap these at correct LVO offsets:**

1. **CreateComm (-30)**
   - Returns fake `diface` pointer (e.g., 0x080000)
   - Stores socket reference for this door session

2. **WriteStr (-84)**
   - Read string from memory
   - Send to socket via emit('ansi-output')
   - Return immediately (no wait)

3. **Prompt (-78)**
   - Send prompt to socket
   - Wait for user input (blocking or queue)
   - Write response to memory
   - Return pointer to response

4. **GetString (-72)**
   - Return pointer to shared string buffer (e.g., 0x081000)

5. **GetDT (-108)**
   - Check DT_* constant in D0
   - Return appropriate user data
   - Write to string buffer

6. **DeleteComm (-36)**
   - Cleanup (no-op for now)

### Phase 3B: Add Remaining Functions

As doors need them.

---

## Critical Code References

**express.e door handling:** Lines 3379-3500
**Door port creation:** Line 4317
**Message processing:** Lines 1085-1160 (another handler)

**Example door:** `/Docs/Doors_with_Source/AEDOORS/AmiExpress/Sources/example.e`

---

## Next Steps

1. ✅ Document this discovery
2. ⏳ Create AEDoorLibrary.ts with trap-based approach
3. ⏳ Implement CreateComm, WriteStr, Prompt, GetString, GetDT
4. ⏳ Add to LibraryTraps system
5. ⏳ Test GetAnswer door - should now work!

---

## Status

**Phases 1 & 2:** ✅ COMPLETE
**Phase 3 Understanding:** ✅ COMPLETE (this document)
**Phase 3 Implementation:** ⏳ READY TO BEGIN

**Key Insight:** We DON'T need to implement full message ports. We can trap AEDoor.library functions and handle them directly!
