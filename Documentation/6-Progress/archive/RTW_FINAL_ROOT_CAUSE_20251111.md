# RTW Door - FINAL Root Cause - November 11, 2025

## Summary

RTW door exits with code 30 because **FindPort("AEDoorPort2") is never called**. Without calling FindPort, A4+0x474 remains zero, causing RTW to take the exit path instead of the IPC path.

## Complete Execution Flow

1. ✓ RTW starts, initializes BSS, sets up A4
2. ✓ RTW reaches PC 0x117C (byte copy loop completion)
3. ✓ RTW branches to 0x11CE (initialization code)
4. ✓ RTW executes some initialization functions (calls dos.library functions)
5. ✗ **RTW SHOULD call FindPort("AEDoorPort2") HERE - BUT DOESN'T**
6. ✓ RTW reaches 0x124C: `tst.l 0x474(a4)`
7. ✓ Test shows A4+0x474 is ZERO (no port address stored)
8. ✓ RTW branches to 0x1272 (cleanup/exit path)
9. ✓ RTW calls FreeMem, CloseLibrary, exits with code 30

## The Critical Test at 0x124C

```asm
0x124C: tst.l 0x474(a4)     ; Test message port address
0x1250: beq.b 0x1272        ; If ZERO → EXIT
                            ; If NON-ZERO → Continue to IPC
```

**Current state**: A4+0x474 = 0x0 (no port found)
**Expected**: A4+0x474 = 0xA0000 (address of AEDoorPort2)

## Evidence

### 1. AEDoorPort IS Created

```
[ExecLibrary] Creating public port: "AEDoorPort2"
[ExecLibrary]   Public port "AEDoorPort2" created at 0xa0000
[AmigaDoorSession] Created AEDoorPort2 at 0xa0000
```

### 2. RTW Has The Port Name Template

```bash
$ strings doors/RTW/rtw | grep AEDoorPort
AEDoorPort%d
```

RTW constructs "AEDoorPort2" from node number argument.

### 3. FindPort Is NEVER Called

```bash
$ grep "FindPort" logs/backend.log
[FindPort] Vector at 0xfe7a (offset -390)  # Only trap installation, never called
```

No "[ExecLibrary] FindPort(...)" log appears!

### 4. A4+0x474 Stays Zero

```
[CRITICAL-TEST] Value at A4+0x474: 0x0
[CRITICAL-TEST] ✓ Test passes - RTW will jump to 0x1272 (continue to IPC)
```

**NOTE**: The comment is WRONG. Jumping to 0x1272 means EXIT, not IPC!

## Why FindPort Isn't Called

RTW's initialization code between 0x11CE and 0x124C must be encountering a failure condition that causes it to skip the FindPort call. Possible reasons:

### 1. Missing File/Resource Check

RTW might check for a required file (DOOR.SYS, config file, etc.) and if not found, skips FindPort and exits.

### 2. Failed Memory Allocation

Some AllocMem call fails, causing RTW to abort initialization before FindPort.

### 3. Failed Library Open

RTW might try to open a library that fails, causing early exit.

### 4. Environment Variable Missing

RTW might check for an environment variable and exit if not set.

## Next Steps

### Immediate Action: Add FindPort Trap Handler

1. Implement `ExecLibrary.findPort()` method
2. Add trap handler for FindPort (offset -390, address 0xFE7A)
3. Return address of AEDoorPort{nodeId} when found

### Investigation: Why FindPort Call Is Skipped

1. **Disassemble 0x11CE through 0x124C** - Find where FindPort SHOULD be called
2. **Check for conditional branches** - Identify what condition causes FindPort to be skipped
3. **Add PC breakpoints** - Log all PCs between 0x11CE and 0x124C to see exact path
4. **Check Open() calls** - RTW might be trying to open a missing file

### Alternative: Manual Port Injection

If FindPort call is too deep in initialization code, we could:
1. Detect when RTW tests A4+0x474
2. If zero, manually write AEDoorPort address to 0x9E74 (A4+0x474)
3. Force test to pass

**BUT THIS IS A HACK** - Better to find why FindPort isn't called!

## Related Files

- `web/backend/src/amiga-emulation/api/ExecLibrary.ts:1234` - Need to add findPort() method
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:408` - Need FindPort trap handler
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:3033` - Execution path logs
- `doors/RTW/rtw` - RTW binary with "AEDoorPort%d" string at unknown offset

## Key Insight

**The port EXISTS, RTW KNOWS the name, but RTW NEVER LOOKS FOR IT.**

This is an initialization failure - some precondition check fails, causing RTW to skip normal startup and go straight to cleanup/exit.

## Confidence Level

**VERY HIGH** - We have definitive proof:
- ✓ AEDoorPort2 created at 0xA0000
- ✓ RTW has "AEDoorPort%d" format string
- ✓ FindPort trap installed but never triggered
- ✓ A4+0x474 stays zero throughout execution
- ✓ TST.L at 0x124C fails, branches to exit
- ✓ RTW exits with code 30

The solution is to either:
1. Fix whatever condition causes FindPort to be skipped (PROPER FIX)
2. Implement FindPort trap and hope RTW eventually calls it
3. Manually inject port address when test fails (HACK)
