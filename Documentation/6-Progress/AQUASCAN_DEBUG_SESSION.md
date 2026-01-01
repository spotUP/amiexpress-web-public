# AquaScan Debug Session - 2025-12-30

## Session 2026-01-01 (cont)
- **Hypothesis**: Reply handlers are overwriting msg.strptr/fillers; AquaScan expects them untouched (strptr only for JH_SMPTR), so the EXPRESS_VERSION reply corrupts state and the door restarts.
- **Tools**: `npm run xim:analyze -- --door N --verbose`, `npm run xim:view -- --door N --last 200`, `Documentation/4-Door-Developers/Aquascan N.log`, `AmiExpress-Sources/express.e`.
- **Observations**: Real Amiga log shows follow-up requests after EXPRESS_VERSION: BB_MAINLINE (131), DT_LINELENGTH (113), DT_TIMELASTON (122), DT_NAME (100), JH_WRITE (4), etc. Current XIM logs stop at EXPRESS_VERSION with repeated JH_REGISTER. express.e processXimMsg uses msg.strptr only for JH_SMPTR (line ~3412).
- **Action**: Removed writeStringPointer in INTERPRET_MCI and SIG_LI; stopped auto-setting strptr during line input completion so we do not overwrite door-provided values.
- **Result**: Pending (requires backend restart and rerun `N S U`).
- **Next**: Restart backend, rerun `N S U`, then re-run `xim:view`/`xim:analyze` to confirm DT_LINELENGTH/DT_TIMELASTON/DT_NAME/JH_WRITE appear and no slide/PC jump occurs.

## Session 2026-01-01
- **Hypothesis**: Backend poller is consuming its own ReplyMsg when mn_ReplyPort=AEDoorPort, causing repeated EXPRESS_VERSION and preventing follow-up DT_* / JH_SM output.
- **Tools**: `npm run xim:analyze -- --door N --verbose`, `npm run xim:flow -- --door N`, `npm run xim:view -- --door N --last 200`.
- **Observations**: XIM viewer shows incoming EXPRESS_VERSION with string "v5.3" immediately after reply; flow repeats init sequence; no DT_TIMELASTON/DT_LINELENGTH/DT_NAME/JH_SM. Analyzer reports incomplete session; last message EXPRESS_VERSION_REPLY.
- **Action**: Added reply tracking in `web/backend/src/amiga-emulation/api/ExecLibrary.ts` (mark in ReplyMsg; clear when GetMsg returns).
- **Result**: Pending (requires backend restart and rerun `N S U`).
- **Next**: Restart backend, rerun `N S U`, re-run XIM analyze/view to confirm progression beyond EXPRESS_VERSION.

## CRITICAL DEBUGGING LESSON - READ FIRST

**ALWAYS CHECK MEMORY OPERATIONS FIRST when debugging 68K emulation issues.**

When something goes wrong (door stops, crashes, wrong behavior), the root cause is almost always:
1. **Memory reads from wrong address** - reading garbage data
2. **Memory writes to wrong address** - corrupting stack, return addresses, or code
3. **Incorrect structure offsets** - reading/writing fields at wrong positions
4. **Buffer overflows** - writing past allocated memory into adjacent structures

**Symptoms of memory corruption:**
- PC (program counter) jumps to garbage addresses (e.g., 0x1e9bdf when code is 0x1000-0x9000)
- Door enters infinite polling loop instead of continuing normally
- Registers contain unexpected values after function calls
- RTS returns to wrong address

**FIRST STEPS when debugging:**
1. Look for PC values outside the door's code range (door size from segment header)
2. Check SP (A7) for corruption - should stay within stack bounds
3. Trace memory reads/writes around the failing operation
4. Verify structure offsets against NDK documentation
5. Check if string operations overflow buffers (MESSAGE_STRING_CAPACITY=200)

**This session wasted 24+ hours debugging Signal/Wait/XIM protocol when the actual issue was PC corruption after ENVSTAT - a memory issue that should have been identified in the first trace.**

---

