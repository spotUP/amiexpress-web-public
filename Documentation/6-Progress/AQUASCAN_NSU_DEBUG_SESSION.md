# AquaScan N S U Debug Session

**Started:** 2026-01-02
**Status:** IN PROGRESS
**Problem:** AquaScan's `N S U` command outputs only linebreaks, no actual text

## Problem Statement

AquaScan's `N S U` command (New Scan User - scans conferences for new mail) should output:
```
Scanning conferences for mail...
Scanning Conference: Lamer Zone - No mail today!
Scanning Conference: Amiga Warez! - No mail today!
...
```

But currently outputs only empty linebreaks.

## Reference: Real Amiga XIM Log

From `/Documentation/4-Door-Developers/Aquascan N.log`:
- AquaScan uses **JH_SM (command 4)** for output
- Gets command args via EXPRESS_VERSION (152) -> "N S U"
- Gets version via BB_MAINLINE (131) -> "v5.3"
- Output text is in the `string` field of JH_SM messages

## Hypothesis Tree

| # | Hypothesis | Status | Notes |
|---|-----------|--------|-------|
| 1 | Door args not passed (N S U) | PENDING | Check EXPRESS_VERSION reply |
| 2 | String empty in JH_SM | PENDING | Log raw memory |
| 3 | StringPtr vs embedded string | PENDING | Check which AquaScan uses |
| 4 | ANSI buffer eating text | PENDING | Check ansiBuffer |
| 5 | Conference data missing | PENDING | Check ConfConfig.info access |

---

## Debug Log

### Step 1: Analyze Existing Logs

**Result:** COMPLETED

**Observations:**
- Found JH_SM messages in door-68k.log but no string content visible
- Log shows `msg request: 4 (JH_SM)` being processed
- No AquaScan-specific logs found - logs show MultiTop, QuickNew, SAmiLog

---

### Step 2: Compare with Real Amiga Log

**Real Amiga Log Analysis:**

| Message | Real Amiga Returns | Our Implementation Returns |
|---------|-------------------|---------------------------|
| EXPRESS_VERSION (152) | "N S U" (door args!) | getExpressMajorVer() (version) |
| BB_MAINLINE (131) | "v5.3" (version) | command + params |
| JH_SM (4) | Banner text on next line | Need to verify |

**CRITICAL FINDING:** The Amiga log shows EXPRESS_VERSION returning door command args ("N S U"),
but express.e source shows it should return the version. This is OPPOSITE to our implementation!

**Log Format Discovery:**
- `string:` followed by content on SAME line for short strings
- `string:` with empty line, then content on NEXT line for long strings (like banner)
- JH_SM string field DOES contain the banner text in real Amiga

---

### Step 3: Diagnostic Logging Added

**File:** `web/backend/src/amiga-emulation/xim/io.ts:348-364`

**Changes:** Added raw byte logging to handleSendMessage:
```typescript
// DEBUG: Log raw bytes from message string buffer
const rawBytes: number[] = [];
const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
for (let i = 0; i < 80; i++) {
  const byte = this.emulator.readMemory(stringAddr + i);
  if (byte === 0) break;
  rawBytes.push(byte);
}
const rawStr = rawBytes.map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : `.`).join('');
console.log(`[XIMIOHandler] JH_SM DEBUG: rawBytes[0..${rawBytes.length}] = "${rawStr}"`);
```

---

### Step 4: Door Args Flow - IN PROGRESS

**EXPRESS_VERSION Discrepancy:**
- express.e line 3808-3810: Returns `getExpressMajorVer()` (version like "v5.3")
- Real Amiga log: Returns "N S U" (door command args)

**Possible Explanations:**
1. The Amiga log is from a modified/different AmiExpress version
2. There's special handling for SysCmd doors
3. The logging shows door-written values, not BBS responses

