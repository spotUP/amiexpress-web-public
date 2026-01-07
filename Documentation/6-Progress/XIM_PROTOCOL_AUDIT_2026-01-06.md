# XIM Protocol Comprehensive Audit - 2026-01-06

## Executive Summary

Comprehensive audit of ALL XIM protocol implementations against express.e sources to ensure 1:1 compatibility with AmiExpress BBS.

**Status:** IN PROGRESS
**Critical Bugs Found:** 1 (FIXED)
**Verified Correct:** 2
**Missing Implementations:** 5+
**Commands Audited:** 25/100+

---

## CRITICAL BUGS FIXED

### ✅ BUG #1: BB_NONSTOPTEXT - INCORRECTLY IMPLEMENTED AS BIDIRECTIONAL

**File:** `web/backend/src/amiga-emulation/xim/bbs-info.ts:447-453`
**Status:** ✅ **FIXED**

**Problem:**
- We implemented BB_NONSTOPTEXT as bidirectional (READ/WRITE) command
- Used `msg.data !== 0` to determine READ vs WRITE mode
- Returned "1" or "0" in READ mode

**Correct Behavior (express.e:3875-3876):**
```e
CASE BB_NONSTOPTEXT
  IF (msg.data=0) THEN nonStopDisplayFlag:=FALSE ELSE nonStopDisplayFlag:=TRUE
```

**Fix Applied:**
```typescript
handleNonStopText(msg: XIMMessage): void {
  // WRITE-ONLY: data=0 disables, data≠0 enables
  this.state.nonStopText = msg.data !== 0;
  this.state.lineCount = 0;
  this.reply(msg, msg.data ?? 0);
}
```

**Impact:** HIGH - Doors expecting simple flag set were getting unexpected bidirectional behavior

---

## VERIFIED CORRECT IMPLEMENTATIONS

### ✅ BB_CONFNUM - Returns 0-Based Conference Number

**File:** `web/backend/src/amiga-emulation/xim/bbs-info.ts:226-256`
**Status:** ✅ CORRECT (previously fixed)

**express.e:3831-3833:**
```e
CASE BB_CONFNUM
  StringF(tempstring,'\d',currentConf-1)
  AstrCopy(msg.string,tempstring,200)
```

**Our Implementation:**
```typescript
const confNum = currentConfNum - 1;  // 0-based
value = confNum.toString();
```

✅ Correctly returns `currentConf - 1` (0-based)

---

### ✅ JH_HK - Blocks Correctly Until Input Arrives

**File:** `web/backend/src/amiga-emulation/xim/io.ts:492-528`
**Status:** ✅ CORRECT

**express.e:3436-3446:**
```e
CASE JH_HK
  lineCount:=0
  aePuts(msg.string)
  ch:=readChar(doorTimeout)    # ← BLOCKS until input!
  IF (ch<0)
    msg.data:=-1
  ELSE
    msg.data:=1
  ENDIF
  msg.string[0]:=ch
  msg.string[1]:=0
```

**Our Implementation:**
```typescript
handleHotkey(msg: XIMMessage): void {
  this.state.lineCount = 0;
  if (prompt.length > 0) {
    this.emitText(prompt, false, false, false, msg);  // Display prompt
  }

  if (this.inputQueue.length > 0) {
    // Input available - return immediately
    this.reply(msg, 1, keyData);
  } else {
    // No input - PAUSE emulator (implements blocking!)
    this.waitingForHotkey = true;
    this.hotkeyMessage = msg;
    this.emulator.pause();
  }
}
```

✅ Correctly implements blocking by pausing emulator
✅ Resumes on input via `completeHotkey()`
✅ Does NOT return -1 immediately when no input

---

## MISSING IMPLEMENTATIONS

### BB_* Commands Not Implemented

1. **BB_PCONFNAME** (express.e:3779-3785)
   - Get conference name by number (1-9)
   - Returns conference name or "ERROR"

