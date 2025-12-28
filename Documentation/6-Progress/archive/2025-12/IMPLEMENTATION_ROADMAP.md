# AmiExpress-Web Implementation Roadmap
**Created:** 2025-12-27
**Goal:** Complete 68K interactive door support from 72% to 100%

---

## Overview

| Phase | Focus | Effort | Target % |
|-------|-------|--------|----------|
| Phase 1 | Critical Path (Env, Signals, Errors) | 10-12 hrs | 85% |
| Phase 2 | High Priority (ReadArgs, DOS, XIM, Exec) | 12-16 hrs | 93% |
| Phase 3 | Polish (Memory, Drop Files, Case Audit) | 6-8 hrs | 97% |
| Phase 4 | Testing & Validation | 4-6 hrs | 100% |

**Total Estimated:** 32-42 hours focused development

---

## Phase 1: Critical Path [MUST FIX]

### 1.1 Environment Variables System
**Priority:** P0 | **Effort:** 3-4 hours | **File:** DosLibrary.ts

**Todos:**
- [ ] Create EnvironmentManager class in `amiga-emulation/session/`
- [ ] Implement SetVar (DOS offset -180)
- [ ] Implement DeleteVar (DOS offset -186)
- [ ] Complete FindVar (DOS offset -162) with GVF_* flags
- [ ] Pre-populate standard vars (PATH, PROMPT, RETURN, BBS_ROOT, NODE_ID, etc.)
- [ ] Load DOORUSE.* tooltypes from door .info files
- [ ] Test: Create door that reads ENV:DOORUSE.FR

**Success Criteria:**
- SetVar writes to memory and state
- FindVar returns correct LocalVar pointer
- DeleteVar removes var and frees memory
- Standard vars pre-populated at session start

---

### 1.2 Signal Delivery Mechanism
**Priority:** P0 | **Effort:** 4-5 hours | **Files:** ExecLibrary.ts, DoorLifecycleManager.ts

**Todos:**
- [ ] Add `pendingSignals` bitmask to Task structure
- [ ] Add `waitingSignals` bitmask to Task structure
- [ ] Implement Wait() blocking (Exec offset -318)
- [ ] Implement Signal() delivery (Exec offset -324)
- [ ] Connect progress timeout to signal delivery (bit 31)
- [ ] Connect carrier drop to SIGBREAKF_CTRL_C (bit 12)
- [ ] Test: Door calls Wait(SIGBREAKF_CTRL_C), simulate carrier drop

**Success Criteria:**
- Wait() blocks until signal arrives
- Signal() resumes blocked task
- Progress timeout delivers signal bit
- Carrier drop interrupts Wait()

---

### 1.3 DOS Error Codes Completeness
**Priority:** P0 | **Effort:** 2-3 hours | **Files:** DosLibrary.ts, FileManager.ts

**Todos:**
- [ ] Add all ERROR_* constants (200+ from NDK dos/dos.h)
- [ ] Map Node.js errors to DOS errors in FileManager:
  - ENOENT -> ERROR_OBJECT_NOT_FOUND (205)
  - EACCES -> ERROR_WRITE_PROTECTED (223)
  - ENOTDIR -> ERROR_OBJECT_WRONG_TYPE (212)
  - ENOSPC -> ERROR_DISK_FULL (221)
  - ENOMEM -> ERROR_NO_FREE_STORE (103)
- [ ] Ensure all DosLibrary file operations set IoErr on failure
- [ ] Test: Open nonexistent file, verify IoErr() returns 205

**Success Criteria:**
- All common ERROR_* codes defined
- FileManager sets IoErr on all failures
- DosLibrary propagates errors correctly

---

## Phase 2: High Priority [SHOULD FIX]

### 2.1 ReadArgs Full Implementation
**Priority:** P1 | **Effort:** 4-6 hours | **File:** DosLibrary.ts

**Todos:**
- [ ] Implement template syntax parsing:
  - /A (required argument)
  - /K (keyword argument)
  - /M (multiple values)
  - /N (numeric validation)
  - /S (switch/boolean)
  - /F (rest of line)
- [ ] Handle quoted strings and escapes
- [ ] Implement default value support
- [ ] Test with complex CLI tools

---

### 2.2 Missing DOS Library Functions
**Priority:** P1 | **Effort:** 3-4 hours | **File:** DosLibrary.ts

**Todos:**
- [ ] Rename (offset -78): Move/rename files
- [ ] SetProtection (offset -108): Set file permission bits
- [ ] SetComment (offset -180): Set file comment
- [ ] Complete Examine fields: DateStamp, Protection, Comment
- [ ] ExNext iteration with proper buffer management

---

