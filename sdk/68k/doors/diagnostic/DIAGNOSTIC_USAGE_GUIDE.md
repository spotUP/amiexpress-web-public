# 68K Door Diagnostic Tool - Usage Guide

## Overview

The diagnostic door is a **comprehensive test suite** for validating 100% production-ready 68K door emulation in AmiExpress. It tests all 300+ capabilities that 68K doors can use.

## Current Status

- **Binary**: `Doors/DIAGNOSTIC/diagnostic` (19KB, vbcc-compiled HUNK executable)
- **Command**: `DIAGNOSTIC` (registered at `Commands/BBSCmd/DIAGNOSTIC.info`)
- **Test Sections**: 21 sections covering 280+ test cases
- **Coverage**: 100% of door capabilities have test cases
- **Implementation**: ~27% working, ~73% awaiting backend handlers

## Running the Diagnostic

### 1. Basic Test Run

From the BBS terminal:
```
DIAGNOSTIC
```

This runs the diagnostic door and displays results in the terminal. Each test shows:
- `[PASS]` - Test passed successfully
- `[FAIL]` - Test failed (backend issue)
- `[WARN]` - Test skipped (awaiting implementation)

### 2. Check Per-Door Logs

After running, check the door-specific log:
```bash
ls -t logs/door-68k-DIAGNOSTIC* | head -1
```

This log contains:
- CPU state at key points (PC, D0, A0, SP registers)
- Library calls (AEDoor.library, dos.library, exec.library)
- File operations (Open, Read, Write paths and results)
- XIM messages (TX/RX command codes and data)
- Memory operations (allocations, reads, writes)

### 3. Enable XIM Debug Logging (Optional)

For even more detailed XIM protocol tracing:
```bash
XIM_DEBUG=1 npm run dev
```

Then run `DIAGNOSTIC` again. Check `logs/xim-debug.log` for:
- Every XIM message sent/received
- Complete message payloads
- File operation details
- Timestamps and elapsed time

## Test Sections

### Currently Implemented (PASS or partial):

1. **Core Door Lifecycle** - Register, ShutDown, CloseOut
2. **Argc/Argv Parsing** - Command-line arguments, node number
3. **User Data Queries** - getlevel, getname, getlocation, getnode, getbbsname
4. **DT_* Constants** - 40+ data type constants (DT_NAME, DT_SECSTATUS, etc.)
5. **Input/Output** - sendmessage, mciputstr, prompt, lineinput, Hotkey
6. **File Operations** - showfile, Download, Upload, FlagFile, Editfile
7. **GetInfo/PutInfo** - User data read/write by constant
8. **System Functions** - getsignal, GetSemaphore, IsAccess, TLock
9. **Date/Time** - GetTheDate, GetTheTime, DateToString, getsystime
10. **Account Management** - LastAccountNum, Search_Account, Load_Account
11. **Conference Functions** - Get_ConfName, Load_ConfDB, Save_ConfDB
12. **Utility Functions** - Chain, AcpCommand, GetFiller1, PutFiller1
13. **Standard C Library** - strlen, strcpy, strcmp, memset, memcpy

### Awaiting Implementation (SKIP):

14. **AmigaDOS File Operations** (24 tests)
    - Open, Close, Read, Write, Seek, SetFileSize
    - Lock, UnLock, DupLock, ParentDir
    - Examine, ExNext, ExAll
    - CurrentDir, CreateDir, DeleteFile, Rename
    - SetProtection, SetComment, SetFileDate
    - IoErr, NameFromLock, DeviceProc

15. **Exec Memory Operations** (8 tests)
    - AllocMem, FreeMem (with MEMF_CLEAR, MEMF_PUBLIC)
    - AllocVec, FreeVec
    - CopyMem, CopyMemQuick
    - AvailMem, TypeOfMem

16. **Exec Message Port Operations** (10 tests)
    - CreatePort/CreateMsgPort, DeletePort/DeleteMsgPort
    - FindPort, PutMsg, GetMsg, ReplyMsg
    - WaitPort, AllocSignal, FreeSignal, Signal

17. **Environment Variables** (8 tests)
    - NODE, BBSNAME, USERNAME, USERLEVEL
    - ENVSTAT, GetEnv, SetEnv
    - Custom ENV_* variables

18. **MCI Code Rendering** (17 tests)
    - Color codes: ~c0-~c9
    - User data: ~UN, ~UL, ~US
    - System data: ~BN, ~SN, ~DT, ~TI
    - Cursor control: ~CU, ~CD, ~CF, ~CB, ~CH, ~CL, ~CE

