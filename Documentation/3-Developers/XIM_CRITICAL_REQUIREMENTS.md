# XIM Protocol - Critical Requirements (DO NOT BREAK)

**Purpose:** Document critical XIM implementation details that have caused regressions multiple times.

**Last Updated:** 2026-01-04

---

## CRITICAL REQUIREMENT #1: BBS Does NOT Send INIT/STAT Messages

### The Issue
**BBS must NOT send any initial messages to XIM doors!** The BBS creates AEDoorPort, launches the door process, and **WAITS** for the door to send JH_REGISTER first. Doors initiate the handshake, not the BBS.

### Where This Is Implemented
**File:** `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`

**Function:** `sendStartupMessage()`

### CORRECT Implementation
```typescript
sendStartupMessage(): void {
  // CRITICAL FIX (from XIM_INITIALIZATION_PROTOCOL.md and RTW_DEBUG_SESSION.md):
  // BBS does NOT send any initial messages to XIM doors!
  // The BBS creates the port, launches the door, and WAITS for door to send JH_REGISTER first.
  console.log("[DoorMessageHandler] XIM door started - waiting for door to send JH_REGISTER");
  this.sentInitialMessage = true;
  // DO NOT CALL: this.sendInitAndStatusMessages(); - BBS never sends first!
}
```

### WRONG Implementation (DO NOT USE)
```typescript
// WRONG - BBS should NOT send first!
sendStartupMessage(): void {
  console.log("[DoorMessageHandler] Sending INIT/STAT startup messages for XIM door");
  this.sendInitAndStatusMessages();  // <- WRONG! Door sends first, not BBS!
}
```

### How to Verify
```bash
# Search for sendStartupMessage implementation
grep -A10 "sendStartupMessage()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts

# MUST contain: "waiting for door to send JH_REGISTER"
# MUST NOT contain: this.sendInitAndStatusMessages()
```

### XIM Protocol Sequence
Per express.e lines 4316-4370 and XIM_INITIALIZATION_PROTOCOL.md:

1. BBS creates `AEDoorPort{N}` port
2. BBS launches door process
3. **BBS calls Wait(ximSig) - WAITS for door to send first**
4. Door finds port with FindPort("AEDoorPort1")
5. **Door sends JH_REGISTER (cmd=1) via PutMsg**
6. BBS GetMsg() receives JH_REGISTER
7. BBS processes and sends ReplyMsg() back
8. Door receives reply on its DoorReplyPort
9. Communication continues with door making requests, BBS replying

**Key Rule**: Door MUST send first. BBS only calls Wait() + GetMsg() + ReplyMsg().

### Reference
- **XIM Protocol:** `Documentation/6-Progress/archive/2025-12/XIM_INITIALIZATION_PROTOCOL.md`
- **RTW Fix:** `Documentation/6-Progress/archive/2025-12/RTW_DEBUG_SESSION.md` (Change 4)
- **express.e:** Lines 4316-4370 (BBS XIM message loop - no PutMsg!)

### Regression History
- **2025-12-25:** Fixed - removed BBS-initiated INIT/STAT per RTW_DEBUG_SESSION.md
- **2026-01-04:** REGRESSED - added back sendInitAndStatusMessages() (WRONG)
- **2026-01-04:** RE-FIXED - restored correct behavior per XIM_INITIALIZATION_PROTOCOL.md

---

## CRITICAL REQUIREMENT #2: EXPRESS_VERSION Returns Full Command Line

### The Issue
The EXPRESS_VERSION (152) XIM command must return the **full command line** (command + parameters), NOT just the parameters. Doors use this to get their runtime arguments.

**Example:**
- Command: `N S U` (new scan unread)
- EXPRESS_VERSION must return: `"N S U"` (full command line)
- EXPRESS_VERSION must NOT return: `"S U"` (just parameters)

### Where This Is Implemented

**TWO LOCATIONS - Both MUST be correct:**

1. **File:** `web/backend/src/handlers/door.handler.ts`
   - **Lines:** ~2235-2242 (in `executeAmigaDoor` function)
   - Sets `doorParams` on the session object

