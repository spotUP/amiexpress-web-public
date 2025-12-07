# RTW Door - Comprehensive Status Report - November 11, 2025

## Executive Summary

**STATUS**: RTW door still does not produce output after days of debugging and multiple fix attempts.

**PROBLEM**: RTW enters IPC loop but produces no visible output. The door displays "Starting RTW... Press ENTER to continue..." then exits silently.

**ROOT CAUSE**: Unknown. Multiple issues have been identified and fixed, but the door still doesn't work.

**COST**: Significant development time and API costs with no working result.

**RECOMMENDATION**: Either:
1. Find a working XIM door example to verify emulation works at all
2. Implement native TypeScript door instead of emulating 68K binary
3. Consider this door type unsupported for now

---

## What We Know For Certain

### ✓ Confirmed Working

1. **MOIRA 68K Emulator** - Correctly executes 68K instructions
2. **Library Trap Mechanism** - Successfully intercepts library calls (AllocMem, FreeMem, Open, Close, etc.)
3. **Hunk Loader** - Properly loads Amiga executables, applies relocations
4. **BSS Initialization** - RTW's BSS segment is correctly zeroed
5. **A4 Register Setup** - A4 is set to data segment base (0x9A00)
6. **AEDoorPort2 Creation** - BBS creates message port at 0xA0000
7. **RTW Reaches IPC Loop** - RTW successfully reaches PC 0x124C and enters IPC code
8. **Port Injection Works** - Our fix successfully injects port addresses into RTW's memory

### ✗ Still Broken

1. **No Door Output** - RTW produces no visible output to terminal
2. **Silent Exit** - RTW exits without error messages
3. **No Message Exchange** - No evidence of successful IPC between RTW and BBS
4. **FindPort Never Called** - RTW never calls FindPort to locate AEDoorPort2

---

## Complete Timeline of Debugging Attempts

### Day 1-2: Initial Investigation
- **Found**: RTW exits with code 30 at PC 0x117C
- **Discovered**: RTW never reaches PutMsg calls at 0x1C24+
- **Learned**: Early exit in initialization, not code corruption

### Day 3: Memory Layout Analysis
- **Found**: RTW uses A4-relative addressing for all globals
- **Discovered**: Three critical memory locations:
  - A4+0x44C: BBS door port address (should be 0xA0000)
  - A4+0x450: RTW reply port (created, used in early code)
  - A4+0x474: RTW reply port (never set, tested in IPC loop)
- **Root Cause**: Dead code at 0x1B0-0x1C0 that would set A4+0x474 is unreachable

### Day 4: First Fix Attempt - Reply Port Injection
- **Implementation**: Inject reply port at PC 0x124C before critical test
- **Result**: RTW enters IPC loop successfully
- **Problem**: Still no output, RTW calls PutMsg with garbage port address 0x2010007

### Day 5: Second Fix Attempt - BBS Port Injection
- **Implementation**: Also inject BBS port address (0xA0000) at A4+0x44C
- **Result**: Unknown - servers restarted but door still produces no output
- **Status**: Current state as of this report

---

## Technical Architecture

### RTW Memory Layout (A4 = 0x9A00)

```
A4+0x000: Port name string (used by CreatePort)
A4+0x44C: BBS door port address (for sending TO BBS)
          Expected: 0xA0000 (AEDoorPort2)
          Actual: Garbage 0x2010007 before fix
          Fixed: Injected 0xA0000 at PC 0x124C

A4+0x450: RTW reply port (for receiving FROM BBS)
          Created by RTW at PC 0x1068
          Used in early handshake code (0x1118-0x112E)
          Fixed: Injected at PC 0x124C

A4+0x454: Message pointer (for IPC message buffer)

A4+0x474: RTW reply port (duplicate location)
          NEVER SET by RTW (dead code at 0x1C0)
          Tested at PC 0x124C to decide: IPC loop vs exit
          Fixed: Injected at PC 0x124C
```

### RTW Execution Flow

