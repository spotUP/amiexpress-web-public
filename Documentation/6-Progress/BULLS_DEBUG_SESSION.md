# XIM Door Debugging Session

**Date:** 2025-12-10
**Session:** 31

## Door Status Summary

| Door | Status | Return Code | Iterations | Notes |
|------|--------|-------------|------------|-------|
| Bulls | WORKING | 0 | ~18863 | Outputs version info |
| What | WORKING | 0 | 885 | No console output (expected?) |
| RTW | FAILING | 20 | 754 | Error code, needs investigation |
| NTR-LASTCALLERS | FAILING | N/A | 114039 | PC jumps to invalid address |

---

# Bulls Investigation

## Summary

Bulls XIM door is now working correctly. It produces expected output and exits cleanly.

## Current Behavior (Working)

```
[dos.library] Write: Console output (63 bytes): " $VER: Bulls 2.2  [/X DOOR]  (07-01-94) - (c)1994: EMPiRE/MYSTiC\n"
[dos.library] Write: Console output (45 bytes): " Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx\n"
[DoorLifecycleManager] === DOOR EXITED CLEANLY ===
[DoorLifecycleManager] Return code (D0): 0
```

## What We Tried

### 1. Address Mapping Investigation
**Problem:** Initial debug probes at radare2 addresses weren't triggering.

**Discovery:** radare2 file addresses != runtime memory addresses.
- CODE segment starts at file offset 0x24
- CODE loads at memory address 0x1008
- **Formula:** `memory_addr = radare2_addr + 0xFE4`

**Example:**
- radare2 0x276 (RTS instruction) -> memory 0x125a
- radare2 0x1260 (CreateMsgPort call) -> memory 0x2244

### 2. Entry Point Tracing
**Problem:** Bulls seemed to exit without reaching expected code paths.

**Discovery:** Bulls DOES execute correctly:
1. Entry at 0x1008 (MOVEM.L to save registers)
2. BSS-clear loop at 0x102a-0x102c runs ~12768 iterations (clearing 0x18d8 longs)
3. After loop, continues to library initialization

### 3. AllocMem Investigation
**Problem:** Suspected AllocMem failure causing early exit.

**Discovery:** All AllocMem calls succeed:
```
AllocMem(12, 0x0) -> 0x100000
AllocMem(11, 0x0) -> 0x10000c
AllocMem(12, 0x0) -> 0x100018
...
AllocMem(34, 0x10001) -> 0x100050  (MEMF_PUBLIC | MEMF_CLEAR)
```

### 4. Library Trap Verification
**Problem:** Unclear if library traps were firing correctly.

**Discovery:** All traps working:
- AllocMem at 0x7ff3a (offset -198) - fires multiple times
- FindTask at 0x7fece (offset -306)
- OpenLibrary at 0x7fdd8 (offset -552)
- CloseLibrary at 0x7fe62 (offset -414)

## What Worked

1. **Previous session fixes are effective:**
   - Signal reset before door load (`resetSignalsForDoor()`)
   - Door type detection fix (`--doortype XIM`)
   - MessageHandler callback registration

2. **Library initialization sequence works:**
   - ExecBase correctly at 0x80000
   - Memory[0x4] points to ExecBase
   - All library calls trapped and handled

3. **Bulls produces expected output:**
   - Version string
   - Door description
   - Clean exit with code 0

## What Didn't Work (Initial Issues)

1. **Wrong address probes:** Using radare2 addresses directly instead of adding 0xFE4 offset
2. **Iteration count assumptions:** BSS loop runs much longer than expected (~12768 vs assumed few hundred)
3. **Missing directory context:** Commands failed when not run from web/backend directory

## Bulls Binary Analysis

| Property | Value |
|----------|-------|
| File size | 21828 bytes |
| CODE segment | 0x1008 (19228 bytes) |
| DATA segment | 0x5c08 (27876 bytes) |
| Entry point | 0x1008 |
| Exit point | 0x125a (RTS) |
| BSS clear loop | 0x102a-0x102c (12768 iterations) |
| First AllocMem | 0x107c (file 0x98) |

---

# Session 32: Bulls XIM Protocol Investigation

**Date:** 2025-12-10

## Problem

Bulls outputs version banner but does NOT run XIM protocol:
```
$VER: Bulls 2.2  [/X DOOR]  (07-01-94) - (c)1994: EMPiRE/MYSTiC
Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx
```

## Debugging Steps

### Step 1: Check if callback is being invoked
**Hypothesis:** doorMessageCallback not being called when door sends PutMsg
**Action:** grep for PutMsg in backend.log
**Result:** All PutMsg calls show `suppress=yes` - but these are from initialization code, NOT from the door!
```
[ExecLibrary][PutMsg] port=0xa0000 name=AEDoorPort1 msg=0x100146 suppress=yes
```
Stack trace shows these come from `DoorMessageHandler.sendInitAndStatusMessages`