2. **File:** `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`
   - **Lines:** ~1333-1347 (in `processCommand` fallback handler)
   - Fallback EXPRESS_VERSION handler when XIMProtocol not set

### CORRECT Implementation (door.handler.ts)
```typescript
// Set door parameters for EXPRESS_VERSION to return (XIM doors need this)
// CRITICAL: Must return FULL command line (command + params), not just params
// AquaScan expects "N S U", not just "S U" - see AQUASCAN_NSU_DEBUG_SESSION.md
const paramString = door.parameters ? door.parameters.join(' ') : '';
const fullCommandLine = door.command + (paramString ? ' ' + paramString : '');
(session as any).doorParams = fullCommandLine;
(session as any).commandParams = fullCommandLine;
console.log(`[executeAmigaDoor] Set doorParams="${fullCommandLine}" for EXPRESS_VERSION`);
```

### CORRECT Implementation (DoorMessageHandler.ts fallback)
```typescript
case XIMCommand.EXPRESS_VERSION:
  // CRITICAL: For XIM doors, EXPRESS_VERSION returns COMMAND LINE (doorParams)
  // NOT the BBS version. AquaScan and similar doors need "N S U" to know their mode.
  // See XIM_CRITICAL_REQUIREMENTS.md - this fix has regressed multiple times.
  {
    const doorParams =
      (this.config.bbsSession as any)?.doorParams ||
      (this.config.bbsSession as any)?.commandParams ||
      '';
    const result = typeof doorParams === 'string' ? doorParams.trim() : '';
    this.writeStringToMessage(msgAddr, result);
  }
  break;
```

### WRONG Implementation (DO NOT USE - door.handler.ts)
```typescript
// WRONG - Returns only parameters, not full command line!
const paramString = door.parameters ? door.parameters.join(' ') : '';
(session as any).doorParams = paramString;  // <- WRONG! Missing command name
(session as any).commandParams = paramString;
```

### WRONG Implementation (DO NOT USE - DoorMessageHandler.ts)
```typescript
case XIMCommand.EXPRESS_VERSION:
  // WRONG - Returns BBS version number, not command line!
  const version = getExpressMajorVersion();  // <- WRONG!
  this.writeStringToMessage(msgAddr, version.toString());
  break;
```

### How to Verify
```bash
# Check door.handler.ts - doorParams must use fullCommandLine
grep -B5 -A5 "doorParams.*fullCommandLine" web/backend/src/handlers/door.handler.ts
# MUST contain: fullCommandLine = door.command + ...
# MUST assign fullCommandLine to doorParams, NOT paramString

# Check DoorMessageHandler.ts - EXPRESS_VERSION must return doorParams, not version
grep -A10 "case XIMCommand.EXPRESS_VERSION" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts
# MUST contain: doorParams or commandParams
# MUST NOT contain: getExpressMajorVersion()
```

### Test Cases
**AquaScan with "N S U" parameters:**
```
Expected log: [executeAmigaDoor] Set doorParams="N S U" for EXPRESS_VERSION
Wrong log:    [executeAmigaDoor] Set doorParams="S U" for EXPRESS_VERSION
```

**Verification in XIM log:**
```
[XIM] RX cmd=152 (EXPRESS_VERSION) data=1 str=""
[XIMBBSInfo] EXPRESS_VERSION: returning params="N S U" for XIM door  <- CORRECT
[XIMBBSInfo] EXPRESS_VERSION: returning params="S U" for XIM door    <- WRONG
```

### Why This Matters
AquaScan parses the command line to determine:
- `N` = NEWSCAN mode (scan for new files)
- `S` = Skip already-scanned conferences
- `U` = User mode (show user-friendly output)

Without the command name, AquaScan validation fails and the door exits.

### Reference
- **Debug Session:** `Documentation/6-Progress/AQUASCAN_NSU_DEBUG_SESSION.md` (line 169: ROOT CAUSE FOUND)
- **Amiga Log:** `Documentation/4-Door-Developers/Aquascan N.log` (line 22-24: shows "N S U")
- **XIM Spec:** EXPRESS_VERSION returns command-line arguments for door