## Problem Statement
AquaScan door sends 3 XIM commands (JH_REGISTER, DT_SLOTNUMBER, ENVSTAT) then stops.
It should continue to send BB_NONSTOPTEXT (command 525) but instead enters infinite polling loop.

## Root Cause (FOUND)
After ENVSTAT reply, door's PC gets corrupted to garbage addresses (~0x1e0000-0x1f0000) when door code is only 0x1000-0x918C. This is memory corruption, likely from:
- String handling in ENVSTAT reply (ENVSTAT has string="8", others have empty strings)
- Stack corruption during Signal/Wait resume
- Incorrect memory write in message reply

## Current State
- Door receives all 3 replies correctly on port 0xa0300:
  - JH_REGISTER reply: Command=22 (line length)
  - DT_SLOTNUMBER reply: Command=104
  - ENVSTAT reply: Command=163
- After ENVSTAT reply, door should continue to address 0x1446 (call BB_NONSTOPTEXT at 0x1f6c)
- Instead, door enters polling loop on AEDoorPort1 (0xa0200)

## Key Code Locations (AquaScan.020)
- Entry point: 0x1008
- ENVSTAT call: 0x143c -> calls 0x1e4a
- After ENVSTAT return: 0x1440 (load struct), 0x1444 (moveq 1,d0), 0x1446 (call BB_NONSTOPTEXT at 0x1f6c)
- SendCmd function: 0x1aa8-0x1b3c
- Polling loop (where stuck): 0x2ad0

## Fixes Already Completed
1. [DONE] Fixed message offsets in AEDoorLibrary.ts - Command at 0xE0, Data at 0xDC, String at 0x14
2. [DONE] Removed unsolicited startup messages - XIM doors expect replies only
3. [DONE] Restored duplicate reply on AEDoorPort for doors that poll there
4. [DONE] Store ExecBase pointer at library+0x22 for native AEDoor code

## Debug Attempts

### Attempt 1: Check disassembly after ENVSTAT
- **Action**: Disassembled 0x143c-0x14a6 to see code after ENVSTAT call
- **Result**: Code shows NO conditional branch between ENVSTAT return (0x1440) and BB_NONSTOPTEXT call (0x1446)
- **Conclusion**: Door should fall straight through to BB_NONSTOPTEXT - issue is elsewhere

### Attempt 2: Check ENVSTAT function (0x1e4a)
- **Action**: Disassembled 0x1e4a-0x1e78
- **Result**: Function is simple - saves regs, sets command/data, calls SendCmd, returns via RTS
- **Conclusion**: No branching in ENVSTAT function itself

### Attempt 3: Check SendCmd function (0x1aa8)
- **Action**: Disassembled 0x1aa8-0x1b3c
- **Result**: SendCmd does:
  - FindPort (-0x84)
  - PutMsg (-0x16e)
  - Wait (-0x13e)
  - GetMsg (-0x174)
  - Checks Data == -1 for error
  - Returns d7 (Data field)
- **Conclusion**: SendCmd should return normally if Data != -1

### Attempt 4: Run trace to see actual XIM commands
- **Action**: `DOOR_TRACE_FIRST_PC_COUNT=500 timeout 15 npx tsx test-aquascan.ts`
- **Result**:
  - JH_REGISTER sent, reply received Command=22
  - DT_SLOTNUMBER sent, reply received Command=104
  - ENVSTAT sent with data=0 string="8" (WRITE operation), reply received Command=163
- **Conclusion**: All 3 commands complete successfully

### Attempt 5: Check door state after ENVSTAT
- **Action**: Trace GetMsg/PutMsg traps and Wait calls
- **Result**: After ENVSTAT reply (Command=163), output just stops showing door traps
- **Finding**: Door enters polling loop on AEDoorPort1 with "No door messages in port (3 replies waiting for door)"
- **Conclusion**: Door is polling AEDoorPort1 but skipReplies filters out the replied messages

## Current Hypothesis
The door successfully receives ENVSTAT reply but then:
1. Something causes it to jump to polling loop (0x2ad0) instead of continuing to 0x1446
2. OR the door IS continuing but hitting some blocking code before BB_NONSTOPTEXT