### Step 2: Check if door calls FindPort
**Hypothesis:** Door should call FindPort("AEDoorPort") to find BBS port
**Action:** grep FindPort in backend.log
**Result:** NO FindPort calls from the door! Only port creation messages:
```
[ExecLibrary]   Public port "AEDoorPort1" created at 0xa0000
```

### Step 3: Check library calls during Bulls execution
**Hypothesis:** Bulls might be calling XIM-related functions
**Action:** grep for INTERCEPTED in backend.log
**Result:** Bulls calls: SetSignal, OpenLibrary, AllocMem, Output, Input, Open, Write, Close, FreeMem, CloseLibrary
**Missing:** NO FindPort, NO CreateMsgPort, NO PutMsg, NO GetMsg, NO WaitPort, NO OpenLibrary("AEDoor.library")

### Step 4: Compare with vamos execution
**Hypothesis:** Bulls might need specific environment
**Action:** `vamos doors/EmP_Tools/Bulls 0`
**Result:**
```
lib:WARNING:  ? CALL: (exec.library)  330 AllocSignal( signalNum[d0]=ffffffff ) from PC=004b12 -> d0=0 (default)
Couldn't create reply port
```
In vamos, Bulls DOES call AllocSignal(-1) and fails with "Couldn't create reply port"

### Step 5: Check AllocSignal in our emulator
**Hypothesis:** Our AllocSignal might be returning different value
**Action:** grep AllocSignal in backend.log
**Result:** AllocSignal(-1) calls exist but not timestamped with Bulls execution

## Key Finding

**Bulls is NOT calling AllocSignal in our emulator but IS calling it in vamos!**

This means Bulls is taking a different code path in our emulator - likely because:
1. Something in the environment check fails before AllocSignal
2. Bulls detects it's not in an XIM environment and shows help text instead

## Step 6: Detailed trace comparison
**Hypothesis:** Bulls takes different code path before AllocSignal
**Action:** Run Bulls standalone via test script, capture detailed trace
**Result:** Confirmed Bulls calls AllocMem(4116) which matches vamos pattern (4116 bytes)

But console output in our emulator:
```
$VER: Bulls 2.2  [/X DOOR]
Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx
```

Console output in vamos:
```
Couldn't create reply port
```

**Key difference**: In vamos Bulls outputs "Couldn't create reply port" after failed AllocSignal.
In our emulator, Bulls outputs version text and exits WITHOUT error message.

## Next Steps

1. Add trace at PC around 0x4b00-0x4b20 to see if AllocSignal is actually being called
2. Check if AllocSignal returns correct value (should return -1 for failure in vamos)
3. Compare string output to see which branch Bulls is taking

---

## Session 33: FileHandle BPTR Fix (2025-12-10)

### Root Cause Identified
**Bulls wasn't outputting any text because Write() was failing.**

The issue was that Input()/Output() returned simple integers (1 and 2) instead of proper BPTRs pointing to allocated FileHandle structures in emulated memory.

When Bulls read fields from what it thought was a FileHandle structure:
- BPTR 1 → address 4 (interrupt vector area)
- BPTR 2 → address 8 (interrupt vector area)
- Bulls read garbage from these addresses

### Fix Applied

1. **DosLibrary.ts**: Added `allocateFileHandleStruct()` method that:
   - Allocates 44 bytes for FileHandle structure in emulated memory
   - Writes proper structure fields (fh_Link, fh_Port, fh_Type, fh_End, fh_Args, etc.)
   - Returns proper BPTR (address >> 2)

2. **DosLibrary.ts**: Modified `enableNewFileSystem()` to:
   - Allocate FileHandle structures for stdin/stdout at 0x140000+
   - Set `stdinBptr = 0x50000` and `stdoutBptr = 0x5000b`
   - Call FileManager.setStdinBptr/setStdoutBptr

3. **FileManager.ts**: Modified `setStdinBptr()`/`setStdoutBptr()` to:
   - Re-register FileHandle objects under new BPTRs in handles map
   - Remove old BPTR (1, 2) from map, add new BPTR (0x50000, 0x5000b)

4. **FileManager.ts**: Fixed `open()` for console device:
   - Return `this.stdoutBptr` instead of hardcoded `2`

### Result
Bulls now outputs text correctly:
```
$VER: Bulls 2.2  [/X DOOR]  (07-01-94) - (c)1994: EMPiRE/MYSTiC
Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx
```

### Remaining Issue
Bulls still shows help text instead of entering XIM mode. Comparing to vamos:
- **vamos with arg**: Bulls calls AllocSignal(-1), fails with "Couldn't create reply port"
- **our emulator with arg**: Bulls outputs help text without calling AllocSignal
- **vamos without arg**: Bulls outputs help text (same as our emulator)

