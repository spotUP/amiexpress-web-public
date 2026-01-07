# JoinCnf Door Stuck Loop Investigation - 2026-01-07

## Summary

The joincnf door hangs after sending its initial 12 XIM messages. Investigation revealed two fixes and one remaining issue.

## Fixes Applied

### 1. Stuck Loop Detection (DoorLifecycleManager.ts)

**Problem**: Door loops infinitely in native AEDoor.library code (PC incrementing by +0x9c40 repeatedly in 0xc00000+ region) but was never detected as stuck.

**Root Cause**: The stuck loop detection only checked for invalid PC addresses (null, odd, <0x400), but 0xc00000+ is considered valid chip RAM. The jump size pattern detection was calculated but never actually used.

**Fix**: Added proper stuck loop detection based on repeated identical jump patterns:
- Track last 3 PC jump sizes
- If same jump size occurs 5+ times, terminate door
- Skip detection only for legitimate Wait() loops or XIM input waiting

**Files Modified**:
- `/web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`
  - Added `lastJumpSizes: number[]` and `sameJumpCount: number` to ExecutionState
  - Lines 786-812: Implemented jump pattern detection logic

**Test Result**: Stuck loop now correctly detected and door terminated with clear error message:
```
[DoorLifecycleManager] STUCK LOOP DETECTED: Same jump pattern 5 times
  Jump size: +0x9c40 (40000)
  PC sequence: 0xc3cd5a -> 0xc4699a
  Last 3 jumps: +0x9c40, +0x9c40, +0x9c40
```

### 2. Message Queue Linked List (ExecLibrary.ts)

**Problem**: Earlier session found that PutMsg directly wrote to lh_Head, breaking Exec linked list structure. Native GetMsg would remove messages properly, but PutMsg would re-add them.

**Fix**: Changed to use proper Exec list operations:
- PutMsg: Use `addHead(msgListAddr, msgAddr)` instead of direct `writeMemory32(lh_Head)`
- GetMsg: Use `remHead(msgListAddr)` instead of just JavaScript array manipulation

**Files Modified**:
- `/web/backend/src/amiga-emulation/api/ExecLibrary.ts` (lines 4931-4941, 5112-5132)

**Status**: Applied in previous session, verified working.

## Remaining Issue

### Native AEDoor.library Stuck After BB_CONFNUM

**Symptom**: After receiving BB_CONFNUM reply, door should send more XIM messages (command 136, 501, JH_SHUTDOWN) but never does. Instead, native AEDoor.library code loops infinitely.

**XIM Message Sequence** (12 messages sent successfully):
1. JH_REGISTER (1)
2. RAWARROW (501)
3. SV_NEWMSG (177) - "JoinCnf 4.0"
4. JH_SYSOP (12)
5. DT_NAME (100) - "Sysop"
6. DT_SECSTATUS (105) - "255"
7. DT_SLOTNUMBER (104) - "0"
8. BB_MAINLINE (131) - ""
9. EXPRESS_VERSION (152) - ""
10. DT_CONFACCESS (146) - "v5.3"
11. DT_LINELENGTH (122) - "XXXXXXXXX"
12. BB_CONFNUM (510) - "22" → returns "0"

**Observations**:
1. Door sends BB_CONFNUM with buffer="22" (asking about conference 22)
2. BBS returns "0" (current conference 1-1=0)
3. Message 0x10004c is reused for all XIM messages (normal - doors reuse message buffers)
4. Replies are correctly sent to door's reply port (0x100150)
5. Door IS calling PutMsg from its own code (PC=0x00312a, 0x003dc4, 0x003d6a) to resend messages
6. BUT: Door gets stuck in AEDoor.library code at PC 0xc00000+, looping by +0x9c40

**Hypotheses**:
1. **BB_CONFNUM protocol mismatch**: Door asks about conference 22, we return conference 0. Door may fail validation and enter error state.
2. **Reply delivery issue**: Reply goes to port 0x100150, but door might not be receiving it correctly.
3. **Signal bit mismatch**: Similar to previous signal bit bug - maybe reply port signaling isn't working.
4. **AEDoor.library waiting logic**: Library might be waiting for something we're not providing.

**Conference Context** (from user):
- 14 real conferences (1-14)
- Rest are virtual/network conferences (15-36)
- Conference 22 is "MYSTiC SCENETALK" (password-protected virtual conference)

**Next Steps**:
1. Verify BB_CONFNUM protocol: Does door expect current conference or validation of requested conference?
2. Check if reply to BB_CONFNUM is actually received by native code
3. Trace native AEDoor.library execution to see where exactly it's stuck
4. Compare with real Amiga log (if available) to see correct BB_CONFNUM response

## Test Command

```bash
BBS_DATA_DIR=~/Code/amiexpress-web timeout 8 \
  npx tsx web/backend/src/scripts/run-amiga-door.ts doors/emp_tools/joincnf 1
```

## References

- Signal Bit Fix: `/Documentation/6-Progress/SIGNAL_BIT_FIX_2026-01-07.md`
- JoinCnf Config: `/doors/emp_tools/joincnf.cfg`
- Command Info: `/Commands/BBSCmd/J.info` (ACCESS=10, TYPE=XIM, MULTINODE=YES)
