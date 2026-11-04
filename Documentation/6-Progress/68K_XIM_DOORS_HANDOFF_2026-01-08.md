# 68K XIM Doors Debug Session - January 8, 2026

## CRITICAL STATUS: PARTIAL FIX ACHIEVED

AquaScan now receives INIT/STAT messages correctly but still exits with code 10.

---

## PROBLEM SUMMARY

**Issue**: AquaScan (and other legacy 68K XIM doors: RTW, Bulls, JoinCnf, WALL) broke after December 27, 2025 refactor.

**Symptom**: Door exits immediately with return code 10 (ERROR_OBJECT_NOT_FOUND) after ~37 iterations without sending any XIM messages.

**Root Cause**: Commit 279611e2d (Jan 8, 03:40 AM) removed `sendStartupMessage()` call, claiming it was incorrect. This was WRONG - commit c9a529286 (Jan 4) had correctly added it to fix AquaScan.

---

## WHAT WE DISCOVERED

### The Old AEDoor Protocol vs Modern XIM

There are TWO different XIM door protocols:

#### **Modern XIM Protocol** (what XIM_CRITICAL_REQUIREMENTS.md documents):
- Door sends JH_REGISTER first
- BBS responds to requests
- Request/reply model
- Door initiates handshake

#### **Legacy AEDoor Protocol** (what AquaScan, JoinCnf, WALL use):
- **BBS sends INIT/STAT messages FIRST**
- Door waits for messages on pr_MsgPort
- Door receives INIT, receives STAT
- Door **replies to both messages** using ReplyMsg()
- THEN door sends JH_REGISTER
- See express.e:3343-3355

### Critical Discovery: pr_MsgPort Messaging

**Key insight**: Legacy doors don't wait on AEDoorPort - they wait on their **process message port (pr_MsgPort)** at offset 0x5C in the Process structure.

**AquaScan behavior**:
1. Calls `WaitPort(0xb35c)` - waiting on pr_MsgPort, NOT AEDoorPort
2. Calls `GetMsg(0xb35c)` - expecting messages on pr_MsgPort
3. Gets NULL → tries `ReplyMsg(NULL)` → exits with code 10

**The fix**: Send INIT/STAT to THREE ports:
- `AEDoorPort1` (0x100000) - for BBS mode detection
- `doorReplyPort` (0x100030) - for door's own message handling
- **`pr_MsgPort` (0xb35c)** - where door actually waits!

---

## FIXES IMPLEMENTED (Uncommitted - in working directory)

### 1. DoorLifecycleManager.ts (lines 394-396)

**Changed FROM**:
```typescript
// CRITICAL: BBS Does NOT Send INIT/STAT Messages (per XIM_CRITICAL_REQUIREMENTS.md)
// DO NOT call sendStartupMessage() - it was removed in commit 279611e2d and that was CORRECT.
```

**Changed TO**:
```typescript
// NOTE: INIT/STAT messages are now sent on FIRST pollXIMMessages() call
// when the door task exists. Sending too early (before task created) causes
// messages to be sent to wrong ports. See pollXIMMessages() for implementation.
```

### 2. DoorLifecycleManager.ts (lines 1881-1888) - Send on First Poll

**Added**:
```typescript
// Send INIT/STAT on first poll when door task exists
if (this.pollCount === 1) {
  console.log(`[DoorLifecycleManager] pollXIMMessages called: doorType="${this.config.doorType}"`);
  // CRITICAL: Send INIT/STAT messages now that door task exists
  // Legacy XIM doors (AquaScan, JoinCnf, WALL) wait for these before sending JH_REGISTER
  // See commit c9a529286 and express.e:3343-3355
  await this.sendStartupMessage();
}
```

**Why deferred**: Sending before door execution starts results in `ThisTask: 0x0` - door task doesn't exist yet. We need to send AFTER door task is created but BEFORE door waits on pr_MsgPort.

### 3. ExecLibrary.ts (lines 2758-2760) - New Getter

**Added**:
```typescript
getCurrentTaskMsgPort(): number {
  return this.currentTask.msgPort;
}
```

**Why needed**: `currentTask.msgPort` is private. This exposes the pr_MsgPort address (0xb35c) so DoorMessageHandler can send messages there.

**Technical note**: pr_MsgPort is stored in `currentTask.msgPort` but NOT written to memory at Process+0x5C. The offset calculation `doorTaskAddr + 0x5C` returns 0 because memory isn't written. Must use `getCurrentTaskMsgPort()` instead.

### 4. DoorMessageHandler.ts (lines 332-337) - Send to pr_MsgPort

