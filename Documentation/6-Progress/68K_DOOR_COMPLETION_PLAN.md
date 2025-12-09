# 68K Door 100% Completion Plan

**Status**: In Progress
**Goal**: Achieve 1:1 parity with AmiExpress/!X 68K door support
**Current Completion**: ~72%
**Target**: 100%
**Estimated Effort**: 20-30 hours focused development

---

## Executive Summary

Based on comprehensive codebase analysis, 68K door support is **72% complete** with strong foundations but **3 CRITICAL gaps** blocking multiple doors:

1. **Environment Variables** (20% complete) - Doors can't read/write ENV: vars
2. **Signal Handling** (30% complete) - Async I/O and interrupts don't work
3. **DOS Error Codes** (70% complete) - Error handling incomplete

Fixing these 3 issues will bring compatibility to **85%+**. The remaining 15% consists of polish items, library completeness, and edge cases.

---

## Phase 1: Critical Path Items [MUST FIX]

### 1.1 Environment Variables System [CRITICAL]
**Priority**: P0 - Blocks multiple doors
**Effort**: 3-4 hours
**Files**: `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Problem**:
- Real AmiExpress doors query ENV: variables extensively
- Current implementation only has FindVar() with minimal support
- SetVar/DeleteVar not implemented
- No persistence across door calls
- Standard DOS vars (PATH, PROMPT, RETURN) not pre-populated

**Implementation Steps**:

1. **Add Environment Structure** (45 min)
   - Create `EnvironmentManager` class in `amiga-emulation/session/`
   - Store vars in Map<string, string> + LocalVar linked list in memory
   - Integrate with AmigaDosEnvironment

2. **Implement SetVar** (60 min)
   - DOS offset -180 (SetVar)
   - Parse (name: STRPTR, buffer: STRPTR, size: LONG, flags: LONG) from registers
   - Write to memory structure at process.pr_LocalVars
   - Update EnvironmentManager state
   - Return BOOL_TRUE (1) or BOOL_FALSE (0)

3. **Implement DeleteVar** (30 min)
   - DOS offset -186 (DeleteVar)
   - Find var in linked list, unlink node, free memory
   - Update EnvironmentManager

4. **Complete FindVar** (30 min)
   - DOS offset -162 (FindVar)
   - Currently basic, enhance to support GVF_GLOBAL_ONLY (256), GVF_LOCAL_ONLY (0)
   - Return LocalVar structure pointer

5. **Pre-populate Standard Vars** (45 min)
   - PATH=Work:,S:,C:,Doors:
   - PROMPT=%N.%S>
   - RETURN=0
   - DEVINFO=CON:,NIL:,SER:
   - BBS_ROOT=<bbsRoot>
   - NODE_ID=<nodeId>
   - CONF_ID=<confId>
   - USER_NAME=<username>
   - USER_LEVEL=<secLevel>
   - DOORUSE.<DOORNAME>=<options> (from .info tooltypes)

6. **Test** (30 min)
   - Create test door that reads ENV:DOORUSE.FR
   - Verify SetVar persists across calls
   - Check memory structure layout matches NDK

**Success Criteria**:
- ✅ SetVar writes to memory and state
- ✅ FindVar returns correct LocalVar pointer
- ✅ DeleteVar removes var and frees memory
- ✅ Standard vars pre-populated at session start
- ✅ Door.info DOORUSE tooltypes loaded to ENV:

**Code Template**:
```typescript
// DosLibrary.ts - Add after FindVar

case -180: { // SetVar
  const name = this.emulator.readString(this.emulator.getAReg(0), 256);
  const buffer = this.emulator.readString(this.emulator.getAReg(1), 4096);
  const size = this.emulator.getDReg(0);
  const flags = this.emulator.getDReg(1);

  const success = this.envManager.setVar(name, buffer, flags);
  this.emulator.setDReg(0, success ? -1 : 0);
  return;
}

