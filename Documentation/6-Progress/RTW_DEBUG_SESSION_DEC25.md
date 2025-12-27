# RTW Door Debugging Session - December 25, 2024

## Problem Statement
RTW (Real Time Who) door shows error banner "This is a XIM-DOOR for AmiExpress 3.x only" instead of displaying node/user information.

## Door Information
- **Type**: XIM (not AEDoor.library)
- **Binary**: `/doors/RTW/rtw` (lowercase)
- **Command**: `/Commands/BBSCmd/RTW.info` with TYPE=XIM
- **Strings found**: "AEServer.%d", "AEDoorPort%d", "AEDoorRP.000"
- **Behavior**: Polls AEServer.1 with GetMsg (expects to RECEIVE messages)

## What We Know Works
1. ✅ A4 register correctly set to 0x5108 (start of small data section)
2. ✅ Port naming: AEServer.1 created at 0xa0000
3. ✅ RTW reads BBSInfo successfully (outputs "sysop")
4. ✅ RTW finds AEServer.1 port successfully (FindPort returns 0xa0000)
5. ✅ BBS polling XIM messages (190k+ polls observed)

## Chronological Debugging Attempts

### Attempt 1: Port Naming (FAILED)
**Hypothesis**: RTW expects "AEDoorPort1" instead of "AEServer.1"
**Files Changed**: None (ports already correctly named)
**Result**: FAILED - RTW has both strings and successfully finds AEServer.1
**Logs**: `[ExecLibrary] Found "AEServer.1" at 0xa0000`

### Attempt 2: Removed BBS Sending INIT/STAT (FAILED)
**Hypothesis**: BBS shouldn't send initial messages (AEDoor.library protocol)
**Files Changed**:
- `DoorLifecycleManager.ts:303-307` - Commented out `sendStartupMessage()`
**Result**: FAILED - Door polled endlessly, found no messages
**Logs**: 190k+ polls, no messages found
**Reason**: RTW is XIM door, not AEDoor.library - different protocol

### Attempt 3: Re-enabled Startup Messages for XIM Only (FAILED)
**Hypothesis**: XIM doors need BBS to send initial messages
**Files Changed**:
- `DoorLifecycleManager.ts:303-309` - Re-enabled for `doorType === "XIM"`
**Code**:
```typescript
if (this.config.doorType === "XIM") {
  console.log("[DoorLifecycleManager] Sending startup message for XIM door");
  await this.sendStartupMessage();
}
```
**Result**: FAILED - Messages sent but door still shows banner
**Logs**: `[DoorMessageHandler] Sending INIT message` to port 0xa0000

### Attempt 4: Send to AEDoorRP Instead of AEServer (FAILED)
**Hypothesis**: Messages should go to door's reply port (AEDoorRP.001), not AEServer.1
**Files Changed**:
- `DoorMessageHandler.ts:209-223` - Changed target port to AEDoorRP.001
**Code**:
```typescript
const doorReplyPortName = `AEDoorRP.${nodeId.toString().padStart(3, '0')}`;
const doorReplyPort = this.execLibrary.findPort(doorReplyPortNameAddr);
const targetPorts = [doorReplyPort];
```
**Result**: FAILED - Door doesn't poll AEDoorRP.001
**Logs**:
- BBS: `Sending to door reply port AEDoorRP.001 at 0x103274`
- Door: `>>> GetMsg(port=0xa0000)` (still polling AEServer.1)
**Reason**: RTW hardcoded to poll AEServer.1, not AEDoorRP

### Attempt 5: Send to AEServer.1 with Delayed BBS Polling (FAILED)
**Hypothesis**: Race condition - BBS's pollXIMMessages consumes its own messages before door sees them
**Files Changed**:
- `DoorMessageHandler.ts:209-213` - Reverted to send to AEServer.1
- `DoorLifecycleManager.ts:1544-1548` - Added delay to BBS polling

**Code Changes**:
```typescript
// DoorMessageHandler.ts
const portAddr = this.execLibrary.getDoorPortAddress(); // AEServer.1
console.log(`[DoorMessageHandler] Sending startup messages to AEServer.1`);
const targetPorts = [portAddr];

// DoorLifecycleManager.ts
// CRITICAL: Don't poll if we just sent startup messages
// Give the door time to receive them first (skip first 1000 iterations)
if (this.config.doorType === "XIM" && this.pollCount < 1000) {
  return;
}
```
**Result**: FAILED - BBS still consumed messages first
**Logs**:
- `[DoorLifecycleManager] Sending startup message for XIM door`
- `[DoorLifecycleManager] XIM polling: Got message at 0x100340`
- `[DoorLifecycleManager] XIM polling: Parsed message command=0 data=0`
**Reason**: Messages sent BEFORE loop starts, delay check happens AFTER messages queued. BBS polling consumed them immediately.