**Changed FROM**:
```typescript
const targetPorts = Array.from(
  new Set([portAddr, doorInfoReply].filter((p) => p && p > 0))
);
```

**Changed TO**:
```typescript
// CRITICAL: Also send to the door's process message port (pr_MsgPort)
// Many doors (AquaScan) wait on their own pr_MsgPort, not AEDoorPort
// Get door task's pr_MsgPort directly from ExecLibrary
const doorTaskAddr = this.execLibrary.getCurrentTaskAddress();
const doorTaskPort = this.execLibrary.getCurrentTaskMsgPort();
console.log(`[DoorMessageHandler] Door task: 0x${doorTaskAddr.toString(16)}, pr_MsgPort: 0x${doorTaskPort.toString(16)}`);

const targetPorts = Array.from(
  new Set([portAddr, doorInfoReply, doorTaskPort].filter((p) => p && p > 0))
);
```

### 5. DoorMessageHandler.ts (lines 344-353) - Valid Reply Port

**Changed FROM**:
```typescript
// INIT/STAT use NULL reply port (0) - door doesn't reply to these, just reads them
const initMsgAddr = this.allocateAedoorStyleMessage(0, 0, "INIT", 0);
const statMsgAddr = this.allocateAedoorStyleMessage(
  1,
  this.doorInfoAddr + DoorConstants.MESSAGE_NODE_OFFSET,
  statusText,
  0
);
```

**Changed TO**:
```typescript
// CRITICAL: Door DOES reply to these messages - use doorReplyPort, NOT NULL!
// AquaScan calls ReplyMsg() on STAT message, needs valid reply port or exits with code 10
const initMsgAddr = this.allocateAedoorStyleMessage(0, 0, "INIT", this.doorReplyPortAddr);
const statMsgAddr = this.allocateAedoorStyleMessage(
  1,
  this.doorInfoAddr + DoorConstants.MESSAGE_NODE_OFFSET,
  statusText,
  this.doorReplyPortAddr
);
```

**Why changed**: Door calls `ReplyMsg(msg)` on both INIT and STAT. If reply port is NULL, ReplyMsg logs "No reply port in message" and door exits with code 10.

---

## CURRENT STATE (What Works)

### ✅ Door Now Receives INIT/STAT Messages

**Evidence from logs**:
```
[DoorMessageHandler] Door task: 0xb300, pr_MsgPort: 0xb35c
[DoorMessageHandler] Sending INIT message (data=0x0)
[ExecLibrary] PutMsg(port=0x100000, msg=0x100394)  # AEDoorPort1
[ExecLibrary] PutMsg(port=0xb35c, msg=0x100394)    # pr_MsgPort ← KEY FIX
[ExecLibrary] PutMsg(port=0x100030, msg=0x100394)  # doorReplyPort

[DoorMessageHandler] Sending STAT message (data=0x100238)
[ExecLibrary] PutMsg(port=0x100000, msg=0x1004e4)
[ExecLibrary] PutMsg(port=0xb35c, msg=0x1004e4)    # pr_MsgPort ← KEY FIX
[ExecLibrary] PutMsg(port=0x100030, msg=0x1004e4)
```

### ✅ Door Processes Messages Correctly

**Evidence from logs**:
```
[ExecLibrary][Trap][GetMsg] port=0xb35c name=Door Task Port
[ExecLibrary]   Returned message 0x1004e4 via remHead(), 1 remaining
[ExecLibrary][GetMsg] Door received message:
  ln_Type=5 (6=NT_REPLYMSG)
  Command=1 (STAT)
  Data=1049144 (0x100238)
  String="NODE 1 STATUS READY" (at 0x14)
```

### ✅ Door Replies Successfully

**Evidence from logs**:
```
[ExecLibrary][ReplyMsg] msg=0x1004e4 replyPort=0x100030
[ExecLibrary] PutMsg(port=0x100030, msg=0x1004e4)
[ExecLibrary] Reply sent to port 0x100030
```

### ✅ BBS Auto-Replies to INIT

**Evidence from logs**:
```
[XIMProtocol] <<< XIM Command: 0 (JH_LI (Line Input)) data=0 string="INIT"
[XIMProtocol] AEDoor handshake detected: JH_INIT (no reply needed)
[ExecLibrary][ReplyMsg] msg=0x100394 replyPort=0x100030
[ExecLibrary] Reply sent to port 0x100030
```

---

## CURRENT STATE (What Doesn't Work)

### ❌ Door Still Exits with Code 10

**Evidence**:
```
[DoorLifecycleManager] === DOOR EXITED CLEANLY ===
[DoorLifecycleManager] Return code (D0): 10
[DoorLifecycleManager] Total iterations: 37
```