```
0x1000: Entry point
  ↓
0x1004-0x1024: BSS initialization (zero A3+0x5C through A3+0x78E)
  ↓
0x1068: CreatePort() - creates reply port, stores at A4+0x450
  ↓
0x10FC: FindPort("AEDoorPort2") - SHOULD be called but ISN'T
  ↓
0x1118-0x112E: Early IPC using A4+0x450 (handshake?)
  ↓
0x11CE-0x124C: Initialization code (27 PCs visited)
  ↓
0x124C: *** CRITICAL TEST *** TST.L 0x474(A4)
        If ZERO → exit at 0x1272
        If NON-ZERO → enter IPC loop at 0x1250+
  ↓
0x1250+: Main IPC loop (Wait/GetMsg/process messages)
```

### BBS Door IPC Protocol (from express.e)

```elan
; BBS creates door port (express.e:4317-4327)
StringF(doorPort, '\s\d', 'AEDoorPort', node)  -> "AEDoorPort2"
mp := createPort(doorPort, 0)                  -> Create at 0xA0000

; BBS waits for messages (express.e:4354-4368)
signals := Wait(ximSig)
WHILE (msg := GetMsg(mp))
  ; Process door message
  ReplyMsg(msg)
ENDWHILE

; Door protocol (assumed from RTW binary)
1. Door calls FindPort("AEDoorPort2") to locate BBS port
2. Door creates own reply port for receiving replies
3. Door sends messages to BBS port with PutMsg()
4. Door waits on own reply port with Wait()/GetMsg()
5. BBS receives message, processes it, calls ReplyMsg()
```

---

## Current Code State

### File: web/backend/src/amiga-emulation/AmigaDoorSession.ts

**Lines 46**: Added flag
```typescript
private rtwPortInjected: boolean = false;
```

**Lines 1061-1094**: Port injection at PC 0x124C
```typescript
if (pc === 0x124C && !this.rtwPortInjected) {
  this.rtwPortInjected = true;
  const a4 = this.emulator.getRegister(12);

  if (this.execLibrary && a4 !== 0 && this.aePortAddress) {
    // Create reply port
    const replyPortAddr = this.execLibrary.createMsgPort();

    // Inject BBS door port at A4+0x44C
    this.emulator.writeMemory32(a4 + 0x44C, this.aePortAddress);

    // Inject reply port at A4+0x450 and A4+0x474
    this.emulator.writeMemory32(a4 + 0x450, replyPortAddr);
    this.emulator.writeMemory32(a4 + 0x474, replyPortAddr);
  }
}
```

**What This Does**:
1. Detects when RTW reaches critical test at PC 0x124C
2. Reads A4 register (data segment base, typically 0x9A00)
3. Creates a new message port for RTW
4. Writes BBS port address (0xA0000) to A4+0x44C
5. Writes reply port address to A4+0x450 and A4+0x474
6. Allows RTW to enter IPC loop

**Why This Is A Hack**:
- RTW should call FindPort() to locate BBS port, but doesn't
- RTW should have code to set A4+0x474, but it's unreachable dead code
- We're papering over missing RTW initialization logic
- Doesn't address why FindPort is never called

---

## Disassembly Reference

### Critical Code Sections

**PC 0x1068 - CreatePort and Store at A4+0x450**
```asm
File 0x1062 (Memory 0x2036):
0x105e: pea.l 0x0(a4)           ; Push port name
0x1062: jsr 0x2594(pc)          ; Call CreatePort wrapper
0x1066: addq.w 0x8, a7          ; Clean stack
0x1068: move.l d0, 0x450(a4)   ; *** Store at A4+0x450 ***
0x106c: lea.l 0x0(a4), a0
0x1078: tst.l 0x450(a4)         ; Test if creation succeeded
0x107c: bne.b 0x10a0            ; If NON-ZERO, continue
```

**PC 0x124C - The Critical Test**
```asm
File 0x278 (Memory 0x124C):
0x124c: tst.l 0x474(a4)         ; Test if A4+0x474 is set
0x1250: beq.b 0x1272            ; If ZERO → exit path
                                ; If NON-ZERO → IPC loop
0x1252: movea.l 0x41c(a4), a6   ; Load library base
0x1256: move.l 0x470(a4), d1
0x125a: beq.b 0x1260
0x125c: jsr -0x5a(a6)
0x1260: movea.l 0x4.w, a6       ; ExecBase
0x1264: jsr -0x84(a6)           ; Wait()
0x1268: movea.l 0x474(a4), a1   ; Load port from A4+0x474
0x126c: jsr -0x17a(a6)          ; GetMsg(port)
```

