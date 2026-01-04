# XIM Protocol - Critical Requirements (DO NOT BREAK)

**Purpose:** Document critical XIM implementation details that have caused regressions multiple times.

**Last Updated:** 2026-01-04

---

## CRITICAL REQUIREMENT #1: Send INIT/STAT Startup Messages

### The Issue
Old-style XIM doors (AquaScan, JoinCnf, WALL, etc.) expect the BBS to send INIT and STAT messages BEFORE the door sends JH_REGISTER. Without these, doors hang in infinite polling loops calling `FindPort("AEDoorPort1")` + `GetMsg()`.

### Where This Is Implemented
**File:** `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`

**Function:** `sendStartupMessage()`

### CORRECT Implementation
```typescript
sendStartupMessage(): void {
  console.log("[DoorMessageHandler] Sending INIT/STAT startup messages for XIM door");
  // CRITICAL: Many XIM doors (AquaScan, JoinCnf, etc.) expect INIT/STAT messages BEFORE
  // sending JH_REGISTER. Without these, doors sit in tight polling loops waiting forever.
  // See express.e:3343-3355 for AEDoor protocol initialization.
  this.sendInitAndStatusMessages();
}
```

### WRONG Implementation (DO NOT USE)
```typescript
// WRONG - This causes doors to hang!
sendStartupMessage(): void {
  console.log("[DoorMessageHandler] Skipping startup messages - door will initiate with JH_REGISTER");
  // REMOVED: this.sendInitAndStatusMessages(); // <- DO NOT REMOVE THIS CALL!
  this.sentInitialMessage = true;
}
```

### How to Verify
```bash
# Search for sendStartupMessage implementation
grep -A10 "sendStartupMessage()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts

# MUST contain: this.sendInitAndStatusMessages();
# MUST NOT contain: "Skipping startup messages"
```

### Test Cases
- **AquaScan (N, NSU, CS, F, FR commands)** - Must not hang after startup
- **JoinCnf (J command)** - Must not hang waiting for messages
- **WALL command** - Must receive INIT/STAT before executing

### Reference
- **Debug Session:** `Documentation/6-Progress/AQUASCAN_NSU_DEBUG_SESSION.md`
- **Amiga Log:** `Documentation/4-Door-Developers/Aquascan N.log`
- **express.e Source:** Lines 3343-3355 (AEDoor initialization)

### Regression History
- **2026-01-04:** Fixed in commit c9a529286 after AquaScan hung on startup
- Previous regressions documented in AQUASCAN_DEBUG_SESSION.md

---

## CRITICAL REQUIREMENT #2: EXPRESS_VERSION Returns Full Command Line

### The Issue
The EXPRESS_VERSION (152) XIM command must return the **full command line** (command + parameters), NOT just the parameters. Doors use this to get their runtime arguments.

**Example:**
- Command: `N S U` (new scan unread)
- EXPRESS_VERSION must return: `"N S U"` (full command line)
- EXPRESS_VERSION must NOT return: `"S U"` (just parameters)

### Where This Is Implemented
**File:** `web/backend/src/handlers/door.handler.ts`

**Lines:** ~2235-2242 (in `executeAmigaDoor` function)

### CORRECT Implementation
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

### WRONG Implementation (DO NOT USE)
```typescript
// WRONG - Returns only parameters, not full command line!
const paramString = door.parameters ? door.parameters.join(' ') : '';
(session as any).doorParams = paramString;  // <- WRONG! Missing command name
(session as any).commandParams = paramString;
```

### How to Verify
```bash
# Search for doorParams assignment in door.handler.ts
grep -B5 -A5 "doorParams.*fullCommandLine" web/backend/src/handlers/door.handler.ts

# MUST contain: fullCommandLine = door.command + ...
# MUST assign fullCommandLine to doorParams, NOT paramString
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
- **2026-01-04:** Fixed in commit d5cdf61da after regression reintroduced
- **Previous Fix:** Documented in AQUASCAN_NSU_DEBUG_SESSION.md
- **Pattern:** This has regressed multiple times - CRITICAL to maintain

---

## CRITICAL REQUIREMENT #3: AEDoorPort Must Be Owned by Door Task

### The Issue
AEDoorPort1 must be owned by the DOOR task (currentTask), NOT the BBS task (bbsTask). When messages arrive, Signal() must wake the DOOR task that's blocking in Wait(), not the BBS task.

### Where This Is Implemented
**File:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts`