case -186: { // DeleteVar
  const name = this.emulator.readString(this.emulator.getAReg(0), 256);
  const success = this.envManager.deleteVar(name);
  this.emulator.setDReg(0, success ? -1 : 0);
  return;
}
```

---

### 1.2 Signal Delivery Mechanism [CRITICAL]
**Priority**: P0 - Blocks async doors
**Effort**: 4-5 hours
**Files**: `web/backend/src/amiga-emulation/api/ExecLibrary.ts`, `session/DoorLifecycleManager.ts`

**Problem**:
- Wait() returns immediately instead of blocking
- Signals never delivered to waiting tasks
- Progress timeout is JS timer, not Amiga signal
- Ctrl-C/carrier drop doesn't interrupt door
- No signal-driven polling support

**Implementation Steps**:

1. **Signal Queue System** (90 min)
   - Add `pendingSignals` bitmask to Task structure
   - Add `waitingSignals` bitmask to track what task is waiting for
   - Add `signalQueue: Map<number, number>` to ExecLibrary
   - Create `deliverSignal(taskAddr, signalMask)` method

2. **Wait() Blocking** (60 min)
   - Exec offset -318 (Wait)
   - Check if requested signals already pending → return immediately
   - Otherwise: store waitingSignals, return to lifecycle manager
   - DoorLifecycleManager pauses execution until signal delivered
   - Resume execution when signal arrives, return signal mask

3. **Signal() Implementation** (45 min)
   - Exec offset -324 (Signal)
   - Set bit in target task's pendingSignals
   - If task is Wait()ing and signal matches → resume task
   - Return previous signal state

4. **Progress Timeout → Signal** (60 min)
   - DoorLifecycleManager timeout delivers SIGINT-like signal
   - AllocSignal reserves signal bit for timeout (e.g., bit 31)
   - On timeout: call Signal(currentTask, 1 << 31)
   - Door's Wait() returns with timeout signal set

5. **Carrier Drop Integration** (45 min)
   - markCarrierDropped() delivers SIGBREAKF_CTRL_C (1 << 12)
   - Door Wake()s from Wait()
   - Returns signal mask with CTRL_C bit set

6. **Test** (30 min)
   - Door calls Wait(SIGBREAKF_CTRL_C)
   - Simulate carrier drop
   - Verify door resumes with correct signal mask
   - Test progress timeout delivers signal

**Success Criteria**:
- ✅ Wait() blocks execution until signal arrives
- ✅ Signal() resumes blocked task
- ✅ Progress timeout delivers signal bit
- ✅ Carrier drop interrupts Wait()
- ✅ Signal masks work correctly (AND, OR, XOR)

**Code Template**:
```typescript
// ExecLibrary.ts

case -318: { // Wait
  const signalMask = this.emulator.getDReg(0);

  // Check if any requested signals already pending
  const pending = this.currentTask?.pendingSignals || 0;
  const received = pending & signalMask;

  if (received) {
    // Signals already present, return immediately
    this.currentTask!.pendingSignals &= ~received;
    this.emulator.setDReg(0, received);
    return;
  }

  // Must wait - store waiting state
  this.currentTask!.waitingSignals = signalMask;
  this.currentTask!.isWaiting = true;

  // Signal lifecycle manager to pause execution
  this.lifecycleManager.pauseUntilSignal(signalMask);
  return;
}