**PC 0x1B0 - Dead Code (NEVER REACHED)**
```asm
File 0x1AE (Memory 0x1182):
0x1ae: bra.b 0x1fa              ; *** UNCONDITIONAL BRANCH ***

File 0x1B0-0x1C0 (Memory 0x1184-0x1194): DEAD CODE
0x1b0: lea.l 0x5c(a3), a0
0x1b4: jsr -0x180(a6)           ; RemPort()
0x1b8: lea.l 0x5c(a3), a0
0x1bc: jsr -0x174(a6)           ; CreatePort()
0x1c0: move.l d0, 0x474(a4)     ; *** Would set A4+0x474 ***
```

---

## What We Still Don't Know

### Mystery #1: Why FindPort Is Never Called

**Evidence**:
- RTW binary contains "AEDoorPort%d" string
- RTW has FindPort call at PC 0x20D0 (file 0x10FC)
- FindPort trap is installed at 0xFE7A
- FindPort is NEVER triggered during execution

**Hypothesis**:
RTW's initialization code between 0x11CE and 0x124C should call FindPort, but doesn't because:
1. Some precondition check fails (missing file, env var, etc.)
2. RTW takes a conditional branch that skips FindPort
3. RTW expects a different startup protocol

**To Investigate**:
- Disassemble 0x11CE through 0x124C completely
- Identify all conditional branches
- Check what conditions determine execution path
- Look for Open() calls that might fail

### Mystery #2: Why No Output

Even after port injection, RTW produces no visible output.

**Possible Causes**:
1. **RTW sends messages, BBS doesn't handle them**
   - BBS XIM door handler doesn't process RTW's message format
   - BBS expects different message structure

2. **RTW waits for initial handshake that never comes**
   - BBS should send initialization message to door
   - Door waits forever for this message

3. **RTW requires files we don't provide**
   - DOOR.SYS, DORINFO1.DEF, door-specific config
   - RTW fails silently if files missing

4. **Output goes to wrong file handle**
   - RTW writes to file handle we don't monitor
   - Output buffer not flushed

5. **RTW crashes/hangs in IPC loop**
   - Infinite loop in message processing
   - Exception we don't catch

**To Investigate**:
- Add extensive logging to PutMsg/GetMsg/Wait/ReplyMsg
- Monitor all file I/O operations
- Check if RTW ever writes to stdout
- Verify BBS actually receives RTW's messages

### Mystery #3: Dead Code at 0x1B0-0x1C0

Why does RTW have unreachable code that would set A4+0x474?

**Theories**:
1. **Compiler optimization artifact** - Dead code elimination missed this
2. **Conditional compilation** - Different build flags enable this path
3. **Version mismatch** - We're testing wrong version of RTW
4. **Intentional dual-mode** - Standalone vs BBS-integrated modes

---

## Alternative Approaches

### Option 1: Find Working XIM Door Example

**Rationale**: Verify our emulation works at all with ANY door

**Action**:
1. Look for simpler XIM doors in AmiExpress distribution
2. Test WHO door (simpler than RTW)
3. If simpler door works, compare protocols
4. If NO door works, emulation is fundamentally broken

**Effort**: Low
**Likelihood of Success**: Medium

### Option 2: Implement Native TypeScript Door

**Rationale**: Avoid 68K emulation entirely

**Action**:
1. Read RTW game logic from sources/disassembly
2. Rewrite in TypeScript
3. Use native BBS IPC (Socket.IO events)
4. Provides better performance and debuggability

**Effort**: Medium-High
**Likelihood of Success**: High

### Option 3: Complete FindPort Implementation

**Rationale**: Fix missing library calls properly

**Action**:
1. Implement findPort() in ExecLibrary.ts
2. Add trap handler for FindPort at 0xFE7A
3. Return correct port addresses
4. Remove port injection hack

**Effort**: Low
**Likelihood of Success**: Unknown (may reveal more missing calls)

**Current Status**: FindPort trap is installed but never called by RTW

### Option 4: Trace Complete Execution Path

**Rationale**: Understand EXACTLY what RTW does

**Action**:
1. Disassemble entire RTW binary completely
2. Add PC trace logging for EVERY instruction
3. Map out complete execution flow
4. Identify every library call RTW makes
5. Verify all library calls are implemented

**Effort**: High
**Likelihood of Success**: Medium (very time-consuming)

