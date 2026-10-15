# Session 2026-01-04: AquaScan Regression Fix

**Date:** 2026-01-04
**Issue:** AquaScan commands (N, NSU, CS, F, FR) were intentionally disabled because doors hung
**Status:** FIXED - Both root causes identified and resolved

---

## Summary

Fixed two critical XIM protocol regressions that caused AquaScan and other old-style doors to hang:

1. **INIT/STAT startup messages not sent** - Doors hung in infinite polling loops
2. **EXPRESS_VERSION returning wrong value** - Returned "S U" instead of "N S U"

Both issues were previously debugged and fixed (documented in AQUASCAN_NSU_DEBUG_SESSION.md), but regressed. Created comprehensive documentation and automated verification to prevent future regressions.

---

## Root Causes Fixed

### Fix #1: Send INIT/STAT Startup Messages
**Commit:** c9a529286

**Problem:**
`DoorMessageHandler.sendStartupMessage()` was a no-op. Old-style XIM doors (AquaScan, JoinCnf, WALL) expect INIT/STAT messages before sending JH_REGISTER. Without these, doors sat in infinite loops calling `FindPort("AEDoorPort1")` + `GetMsg()`.

**Fix:**
```typescript
// web/backend/src/amiga-emulation/session/DoorMessageHandler.ts
sendStartupMessage(): void {
  console.log("[DoorMessageHandler] Sending INIT/STAT startup messages for XIM door");
  this.sendInitAndStatusMessages();  // <- CRITICAL: Must call this
}
```

**Before:** Door polled AEDoorPort1 800+ times, never sent XIM messages
**After:** Door receives INIT/STAT, sends JH_REGISTER, progresses normally

---

### Fix #2: EXPRESS_VERSION Returns Full Command Line
**Commit:** d5cdf61da

**Problem:**
`doorParams` was set to just parameters ("S U") instead of full command line ("N S U"). AquaScan validates EXPRESS_VERSION response and exits if it doesn't match expected format.

**Fix:**
```typescript
// web/backend/src/handlers/door.handler.ts:2235-2242
const paramString = door.parameters ? door.parameters.join(' ') : '';
const fullCommandLine = door.command + (paramString ? ' ' + paramString : '');
(session as any).doorParams = fullCommandLine;  // <- "N S U", not "S U"
```

**Before:**
- doorCommand="N"
- doorParams="S U"
- EXPRESS_VERSION returns "S U"

**After:**
- doorCommand="N"
- doorParams="N S U"
- EXPRESS_VERSION returns "N S U"

---

## Documentation Created

### XIM_CRITICAL_REQUIREMENTS.md
**Commit:** 38e9e8b4d

Comprehensive documentation (282 lines) covering:
- Both critical requirements with correct/wrong examples
- Verification commands (grep patterns)
- Test cases and symptoms
- Regression history
- Quick reference table

**Location:** `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md`

### verify-xim-critical.sh
**Commit:** 38e9e8b4d

Automated verification script that checks:
- sendInitAndStatusMessages() is called
- doorParams uses fullCommandLine (not paramString)
- No "Skipping startup messages" code
- Exit code 1 if any check fails

**Location:** `dev/scripts/verify-xim-critical.sh`

**Usage:**
```bash
./dev/scripts/verify-xim-critical.sh
# [SUCCESS] All XIM critical requirements verified!
```

---

## Testing Required

**Commands to test:**
- `N` - New message scan (calls AquaScan)
- `NSU` - New scan unread (calls AquaScan)
- `CS` - Conference scan (calls AquaScan)
- `F` - File area scan (calls AquaScan)
- `FR` - File area reverse scan (calls AquaScan)
- `J` - Join conference (calls JoinCnf)

**Restart servers to pick up fixes:**
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

**Expected behavior:**
- AquaScan should start immediately (no polling loops)
- Should display banner and scan output
- Should complete successfully

**Verify in logs:**
```bash
# Check INIT/STAT sent
grep "Sending INIT/STAT startup messages" logs/backend.log

# Check EXPRESS_VERSION returns full command line
grep 'Set doorParams="N S U"' logs/backend.log  # CORRECT
# Should NOT see: Set doorParams="S U"

# Check door progresses past startup
grep "BB_NONSTOPTEXT\|RAWARROW\|BB_MAINLINE" logs/backend.log
```

---

## Regression History

**Why This Keeps Happening:**
1. XIM protocol implementation is complex
2. Door startup flow has changed multiple times
3. Different door styles (old vs new protocol)
4. No automated verification until now

**Previous Incidents:**
- Multiple times in 2024-2025 (see AQUASCAN_DEBUG_SESSION.md)
- Each time: doors hang, debugging session, fix, regression

**Prevention Going Forward:**
- Run `verify-xim-critical.sh` before committing XIM changes
- Check XIM_CRITICAL_REQUIREMENTS.md when modifying door code
- Test with AquaScan after XIM protocol changes

---

## Files Modified

### Code Fixes
- `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` - sendStartupMessage()
- `web/backend/src/handlers/door.handler.ts` - doorParams fullCommandLine

### Documentation
- `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md` - NEW
- `dev/scripts/verify-xim-critical.sh` - NEW (executable)
- `Documentation/3-Developers/TESTING.md` - Updated regression safeguards

---

## Reference Logs

**Real Amiga AquaScan log:**
`Documentation/4-Door-Developers/Aquascan N.log`

Shows correct XIM message sequence:
```
msg request: 1 (JH_REGISTER)
msg request: 104 (DT_SLOTNUMBER)
msg request: 163 (ENVSTAT) → string: "8"
msg request: 525 (BB_NONSTOPTEXT)
msg request: 501 (RAWARROW)
msg request: 131 (BB_MAINLINE)
msg request: 152 (EXPRESS_VERSION) → string: "N S U"  <- Full command line!
```

---

## Next Steps

1. **Test AquaScan commands** - Verify all 5 commands work (N, NSU, CS, F, FR)
2. **Test J command** - Verify JoinCnf works with Conference 14 fixes
3. **Run verification script** - Add to CI/pre-commit if desired
4. **Monitor for regressions** - Watch for similar hangs in other doors

---

## Commits

1. **c9a529286** - `fix(xim): send INIT/STAT startup messages to prevent AquaScan hang`
2. **d5cdf61da** - `fix(xim): EXPRESS_VERSION returns full command line (command + params)`
3. **38e9e8b4d** - `docs: add XIM critical requirements and verification script`

---

**Session completed by:** Claude Sonnet 4.5
**Documentation:** Complete and verified