case -324: { // Signal
  const taskAddr = this.emulator.getAReg(1);
  const signalMask = this.emulator.getDReg(0);

  // Deliver signal to task
  const task = this.getTaskByAddress(taskAddr);
  if (task) {
    const oldSignals = task.pendingSignals;
    task.pendingSignals |= signalMask;

    // Wake up if waiting for this signal
    if (task.isWaiting && (task.waitingSignals & signalMask)) {
      task.isWaiting = false;
      this.lifecycleManager.resumeFromSignal(signalMask);
    }

    this.emulator.setDReg(0, oldSignals);
  } else {
    this.emulator.setDReg(0, 0);
  }
  return;
}
```

---

### 1.3 DOS Error Code Completeness [CRITICAL]
**Priority**: P0 - Error handling broken
**Effort**: 2-3 hours
**Files**: `web/backend/src/amiga-emulation/api/DosLibrary.ts`, `api/FileManager.ts`

**Problem**:
- Only ~15 ERROR_* codes defined, NDK has 200+
- IoErr() often returns 0 instead of specific error
- Filesystem errors not mapped to DOS errors
- Error propagation inconsistent

**Implementation Steps**:

1. **Add Complete ERROR_* Constants** (30 min)
   - Import from NDK dos/dos.h
   - Define all 200+ ERROR_* codes (103-500 range)
   - Key errors: ERROR_NO_FREE_STORE (103), ERROR_TASK_TABLE_FULL (105), ERROR_BAD_TEMPLATE (114), ERROR_BAD_NUMBER (115), ERROR_REQUIRED_ARG_MISSING (116), ERROR_KEY_NEEDS_ARG (117), ERROR_TOO_MANY_ARGS (118), ERROR_UNMATCHED_QUOTES (119), ERROR_LINE_TOO_LONG (120), ERROR_FILE_NOT_OBJECT (121), ERROR_INVALID_RESIDENT_LIBRARY (122), ERROR_NO_DEFAULT_DIR (201), ERROR_OBJECT_IN_USE (202), ERROR_OBJECT_EXISTS (203), ERROR_DIR_NOT_FOUND (204), ERROR_OBJECT_NOT_FOUND (205), ERROR_BAD_STREAM_NAME (206), ERROR_OBJECT_TOO_LARGE (207), ERROR_ACTION_NOT_KNOWN (209), ERROR_INVALID_COMPONENT_NAME (210), ERROR_INVALID_LOCK (211), ERROR_OBJECT_WRONG_TYPE (212), ERROR_DISK_NOT_VALIDATED (213), ERROR_DISK_WRITE_PROTECTED (214), ERROR_RENAME_ACROSS_DEVICES (215), ERROR_DIRECTORY_NOT_EMPTY (216), ERROR_TOO_MANY_LEVELS (217), ERROR_NO_DISK (218), ERROR_NO_MORE_ENTRIES (219), ERROR_IS_SOFT_LINK (233), ERROR_DISK_FULL (221), ERROR_DELETE_PROTECTED (222), ERROR_WRITE_PROTECTED (223), ERROR_READ_PROTECTED (224), ERROR_NOT_A_DOS_DISK (225), ERROR_NO_DISK (226), ERROR_NO_MORE_ENTRIES (232)

2. **FileManager Error Mapping** (60 min)
   - Catch all filesystem errors in FileManager
   - Map Node.js ENOENT → ERROR_OBJECT_NOT_FOUND (205)
   - Map EACCES → ERROR_WRITE_PROTECTED (223)
   - Map ENOTDIR → ERROR_OBJECT_WRONG_TYPE (212)
   - Map EISDIR → ERROR_OBJECT_WRONG_TYPE (212)
   - Map ENOSPC → ERROR_DISK_FULL (221)
   - Map ENOMEM → ERROR_NO_FREE_STORE (103)
   - Set IoErr in all error paths

3. **DosLibrary Error Propagation** (60 min)
   - Every file operation checks FileManager result
   - On failure: set IoErr, return NULL/0/-1
   - Open: ERROR_OBJECT_NOT_FOUND
   - Read: ERROR_OBJECT_WRONG_TYPE, ERROR_READ_PROTECTED
   - Write: ERROR_DISK_WRITE_PROTECTED, ERROR_DISK_FULL
   - Seek: ERROR_SEEK_ERROR (219)
   - Close: ERROR_OBJECT_IN_USE (202)

4. **IoErr Accessor** (15 min)
   - Offset -132 (IoErr)
   - Return lastIoErr from process structure
   - Clear after read (optional, check express.e behavior)

5. **Test** (30 min)
   - Try to open nonexistent file → IoErr() returns 205
   - Write to read-only file → IoErr() returns 223
   - Seek on device → IoErr() returns 219

**Success Criteria**:
- ✅ All common ERROR_* codes defined
- ✅ FileManager sets IoErr on all failures
- ✅ DosLibrary propagates errors correctly
- ✅ IoErr() returns correct code after operations
- ✅ Test suite validates error scenarios

---

## Phase 2: High-Priority Compatibility [SHOULD FIX]

### 2.1 ReadArgs Full Implementation
**Priority**: P1
**Effort**: 4-6 hours
**Blocked Doors**: Complex CLI tools, installers

**Missing**:
- Template syntax: /A (required), /K (keyword), /M (multiple), /N (numeric), /S (switch), /F (rest of line)
- Keyword matching
- Multi-value arguments
- Numeric validation
- Quote handling
- Default values

**Reference**: dos.library/ReadArgs autodoc, express.e uses this for BBS commands

---

### 2.2 Missing DOS Library Functions
**Priority**: P1
**Effort**: 3-4 hours
**Blocked Doors**: File managers, utilities

**Functions to Add**:
- Rename (offset -78): Move/rename file
- SetProtection (offset -108): Set file permissions
- SetComment (offset -180): Set file comment
- Examine full fields: DateStamp, Protection bits, Comment
- ExNext iteration: Proper buffer management
- FastDir (if used)
- GetFileSize (if used)

---

### 2.3 XIM Command Gaps
**Priority**: P1
**Effort**: 3-4 hours
**Blocked Doors**: Configuration-heavy doors

**Missing**:
- ENVSTAT: Actually update environment (not just buffer write)
- RAWARROW: Toggle arrow key raw mode
- PRV_COMMAND: Capture return value
- MOD_TYPE, EDITOR_STRUCT, BYPASS_CSI_CHECK handlers
- GET_CMD_TOOLTYPE caching optimization

---

### 2.4 Exec Library Completeness
**Priority**: P1
**Effort**: 2-3 hours

**Missing**:
- SetSignal: Modify signal state
- SendIO/DoIO: Async I/O operations (stub for now)
- Complete AllocSignal/FreeSignal edge cases
- StackSwap: Full implementation (if needed)

---

## Phase 3: Polish & Edge Cases [NICE TO HAVE]

### 3.1 Memory Management Hardening
**Priority**: P2
**Effort**: 2-3 hours

**Improvements**:
- AllocMem bounds checking (prevent >16MB)
- Stack overflow detection
- Heap coalescing for reuse
- BSS zero-fill verification
- Hunk relocation edge cases (HUNK_RELOC32SHORT, HUNK_EXT variants)

---

### 3.2 Drop File Accuracy
**Priority**: P2
**Effort**: 1-2 hours

**Improvements**:
- Actual user call tracking
- Download KB from database
- Previous caller from session logs
- Memory availability (query system)
- Node count detection

---

### 3.3 Case Sensitivity Audit
**Priority**: P2
**Effort**: 1-2 hours

**Audit**:
- All DosLibrary operations use amigafs
- Device names case-insensitive
- Tooltype lookups case-insensitive
- Path resolution consistent

---

### 3.4 Library Dynamic Loading
**Priority**: P3
**Effort**: 2-3 hours

**Test**:
- Real Amiga library binaries
- OpenLibrary with actual .library files
- CloseLibrary cleanup
- Document which doors need which libraries

---

## Phase 4: Testing & Validation

### 4.1 Test Suite Development
**Effort**: 4-5 hours

**Create**:
- `test-env-vars.ts`: Test SetVar/GetVar/DeleteVar
- `test-signals.ts`: Test Wait/Signal delivery
- `test-dos-errors.ts`: Test IoErr codes
- `test-readargs.ts`: Test argument parsing
- `test-file-ops.ts`: Test Rename/SetProtection/etc.
- `test-xim-commands.ts`: Test all XIM commands

---

### 4.2 Real Door Testing
**Effort**: Ongoing

**Test Doors**:
- AquaScan (FR mode with ENV:DOORUSE.FR=1)
- Bulls (environment configuration)
- WHO (signal handling)
- Request.rexx (AREXX door)
- NTR-LastCallers (file operations)
- QuickNew (complex operations)

---

## Implementation Schedule

### Week 1: Critical Path
- **Day 1-2**: Environment Variables (1.1)
- **Day 3-4**: Signal Handling (1.2)
- **Day 5**: DOS Error Codes (1.3)
- **Test & Validate**: All critical fixes

**Expected Completion**: 85%+ compatibility

### Week 2: High Priority
- **Day 1-2**: ReadArgs (2.1)
- **Day 3**: DOS Functions (2.2)
- **Day 4**: XIM Gaps (2.3)
- **Day 5**: Exec Completeness (2.4)

**Expected Completion**: 92%+ compatibility

### Week 3: Polish (Optional)
- **Day 1**: Memory Hardening (3.1)
- **Day 2**: Drop Files (3.2)
- **Day 3**: Case Audit (3.3)
- **Day 4**: Testing (4.1)
- **Day 5**: Real Door Testing (4.2)

**Expected Completion**: 95%+ compatibility

### Week 4: Library Loading (Optional)
- **Day 1-2**: Dynamic loading (3.4)
- **Day 3-5**: Edge cases, documentation

**Expected Completion**: 98%+ compatibility

---

## Success Metrics

| Metric | Current | Phase 1 | Phase 2 | Phase 3 | Target |
|--------|---------|---------|---------|---------|--------|
| Core doors working | 60% | 85% | 95% | 98% | 100% |
| XIM commands complete | 85% | 90% | 95% | 98% | 100% |
| DOS library complete | 70% | 80% | 90% | 95% | 100% |
| Exec library complete | 65% | 80% | 90% | 95% | 100% |
| Error handling | 70% | 95% | 98% | 99% | 100% |
| Environment vars | 20% | 100% | 100% | 100% | 100% |
| Signal handling | 30% | 95% | 98% | 99% | 100% |
| Overall compatibility | 72% | 87% | 93% | 96% | 100% |

---

## Risk Mitigation

### High Risk Items
1. **Signal blocking complexity** - May need async/await refactor
   - Mitigation: Prototype with simple test door first
2. **Environment var memory layout** - Must match NDK exactly
   - Mitigation: Reference vamos implementation
3. **Performance impact** - Wait() blocking could slow execution
   - Mitigation: Optimize signal delivery path

### Medium Risk Items
1. **ReadArgs template parser** - Complex edge cases
   - Mitigation: Unit tests for each template type
2. **Memory overlap bugs** - Hard to debug
   - Mitigation: Add comprehensive bounds checking
3. **XIM command interactions** - Some commands depend on others
   - Mitigation: Test command sequences, not just individual commands

---

## Documentation Updates

After each phase:
1. Update `CURRENT_STATUS.md` with completion %
2. Update `KNOWN_ISSUES.md` with remaining gaps
3. Update `DOOR_DEVELOPMENT.md` with new capabilities
4. Create session notes in `archive/` for each major fix
5. Update `MASTERPLAN.md` progress section

---

## Code Review Checklist

Before merging each phase:
- ✅ TypeScript compiles with 0 errors
- ✅ All affected test scripts pass
- ✅ At least 1 real door tested and working
- ✅ Memory leaks checked (no dangling allocations)
- ✅ Error paths all set IoErr correctly
- ✅ Documentation updated
- ✅ Commit message references this plan phase

---

## Appendix: Code Locations

**Environment Variables**:
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` - SetVar/DeleteVar/FindVar
- `web/backend/src/amiga-emulation/session/AmigaDosEnvironment.ts` - Environment manager
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` - Session init

**Signal Handling**:
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Wait/Signal/AllocSignal
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` - Execution loop
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Carrier drop

**DOS Errors**:
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` - Error constants, IoErr
- `web/backend/src/amiga-emulation/api/FileManager.ts` - Error mapping
- `web/backend/src/amiga-emulation/api/AmigaDosEnvironment.ts` - Error state

**XIM Protocol**:
- `web/backend/src/amiga-emulation/XIMProtocol.ts` - Main router
- `web/backend/src/amiga-emulation/xim/system-commands.ts` - ENVSTAT, etc.
- `web/backend/src/amiga-emulation/xim/data-query.ts` - DT_* handlers

**Testing**:
- `dev/scripts/test-all-68k-doors.sh` - Full door test suite
- `dev/scripts/test-door-install.ts` - Single door test
- `web/backend/src/scripts/run-amiga-door.ts` - Standalone runner

---

**Document Version**: 1.0
**Last Updated**: 2025-12-09
**Next Review**: After Phase 1 completion