### Regression History
- **2026-01-04 (later):** Fixed DoorMessageHandler.ts fallback - was returning getExpressMajorVersion() instead of doorParams
- **2026-01-04:** Fixed in commit d5cdf61da after regression reintroduced
- **Previous Fix:** Documented in AQUASCAN_NSU_DEBUG_SESSION.md
- **Pattern:** This has regressed multiple times in BOTH locations - CRITICAL to verify BOTH files

---

## CRITICAL REQUIREMENT #3: AEDoorPort Must Be Owned by BBS Task

### The Issue
AEDoorPort1 must be owned by the **BBS Handler Task** (bbsTask at 0x88000), NOT the Door Task (currentTask at 0x90000). This prevents the door from signaling itself with the wrong signal bit when it sends messages.

### Where This Is Implemented
**File:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts`

**Function:** `createAEDoorPort()` (around line 4708)

### CORRECT Implementation
```typescript
// CRITICAL FIX (Dec 27): Create AEDoorPort with BBS Handler Task as owner
// This prevents the door from signaling itself when it sends messages.
// Real Amiga has TWO tasks: BBS task owns AEDoorPort, Door task runs binary.
// When door calls PutMsg(AEDoorPort), it signals BBS task (not itself).
const portAddr = this.createPublicPort(
  name,
  this.bbsTask,  // BBS task, not Door task
  AEDOORPORT_SIGBIT
);
```

### WRONG Implementation (DO NOT USE)
```typescript
// WRONG - Door signals itself with wrong signal bit, causing deadlock!
const portAddr = this.createPublicPort(
  name,
  this.currentTask,  // <- WRONG! Causes signal bit mismatch
  AEDOORPORT_SIGBIT
);
```

### How to Verify
```bash
# Check port creation in ExecLibrary.ts
grep -A5 "createPublicPort" web/backend/src/amiga-emulation/api/ExecLibrary.ts | grep -B2 -A2 "AEDoorPort"