**Exit location**: PC 0x003272 (immediately after ReplyMsg(STAT))

**What this means**: Door receives both INIT and STAT, replies to both successfully, but then exits instead of continuing execution.

### Likely Cause: Data Validation Failure

**Hypothesis**: Door is checking fields in NodeStatus/DoorInfo structures and finding invalid/unexpected values.

**Why we think this**:
1. Door exits immediately after processing STAT message
2. STAT message contains `data=0x100238` which points to DoorInfo+MESSAGE_NODE_OFFSET
3. Door likely reads NodeStatus/DoorInfo fields from that address
4. Something in those structures doesn't match what door expects
5. Door exits with ERROR_OBJECT_NOT_FOUND (code 10)

**What door is checking at PC 0x3260-0x3274**:
```
cmp.b instructions - comparing byte values
tst.b instructions - testing byte flags
beq/bne branches - conditional jumps based on comparison results
```

Door is doing character/flag validation before continuing.

---

## TECHNICAL DETAILS

### Memory Layout

```
ExecBase:        0x80000
Door Task:       0xb300
  pr_MsgPort:    0xb35c  (Process + 0x5C)
AEDoorPort1:     0x100000 (public port for BBS mode detection)
doorReplyPort:   0x100030 (door's reply port, created by CreateMsgPort)
DoorInfo:        0x100154
NodeStatus:      0x10019a (DoorInfo + 0x46)
BBSInfo:         0x10019a (same as NodeStatus)
```

### Message Structure

```
INIT Message (0x100394):
  ln_Type:       5
  mn_ReplyPort:  0x100030 (doorReplyPort)
  Command:       0 (JH_INIT / JH_LI)
  Data:          0
  String:        "INIT"

STAT Message (0x1004e4):
  ln_Type:       5
  mn_ReplyPort:  0x100030 (doorReplyPort)
  Command:       1 (JH_STAT)
  Data:          0x100238 (DoorInfo + MESSAGE_NODE_OFFSET)
  String:        "NODE 1 STATUS READY"
```

### Door Execution Flow (First 37 Iterations)

```
1. Door starts at PC 0x2008
2. Calls WaitPort(0xb35c) - waits for pr_MsgPort messages
3. BBS sends INIT/STAT to pr_MsgPort (on first poll)
4. Door calls GetMsg(0xb35c) - gets INIT message (0x100394)
5. BBS auto-replies to INIT
6. Door calls GetMsg(0xb35c) - gets STAT message (0x1004e4)
7. Door calls ReplyMsg(0x1004e4) - replies to STAT
8. Door continues to PC 0x003272
9. Door exits with D0=10 (ERROR_OBJECT_NOT_FOUND)
```

### Port Addresses Referenced

```
0x100000 - AEDoorPort1 (public, for FindPort checks)
0x100030 - doorReplyPort (created by door with CreateMsgPort)
0xb35c   - pr_MsgPort (door's process message port)
0x18     - Mystery port (door tries to reply to NULL here in earlier attempts)
```

---

## WHAT WE'VE TRIED (Chronological)

### Attempt 1: Check if INIT/STAT messages exist
- **Action**: Searched git history for `sendStartupMessage`
- **Found**: Commit c9a529286 (Jan 4) ADDED sendStartupMessage to fix AquaScan
- **Found**: Commit 279611e2d (Jan 8, TODAY) REMOVED it claiming it was wrong
- **Conclusion**: The removal was the bug, not the addition

### Attempt 2: Restore sendStartupMessage() call
- **Action**: Added `await this.sendStartupMessage()` to runExecutionLoop() line 400
- **Result**: Messages sent but to WRONG ports (ThisTask: 0x0)
- **Problem**: Door task doesn't exist yet when sendStartupMessage() called

### Attempt 3: Send messages to door task port
- **Action**: Read ExecBase+0x114 (ThisTask), then read Process+0x5C (pr_MsgPort)
- **Result**: ThisTask=0x0, pr_MsgPort=0x0
- **Problem**: Door task not created yet

### Attempt 4: Use getCurrentTask() method
- **Action**: Called `this.execLibrary.getCurrentTask()`
- **Result**: TypeError - method doesn't exist
- **Problem**: Wrong API - should use getCurrentTaskAddress()

### Attempt 5: Use getCurrentTaskAddress()
- **Action**: Called `getCurrentTaskAddress()`, read memory at addr+0x5C
- **Result**: pr_MsgPort=0x0
- **Problem**: pr_MsgPort not written to memory, only stored in currentTask.msgPort