## Next Steps to Try
1. [ ] Add PC logging INSIDE the emulator to see exact instruction flow after ENVSTAT GetMsg
2. [ ] Check if door's Wait() is returning wrong signal bits
3. [ ] Check if ENVSTAT reply Data field is set correctly (should be 1, not -1)
4. [ ] Verify door stack is intact after SendCmd returns

### Attempt 6: Check ENVSTAT reply Data field value
- **Action**: Traced reply() method in system-commands.ts
- **Finding**: reply() writes Data=1 via `messageParser.writeData(msg.msgAddr, data)` then calls `execLibrary.replyMsg()`
- **Location**: system-commands.ts:623-654
- **Conclusion**: ENVSTAT reply should have Data=1, not -1. Need to verify door actually reads this value.

### Attempt 7: Verified Signal()/Wait() timing
- **Action**: Traced Signal() and Wait() implementation
- **Finding**: Signal() sets D0=0x10000 BEFORE calling resume() (line 5050 in ExecLibrary.ts)
- **Sequence verified**:
  1. Wait() returns 0, pauses emulator
  2. LibraryTraps sets D0=0 (line 1203)
  3. Signal() sets D0=0x10000, calls resume()
  4. Emulator resumes with D0=0x10000
- **Conclusion**: Signal/Wait timing is CORRECT - D0 should be 0x10000 when door resumes

### Attempt 8: Fresh trace after ENVSTAT
- **Action**: `DOOR_TRACE_FIRST_PC_COUNT=3000 timeout 18 npx tsx test-aquascan.ts`
- **Result**: All 3 XIM commands complete successfully with proper Signal() and resume:
  - JH_REGISTER: Signal(0x10000), D0=0x10000, resume
  - DT_SLOTNUMBER: Signal(0x10000), D0=0x10000, resume
  - ENVSTAT: Signal(0x10000), D0=0x10000, resume
- **After ENVSTAT**: Door enters polling loop on AEDoorPort1 (0xa0200)
  - `GetMsg(port=0xa0200)` - "No door messages in port (3 replies waiting for door)"
  - Repeated polling in tight loop
- **Key Finding**: Door IS continuing execution but goes to polling loop, NOT BB_NONSTOPTEXT

## Current Understanding (Updated)
After ENVSTAT completes, the door doesn't call BB_NONSTOPTEXT. Instead it enters a polling loop on AEDoorPort1. This suggests:
1. The door's execution path after ENVSTAT is NOT what we expected from disassembly
2. OR BB_NONSTOPTEXT itself contains the polling loop
3. OR there's a conditional branch we missed

## Next Steps
1. [ ] Trace PC values to see exact instruction flow after ENVSTAT GetMsg returns
2. [ ] Disassemble BB_NONSTOPTEXT (0x1f6c) to see if it contains polling loop
3. [ ] Check what code is at 0x2ad0 (polling loop address)
4. [ ] Verify ENVSTAT reply Data value the door reads (should be 1, not -1)

## Questions (Updated)
- Is BB_NONSTOPTEXT (0x1f6c) even being called?
- What code is at 0x2ad0 (the polling loop)?
- Does the door's initialization code jump directly to polling after ENVSTAT?
- Is there a conditional check on ENVSTAT return value that branches to polling?

---

### Attempt 9: Investigate signal bit allocation (2025-12-30 new session)
- **Action**: Traced port creation and signal allocation
- **Finding**: Signal bit allocation bug found!
  - Port 0xa0000: sigBit=16
  - Port 0xa0100: sigBit=17
  - Port 0xa0200 (AEDoorPort1): sigBit=18
  - Port 0xa0300 (door reply): sigBit=16 **<- BUG! Should be 19**
- **Root Cause**: `resetSignalsForDoor()` in DoorLoader.ts:48 resets `allocatedSignals=0` AFTER AEDoorPort1 is created (signal 18) but BEFORE door's reply port is created
- **Sequence**:
  1. AEDoor.library opens, creates AEDoorPort1 at 0xa0200 with sigBit=18
  2. DoorLoader.loadDoor() calls resetSignalsForDoor() - signals reset to 0
  3. Door runs, calls CreateMsgPort for reply port
  4. AllocSignal returns 16 (first available after reset) instead of 19