### Option 5: Analyze Working Amiga BBS

**Rationale**: See how REAL AmiExpress handles RTW

**Action**:
1. Set up real Amiga emulator (FS-UAE or WinUAE)
2. Install AmiExpress BBS
3. Run RTW door successfully
4. Use debugger to trace IPC protocol
5. Capture actual message exchanges
6. Replicate protocol exactly

**Effort**: Medium
**Likelihood of Success**: High (ground truth)

---

## Recommended Next Steps

### Immediate (Before More Fixes)

1. **Test WHO Door** (`doors/WHO/who`)
   - Simpler than RTW
   - If it works, compare to RTW
   - If it fails, similar root cause

2. **Implement FindPort Properly**
   ```typescript
   // In ExecLibrary.ts
   public findPort(namePtr: number): number {
     const portName = this.emulator.readString(namePtr);
     const port = this.publicPorts.get(portName);
     return port ? port.address : 0;
   }
   ```

3. **Add Complete IPC Logging**
   - Log EVERY PutMsg call with message contents
   - Log EVERY GetMsg call with results
   - Log EVERY Wait/Signal operation
   - Track message flow from door to BBS and back

### Medium Term

4. **Verify BBS Handles Door Messages**
   - Check XIM handler in backend
   - Verify message queue processing
   - Ensure ReplyMsg is called

5. **Check Door File Requirements**
   - Create DOOR.SYS if expected
   - Create DORINFO1.DEF if expected
   - Check RTW documentation for requirements

### Long Term

6. **Consider Native Rewrite**
   - If 68K emulation proves too fragile
   - Rewrite popular doors in TypeScript
   - Use modern BBS API instead of XIM

7. **Document All Working Doors**
   - Create test suite for door protocol
   - Verify each door type works
   - Build compatibility matrix

---

## Files Modified

### web/backend/src/amiga-emulation/AmigaDoorSession.ts
- Line 46: Added `rtwPortInjected` flag
- Lines 1061-1094: Port injection at PC 0x124C
- Lines 1096-1109: Debug logging at critical test

**Revert Command** (if needed):
```bash
git checkout web/backend/src/amiga-emulation/AmigaDoorSession.ts
```

---

## Test Logs Location

All test runs logged to:
- `~/Code/amiexpress-web/logs/backend.log`

**Key Log Markers**:
```bash
# Find port injection
grep "RTW-FIX" logs/backend.log

# Find critical test
grep "CRITICAL-TEST" logs/backend.log

# Find library calls
grep "INTERCEPTED" logs/backend.log

# Find PutMsg with port addresses
grep "PutMsg(port=" logs/backend.log
```

---

## Cost Analysis

**Time Invested**: 3-4 days of intensive debugging
**Issues Identified**: 5+ separate problems
**Fixes Implemented**: 3 major fixes
**Working Result**: None

**ROI**: Negative - significant cost, no working door

**Break-Even Analysis**:
- If native TypeScript rewrite takes 1-2 days → cheaper than continued debugging
- If simpler door works immediately → emulation is viable
- If WHO door also fails → fundamental emulation issues, abandon 68K approach

---

## Conclusion

RTW door debugging has reached diminishing returns. Multiple fundamental issues have been identified and fixed, but the door still doesn't work. The recommended path forward is:

1. **Stop** attempting more fixes without understanding root cause
2. **Test** simpler doors (WHO) to verify basic emulation works
3. **Decide** whether to continue 68K emulation or switch to native rewrites
4. **Document** any door that DOES work to understand the difference

This report provides complete context for future work. Any developer (or AI) should be able to pick up exactly where we left off.

---

## Related Documentation

- `RTW_ABSOLUTE_ROOT_CAUSE_20251111.md` - Memory layout discovery
- `RTW_FINAL_ROOT_CAUSE_20251111.md` - FindPort analysis
- `RTW_TRUE_ROOT_CAUSE_20251111.md` - Disassembly corrections
- `RTW_LIBRARY_TRAP_BUG_20251111.md` - Trap mechanism analysis
- `RTW_EXIT_ROOT_CAUSE_20251111.md` - Early exit investigation
- `AmiExpress-Sources/express.e` lines 4300-4400 - Door protocol
- `doors/RTW/rtw` - RTW binary

**Next person: Start by reading this document completely before attempting any fixes.**