### Attempt 6: Add getCurrentTaskMsgPort() getter
- **Action**: Added public getter to ExecLibrary, updated DoorMessageHandler
- **Result**: pr_MsgPort=0xb35c (correct!)
- **Success**: Messages now sent to pr_MsgPort

### Attempt 7: Set NULL reply port for INIT/STAT
- **Action**: Pass `0` as reply port parameter
- **Result**: Door receives messages but ReplyMsg fails: "No reply port in message"
- **Problem**: Door DOES reply to these messages

### Attempt 8: Use valid doorReplyPort
- **Action**: Pass `this.doorReplyPortAddr` as reply port
- **Result**: Door successfully replies to both INIT and STAT
- **Success**: ReplyMsg works, door processes messages

### Attempt 9: Defer sending until door task exists
- **Action**: Move sendStartupMessage() from runExecutionLoop() to first pollXIMMessages() call
- **Result**: Door task exists (0xb300), pr_MsgPort correct (0xb35c), messages delivered
- **Success**: Proper timing achieved

### Current Attempt 10: Still exits with code 10
- **Status**: Door receives INIT/STAT, replies successfully, but exits instead of continuing
- **Next**: Need to investigate what data door expects in NodeStatus/DoorInfo

---

## WHAT NEEDS TO HAPPEN NEXT

### Immediate Next Steps

1. **Investigate NodeStatus/DoorInfo contents**
   - Check what fields door reads from `data` pointer (0x100238)
   - Compare with what we're writing in `populateDoorInfoStructs()`
   - Look for missing/incorrect fields

2. **Trace PC 0x003260-0x003274 in detail**
   - Disassemble with radare2: `r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x3260; pd 10" doors/AquaScan/AquaScan.020`
   - Identify exactly what byte comparisons door is doing
   - Find what value it expects vs what it's getting

3. **Check CLI arguments**
   - Door has `progName="N"` and `CLI args="1 S U"`
   - STAT message might need to reference these
   - Check if door validates args against message data

4. **Test with vamos for comparison**
   ```bash
   vamos --log-file=/tmp/vamos-aquascan.log doors/AquaScan/AquaScan.020
   ```
   - See if door works in vamos
   - Compare message flow
   - Check what structures vamos provides

### Files to Check

- `/web/backend/src/utils/door-info.util.ts` - populateDoorInfoStructs() implementation
- `/web/backend/src/amiga-emulation/DoorTypes.ts` - DoorConstants, structure offsets
- `/doors/AquaScan/AquaScan.info` - Door configuration (DOORUSE.N=NEWSCAN, args, etc.)

### Debugging Commands

**Run AquaScan with trace**:
```bash
BBS_DATA_DIR=~/Code/AmiExpress/amiexpress-web \
DOOR_TRACE_FIRST_PC_COUNT=500 \
timeout 30 \
npx tsx web/backend/src/scripts/run-amiga-door.ts doors/AquaScan/AquaScan.020 1
```

**Check specific log sections**:
```bash
# Check message flow
npx tsx ... | grep -E "JH_REGISTER|EXPRESS_VERSION|BB_|DT_|INIT|STAT|ReplyMsg"

# Check port messaging
npx tsx ... | grep -E "PutMsg|GetMsg|port=0x|pr_MsgPort"

# Check door task
npx tsx ... | grep -E "Door task:|ThisTask:|currentTask"
```

**Disassemble exit region**:
```bash
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x3260; pd 20" doors/AquaScan/AquaScan.020
```

---

## KEY COMMITS

- **c9a529286** (Jan 4, 17:17) - "fix(xim): send INIT/STAT startup messages to prevent AquaScan hang"
  - Added sendStartupMessage() - THIS WAS CORRECT
  - Fixed first hang issue
  - See commit message: "AquaScan and other XIM doors expect INIT/STAT messages BEFORE sending JH_REGISTER"

- **279611e2d** (Jan 8, 03:40) - "fix(emulation): Restore trap-based AEDoor.library"
  - Removed sendStartupMessage() - THIS WAS WRONG
  - Broke AquaScan again
  - See commit message: "ISSUE REMAINS: AquaScan still exits with return code 10"

---

## UNCOMMITTED CHANGES

All fixes are in working directory, NOT committed:

```
M  web/backend/src/amiga-emulation/api/ExecLibrary.ts
M  web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts
M  web/backend/src/amiga-emulation/session/DoorMessageHandler.ts
```

**Cannot commit due to file size check**:
- sdk/engines/ui/blessed/core/element.ts (3410 lines) > 2000 limit
- sdk/engines/ui/blessed/core/screen.ts (2528 lines) > 2000 limit
- web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts (2518 lines) > 2000 limit