2. **BB_PCONFLOCAL** (express.e:3786-3793)
   - Get conference path by number (1-9)
   - Returns conference path or "ERROR"

3. **BB_DROPDTR** (express.e:3834-3839)
   - Drop DTR to hang up modem
   - Critical for disconnect handling

4. **BB_GETTASK** (express.e:3840-3841)
   - Return Task pointer for FindTask(0)
   - Used by some doors for Exec operations

5. **BB_STATUS** (express.e:1357-1362)
   - Returns "ONLINE" or "OFFLINE"
   - BBS operational status

---

## COMMANDS NEEDING VERIFICATION

### BB_* Commands - Need READ/WRITE Audit

| Command | Line | Status | Notes |
|---------|------|--------|-------|
| BB_CONFNAME | 3693-3700 | ❓ VERIFY | Both READ/WRITE - check `msg.data` logic |
| BB_CONFLOCAL | 3701-3707 | ❓ VERIFY | Both READ/WRITE - check `msg.data` logic |
| BB_CHATSET | 3756-3767 | ❓ VERIFY | Both READ/WRITE - verify sysop paging |
| BB_LINECOUNT | 3877-3883 | ❓ VERIFY | Both READ/WRITE - check implementation |

**Pattern to Verify:**
```e
IF (msg.data)         // data ≠ 0 = READ mode
  AstrCopy(msg.string, value, 200)   // Return value
ELSE                  // data = 0 = WRITE mode
  value := Val(msg.string)            // Set value
ENDIF
```

---

## EXPRESS.E COMMAND REFERENCE

### BB_* Commands (BBS Info) - express.e:3693-3883

| Command | Line | Type | Returns | Implemented |
|---------|------|------|---------|-------------|
| BB_CONFNAME | 3693-3700 | R/W | Conference name | ✅ |
| BB_CONFLOCAL | 3701-3707 | R/W | Conference path | ✅ |
| BB_LOCAL | 3708-3709 | READ | BBS root path | ✅ |
| BB_TASKPRI | 3744-3746 | READ | Task priority | ✅ |
| BB_CHATFLAG | 3750-3755 | READ | "ON"/"OFF" | ✅ |
| BB_CHATSET | 3756-3767 | R/W | Page flag | ✅ |
| BB_PCONFNAME | 3779-3785 | READ | Conf name (1-9) | ❌ |
| BB_PCONFLOCAL | 3786-3793 | READ | Conf path (1-9) | ❌ |
| BB_MAINLINE | 3794-3800 | READ | Command line | ✅ |
| BB_NODEID | 3801-3803 | READ | Node number | ✅ |
| BB_CALLERSLOG | 3804-3805 | WRITE | Append log | ✅ |
| BB_UDLOG | 3806-3807 | WRITE | Append UD log | ✅ |
| BB_CONFNUM | 3831-3833 | READ | Conference (0-based) | ✅ |
| BB_DROPDTR | 3834-3839 | ACTION | Drop carrier | ❌ |
| BB_GETTASK | 3840-3841 | READ | Task pointer | ❌ |
| BB_LOGONTYPE | 3859-3860 | READ | Logon type | ✅ |
| BB_SCRLEFT | 3861-3862 | READ | Screen left | ✅ |
| BB_SCRTOP | 3863-3864 | READ | Screen top | ✅ |
| BB_SCRWIDTH | 3865-3866 | READ | Screen width | ✅ |
| BB_SCRHEIGHT | 3867-3868 | READ | Screen height | ✅ |
| BB_PURGELINE | 3869-3870 | ACTION | Clear buffer | ✅ |
| BB_PURGELINESTART | 3871-3872 | ACTION | Start purge | ✅ |
| BB_PURGELINEEND | 3873-3874 | ACTION | End purge | ✅ |
| BB_NONSTOPTEXT | 3875-3876 | WRITE | Set flag | ✅ FIXED |
| BB_LINECOUNT | 3877-3883 | R/W | Line count | ✅ |

### JH_* Commands (Door I/O) - express.e:3379-3492