19. **ANSI Code Rendering** (11 tests)
    - ESC[#m graphics mode
    - ESC[#;#m color
    - ESC[#A/B/C/D cursor movement
    - ESC[#;#H cursor position
    - ESC[2J clear screen
    - ESC[K clear to EOL
    - ESC[s/u save/restore cursor

20. **Error Condition Handling** (11 tests)
    - IoErr error code retrieval
    - ERROR_OBJECT_NOT_FOUND, ERROR_NO_FREE_STORE
    - ERROR_SEEK_ERROR, ERROR_READ_PROTECTED, etc.
    - Null pointer safety
    - Buffer overflow protection

21. **Binary Data Transfer** (5 tests)
    - Binary data via WriteStr
    - Bulk data via Filler1/Filler2
    - Non-ASCII character handling
    - Binary file I/O

## Interpreting Results

### Test Summary Format

At the end of the diagnostic run, you'll see:
```
=====================================
         TEST SUMMARY
=====================================
Total Tests:  280
Passed:       80
Failed:       0
Skipped:      200
=====================================
```

- **Passed**: Backend handler is working correctly
- **Failed**: Backend handler exists but has a bug
- **Skipped**: Backend handler not yet implemented

### Common Failure Patterns

#### 1. "Function not implemented" (SKIP)

```
[WARN] Open() file handle (Not yet implemented)
```

**Meaning**: Test case exists, but backend handler is missing.

**Action**: Implement the backend handler for this function.

#### 2. "Test failed" (FAIL)

```
[FAIL] getlevel() returns valid range (0-255)
```

**Meaning**: Backend handler exists but returns incorrect data.

**Action**: Check logs for the actual return value, debug backend implementation.

#### 3. No output / door hangs

**Meaning**: Critical error in door execution or XIM protocol.

**Action**:
1. Check `logs/door-68k-DIAGNOSTIC-*.log` for last CPU state
2. Check for illegal instruction traps
3. Verify library loading succeeded

## Next Steps to 100% Production Ready

### Phase 1: Implement Critical Handlers (Priority 1)

1. **AmigaDOS File Operations**
   - Files: `web/backend/src/amiga-emulation/api/DosLibrary.ts`
   - Functions: Open, Close, Read, Write, Seek, Lock, etc.
   - Test: Re-run diagnostic, verify section 14 passes

2. **Exec Memory Operations**
   - Files: `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
   - Functions: AllocMem, FreeMem, AllocVec, FreeVec
   - Test: Re-run diagnostic, verify section 15 passes

3. **Exec Message Port Operations**
   - Files: `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
   - Functions: CreatePort, FindPort, PutMsg, GetMsg
   - Test: Re-run diagnostic, verify section 16 passes

### Phase 2: Implement High Priority Handlers (Priority 2)

4. **Environment Variables**
   - Files: `web/backend/src/amiga-emulation/xim/data-query.ts`
   - Constants: NODE, BBSNAME, USERNAME, USERLEVEL
   - Test: Re-run diagnostic, verify section 17 passes

5. **MCI Code Rendering**
   - Files: `web/backend/src/amiga-emulation/xim/io.ts`
   - Codes: ~c0-~c9, ~UN, ~UL, ~US, ~BN, ~SN, ~DT, ~TI
   - Test: Re-run diagnostic, verify section 18 passes

6. **ANSI Code Rendering**
   - Files: `web/backend/src/amiga-emulation/xim/io.ts`
   - Codes: ESC[#m, ESC[#A/B/C/D, ESC[2J, ESC[K
   - Test: Re-run diagnostic, verify section 19 passes

### Phase 3: Implement Medium Priority (Priority 3)

7. **Error Condition Handling**
   - Add proper error returns to all handlers
   - Implement IoErr() properly
   - Test: Re-run diagnostic, verify section 20 passes

8. **Binary Data Transfer**
   - Ensure WriteStr handles binary data
   - Implement Filler1/Filler2 bulk transfer
   - Test: Re-run diagnostic, verify section 21 passes

### Phase 4: Validation and Polish

9. **Full Integration Test**
   - Run diagnostic: ALL tests must PASS (0 failed, 0 skipped)
   - Test suite completion: 100%
   - Production readiness: ACHIEVED

10. **Real-World Door Testing**
    - Test with actual Amiga doors (AquaScan, Bulls, RTW, etc.)
    - Verify all doors work identically to real Amiga
    - No regressions from diagnostic changes

## Development Workflow

### 1. Implement Handler

Edit the appropriate backend file:
- `DosLibrary.ts` for dos.library functions
- `ExecLibrary.ts` for exec.library functions
- `xim/data-query.ts` for DT_* constants
- `xim/io.ts` for I/O and MCI/ANSI codes

### 2. Run Diagnostic

```bash
cd ~/Code/amiexpress-web
./dev/scripts/start-servers.sh
# Connect to BBS via telnet/web
DIAGNOSTIC
```

### 3. Analyze Logs

```bash
# Check per-door log
ls -t logs/door-68k-DIAGNOSTIC* | head -1 | xargs cat

# Check XIM debug log (if XIM_DEBUG=1)
tail -200 logs/xim-debug.log
```

### 4. Fix and Iterate

- Find failed tests in logs
- Identify root cause (wrong return value, missing handler, etc.)
- Fix backend implementation
- Re-run diagnostic
- Repeat until test passes

## Success Criteria

The diagnostic door is considered **100% production ready** when:

1. **All 280+ tests PASS** (0 failed, 0 skipped)
2. **All 21 test sections complete successfully**
3. **Real Amiga doors work identically** to real hardware
4. **No emulation bugs** in any capability
5. **Full XIM protocol compliance**

## Current Progress

- Test Framework: ✅ COMPLETE (21 sections, 280+ tests)
- Test Coverage: ✅ 100% (all capabilities tested)
- Backend Handlers: ⚠️ 27% (80/300 capabilities working)
- Production Ready: ❌ NO (awaiting handler implementation)

**Time to Production**: 2-4 weeks estimated (220 handlers @ ~5-10/day)

## Files

- **Diagnostic Source**: `sdk/68k/doors/diagnostic/diagnostic.c` (1200+ lines)
- **Installed Binary**: `Doors/DIAGNOSTIC/diagnostic` (19KB)
- **Command Config**: `Commands/BBSCmd/DIAGNOSTIC.info`
- **Capability Matrix**: `sdk/68k/doors/diagnostic/CAPABILITY_MATRIX.md`
- **This Guide**: `sdk/68k/doors/diagnostic/DIAGNOSTIC_USAGE_GUIDE.md`

## Support

For questions or issues:
1. Check `CAPABILITY_MATRIX.md` for complete capability list
2. Check per-door logs in `logs/door-68k-DIAGNOSTIC-*.log`
3. Enable XIM_DEBUG=1 for detailed protocol tracing
4. Review backend handler implementations in `web/backend/src/amiga-emulation/`