# MUST use: this.bbsTask
# MUST NOT use: this.currentTask
```

### Test Cases
**Check backend log after door starts:**
```
Expected: [ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000 (sigBit=12, owner=BBS Task 0x88000)
Wrong:    [ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000 (sigBit=12, owner=Door Task 0x90000)
```

### Why This Matters
On real Amiga, there are **TWO separate tasks:**
- **BBS Task (0x88000)** - Owns AEDoorPort, handles messages from door
- **Door Task (0x90000)** - Runs the door binary

When door sends message via PutMsg(AEDoorPort):
1. Message is queued to port at 0x100000
2. Signal(port->mp_SigTask, 1 << port->mp_SigBit) is called
3. **If port owned by BBS task:** Signals BBS task with bit 12 ✓
4. **If port owned by Door task:** Signals door itself with bit 12, but door is waiting for bit 16+12, causing deadlock ✗

### Reference
- **Full explanation:** `Documentation/6-Progress/archive/2025-12/AQUASCAN_SIGNAL_FIX.md`
- **Memory layout:** ExecBase (0x80000), BBS Task (0x88000), Door Task (0x90000)

### Regression History
- **2025-12-27:** Fixed - was using currentTask, causing all XIM doors to hang
- **2026-01-04:** REGRESSED - changed back to currentTask (WRONG)

---

## CRITICAL REQUIREMENT #4: XIM Message Reply Order

### The Issue
XIM messages MUST be replied to in the order they are received. Doors expect synchronous request-reply protocol.

### Implementation
**File:** `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`

### Rule
- Door sends message via PutMsg to AEDoorPort
- BBS retrieves message via GetMsg
- BBS MUST call ReplyMsg BEFORE processing next message
- Door blocks in GetMsg on reply port until reply received

### Verification
Check logs for proper sequence:
```
[XIM] RX cmd=163 (ENVSTAT) data=0 str="8"
[XIMBBSInfo] ENVSTAT handler processing...
[XIMProtocol] >>> ReplyMsg sent                    <- MUST happen
[XIM] RX cmd=525 (BB_NONSTOPTEXT) data=1 str=""    <- Next message
```

---

## Pre-Commit Verification Script

Add this to your pre-commit workflow to catch regressions:

```bash
#!/bin/bash
# File: dev/scripts/verify-xim-critical.sh

echo "Verifying XIM critical requirements..."

# Check #1: BBS does NOT send INIT/STAT first (door sends first)
if grep -q "this.sendInitAndStatusMessages()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts | grep -v "DO NOT CALL"; then
  echo "[ERROR] sendStartupMessage() calls sendInitAndStatusMessages() - BBS should NOT send first!"
  echo "See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  exit 1
fi

# Check #2a: EXPRESS_VERSION uses fullCommandLine in door.handler.ts
if ! grep -q "fullCommandLine.*door.command" web/backend/src/handlers/door.handler.ts; then
  echo "[ERROR] doorParams does not use fullCommandLine (command + params)"
  echo "See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  exit 1
fi

if grep -q "doorParams.*paramString[^)]" web/backend/src/handlers/door.handler.ts; then
  echo "[ERROR] doorParams is set to paramString instead of fullCommandLine"
  echo "See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  exit 1
fi

# Check #2b: DoorMessageHandler EXPRESS_VERSION returns doorParams, not version
if grep -A5 "case XIMCommand.EXPRESS_VERSION" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts | grep -q "getExpressMajorVersion"; then
  echo "[ERROR] DoorMessageHandler EXPRESS_VERSION returns version instead of doorParams!"
  echo "See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  exit 1
fi

echo "[OK] All XIM critical requirements verified"
```

---

## Quick Reference: Symptoms vs Root Causes

| Symptom | Root Cause | Fix Location |
|---------|-----------|--------------|
| AquaScan hangs after startup, polls AEDoorPort1 forever | BBS sent INIT/STAT (should wait for door) | DoorMessageHandler.ts:sendStartupMessage() |
| AquaScan exits after EXPRESS_VERSION | Returns "S U" not "N S U" | door.handler.ts:~2239 (doorParams) |
| AquaScan outputs linebreaks only, no text | EXPRESS_VERSION returns empty or version | DoorMessageHandler.ts:~1333 (fallback handler) |
| Door never sends XIM messages | Wrong INIT/STAT sequence | DoorMessageHandler.ts:sendStartupMessage() |
| Door stops after first few XIM commands | EXPRESS_VERSION validation fails | BOTH: door.handler.ts AND DoorMessageHandler.ts |

---

## Regression Prevention Checklist

Before modifying XIM code, verify:

- [ ] BBS waits for door in `DoorMessageHandler.sendStartupMessage()` (NO BBS-initiated messages)
- [ ] `doorParams` uses `fullCommandLine` not `paramString` in door.handler.ts
- [ ] DoorMessageHandler.ts EXPRESS_VERSION fallback returns `doorParams`, NOT `getExpressMajorVersion()`
- [ ] Test with AquaScan (N, NSU, CS, F, FR commands)
- [ ] Test with JoinCnf (J command)
- [ ] Check logs for "Set doorParams=" contains command name
- [ ] Check logs for EXPRESS_VERSION returning full command line (e.g., "N S U")
- [ ] Verify XIM message sequence matches reference logs

---

## Related Documentation

- **XIM Protocol Overview:** `Documentation/4-Door-Developers/XIM_PROTOCOL.md`
- **XIM Debugging Guide:** `Documentation/4-Door-Developers/XIM_DEBUGGING_GUIDE.md`
- **AquaScan Debug Session:** `Documentation/6-Progress/AQUASCAN_NSU_DEBUG_SESSION.md`
- **Reference Logs:** `Documentation/4-Door-Developers/*.log`

---

## Contact

If you're modifying XIM code and unsure about these requirements:
1. Read this document first
2. Check reference Amiga logs in `Documentation/4-Door-Developers/`
3. Run verification script: `dev/scripts/verify-xim-critical.sh`
4. Test with AquaScan before committing

**DO NOT disable these checks without documenting why and getting approval.**