| Command | Line | Type | Blocking | Implemented |
|---------|------|------|----------|-------------|
| JH_REGISTER | 3379-3381 | ACTION | No | ✅ |
| JH_WRITE | 3382-3385 | OUTPUT | No | ✅ |
| JH_SHUTDOWN | 3388-3393 | ACTION | No | ✅ |
| JH_CO | 3395-3400 | OUTPUT | No | ✅ |
| JH_SO | 3401-3405 | OUTPUT | No | ✅ |
| JH_SM | 3406-3411 | OUTPUT | No | ✅ |
| JH_SMPTR | 3412-3417 | OUTPUT | No | ✅ |
| JH_PM | 3418-3424 | INPUT | **YES** | ❓ VERIFY |
| JH_LI | 3425-3431 | INPUT | **YES** | ❓ VERIFY |
| JH_ExtHK | 3432-3435 | INPUT | **YES** | ❓ VERIFY |
| JH_HK | 3436-3446 | INPUT | **YES** | ✅ CORRECT |
| JH_CK | 3447-3450 | INPUT | No | ❓ VERIFY |
| JH_SG | 3451-3453 | DISPLAY | No | ✅ |
| JH_SF | 3454-3456 | DISPLAY | No | ✅ |

**CRITICAL:** All INPUT commands (JH_PM, JH_LI, JH_ExtHK, JH_HK) MUST block until:
- User provides input → returns data=1 with input string/char
- Timeout expires → returns data=-1
- They MUST NOT return -1 immediately when no input is queued

---

## DT_* Commands (Door/User Data)

**Found in data-query.ts:** 40+ implementations
**Status:** Need to verify against express.e:1180-1330

Sample commands found:
- DT_NAME, DT_PASSWORD, DT_LOCATION, DT_PHONENUMBER
- DT_SLOTNUMBER, DT_SECSTATUS, DT_SECBOARD, DT_SECLIBRARY
- DT_TIMELIMIT, DT_LINELENGTH, DT_EXPERT
- DT_MESSAGESPOSTED, DT_UPLOADS, DT_DOWNLOADS
- DT_TIMESCALLED, DT_TIMELASTON, DT_TIMEUSED
- DT_BYTESUPLOAD, DT_BYTEDOWNLOAD, DT_DAILYBYTELIMIT

**Next:** Verify each DT_* command matches express.e READ/WRITE logic

---

## NEXT STEPS

1. ✅ Fix BB_NONSTOPTEXT (DONE)
2. ❓ Verify BB_CONFNAME, BB_CONFLOCAL READ/WRITE logic
3. ❓ Verify BB_CHATSET READ/WRITE logic and sysop paging
4. ❓ Verify JH_PM, JH_LI blocking behavior
5. ❓ Implement missing BB_* commands
6. ❓ Audit ALL DT_* commands against express.e
7. ❓ Audit message port operations (ReplyMsg/PutMsg/GetMsg)
8. ❓ Audit door lifecycle and polling logic
9. ❓ Audit library trap handlers (dos.library, exec.library, icon.library)

---

## FILES MODIFIED

### Fixed
- `web/backend/src/amiga-emulation/xim/bbs-info.ts` - Fixed BB_NONSTOPTEXT implementation

### To Verify
- `web/backend/src/amiga-emulation/xim/bbs-info.ts` - BB_* command handlers
- `web/backend/src/amiga-emulation/xim/data-query.ts` - DT_* command handlers
- `web/backend/src/amiga-emulation/xim/io.ts` - JH_* I/O handlers
- `web/backend/src/amiga-emulation/XIMProtocol.ts` - Message routing

---

## METHODOLOGY

1. Search express.e for each command using MCP tools
2. Read exact implementation from express.e sources
3. Compare against our TypeScript implementation
4. Document discrepancies
5. Fix bugs immediately
6. Verify fix against express.e behavior

**Key Principle:** express.e is the authoritative source. Our implementation MUST match EXACTLY.