**To force commit**:
```bash
SKIP_SIZE_CHECK=1 git commit -m "..."
```

---

## CRITICAL REFERENCES

### Code Files
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` - Main execution loop
- `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` - INIT/STAT message sending
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Task/port management
- `web/backend/src/utils/door-info.util.ts` - NodeStatus/DoorInfo population

### Documentation
- `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md` - Modern XIM protocol (WRONG for legacy doors!)
- `Documentation/6-Progress/AQUASCAN_NSU_DEBUG_SESSION.md` - Previous debug session
- express.e:3343-3355 - AEDoor protocol initialization (via MCP)

### Test Commands
- `./dev/scripts/start-servers.sh` - Start BBS servers
- `npx tsx web/backend/src/scripts/run-amiga-door.ts doors/AquaScan/AquaScan.020 1` - Test door
- `npm run xim:debug -- AquaScan` - Smart debugger (requires servers running)

---

## SESSION CONTINUATION INSTRUCTIONS

When resuming:

1. **Read this file first** to understand complete context
2. **Check uncommitted changes**: `git status` and `git diff`
3. **Test current state**: Run AquaScan with trace (see Debugging Commands above)
4. **Review logs**: Check what door receives in STAT message data field
5. **Disassemble PC 0x3260-0x3274**: See what validation door is doing
6. **Compare with vamos**: Test if door works in vamos reference implementation
7. **Fix remaining issue**: Identify missing/incorrect NodeStatus/DoorInfo field

**DO NOT**:
- Remove sendStartupMessage() again - we need it for legacy doors
- Send INIT/STAT before door task exists - will go to wrong ports
- Use NULL reply port - door calls ReplyMsg() on these messages
- Assume XIM_CRITICAL_REQUIREMENTS.md applies to ALL XIM doors - it doesn't cover legacy protocol

**KEY INSIGHT TO REMEMBER**:
Legacy XIM doors use OLD AEDoor protocol where **BBS sends INIT/STAT first to pr_MsgPort**, door replies to both, THEN door sends JH_REGISTER. This is different from modern XIM where door initiates.

---

## EVIDENCE OF PROGRESS

### Before Fixes (door exits immediately):
```
[ExecLibrary][Trap][GetMsg] port=0xb35c name=Door Task Port
[ExecLibrary] >>> GetMsg(port=0xb35c)
[ExecLibrary]   No messages in port           ← NO MESSAGES
[ExecLibrary] ReplyMsg: Auto-registering reply port 0x18
[ExecLibrary][ReplyMsg] msg=0x0 replyPort=0x18  ← TRYING TO REPLY TO NULL
[DoorLifecycleManager] === DOOR EXITED CLEANLY ===
[DoorLifecycleManager] Return code (D0): 10
[DoorLifecycleManager] Total iterations: 37
```

### After Fixes (door processes messages):
```
[DoorMessageHandler] Door task: 0xb300, pr_MsgPort: 0xb35c
[ExecLibrary] PutMsg(port=0xb35c, msg=0x1004e4)  ← MESSAGE SENT TO pr_MsgPort
[ExecLibrary][Trap][GetMsg] port=0xb35c name=Door Task Port
[ExecLibrary]   Returned message 0x1004e4        ← MESSAGE RECEIVED
[ExecLibrary][GetMsg] Door received message:
  Command=1 (STAT)
  String="NODE 1 STATUS READY"
[ExecLibrary][ReplyMsg] msg=0x1004e4 replyPort=0x100030  ← SUCCESSFUL REPLY
[ExecLibrary] Reply sent to port 0x100030
[DoorLifecycleManager] === DOOR EXITED CLEANLY ===  ← STILL EXITS BUT PROGRESSED FURTHER
[DoorLifecycleManager] Return code (D0): 10
[DoorLifecycleManager] Total iterations: 37
```

---

## CONCLUSION

We've made SIGNIFICANT progress:
- ✅ Identified root cause (removed sendStartupMessage)
- ✅ Restored INIT/STAT messaging with proper timing
- ✅ Door now receives messages on correct port (pr_MsgPort)
- ✅ Door successfully replies to both INIT and STAT
- ✅ No more "trying to reply to NULL" errors

Remaining work:
- ❌ Door still exits with code 10 after processing messages
- ❌ Need to identify what data validation is failing
- ❌ Need to fix NodeStatus/DoorInfo structure contents

**Door is 90% working** - it's receiving and processing the handshake messages correctly. The final 10% is identifying what field in the message data is invalid.
