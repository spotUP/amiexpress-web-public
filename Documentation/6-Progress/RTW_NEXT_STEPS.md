# RTW Door - Next Steps (Quick Start)

## If You're Picking This Up

Read `RTW_COMPREHENSIVE_STATUS_20251111.md` first. This document is a quick-start guide.

---

## The Problem In 30 Seconds

RTW door reaches IPC loop but produces no output. We've fixed:
- ✓ Reply port injection (A4+0x474)
- ✓ BBS port injection (A4+0x44C)
- ✗ Still no output

**Current Code**: Port injection hack at `AmigaDoorSession.ts:1061-1094`

---

## Test First (Before Any More Fixes)

### 1. Test WHO Door (5 minutes)

WHO is simpler than RTW. If WHO works, compare to RTW. If WHO fails, same root cause.

```bash
# Connect to BBS at http://localhost:5174
# Login as sysop/sysop
# Type: /DOOR WHO
```

**If WHO works**: RTW-specific issue, compare implementations
**If WHO fails**: Fundamental emulation problem

### 2. Check Logs (2 minutes)

```bash
# Did RTW call PutMsg with correct port?
grep "PutMsg(port=" logs/backend.log | tail -5

# Expected: port=0xa0000 (AEDoorPort2)
# If port=0x2010007 or other garbage: injection failed
```

### 3. Verify Message Handling (5 minutes)

Check if BBS receives/processes door messages:

```bash
# Look for door message processing
grep -E "XIM|Door.*message|processMessage" logs/backend.log | tail -20
```

---

## Most Likely Issues

### Issue 1: BBS Doesn't Handle Messages (60% probability)

**Symptom**: RTW sends PutMsg, but BBS never processes it

**Check**:
```typescript
// In door.handler.ts or similar
// Search for XIM message handling
// Verify ReplyMsg() is called
```

**Fix**: Implement XIM message handler in BBS

### Issue 2: Missing FindPort Implementation (30% probability)

**Symptom**: FindPort trap installed but never called

**Fix**:
```typescript
// web/backend/src/amiga-emulation/api/ExecLibrary.ts
public findPort(namePtr: number): number {
  const portName = this.emulator.readString(namePtr);
  const port = this.publicPorts.get(portName);
  console.log(`[ExecLibrary] FindPort("${portName}") -> 0x${(port?.address || 0).toString(16)}`);
  return port ? port.address : 0;
}

// web/backend/src/amiga-emulation/api/LibraryTraps.ts
// In handleExecTrap(), add case for FindPort (offset -390)
case -390: // FindPort
  const namePtr = this.emulator.getRegister(8); // A0
  const result = this.execLibrary.findPort(namePtr);
  this.emulator.setRegister(0, result); // D0
  break;
```

### Issue 3: RTW Requires Files (10% probability)

**Symptom**: RTW checks for DOOR.SYS, fails silently

**Check**: Add Open() logging to see what RTW tries to open

**Fix**: Create required door files

---

## Quick Wins (Try These First)

### Win 1: Implement FindPort (15 minutes)

See "Issue 2" above. Even if RTW doesn't call it, having it implemented is required.

### Win 2: Add Complete IPC Logging (10 minutes)

```typescript
// In AmigaDoorSession.ts polling loop
if (pc === somePC) {
  const a0 = this.emulator.getRegister(8);
  const d0 = this.emulator.getRegister(0);
  console.log(`[RTW-IPC] PC=0x${pc.toString(16)} A0=0x${a0.toString(16)} D0=0x${d0.toString(16)}`);
}
```

### Win 3: Test Simpler Door (5 minutes)

Try WHO door. If it works, you have a working baseline to compare.

---

## If Nothing Works

### Option A: Native Rewrite (1-2 days)

Rewrite RTW in TypeScript instead of emulating 68K binary.

**Pros**:
- Full control, easy debugging
- Better performance
- No emulation issues

**Cons**:
- Need to understand RTW game logic
- 1-2 days of work

### Option B: Use Real Amiga (1 day)

Run AmiExpress on FS-UAE/WinUAE, debug real door protocol.

**Pros**:
- Ground truth for how it should work
- Can trace actual IPC

**Cons**:
- Setup overhead
- Still need to replicate in TypeScript

### Option C: Skip XIM Doors (1 hour)

Mark XIM doors as unsupported, focus on other door types.

**Pros**:
- Immediate resolution
- Focus on features that work

**Cons**:
- Missing classic Amiga doors
- Defeats purpose of emulation

---

## Don't Do These

❌ **Don't**: Add more PC-specific hacks without understanding root cause
❌ **Don't**: Guess at missing values or fake library results
❌ **Don't**: Spend more than 4 hours without progress
❌ **Don't**: Skip testing WHO door first

✅ **Do**: Test simpler examples
✅ **Do**: Add logging, not fixes
✅ **Do**: Understand before implementing
✅ **Do**: Consider native rewrite if blocked

---

## Success Criteria

**Minimum**: WHO door produces output
**Goal**: RTW door produces output
**Stretch**: All XIM doors work

---

## Time Budget

- Testing WHO door: 15 minutes
- Implementing FindPort: 30 minutes
- Adding logging: 30 minutes
- **STOP after 2 hours if no progress**

If no progress in 2 hours, switch to Option A (native rewrite) or Option C (skip XIM doors).

---

## Files To Check

1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Port injection hack at line 1061
2. `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Need findPort() implementation
3. `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - Need FindPort trap handler
4. `web/backend/src/handlers/door.handler.ts` - XIM message handling
5. `logs/backend.log` - All execution logs

---

## Expected vs Actual

### Expected (Working Door)
```
[RTW-FIX] Injecting ports...
[CRITICAL-TEST] Port is set! RTW will enter IPC loop!
[ExecLibrary] PutMsg(port=0xa0000, msg=...)
[DoorHandler] Received door message from RTW
[DoorHandler] Processing XIM command: ...
[ExecLibrary] ReplyMsg(msg=...)
[RTW Output] Some game text appears
```

### Actual (Broken Door)
```
[RTW-FIX] Injecting ports...
[CRITICAL-TEST] Port is set! RTW will enter IPC loop!
[ExecLibrary] PutMsg(port=0xa0000, msg=...)
(silence - no message processing, no output)
[CallersLog] Node2: Door exit: RTW
```

**The gap**: Between PutMsg and output, something is missing.

---

## Contact Points

- Port injection: `AmigaDoorSession.ts:1061-1094`
- Library traps: `LibraryTraps.ts:handleExecTrap()`
- Door messages: `door.handler.ts` (search for XIM)
- Logs: `logs/backend.log`

---

**Remember**: Read full report in `RTW_COMPREHENSIVE_STATUS_20251111.md` before attempting fixes.