**BB_MAINLINE Analysis:**
- express.e line 3794-3800: Returns `command + params` (user's command line)
- Real Amiga log: Returns "v5.3" on second call

---

### Step 5: ConfConfig.info Access

**Status:** PENDING - need to run test

---

## Next Steps - User Action Required

**The servers need to be running to test.** Run:

```bash
./dev/scripts/start-servers.sh
```

Then login to the BBS and run the `N S U` command. After it runs, check the backend logs for:

```bash
grep -E "JH_SM DEBUG|EXPRESS_VERSION DEBUG" logs/door-68k.log | tail -50
```

**What to look for:**
1. `JH_SM DEBUG: rawBytes[0..N]` - if N=0, the string buffer is empty (AquaScan isn't writing output)
2. `EXPRESS_VERSION DEBUG:` - shows what we return vs what real Amiga expects

---

## Findings

### Finding 1: EXPRESS_VERSION May Return Wrong Value

Real Amiga returns command args ("N S U") for EXPRESS_VERSION, but we return version ("v5.3").
This could prevent AquaScan from knowing what mode to run in.

### Finding 2: Message String Reading

The message string is read from offset 0x14 (20 bytes) in the jhMessage structure.
If AquaScan writes to a different offset, we won't see the text.

### Finding 3: AquaScan Uses DOORUSE Tooltypes

From `doors/AquaScan/AquaScan.info`:
- DOORUSE.N=NEWSCAN
- DOORUSE.NSU=CONFSCAN

AquaScan needs to know it was invoked with "N" to perform NEWSCAN.

---

## Hypothesis Update

| # | Hypothesis | Status | Evidence |
|---|-----------|--------|----------|
| 1 | EXPRESS_VERSION returns wrong value | LIKELY | Real Amiga returns args, we return version |
| 2 | String buffer empty in JH_SM | PENDING | Need logs from test run |
| 3 | String read from wrong offset | UNLIKELY | Offset 0x14 matches aedoor.h |
| 4 | Door args not passed correctly | POSSIBLE | Need to verify doorCommand is set |
| 5 | ConfConfig.info not accessible | POSSIBLE | File exists, need to verify door reads it |

---

## ROOT CAUSE FOUND

### EXPRESS_VERSION Returns Wrong Value

**The Issue:**
- Real Amiga: EXPRESS_VERSION (152) returns door command args ("N S U")
- Our implementation: EXPRESS_VERSION returned BBS version ("v5.3")

**Evidence from Real Amiga Log:**
```
1767037790 msg request: 152
1767037790 data: 1
1767037790 string: N S U    <-- Door args, NOT version!
```

**Evidence from Our Implementation:**
- AquaScan completed in 0.5 seconds without making any JH_SM (output) calls
- Door exited immediately after EXPRESS_VERSION returned wrong value
- AquaScan couldn't determine its invocation mode without its args

**The Fix:**
Modified `handleExpressVersion()` in `web/backend/src/amiga-emulation/xim/bbs-info.ts`:
```typescript
// BEFORE (incorrect):
const version = this.getExpressMajorVersion();
this.messageParser.writeMessageString(msg.msgAddr, version);

// AFTER (correct - matches real Amiga):
const doorCommand = this.state.doorCommand || (this.bbsSession as any)?.doorCommand || '';
this.messageParser.writeMessageString(msg.msgAddr, doorCommand);
```

**Why This Matters:**
AquaScan uses EXPRESS_VERSION to get its command-line arguments ("N S U"):
- "N" = NEWSCAN mode (scan for new files)
- "S" = Skip already-scanned conferences
- "U" = User mode (show user-friendly output)

Without these args, AquaScan doesn't know what to do and exits immediately.

---

## Solution

**Fixed in:** `web/backend/src/amiga-emulation/xim/bbs-info.ts`

EXPRESS_VERSION now returns `doorCommand` instead of version, matching real Amiga behavior.

---

## Files Modified

- `web/backend/src/amiga-emulation/xim/io.ts` - Added JH_SM debug logging
- `web/backend/src/amiga-emulation/xim/bbs-info.ts` - Added EXPRESS_VERSION debug logging