- **Conclusion**: Signal allocation is wrong, but this may NOT be the root cause - see Attempt 10

### Attempt 10: Verify Wait/Signal still works despite signal mismatch
- **Action**: Traced Wait/Signal sequence
- **Result**: Signals DO work correctly despite the allocation issue:
  - Door waits for 0x11000 (includes bit 16 = 0x10000)
  - BBS signals 0x10000 (bit 16 from port.sigBit=16)
  - D0 is set to 0x10000, GetMsg is called
- **Conclusion**: Signal matching works - door receives all 3 replies successfully

### Attempt 11: Check if BB_NONSTOPTEXT is ever sent
- **Action**: Searched logs for command 525 (BB_NONSTOPTEXT)
- **Result**: Only 3 commands are sent: 1 (JH_REGISTER), 104 (DT_SLOTNUMBER), 163 (ENVSTAT)
- **Finding**: BB_NONSTOPTEXT (525) is NEVER sent
- **Conclusion**: Door execution path diverges BEFORE calling BB_NONSTOPTEXT

### Attempt 12: Trace what happens immediately after ENVSTAT reply
- **Action**: Grep for GetMsg calls after ENVSTAT
- **Result**: After ENVSTAT reply is received on 0xa0300, door immediately starts polling 0xa0200:
  ```
  GetMsg(port=0xa0300) - receives ENVSTAT reply
  GetMsg(port=0xa0200) - polling loop starts
  GetMsg(port=0xa0200) - repeated infinitely
  ```
- **Key Finding**: Door never calls Wait() again after ENVSTAT - it goes straight to GetMsg polling on 0xa0200

## Updated Understanding (Session 2)
The signal allocation bug exists but is NOT the root cause. The door:
1. Successfully receives all 3 XIM replies
2. After ENVSTAT GetMsg returns, does NOT continue to BB_NONSTOPTEXT
3. Instead jumps directly to a polling loop on AEDoorPort1 (0xa0200)

The code path after ENVSTAT must be checking something and branching to the polling loop.

### Attempt 13: Check ENVSTAT reply Data value
- **Action**: Traced reply Data field in logs
- **Result**: ENVSTAT reply has Data=1 (at 0xDC) - correct, NOT -1
- **Conclusion**: Reply data is correct, not causing the branch

### Attempt 14: Disassemble SendCmd signal checking code (0x1b00-0x1b3c)
- **Action**: `r2 -q -c "s 0x1b00; pd 40" AquaScan.020`
- **Key Finding**: Door HARDCODES signal masks!
  ```asm
  0x1b6a: move.l d0, 0x10(a5)     ; [a5+0x10] = reply port signal (calculated)
  0x1b6e: move.l 0x1000, 0x14(a5) ; [a5+0x14] = 0x1000 (bit 12 - HARDCODED!)
  ```
- **Problem**: Door expects AEDoorPort at bit 12 (0x1000), but our AEDoorPort1 has sigBit=18 (0x40000)
- **Wait mask**: Door waits for 0x11000 = 0x10000 (reply, bit 16) | 0x1000 (AEDoorPort, bit 12)
- **Mismatch**: Our AEDoorPort uses bit 18, not bit 12!

### Attempt 15: Analyze SendCmd flow after GetMsg
- **Code at 0x1b14-0x1b1a**:
  ```asm
  0x1b14: move.l d4, d0           ; d0 = saved Wait result
  0x1b16: and.l 0x14(a5), d0      ; d0 = d0 AND 0x1000 (AEDoorPort signal)
  0x1b1a: beq.b 0x1b26            ; If zero, skip to 0x1b26
  ```
- **Analysis**: After GetMsg, door checks if AEDoorPort signal was received
- **Problem**: Door checks for bit 12 (0x1000), but Wait returned 0x10000 (bit 16)
- **Result**: AND(0x10000, 0x1000) = 0, so door branches differently