Bulls is NOT receiving/parsing the argument correctly. Need to investigate argument passing via A0/D0 at entry point.

---

## Way Forward

### For Bulls
Status: Console output WORKS, but XIM mode not entering.
Root cause: Bulls not recognizing command-line argument (node number).
Next steps:
1. Compare argument memory layout between vamos and our emulator
2. Check what Bulls reads at A0 and how it parses the node number
3. May need to fix argument string format or memory layout

### For Other Doors (RTW, etc.)
Apply same debugging methodology:
1. Verify address mapping (+0xFE4 offset may vary per binary)
2. Trace from entry point through BSS initialization
3. Check all library calls are trapped and returning correct values
4. Look for specific failure points in library call sequence

### Technical Notes for Future Debugging

**Address Calculation:**
```
memory_addr = file_addr - CODE_FILE_OFFSET + CODE_LOAD_ADDR
memory_addr = file_addr - 0x24 + 0x1008
memory_addr = file_addr + 0xFE4
```

**Key Memory Addresses:**
- ExecBase: 0x80000
- AllocMem trap: 0x7ff3a (0x80000 - 198)
- AllocSignal trap: 0x7feb6 (0x80000 - 330)
- FindTask trap: 0x7fece (0x80000 - 306)
- OpenLibrary trap: 0x7fdd8 (0x80000 - 552)

**Debug Probe Template:**
```typescript
if (pc >= START && pc <= END && this.executionState.iterationCount > MIN && this.executionState.iterationCount < MAX) {
  const a6 = this.emulator.getRegister(14);
  const d0 = this.emulator.getRegister(0);
  const instr = this.emulator.readMemory16(pc);
  console.log(`[DEBUG] PC=0x${pc.toString(16)} instr=0x${instr.toString(16)} D0=0x${d0.toString(16)} A6=0x${a6.toString(16)}`);
}
```

---

## Session 34: AmigaDOS Argument Newline Fix (2025-12-10)

### Root Cause Identified
**Bulls wasn't entering XIM mode because D0 (argument length) was 1 instead of 2.**

AmigaDOS requires command-line argument strings to be terminated with a newline character (0x0A), and the length in D0 must include this newline.

Comparing vamos output:
```
vamos doors/EmP_Tools/Bulls 1
# Shows: args: '1' (2)   <- length 2 includes the newline!
```

Our emulator was passing:
```
D0=0x1 A0=0xf0100   <- length 1, missing newline
```

### Fix Applied

**DoorLoader.ts**: Modified argument string construction to append newline:
```typescript
const argStringBase = customArgs.join(" ").trim();
// AmigaDOS requires argument string to be terminated with newline (0x0A), NOT null
// This is critical - many doors check the argument length and parse differently
// vamos shows: args: '1' (2) - the newline is INCLUDED in the length
const argString = argStringBase + "\n";
```

### Result - Bulls NOW ENTERS XIM MODE

Bulls execution after fix:
```
[CPU] PC=0x1008 D0=0x2 A0=0xf0100 SP=0xe904   <- D0=2 (correct!)
[INFO] Args: "1\n" len=2

[ExecLibrary] AllocSignal(-1) -> 0x11 (signal 17)
[ExecLibrary]   Public port "DoorReplyPort1" created at 0xa8000
[ExecLibrary][FindPort] Looking for: AEDoorPort1
[ExecLibrary][FindPort] Found: AEDoorPort1 at 0xa0000
[ExecLibrary][PutMsg] port=0xa0000 name=AEDoorPort1 msg=0x100358 suppress=no
[XIMMessageParser] Parsed jhMessage:
[XIM-MSG] <- JH_HK (Hotkey) (6)
[XIMProtocol] Handling command: JH_HK (Hotkey)
[XIMIOHandler] JH_HK: Hotkey input request
```

Bulls is now:
1. Receiving correct argument length (D0=2)
2. Calling AllocSignal(-1) -> returns signal 17
3. Creating DoorReplyPort1
4. Finding AEDoorPort1
5. Sending XIM messages via PutMsg
6. Polling with JH_HK (Hotkey) requests for user input

### Door Status Update

| Door | Status | Return Code | Notes |
|------|--------|-------------|-------|
| Bulls | WORKING (XIM MODE) | - | Full XIM protocol active, polling for input |
| What | WORKING | 0 | No console output (expected?) |
| RTW | FAILING | 20 | Error code, needs investigation |
| NTR-LASTCALLERS | FAILING | N/A | PC jumps to invalid address |

### Key Learning

**AmigaDOS Argument Format:**
- Arguments MUST end with newline (0x0A)
- D0 = length INCLUDING the newline
- A0 = pointer to argument string (with newline)
- Example: `"1\n"` has length 2, NOT 1