### 2.3 XIM Command Gaps
**Priority:** P1 | **Effort:** 3-4 hours | **Files:** XIMProtocol.ts, xim/*.ts

**Todos:**
- [ ] ENVSTAT: Actually update environment state
- [ ] RAWARROW: Toggle arrow key raw mode
- [ ] PRV_COMMAND: Capture return value
- [ ] MOD_TYPE handler
- [ ] EDITOR_STRUCT handler
- [ ] BYPASS_CSI_CHECK handler
- [ ] GET_CMD_TOOLTYPE caching

---

### 2.4 Exec Library Completeness
**Priority:** P1 | **Effort:** 2-3 hours | **File:** ExecLibrary.ts

**Todos:**
- [ ] SetSignal: Modify signal state
- [ ] SendIO/DoIO: Async I/O stubs
- [ ] AllocSignal/FreeSignal edge cases
- [ ] StackSwap full implementation (if needed)

---

## Phase 3: Polish & Edge Cases [NICE TO HAVE]

### 3.1 Memory Management Hardening
**Priority:** P2 | **Effort:** 2-3 hours

**Todos:**
- [ ] AllocMem bounds checking (max 16MB)
- [ ] Stack overflow detection
- [ ] Heap coalescing for memory reuse
- [ ] BSS zero-fill verification
- [ ] HUNK_RELOC32SHORT support
- [ ] HUNK_EXT variants support

---

### 3.2 Drop File Accuracy
**Priority:** P2 | **Effort:** 1-2 hours

**Todos:**
- [ ] Actual user call tracking from database
- [ ] Download KB from session stats
- [ ] Previous caller from session logs
- [ ] Memory availability query
- [ ] Node count detection

---

### 3.3 Case Sensitivity Audit
**Priority:** P2 | **Effort:** 1-2 hours

**Todos:**
- [ ] Verify all DosLibrary ops use amigafs
- [ ] Device names case-insensitive
- [ ] Tooltype lookups case-insensitive
- [ ] Path resolution consistent

---

### 3.4 AquaScan FR Output Fixes
**Priority:** P2 | **Effort:** 2-3 hours

**Todos:**
- [ ] Fix double line breaks in ASCII art
- [ ] Fix premature wrap in art lines
- [ ] Correct pause timing for terminal height
- [ ] Test with DOORUSE=FR/REVSCAN

---

## Phase 4: Testing & Validation

### 4.1 Test Suite Development
**Priority:** P1 | **Effort:** 4-5 hours

**Todos:**
- [ ] Create test-env-vars.ts
- [ ] Create test-signals.ts
- [ ] Create test-dos-errors.ts
- [ ] Create test-readargs.ts
- [ ] Create test-file-ops.ts
- [ ] Create test-xim-commands.ts

---

### 4.2 Real Door Testing
**Priority:** P1 | **Effort:** Ongoing

**Test Doors:**
- [ ] AquaScan (FR mode with ENV:DOORUSE.FR=1)
- [ ] Bulls (environment configuration)
- [ ] WHO (signal handling)
- [ ] Request.rexx (AREXX door)
- [ ] NTR-LastCallers (file operations)
- [ ] QuickNew (complex operations)
- [ ] RTW (interactive XIM)

---

## Implementation Order

### Week 1: Critical Path -> 85%
```
Day 1-2: Environment Variables (1.1)
Day 3-4: Signal Handling (1.2)
Day 5:   DOS Error Codes (1.3)
         Test & Validate all critical fixes
```

### Week 2: High Priority -> 93%
```
Day 1-2: ReadArgs (2.1)
Day 3:   DOS Functions (2.2)
Day 4:   XIM Gaps (2.3)
Day 5:   Exec Completeness (2.4)
```

### Week 3: Polish -> 97%
```
Day 1: Memory Hardening (3.1)
Day 2: Drop Files (3.2)
Day 3: Case Audit (3.3)
Day 4: AquaScan Fixes (3.4)
Day 5: Test Suite (4.1)
```

### Week 4: Validation -> 100%
```
Day 1-3: Real Door Testing (4.2)
Day 4-5: Edge cases, documentation
```

---

## Quick Reference

**Key Files:**
- `web/backend/src/amiga-emulation/api/DosLibrary.ts`
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
- `web/backend/src/amiga-emulation/api/FileManager.ts`
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`
- `web/backend/src/amiga-emulation/XIMProtocol.ts`

**MCP Tools:**
- `search_ndk_autodocs` - AmigaOS function specs
- `search_express_source` - express.e implementation
- `read_express_module` - Read by module

**Testing:**
- `./dev/scripts/test-all-68k-doors.sh`
- `npx tsx dev/scripts/test-door-install.ts <door>`
- `node web/backend/dist/scripts/run-amiga-door.js`

---

## Completed Milestones

- [x] Batch utilities (mtop, Bulls, WHO) - 2025-12-27
- [x] User file format 1:1 parity - 2025-12-27
- [x] AREXX doors 100% complete
- [x] XIM door basic functionality
- [x] QuickNew optimization (8 sec vs 20-30 min)