## ROOT CAUSE IDENTIFIED
The door hardcodes AEDoorPort signal as bit 12 (0x1000), but our AEDoorPort1 uses sigBit=18 (0x40000).

When the door's SendCmd function checks for signals:
1. Wait(0x11000) - waits for bit 16 OR bit 12
2. BBS signals bit 16 (reply port) - Wait returns 0x10000
3. Door checks for AEDoorPort signal: AND(0x10000, 0x1000) = 0
4. This causes different code path execution after ENVSTAT

## FIX REQUIRED
AEDoorPort1 must use sigBit=12 (not 18) to match what doors expect.

---

### Attempt 16: Fix AEDoorPort to use sigBit=12
- **Action**: Modified ExecLibrary.ts:
  - Added `forceSigBit` parameter to `createMsgPort()`, `createPublicPort()`, `ensurePublicPort()`
  - Created `createAEDoorPort()` method that uses sigBit=12
  - Updated LibraryManager.ts to use `createAEDoorPort()` for AEDoorPort creation
- **Result**: Door now skipped JH_REGISTER and went straight to BB_NONSTOPTEXT (525)!
- **New Problem**: Door took wrong code path - skipped registration entirely
- **Root Cause Found**: AEDoorPort was owned by Door Task (0x90000)
  - When door calls PutMsg(AEDoorPort), it signals AEDoorPort's sigTask
  - sigTask was Door Task -> door signals ITSELF with bit 12 (0x1000)
  - Door's Wait(0x11000) returns immediately with 0x1000 (AEDoorPort signal)
  - Door thinks AEDoorPort has message, takes wrong code path

### Attempt 17: Fix AEDoorPort ownership to BBS Task
- **Action**: Modified `createAEDoorPort()` to set BBS Task (0x88000) as owner instead of Door Task
- **Code**:
  ```typescript
  createAEDoorPort(name: string): number {
    const AEDOORPORT_SIGBIT = 12;
    // CRITICAL: Use BBS task as owner, NOT the door task
    const portAddr = this.createPublicPort(name, this.bbsTask, AEDOORPORT_SIGBIT);
    return portAddr;
  }
  ```
- **Result**: Still broken! Door's Wait() still returns 0x1000
- **Trace showed**:
  ```
  Signal(task=0x88000, signals=0x1000)  <- Targeting BBS task
  Task not waiting (will receive signal when it calls Wait())
  ...later...
  sigRecvd: 0x0 -> 0x1000  <- But door task's sigRecvd is being set!
  Wait(signalMask=0x11000)
  Wait: checking sigRecvd=0x1000 & mask=0x11000
  returned 0x1000  <- Immediate return with AEDoorPort signal
  ```
- **Root Cause**: Signal() was ignoring taskAddr parameter and always signaling currentTask (the door)!

### Attempt 18: Fix Signal() to respect taskAddr (CURRENT FIX)
- **Action**: Modified Signal() in ExecLibrary.ts
- **Problem**: Signal() had code that said "In single-task emulation, always signal currentTask"
  - This was WRONG for AEDoorPort which has BBS task as sigTask
  - When door called PutMsg(AEDoorPort), PutMsg called Signal(0x88000, 0x1000)
  - Signal() ignored 0x88000 and set door's sigRecvd to 0x1000
- **Fix**: Return early if taskAddr != currentTask.address (and taskAddr != 0)
  ```typescript
  if (taskAddr !== 0 && taskAddr !== this.currentTask.address) {
    console.log(`Signal to non-door task - skipping door signal`);
    return; // Don't signal the door when target is BBS task
  }
  ```
- **Rationale**: BBS task is JavaScript code - doorMessageCallback handles it, not Exec Signal()
- **Status**: Testing required