### Attempt 6: Disable BBS Polling Entirely for XIM Doors (RECOMMENDED NEXT)
**Hypothesis**: RTW expects AEServer.1 to be RECEIVE-only for the door, BBS shouldn't poll it
**Rationale**:
- RTW polls AEServer.1 to receive messages from BBS
- RTW never calls PutMsg (doesn't send messages back)
- This is ONE-WAY communication: BBS → Door only
- BBS polling is for BIDIRECTIONAL doors that send replies

**Proposed Change**:
```typescript
// DoorLifecycleManager.ts pollXIMMessages()
// Completely disable BBS polling for XIM doors
if (this.config.doorType === "XIM") {
  if (this.pollCount === 1) {
    console.log(`[DoorLifecycleManager] XIM polling DISABLED - door polls port, not BBS`);
  }
  return;
}
```
**Result**: FAILED - Door exits before XIM initialization
**Logs**:
- BBS: `[DoorLifecycleManager] XIM polling DISABLED - door polls port, not BBS`
- BBS: `[DoorMessageHandler] Sending INIT message (data=0x0)` to port 0xa0000
- Door: `[dos.library] Write: Console output (39 bytes): " This is a XIM-DOOR for AmiExpress 3.x\r\n"`
- Door: NO FindPort calls, NO GetMsg calls, NO XIM protocol activity
- Door: 199,457 iterations then clean exit
**Reason**: Door performs ENVIRONMENT CHECK before XIM initialization, exits if check fails. Never reaches FindPort/GetMsg code.

### Attempt 7: Create AEDoorPort{N} Instead of DoorControl{N} for XIM Doors (CURRENT)
**Hypothesis**: RTW checks for AEDoorPort{N} port existence before initializing XIM protocol
**Discovery**: Used Task agent to search express.e source, found XIM door startup sequence:
1. Door calls `FindPort("AEDoorPort{nodeId}")` - express.e:4317
2. If port NOT found → Exit with "This is a XIM-DOOR for AmiExpress 3.x only"
3. If port IS found → Query EXPRESS_VERSION, initialize XIM protocol

**Files Changed**:
- `LibraryManager.ts:362-367` - Updated comments explaining port naming
- `LibraryManager.ts:401-404` - Fixed alternate port logic: `isSIMType ? "AEServer" : "AEDoorPort"`

**Code Change**:
```typescript
// OLD (WRONG for XIM doors):
const altBasePortName = isSIMType ? "AEDoorPort" : "DoorControl";

// NEW (CORRECT - XIM doors get AEDoorPort{N}):
const altBasePortName = isSIMType ? "AEServer" : "AEDoorPort";
```

**Ports Created for XIM Door (Node 1)**:
- Primary: `AEServer.1` (main port for message passing)
- Alternate: `AEDoorPort1` ✅ (required for door startup verification)
- Simple: `AEDoorPort` (fallback name)

**Expected**: RTW will find `AEDoorPort1`, pass environment check, initialize XIM protocol
**Status**: CODE CHANGED, PENDING TEST

## Technical Findings

### Message Flow Architecture
```
AEServer.1 (0xa0000):
  - Door sends TO BBS: door calls PutMsg(AEServer.1)
  - BBS receives FROM door: BBS calls GetMsg(AEServer.1)
  - ALSO: BBS sends TO door (startup messages)
  - ALSO: Door receives FROM BBS: door calls GetMsg(AEServer.1)

This is BIDIRECTIONAL, causing race conditions!
```

### Port Usage Observed
1. **AEServer.1** (0xa0000) - Created by BBS, polled by both BBS and door
2. **AEDoorRP.001** (0x103274) - Created by BBS, NOT used by RTW
3. **No door-created port** - RTW never calls CreatePort/CreateMsgPort

### Key Code Locations
- Port creation: `LibraryManager.ts:362-435`
- BBS polling: `DoorLifecycleManager.ts:1541-1612`
- Message sending: `DoorMessageHandler.ts:164-271`
- XIM protocol: `XIMProtocol.ts:248-303`

## What Didn't Work (Don't Try Again)

1. ❌ Disabling BBS startup messages completely (door found nothing)
2. ❌ Sending messages to AEDoorRP instead of AEServer.1 (door doesn't poll that port)
3. ❌ Removing DoorReplyPort creation (didn't affect anything)
4. ❌ Delaying BBS polling with iteration count (messages sent before loop starts)
5. ❌ Sending messages earlier or later in initialization (timing didn't matter, BBS always consumed first)
6. ❌ Disabling BBS polling entirely (door exits before XIM initialization, never polls)
7. ❌ Assuming door would find AEServer.1 port (door checks for AEDoorPort{N} first)

## What We Haven't Tried Yet

1. **Disassemble RTW** to find exactly what it checks before showing error banner
2. **Use vamos** to trace real RTW execution on actual Amiga environment
3. **Check if RTW needs specific BBSInfo fields** populated
4. **Verify message structure** - maybe INIT/STAT format is wrong
5. **Check if door expects WBStartup message** instead of INIT/STAT
6. **Look for version checks** - error says "AmiExpress 3.x only"

## Next Steps if Current Attempt Fails

1. Use radare2 to disassemble the error banner display code in RTW
2. Find what condition triggers the banner vs normal execution
3. Check express.e source for XIM door initialization sequence (we checked AEDoor.library, not XIM)
4. Compare with a working XIM door binary if available
5. Consider that RTW might be incompatible with our emulator (last resort)

## Context Usage Note
This debugging session has used 106K/200K tokens. If we continue looping, we should:
1. Switch to a fresh session with this document as reference
2. Focus on disassembly to find root cause instead of trial-and-error
3. Use MCP tools more effectively to search express.e for XIM specifics

### Attempt 8: Kickstart ROM Integration (FAILED - CONCLUSIVE)
**Hypothesis**: RTW needs real Kickstart 3.1 ROM instead of AROS ROM
**Files Changed**:
- Integrated KickstartRom into AmigaDoorSession startup
- Copied Kickstart 3.1 ROM to `web/backend/data/amiga-roms/`
- LibraryLoader now loads ROM-resident libraries from Kickstart ROM

**Result**: FAILED - RTW shows identical error with Kickstart ROM
**Logs**:
- `[ROM] Kickstart 3.1 loaded successfully` ✅
- `[LibraryLoader] ✅ dos.library is ROM-resident (using Kickstart ROM)` ✅
- RTW still shows error banner, no FindPort calls

**VAMOS Test (Ground Truth)**:
```bash
$ vamos doors/RTW/RTW
 This is a XIM-DOOR for AmiExpress 3.x
```
- RTW shows SAME error in vamos (proper Amiga OS emulator)
- vamos trace: RTW only opens dos.library, then exits
- NO FindPort/FindSemaphore calls in vamos either

**Conclusive Finding**:
RTW's check is CORRECT - it detects it's NOT running under AmiExpress BBS. The error message is accurate. RTW reads memory at `A5-0x58` (0x10051C) expecting AmiExpress-provided structure pointer. When zero, displays error.

**Root Cause**:
RTW is NOT a standalone door. It requires AmiExpress to pre-populate memory structures/semaphores/environment before launching. This is beyond port creation - requires full AmiExpress environment initialization that happens BEFORE door execution.

---

## CONCLUSION - STOP INVESTIGATION LOOP

**Status**: RTW requires AmiExpress-specific initialization not yet implemented
**Evidence**: Identical behavior in vamos proves RTW check is working correctly
**Solution Path**: Implement AmiExpress XIM door launch sequence (not just port creation)

**Required Research** (express.e source):
1. How does AmiExpress initialize XIM door environment?
2. What structures/pointers does it set up before calling the door?
3. What memory locations must be populated?
4. Is there a global AmiExpress version/environment structure?

**DO NOT**:
- Try more port naming variations (ports are correct)
- Try different ROM configurations (ROM is correct)
- Investigate RTW binary (RTW is correct)
- Adjust BBS polling logic (logic is correct)

**DO**:
- Research express.e XIM door launch code
- Implement missing AmiExpress environment setup
- Test with simpler XIM doors first (if available)

---

## December 26, 2024 - Session Continued

### Progress Since Dec 25
RTW now PASSES the initialization check and enters XIM protocol! The previous session's work on environment variables and Kickstart ROM was necessary but not sufficient. Additional fixes were made to populate missing structures.

### Current Status: RTW Stuck After JH_REGISTER

**What Works Now**:
1. RTW loads and starts executing
2. RTW sends JH_REGISTER (command=1) successfully
3. BBS receives and processes JH_REGISTER
4. BBS sends reply with lineLen=23, nodeId=1

**What's Broken**:
RTW is stuck in an infinite loop polling `AEDoorPort1` for messages, but our reply was sent to `AEDoorRP.010` (the door's reply port).

### Root Cause Found: XIM Reply Port Mismatch

**The Problem**:
```
Door sends:     JH_REGISTER to AEDoorPort1 (0xa0200)
BBS receives:   GetMsg on AEDoorPort1 -> gets JH_REGISTER
BBS replies:    ReplyMsg sends to mn_ReplyPort (0x100120 = AEDoorRP.010)
Door waits:     GetMsg on AEDoorPort1 (0xa0200) <- WRONG PORT!
Door never receives reply because it's on a different port
```

**Evidence from logs**:
```
[ExecLibrary][ReplyMsg] msg=0x100020 replyPort=0x100120
[ExecLibrary][PutMsg] port=0x100120 name=AEDoorRP.010 msg=0x100020
[ExecLibrary] >>> GetMsg(port=0xa0200)  <- Door polling wrong port!
[ExecLibrary]   No messages in port
[ExecLibrary] >>> GetMsg(port=0xa0200)  <- Infinite loop
```

**Comparison with Real Amiga RTW**:
From `/Documentation/4-Door-Developers/rtw.log`:
- Real RTW sends JH_REGISTER (cmd=1) with string "AEDoorRP.000"
- Immediately continues to cmd=102, cmd=531, then output (cmd=4)
- Does NOT wait for explicit reply - communication is on same port

### Fix Applied: Send Reply to AEDoorPort

**Files Changed**:

1. **XIMProtocol.ts** (lines 129-131):
   ```typescript
   // Added to XIMState initialization:
   ximPortAddr: doorPort,
   aePortAddr: doorPort,
   doorPortAddr: doorPort,
   ```

2. **system-commands.ts** (lines 92-107):
   ```typescript
   // Changed from:
   this.execLibrary.replyMsg(msg.msgAddr);

   // Changed to:
   if (this.ximPortAddr !== 0) {
     const NT_REPLYMSG = 6;
     this.emulator.writeMemory(msg.msgAddr + 8, NT_REPLYMSG);
     this.execLibrary.putMsg(this.ximPortAddr, msg.msgAddr, { suppressDoorCallback: true });
   } else {
     this.execLibrary.replyMsg(msg.msgAddr);
   }
   ```

**Rationale**:
XIM doors use a BIDIRECTIONAL model on AEDoorPort:
- Door SENDS messages to AEDoorPort
- Door RECEIVES replies from same port (AEDoorPort)
- mn_ReplyPort is for something else (possibly async notifications)
- Standard ReplyMsg to mn_ReplyPort doesn't work for XIM

### DO NOT Try Again

1. ❌ Using ReplyMsg for XIM door replies (goes to wrong port)
2. ❌ Sending to AEDoorRP.XXX (door doesn't poll it for JH_REGISTER reply)
3. ❌ Assuming standard Amiga message model (XIM is bidirectional on one port)

### Key Insight: XIM Protocol is Different

Standard Amiga message passing:
- Sender sets mn_ReplyPort to own port
- Receiver calls ReplyMsg which sends to mn_ReplyPort
- Sender calls GetMsg on own port to get reply

XIM door message passing:
- Door sends to AEDoorPort
- Door polls SAME port (AEDoorPort) for replies
- BBS must put reply back on AEDoorPort, not mn_ReplyPort
- mn_ReplyPort may be used for async events only

### Next Steps

1. Test if RTW progresses after this fix
2. If yes, may need same fix for other XIM commands
3. If no, check if door expects specific data in reply message

### Other Session Fixes (Dec 26)

- Fixed duplicate `amigaNodeId` variable in LibraryManager.ts
- Fixed duplicate `portAddr` variable (renamed to `mainPortAddr`, `aedoorPortAddr`)
- Fixed non-existent `findPortByName` method call (changed to `ensurePublicPort`)
- Optimized CLAUDE.md from 41.3k to 9.7k characters (76% reduction)

---

## RTW WORKING - December 26, 2024 (cont.)

**MAJOR BREAKTHROUGH**: RTW now outputs node list data correctly!

### Fix: Double Line Breaks

**Problem**: RTW output had double line breaks between each row:
```
| 00 |                  |                 | cARRIER lOST :- |              |

| 01 | yOUR lINE         |                 | iN A kEWL dOOR! | rTW v2.01    |
```

**Root Cause**:
- Door sends JH_SM (cmd=4) with `data=1` AND a string containing `\n`
- We were adding another `\n` because of `data=1`
- Result: `\n` (from string) + `\n` (from data=1) = double line breaks

**Evidence** (from logs):
```
[XIMProtocol] <<< XIM Command: 4 (JH_SM) data=1 string="
[XIMIOHandler] JH_SM: "
```
The log breaks after the opening quote because the string itself contains `\n`.

Compared with real Amiga RTW log (`/Documentation/4-Door-Developers/rtw.log`):
```
msg request: 4
data: 1
string:
```
Real Amiga log shows empty string with data=1 (newline is just log format).

**Fix Applied** (`xim/io.ts:937-942`):
```typescript
// CRITICAL: Only add newline if text doesn't already end with one
// Some doors send data=1 with a string that already contains a trailing \n
// Adding another would cause double line breaks (RTW does this)
if (addNewline && !normalized.endsWith('\n')) {
  normalized += '\n';
}
```

**Result**: Single line breaks, correct output formatting.

---

*Last Updated: 2024-12-26 (late)*
*Status: RTW WORKING - output displays correctly*
*Key Finding: XIM doors use bidirectional communication on AEDoorPort*
*Key Finding: Some doors send embedded \n in strings AND data=1, must not double-add*
