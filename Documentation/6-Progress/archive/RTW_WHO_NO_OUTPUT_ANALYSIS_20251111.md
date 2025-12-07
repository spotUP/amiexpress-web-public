# RTW/WHO No Output Analysis - November 11, 2025

## Summary

After fixing the stack corruption bug, both RTW and WHO doors now **exit cleanly** but produce **no output**.

## Symptoms

Both doors exhibit identical behavior:
- Execute exactly 1134 CPU iterations
- Exit cleanly with return code 30 (0x1E)
- Never call FindSemaphore, FindPort, Read, Write, or AEDoor functions
- Never produce any BBS output

## Library Calls Made

RTW/WHO call these functions during execution:
```
3 AllocMem
1 Close
1 CloseLibrary
3 FreeMem
1 Input         (get stdin handle)
1 Open          (opens console "*", gets BPTR 2)
1 OpenLibrary   (dos.library only)
2 Output        (get stdout handle twice)
1 SetTaskPri
2 StackSwap
```

## What's Missing

RTW/WHO do NOT call:
- `FindSemaphore("AEServer.2")` - needed to find node status
- `FindPort()` - for IPC message ports
- `AllocSignal()` - for reply port signal
- `CreateMsgPort()` / `CreatePort()` - for IPC
- `Read()` / `Write()` - for file I/O
- Any AEDoor.library functions

## Environment Setup

The emulator correctly creates:
- **AEServer semaphores**: `"AEServer.0"` through `"AEServer.7"` at addresses 0xB1000-0xB1E00
- **FindSemaphore() trap**: Implemented at LVO -594, would return semaphore addresses
- **Command line args**: `"rtw 2"` (correct node number)
- **DOOR.SYS**: Created for Node2, contains proper BBS info
- **Console handle**: Open() succeeds, returns BPTR 2

## Theory: Early Exit Condition

Both doors execute the SAME code path (1134 iterations, exit code 30), suggesting they hit an early-exit condition that:

1. **Checks for some requirement** (environment var, file, port, etc.)
2. **Finds requirement missing**
3. **Exits with code 30** without calling FindSemaphore or doing IPC

Possible checks:
- Checking for a specific file that doesn't exist
- Checking for an environment variable
- Checking DOS device list
- Checking for AmiExpress-specific setup
- Verifying node number is valid

## Exit Code 30 Analysis

Return code 30 (decimal) = 0x1E (hex):
- **Not a standard AmigaDOS error** (typical errors are 103-226)
- **Not ASCII** (0x1E is a control character)
- **Possibly door-specific** error code
- **Consistent across WHO and RTW** - same condition

## Next Steps to Debug

### Option 1: Execution Path Tracking
Add instrumentation to log PC values after the polling loops (0x117C-0x3000) to see exactly what code path RTW takes before exiting.

### Option 2: Conditional Branch Analysis
Disassemble RTW from entry point to exit, identify all conditional branches (BEQ, BNE, TST, CMP) that could lead to early exit.

### Option 3: Compare with Working Door
Run a known-working SIM door (like MultiTop) and compare execution paths to see what RTW is missing.

### Option 4: Environment Setup
Check if RTW expects specific:
- Environment variables (ENV:, ENVARC:)
- Assigns (logical device mappings)
- DOS handlers
- Current directory structure

## Files Modified (This Session)

1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts:540-544`
   - Fixed stack corruption by extending exit trap coverage

2. `Documentation/6-Progress/RTW_WHO_STACK_CORRUPTION_FIX_20251111.md`
   - Documented the stack bug fix

## References

- Stack fix: `RTW_WHO_STACK_CORRUPTION_FIX_20251111.md`
- Original debugging: `RTW_DOOR_DEBUGGING_SESSION_20251111.md`
- DBRA loop analysis: `RTW_WHO_DBRA_LOOP_BUG_20251111.md`