## Current State (Session 3)
- AEDoorPort uses sigBit=12 (matches door's hardcoded 0x1000)
- AEDoorPort owned by BBS Task (0x88000) to prevent self-signaling
- Signal() now respects taskAddr - won't signal door when target is BBS task
- Need to test if door now proceeds correctly through JH_REGISTER -> DT_SLOTNUMBER -> ENVSTAT -> BB_NONSTOPTEXT

---

### Attempt 19: Test Signal() fix
- **Action**: Ran test with Signal() fix
- **Result**:
  - Signal to BBS task correctly skipped: `Signal to non-door task 0x88000 (BBS task) - skipping door signal`
  - Wait() returns 0x10000 (reply port signal) correctly each time
  - JH_REGISTER, DT_SLOTNUMBER, ENVSTAT all sent and replied successfully
- **Problem**: Door STILL enters polling loop after ENVSTAT!
  - `No door messages in port (3 replies waiting for door)` - polling AEDoorPort1 (0xa0200)
  - BB_NONSTOPTEXT (525) is NEVER sent
- **Analysis**: The Signal/Wait fix is working correctly - door wakes with 0x10000 (not 0x1000)
  - Door checks: `AND(D0=0x10000, [a5+0x14]=0x1000) = 0` -> takes "no AEDoorPort signal" branch
  - This is CORRECT behavior - door should then get reply from port 0xa0300 and continue
  - But door still enters polling loop instead of BB_NONSTOPTEXT

### Attempt 20: Investigate why door enters polling after ENVSTAT
- **Current Hypothesis**: Something after ENVSTAT return causes door to jump to polling loop
- **Possibilities**:
  1. BB_NONSTOPTEXT itself starts with polling loop (unlikely - SendCmd pattern)
  2. ENVSTAT reply data causes branch to polling
  3. Door's main loop logic after registration jumps to polling
  4. Missing BBS response causes fallback to polling mode

## Updated Understanding (Session 3 continued)
The Signal() fix is working - door receives correct signals:
- Reply port signal (0x10000) wakes door from Wait()
- AEDoorPort signal (0x1000) is NOT sent to door (correctly skipped)

But door still enters polling after ENVSTAT. The issue is NOT in Signal/Wait anymore.
The door's code path after ENVSTAT GetMsg returns must be branching to polling loop.

## Next Steps
1. [x] Fix AEDoorPort sigBit to 12
2. [x] Fix AEDoorPort ownership to BBS Task
3. [x] Fix Signal() to not signal door when target is BBS task
4. [x] Verify Signal fix works - Wait returns 0x10000
5. [ ] Trace PC after ENVSTAT GetMsg returns to find branching point
6. [ ] Check if ENVSTAT reply Data value causes branch
7. [ ] Disassemble code between ENVSTAT return (0x1440) and polling loop (0x2ad0)

---

## REFERENCE: Real Amiga XIM Command Sequence (from Aquascan N.log)

This is the ACTUAL sequence AquaScan sends on a real Amiga running AmiExpress:

```
1. msg request: 1   (JH_REGISTER)      data=0 string=""
2. msg request: 104 (DT_SLOTNUMBER)    data=1 string=""
3. msg request: 163 (ENVSTAT)          data=0 string="8"   <- WRITE env=8 (ENV_FILES)
4. msg request: 525 (BB_NONSTOPTEXT)   data=1 string=""    <- OUR DOOR STOPS HERE
5. msg request: 501                    data=1 string=""
6. msg request: 131                    data=1 string=""
7. msg request: 152                    data=1 string="N S U"  <- Args
8. msg request: 131                    data=1 string="v5.3"
9. msg request: 113                    data=1 string="N S U"
10. msg request: 122                   data=1 string="1767037752"
11. msg request: 100                   data=1 string="29"   <- Day
12. msg request: 4                     data=1 string=""     <- Output
13. (header output)
14. msg request: 105                   data=1 string=""
15. msg request: 127                   data=1 string="255"
16. msg request: 150                   data=1 string="Directory Scan..."
17. msg request: 4                     data=0 string="Scanning dir X..."
... (scan output) ...
18. msg request: 525 (BB_NONSTOPTEXT)  data=0 string=""     <- Disable nonstop
19. msg request: 2                     data=0 string=""     <- Exit
```

**KEY OBSERVATION**: Door sends 525 (BB_NONSTOPTEXT) IMMEDIATELY after 163 (ENVSTAT).
Our emulated door stops after 163 and enters polling loop instead of sending 525.

**ENVSTAT Details**:
- data=0 means WRITE mode (door is setting status)
- string="8" means ENV_FILES (file operations mode)
- Our handleEnvStat() replies with Data=1 (success)

---

### Attempt 21: Investigate FindPort at PC=0x2ad0 (2025-12-30)
- **Observation**: After Wait returns, door calls FindPort from PC=0x2ad0
- **But**: 0x2ad0 is NOT in SendCmd (0x1aa8-0x1b3c)
- **This means**: Door execution is jumping out of SendCmd somehow
- **Log sequence**:
  ```
  [ExecLibrary] Wait(signalMask=0x11000)
  [ExecLibrary][FindPort] pc=0x2ad0 "AEDoorPort1"
  [ExecLibrary] >>> GetMsg(port=0xa0200)
  ```
- **Expected**: After Wait, door should continue at 0x1aec (after JSR Wait)
  - 0x1aec: save D0
  - 0x1af0: check reply signal
  - 0x1af6: GetMsg on reply port 0xa0300
- **Actual**: Door calls FindPort at 0x2ad0, then GetMsg on AEDoorPort 0xa0200
- **Hypothesis**: Something is wrong with how we resume from Wait, causing wrong PC

### Attempt 22: Found PC Corruption After ENVSTAT
- **Critical Finding**: After ENVSTAT GetMsg, door executes from GARBAGE PC values!
  ```
  GetMsg returning msg=0x100174 queueLen=0
    Command=163 (at 0xE0)    <- ENVSTAT reply
  [FindPort] pc=0x1e9bdf     <- GARBAGE! Door is only 33KB (0x1000-0x918C)
  [FindPort] pc=0x1f381f     <- More garbage
  [FindPort] pc=0x1fd45f     <- Pattern: each +0x9c40 (40000 decimal)
  ```
- **Door size**: 33164 bytes (0x1000 to ~0x918C)
- **Invalid PCs**: 0x1e9bdf = 2MB into memory - WAY outside valid code
- **Pattern**: PCs increment by 40000 each - not random, possibly memory scan
- **Before ENVSTAT**: FindPort pc=0x7fe7a (trampoline) - CORRECT
- **After ENVSTAT**: Garbage PCs - CORRUPTED

**Root Cause**: Stack or return address corruption during ENVSTAT handling!

**Key difference**:
- JH_REGISTER: data=0, string="" (empty)
- DT_SLOTNUMBER: data=1, string="" (empty)
- ENVSTAT: data=0, string="8" (non-empty!)

**Hypothesis**: String handling in ENVSTAT is corrupting the stack

### Attempt 23: Verify Memory at 0x2ae2 (2025-12-30)
- **Action**: Dumped emulator memory at 0x2ae2 (GetMsg return address)
- **Memory dump**:
  ```
  0x2ae2: 0x4a80  (TST.L D0)
  0x2ae4: 0x6712  (BEQ.B +18)
  0x2ae6: 0x206d  (MOVEA.L ...)
  0x2ae8: 0x000c
  0x2aea: 0x70ff  (MOVEQ #-1,D0)
  ```
- **Verified**: Memory at 0x2ae2 is CORRECT! Code is 0x4a80 (TST.L D0)
- **LibraryTraps log confirms**: "Instruction at return address: 0x4a80"
- **Conclusion**: Code is loaded correctly, corruption happens DURING execution

### Attempt 24: Trace Between ENVSTAT Return and Garbage PC (2025-12-30)
- **Action**: Full trace with DEBUG_LIBRARY_TRAPS=1
- **Last correct logs**:
  ```
  Command=163 (at 0xE0)
  Data=1 (at 0xDC)
  String="8" (at 0x14)
  [LibraryTraps] A6 restored: 0x80000 -> 0x80000 (GetMsg library base)
  [LibraryTraps] GetMsg() returned 0x100174
  [LibraryTraps] Set SR to: 0x0000 (Z=0 N=0)
  [LibraryTraps] Verified SR: 0x0000 (Z=0)
  [LibraryTraps] Setting PC to return address 0x2ae2
  [LibraryTraps] Verified PC is now: 0x2ae2
  [LibraryTraps] Instruction at return address: 0x4a80
  [LibraryTraps] Returning to 0x2ae2
  [LibraryTraps] Final SP: 0xb0fc, Final A6: 0x80000
  ```
- **Immediately after**:
  ```
  [ExecLibrary][FindPort] pc=0x1e9bdf "AEDoorPort1"
  ```
- **Critical**: NO intermediate logs between 0x2ae2 and 0x1e9bdf!
- **Conclusion**: Corruption happens during batch execution in executeUntilTrap()

### Attempt 25: Pattern Analysis of Garbage PCs (2025-12-30)
- **Garbage PC sequence**:
  - 0x1e9bdf
  - 0x1f381f (+ ~0x9c40)
  - 0x1fd45f (+ ~0x9c40)
  - 0x1e80b3
  - 0x1f1cf3
  - 0x1fb933
  - ...
- **Pattern**: PCs increment by ~40000 (0x9c40) then wrap around
- **This is NOT random** - suggests systematic memory scanning
- **Hypothesis**: The garbage PC is being CALCULATED, not jumped to
- **Possible cause**:
  1. executeUntilTrap() batch counter overflow affecting PC
  2. refillPrefetch() corrupting PC
  3. Some memory operation writing to PC register location

## Current Status (Session 4 - 2025-12-30)
- Memory is loaded correctly
- LibraryTraps sets PC=0x2ae2 correctly after ENVSTAT GetMsg
- PC is verified at 0x2ae2 with correct instruction 0x4a80 (TST.L D0)
- THEN PC becomes garbage (0x1e9bdf) with no intermediate steps logged
- Corruption happens INSIDE the WASM emulator during executeUntilTrap()

## SOLUTION FOUND - 2025-12-30 17:41

### Root Cause: MOIRA CPU Model Not Initialized for 68020

The PC "corruption" was actually **MOIRA executing an Illegal Instruction exception handler!**

**Discovery path:**
1. PC=0x180080 = Exception handler base (0x180000) + 0x80 = **Exception #4 (Illegal Instruction)**
2. Looking at radare2 disassembly, at file offset 0x2f8e there's opcode `0x49C0`
3. Opcode 0x49C0 = **EXTB.L D0** - a 68020+ instruction (extend byte to long)
4. AquaScan.020 is compiled for 68020 (the .020 extension indicates this)
5. MOIRA was configured for M68000 mode, treating EXTB.L as illegal!

**The bug in moira-wrapper.cpp:**
```cpp
// OLD (broken):
cpuModel = Model::M68020;  // Just sets a variable, doesn't update jump table!

// NEW (fixed):
setModel(Model::M68020);   // Properly creates jump table for 68020 instructions
```

**Why the bug existed:**
- `cpuModel` is a field in Moira base class that defaults to M68000
- Simply setting `cpuModel = M68020` only changes the variable
- The instruction handler jump table is built by `createJumpTable()` which is called by `setModel()`
- Without calling `setModel()`, the jump table remained for M68000, treating 68020 instructions as illegal

**Fix applied:**
- Modified `/web/backend/src/amiga-emulation/cpu/moira-wrapper.cpp` line 443
- Changed `cpuModel = Model::M68020;` to `setModel(Model::M68020);`
- Rebuilt WASM: `./build-wasm.sh`

**Instructions now supported that weren't before:**
- EXTB.L Dn (0x49C0-0x49C7) - extend byte to long
- Other 68020+ instructions: BFCHG, BFCLR, BFEXTS, BFEXTU, BFFFO, BFINS, BFSET, BFTST, etc.

### Lessons Learned
1. Exception handlers at 0x180000+ are a CLUE, not random corruption
2. Exception #4 = Illegal Instruction - check if door uses newer CPU instructions
3. File extension (.020, .030) indicates target CPU - match emulator config
4. `setModel()` vs direct field assignment - APIs exist for a reason!

## Status: FIXED
- WASM rebuilt at 2025-12-30 17:41
- Requires backend restart to use new WASM
- Door should now execute 68020 instructions correctly
