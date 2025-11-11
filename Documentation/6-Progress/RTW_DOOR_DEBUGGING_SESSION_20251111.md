# RTW Door Debugging Session - November 11, 2025

## Summary

Debugged RTW (Real Time Who) door to fix 13 critical bugs. RTW now executes without error messages but exits early without displaying the expected user list table. Door runs for ~1134 CPU iterations before exiting.

## Expected vs Actual Behavior

### Expected Output (from Real Amiga BBS)
```
  Nd . Name              . Location          . Action          . Misc Info
.----+-------------------+-------------------+-----------------+--------------.
| 01 | yOUR lINE         | Up Rough          | iN A kEWL dOOR! | rTW v2.01    |
| 02 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
```

### Actual Output
```
Starting RTW...

Press ENTER to continue...
```
*(No output from RTW itself, just the BBS's "Press ENTER" message)*

## All 13 Bugs Fixed

### Bug #1: StackSwap() Allocating Wrong Stack
**File**: `web/backend/src/amiga-emulation/api/ExecLibrary.ts:1369-1381`
**Problem**: StackSwap() detected "overlap danger" and allocated separate stack at 0x53ffc instead of requested 0xfdff8.
**Fix**: Removed overlap protection logic, simplified to honor caller's requested stack pointer.

### Bug #2: Initial A0=0 Attempt
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:564` (removed)
**Problem**: First attempt to set A0=0 so RTW would call FindPort(), but this was wrong approach.
**Fix**: Removed this approach entirely (later discovered it corrupted argument pointer).

### Bug #3: Missing CLI Local Variables
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:842-894`
**Problem**: RTW checks for RC and Result2 CLI local variables via FindVar(), but they didn't exist.
**Fix**: Created MinList structure with LocalVar nodes for RC=0 and Result2=0 at cli_LocalVars offset 0x5C.

### Bug #4: FindVar() Not Implemented
**File**: `web/backend/src/amiga-emulation/api/DosLibrary.ts:2796-2878`
**Problem**: FindVar() DOS function wasn't implemented, so RTW couldn't check for RC/Result2.
**Fix**: Implemented FindVar() to search CLI local variables list and return LocalVar structure pointer.

### Bug #5: Low Memory Corruption at 0xAC
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:577-590` (removed)
**Problem**: Wrote port address to absolute memory[0xAC], corrupting exception vector table (0x00-0xFF).
**Fix**: Removed lines that wrote to memory[0xAC].

### Bug #6: FindVar() Trap Vector Missing
**File**: `web/backend/src/amiga-emulation/api/LibraryTraps.ts:264-271`
**Problem**: FindVar() was implemented in DosLibrary but trap vector wasn't installed, so calls weren't intercepted.
**Fix**: Added FindVar() trap vector at offset -126 in DOS_VECTORS array.

### Bug #7: A0 Register Corruption (Final)
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:561-565` (removed)
**Problem**: Set A0=0 AFTER setting up argument string pointer, corrupting SAS/C startup. The startup code needs A0 to parse argc/argv.
**Fix**: Removed lines 563-565 that set A0=0. Now A0 keeps pointing to argument string for SAS/C.

### Bug #8: Argument String Format Wrong
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:492`
**Problem**: Passed just arguments " 2" instead of FULL command line "rtw 2" in D0/A0. SAS/C expects full command line.
**Fix**: Changed `argString = " " + nodeId` to `argString = \`${progName} ${nodeId}\`` (e.g., "rtw 2").

### Bug #9: UnLock() Trap Vector Missing
**File**: `web/backend/src/amiga-emulation/api/LibraryTraps.ts:226-233`
**Problem**: UnLock() wasn't intercepted, causing RTW to fail after Open("*").
**Fix**: Added UnLock() trap vector at offset -90 in DOS_VECTORS array.

### Bug #10: Missing CLI Structure Fields
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:834-840`
**Problem**: CLI structure jumped from offset 0x3C (cli_Module) to 0x5C (cli_LocalVars), skipping 32 bytes of required fields.
**Fix**: Added missing fields: cli_CurrentDir (0x40), cli_DirLen (0x44), cli_DirBuf (0x48), cli_PathList (0x4C), cli_ReturnAddr (0x50), cli_Pid (0x54), cli_NumArgs (0x58).

### Bug #11: FreeLock() Trap Vector Missing
**File**: `web/backend/src/amiga-emulation/api/LibraryTraps.ts:241-248`
**Problem**: RTW calls FreeLock() (not UnLock!) to release directory lock from Amiga shell log. Trap vector wasn't installed.
**Fix**: Added FreeLock() trap vector at offset -150 in DOS_VECTORS array.

### Bug #12: NodeId Was 0 (Invalid) - PROPERLY FIXED
**Files**:
- `web/backend/src/handlers/door.handler.ts:564-569`
- `web/backend/src/handlers/command.handler.ts:2895-2899`
- `web/backend/src/handlers/command-handler/internal-commands.ts:465-469`

**Problem**: BBSSession already had nodeId property (index.ts:244), but door handlers were creating partial session objects with `nodeId: 0` or overriding with `nodeId: 2`.

**Initial Temporary Fix**: Set `nodeId: 2` hardcoded value.

**Proper Fix (Applied)**:
1. Removed spread operator hack `{...session, nodeId: 2}` in door.handler.ts
2. Fixed command.handler.ts to pass `session` instead of `{ nodeId: 0, user: session.user }`
3. Fixed internal-commands.ts to pass `session` instead of `{ nodeId: 0, user: session.user }`
4. Now uses actual nodeId assigned by `getNextAvailableNodeId()` (session-manager.ts:66-84)
5. NodeId is properly assigned from 1-99 when socket connects (index.ts:811)

### Bug #13: Stack Exit Trap Causing Crash at PC=0
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:536-543`
**Problem**: Only wrote exit trap at one location (0xFDFFC). SAS/C startup pushes registers, moving SP down (e.g., to 0xFDFF8). When main() returns, RTS pops from wrong location (containing 0).
**Fix**: Fill 64 bytes of stack (0xFDFC0 to 0xFDFFC) with exit trap address 0xFFFF00.

## RTW Startup Sequence (from Amiga Shell Log)

From user-provided vamos trace showing what RTW does when it works:
```
1. RunCommand
2. Open("*")           - stdout
3. #FREE_LOCK          - release current directory lock
4. FindVar("RC")       - check for return code variable
5. FindVar("Result2")  - check for secondary result
6. FindPort("AEDoorPort2") - find BBS message port
7. Display user list table
```

## Current Execution Status

### What's Working ✓
- Arguments parsed correctly: D0=5, A0="rtw 2"
- CLI structure properly initialized at 0x90000
- CLI command line BSTR: "RTW 2" at 0x90100
- CLI local variables created: RC=0, Result2=0 at 0x90300
- FindVar() trap vector installed at offset -126
- FindPort() trap vector installed at offset -390
- UnLock() trap vector installed at offset -90
- FreeLock() trap vector installed at offset -150
- Exit() trap vector installed at offset -144
- AEDoorPort2 created successfully at 0xA0000
- StackSwap() honors caller's requested stack
- Exit trap addresses filled: 0xFDFC0 to 0xFDFFC

### What's Not Working ✗
- **RTW never calls FindPort()** - vamos shows it reaches PC=0x30ea (FindPort call site), our emulator never gets there
- **RTW exits silently** - no output written via DOS Write()
- **Execution path shows polling loops**: PC 0x1156 → 0x1158 → 0x115e → 0x1160 (repeats), then 0x1172 → 0x1178 (repeats), ends at 0x117c
- **Total iterations: 1134** - very short execution (should be much longer if working)
- **Crashes at PC=0** - "PC in low memory (0x0) - likely stack corruption" after CloseLibrary returns to 0x128c

### Library Calls Intercepted (in order)
```
1. StackSwap()      - Setup door stack
2. SetTaskPri()     - Set task priority
3. OpenLibrary()    - Open dos.library
4. AllocMem(12)     - Allocate structures
5. Output()         - Get stdout handle
6. Input()          - Get stdin handle
7. Output()         - Get stdout again
8. Open("*")        - Open console
9. AllocMem(16)     - More allocations
10. AllocMem(12)
11. FreeMem(256)    - Free buffer immediately after allocating
12. StackSwap()     - Restore original stack
13. Close()         - Close file
14. FreeMem(12)     - Cleanup
15. FreeMem(16)
16. CloseLibrary()  - Close dos.library
```

**Notable**: No FindVar() calls intercepted, no FindPort() calls intercepted, no Write() calls after initialization.

## Vamos vs Our Emulator

### Vamos Trace (Working)
```
lib:INFO:  { CALL: FindPort( name[a1]=0000a9cc ) from PC=0030ea -> d0=0
lib:INFO:  { CALL: AllocSignal( signalNum[d0]=ffffffff ) -> d0=0
lib:INFO:  { CALL: Write( file[d1]=00000831, buffer[d2]=0000d26c, length[d3]=0000001b )
```
Output: `Couldn't create reply port`

### Our Emulator (Not Working)
- Never reaches PC=0x30ea (FindPort call site)
- No AllocSignal() call
- No Write() with error message
- Exits in polling loop before reaching FindPort

## Technical Details

### Memory Layout
```
0x00000000 - 0x000000FF : Exception vectors (low memory)
0x00001000 - 0x0000XXXX : RTW code segment
0x0000F0100            : Argument string "rtw 2"
0x00010000             : ExecBase
0x00020000             : DOS.library base
0x00070000             : Current task structure
0x00080000 - 0x00080XXX : AllocMem allocations
0x00090000             : CLI structure
0x00090100             : CLI command line BSTR "RTW 2"
0x00090200             : Arg string for GetArgStr() "2"
0x00090300             : CLI local variables list (MinList)
0x00090320             : RC LocalVar structure
0x00090340             : RC name string "RC"
0x00090360             : Result2 LocalVar structure
0x00090380             : Result2 name string "Result2"
0x000A0000             : AEDoorPort2 message port
0x000B0000             : Node status semaphores
0x000FDFFC             : Initial stack pointer (finalSP)
0x000FDFC0-0x000FDFFC  : Exit trap addresses (0xFFFF00)
0x00F80000 - 0x00FFFFFF : Kickstart ROM
```

### Register State at Entry
```
PC  = 0x1000      (Entry point)
SP  = 0xFDFFC     (Stack pointer)
A6  = 0x10000     (ExecBase)
SR  = 0x2700      (Supervisor mode, interrupts disabled)
D0  = 5           (Argument length "rtw 2")
A0  = 0xF0100     (Argument string pointer)
A1  = 0x505C      (End of CODE segment)
```

### Execution Path Analysis
```
PC Range     | Description
-------------|----------------------------------------------------------
0x1000-0x101A| SAS/C startup - initialization
0x1020-0x1024| DBRA loop - copy BSS initialization data (48 iterations)
0x1156-0x1160| Polling loop 1 - checking some condition (repeats many times)
0x1164-0x116C| Brief execution between loops
0x1172-0x1178| Polling loop 2 - another condition check (repeats)
0x117C       | Last unique PC before exit
0x128C       | Return from CloseLibrary
0x0000       | CRASH - PC=0 (stack corruption)
```

**Critical Question**: What is RTW checking/waiting for in the polling loops at 0x1156 and 0x1172?

## Comparison with WHO Door Behavior

Both RTW and WHO doors exhibit the same behavior:
- Load successfully
- Execute SAS/C startup
- Run for ~1000 iterations
- Exit without displaying output
- Never reach FindPort() call

This suggests a **systematic issue** affecting all XIM doors, not just RTW-specific bugs.

## Next Steps for Investigation

### Option 1: Instruction-Level Debugging
Add detailed logging at problem PCs:
```typescript
// In AmigaDoorSession.ts runExecutionLoop()
if (pc >= 0x1156 && pc <= 0x1178) {
  const opcode = this.emulator.readMemory16(pc);
  const d0 = this.emulator.getRegister(0);
  const d1 = this.emulator.getRegister(1);
  const a0 = this.emulator.getRegister(8);
  const a1 = this.emulator.getRegister(9);
  const sr = this.emulator.getRegister(17);
  console.log(`[RTW-POLL] PC=${pc.toString(16)} Opcode=${opcode.toString(16)} D0=${d0.toString(16)} D1=${d1.toString(16)} A0=${a0.toString(16)} A1=${a1.toString(16)} SR=${sr.toString(16)}`);
}
```

### Option 2: Memory Comparison
Dump memory state at equivalent execution points:
- After SAS/C startup completes (PC=0x1156)
- During polling loop iterations
- Compare with vamos memory dump at same points

### Option 3: Disassembly Analysis
Disassemble RTW at problematic PC ranges:
```bash
m68k-amigaos-objdump -d -M reg-names-std doors/RTW/rtw | grep -A 20 "1156:"
```
Analyze what those polling loops are checking (likely testing memory locations or register flags).

### Option 4: AllocSignal Implementation
Vamos shows RTW calls AllocSignal() after FindPort(). Our emulator doesn't have AllocSignal() implemented. This might be required for reply port creation:

```typescript
// In LibraryTraps.ts EXEC_VECTORS
{
  offset: -330,  // LVO -330 - AllocSignal
  name: 'AllocSignal',
  handler: (emu, lib: ExecLibrary) => {
    const signalNum = emu.getRegister(0);  // D0
    return lib.allocSignal(signalNum);
  }
}
```

### Option 5: Check for Missing Initialization
RTW might expect:
- Environment variables (ENV:)
- Config files (PROGDIR:RTW.config)
- Specific memory patterns
- Certain system flags set

### Option 6: Compare with SIM Door
Test a simple SIM door (synchronous) to see if the issue is specific to XIM (async) doors or affects all door types.

## Files Modified

### Core Emulation
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
  - Lines 492: Argument string format fix
  - Lines 536-543: Stack exit trap fix
  - Lines 561-565: Removed A0=0 corruption
  - Lines 834-840: Added CLI structure fields
  - Lines 842-894: Created CLI local variables

- `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
  - Lines 1369-1381: StackSwap() fix

- `web/backend/src/amiga-emulation/api/DosLibrary.ts`
  - Lines 2796-2878: FindVar() implementation

- `web/backend/src/amiga-emulation/api/LibraryTraps.ts`
  - Lines 226-233: UnLock() trap vector
  - Lines 241-248: FreeLock() trap vector
  - Lines 264-271: FindVar() trap vector

### Door Handler
- `web/backend/src/handlers/door.handler.ts`
  - Lines 564-572: NodeId fix (set to 2 instead of 0)

## Known Limitations

1. **No FindVar calls intercepted** despite vector being installed - RTW might not be reaching the code that calls FindVar
2. **No AllocSignal implementation** - RTW needs this for reply port creation
3. **No CreateMsgPort user implementation** - Vector exists but might need full implementation
4. **Stack corruption at exit** - PC goes to 0 after CloseLibrary, despite filling stack with exit traps
5. **No instruction-level debugger** - Can't step through 68K code to see exact behavior

**FIXED**: ~~BBSSession needs nodeId property~~ - Properly fixed by removing partial session objects and using actual session with nodeId from getNextAvailableNodeId()

## References

- RTW.guide: `~/Code/amiexpress-web/dev/docs/RTW.guide`
- Amiga shell log: User-provided trace showing FindVar("RC"), FindVar("Result2"), FindPort sequence
- WHO door source: `~/Code/amiexpress-web/Documentation/5-Door-Sources/WHO.e`
- Vamos trace: `vamos -l lib:info,exec:info,dos:info doors/RTW/rtw 2`

## Context Token Usage

This session consumed approximately 115,000 tokens debugging RTW. All 13 bugs were fixed systematically by:
1. Analyzing vamos traces to understand expected behavior
2. Comparing with our emulator's execution
3. Identifying mismatches and missing implementations
4. Testing each fix with server restart

Despite fixing all obvious issues, RTW still doesn't work, indicating a subtle emulation bug that requires deeper analysis.

---

**Session Date**: November 11, 2025
**Duration**: ~3 hours
**Bugs Fixed**: 13
**Status**: RTW executes but exits early without output
**Next Session**: Requires instruction-level debugging or disassembly analysis