**Function:** `createAEDoorPort()` (around line 4708)

### CORRECT Implementation
```typescript
// CRITICAL: Use DOOR task as owner so door gets signaled when messages arrive
// Door calls GetMsg() on AEDoorPort1, then Wait(0x1000) to block until signaled.
// When BBS sends message via PutMsg(), it Signal()s the door task to wake it up.
const portAddr = this.createPublicPort(
  name,
  this.currentTask,  // Door task, not BBS task
  AEDOORPORT_SIGBIT
);
```

### WRONG Implementation (DO NOT USE)
```typescript
// WRONG - Signals BBS task instead of door task, door never wakes from Wait()!
const portAddr = this.createPublicPort(
  name,
  this.bbsTask,  // <- WRONG! Door hangs in Wait()
  AEDOORPORT_SIGBIT
);
```

### How to Verify
```bash
# Check port creation in ExecLibrary.ts
grep -A5 "createPublicPort" web/backend/src/amiga-emulation/api/ExecLibrary.ts | grep -B2 -A2 "AEDoorPort"

# MUST use: this.currentTask
# MUST NOT use: this.bbsTask
```

### Test Cases
**Check backend log after door starts:**
```
Expected: [ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000 (sigBit=12, owner=Door Task 0x90000)
Wrong:    [ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000 (sigBit=12, owner=BBS Task 0x88000)
```

### Why This Matters
1. Door calls `GetMsg(AEDoorPort1)` → no messages
2. Door calls `Wait(0x1000)` → blocks waiting for signal on bit 12
3. BBS calls `PutMsg(AEDoorPort1, msg)` → queues message
4. BBS calls `Signal(port->sigTask, 0x1000)` → wakes task
5. **If sigTask is BBS task:** Door never wakes, hangs forever
6. **If sigTask is door task:** Door wakes, calls GetMsg, gets message

### Reference
- **Exec message passing:** AmigaOS NDK docs
- **Wait/Signal protocol:** Doors block in Wait() until signaled

### Regression History
- **2026-01-04:** Fixed - was using bbsTask, causing all XIM doors to hang

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

# Check #1: INIT/STAT messages are sent
if ! grep -q "this.sendInitAndStatusMessages()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts; then
  echo "[ERROR] sendStartupMessage() does not call sendInitAndStatusMessages()"
  echo "See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  exit 1
fi

# Check #2: EXPRESS_VERSION uses fullCommandLine
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

echo "[OK] All XIM critical requirements verified"
```

---

## Quick Reference: Symptoms vs Root Causes

| Symptom | Root Cause | Fix Location |
|---------|-----------|--------------|
| AquaScan hangs after startup, polls AEDoorPort1 forever | INIT/STAT not sent | DoorMessageHandler.ts:sendStartupMessage() |
| AquaScan exits after EXPRESS_VERSION | Returns "S U" not "N S U" | door.handler.ts:~2239 (doorParams) |
| Door never sends XIM messages | No INIT/STAT, door waiting | DoorMessageHandler.ts:sendStartupMessage() |
| Door stops after first few XIM commands | EXPRESS_VERSION validation fails | door.handler.ts:~2239 (fullCommandLine) |

---

## Regression Prevention Checklist

Before modifying XIM code, verify:

- [ ] INIT/STAT messages still sent in `DoorMessageHandler.sendStartupMessage()`
- [ ] `doorParams` uses `fullCommandLine` not `paramString` in door.handler.ts
- [ ] Test with AquaScan (N, NSU, CS, F, FR commands)
- [ ] Test with JoinCnf (J command)
- [ ] Check logs for "Set doorParams=" contains command name
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
