# Master Implementation Plan - 2025-12-16

## Overview

Complete implementation of all fixes from wiki analysis and diagnostic failures to achieve 100% AmiExpress compatibility.

**Total Tasks**: 50+
**Estimated Effort**: 3-4 days full implementation
**Priority**: Complete ALL items (CRITICAL, HIGH, MEDIUM)

---

## Phase 1: Fix BBSInfo Population (CRITICAL)

**Issue**: User data queries return garbage (getname, getlocation, getbbsname, dates)

### Tasks:
1.1. ✅ Document root cause analysis → BBSINFO_FINAL_FIX_PLAN.md
1.2. Implement post-register BBSInfo population hook
1.3. Add helper functions for date/time formatting
1.4. Test with diagnostic door
1.5. Verify all user data queries return correct values

### Files to Modify:
- `/web/backend/src/amiga-emulation/xim/io.ts` - Add post-register hook
- `/web/backend/src/amiga-emulation/session/door-info.util.ts` - Update implementation

**Success Criteria**:
```
[PASS] getname() = "sysop"
[PASS] getlocation() = "Server Room"
[PASS] getbbsname() = "AmiExpress-Web"
[PASS] GetTheDate() = "12/16/2025"
[PASS] GetTheTime() = "14:30:00"
```

---

## Phase 2: Fix AmigaDOS Library Functions

**Issue**: 6 DOS library functions failing in diagnostic tests

### 2.1 Implement ParentDir() - dos.library LVO -210
**What**: Get parent directory of a lock
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/ParentDir

### 2.2 Implement CreateDir() - dos.library LVO -120
**What**: Create a new directory
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/CreateDir

### 2.3 Implement SetProtection() - dos.library LVO -186
**What**: Set file protection bits
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/SetProtection

### 2.4 Implement SetComment() - dos.library LVO -180
**What**: Set file comment string
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/SetComment

### 2.5 Implement DeviceProc() - dos.library LVO -174
**What**: Get device process for a name
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/DeviceProc

### 2.6 Implement SetFileSize() - dos.library LVO -456
**What**: Change file size
**File**: `/web/backend/src/amiga-emulation/api/DosLibrary.ts`
**Reference**: NDK autodocs dos/SetFileSize

**Success Criteria**: All 6 DOS functions pass in diagnostic test

---

## Phase 3: Fix Exec Library Functions

### 3.1 Implement CopyMem() - exec.library LVO -630
**What**: Copy memory block (optimized)
**File**: `/web/backend/src/amiga-emulation/api/ExecLibrary.ts`
**Reference**: NDK autodocs exec/CopyMem

**Success Criteria**: `[PASS] CopyMem() copy memory block`

---

## Phase 4: Fix argv[0] Node Number

**Issue**: argv[0] contains door name, should contain node number

### Tasks:
4.1. Find where argv is populated for door execution
4.2. Change argv[0] from door name to node number string
4.3. Test with diagnostic door

**File**: `/web/backend/src/amiga-emulation/session/AmigaDoorSession.ts` (likely)

**Success Criteria**: `[PASS] argv[0] contains node number`

---

## Phase 5: Implement ~Dx MCI Terminator

**Issue**: ~Dx (dynamic terminator change) not implemented

### Tasks:
5.1. Parse ~Dx codes to extract terminator character
5.2. Store terminator in session state
5.3. Use custom terminator for subsequent MCI codes
5.4. Test with screen files using ~D

**File**: `/web/backend/src/handlers/screen.handler.ts`

**Example**:
```
~D.                  // Change terminator from | to .
~c3RED~c4GREEN.      // Now uses . instead of |
~D|                  // Change back to |
~c5BLUE~c6YELLOW|    // Back to normal
```

**Success Criteria**: Screen files with ~Dx render correctly

---

## Phase 6: HIGH Priority Wiki Fixes

### 6.1 SysCmd Integration

Implement 20+ system command hooks from wiki:

**Chat & Communication:**
- CHATIN, CHATOUT, FAX

**Editors:**
- EDITOR, FULLEDIT

**User Management:**
- ACCOUNTS, SCRIPT, NUPFAIL

**Files:**
- EXAMINE, EXAMINEn, LCFILES, FILECHECK

**Logon/Logoff:**
- FRONTEND, ANSI, N, LOGOFF, LOGOFFn, RELOGON, RELOGONn

**Security:**
- PWFAIL, SYSTEMPW, SYSPWDFAIL

**Status:**
- S (custom status door)

**Implementation**:
1. Create `/web/backend/src/services/syscmd.service.ts`
2. Define SysCmd hook interface
3. Implement hook execution at appropriate points:
   - Logon: FRONTEND, ANSI
   - Logoff: LOGOFF, LOGOFFn
   - Chat: CHATIN, CHATOUT
   - Upload: EXAMINE, FILECHECK
   - Etc.
4. Test each hook type

**Files**:
- NEW: `/web/backend/src/services/syscmd.service.ts`
- `/web/backend/src/handlers/command.handler.ts` - Call syscmd hooks
- `/web/backend/src/handlers/logon.handler.ts` - Logon/logoff hooks

### 6.2 Startup Sequence

Verify/fix startup sequence to match wiki:
1. Load Computer Types from COMPUTERLIST.INFO
2. Task Verification (check for duplicate nodes)
3. Load REXXSYSLIB.LIBRARY check
4. Modem initialization

**Main Loop State Machine** (check order):
1. Function key input (local keyboard)
2. Serial port data
3. AmiExpress_Node(x) msgport commands
4. Window gadget events
5. ACP (control panel) commands

**File**: `/web/backend/src/nodes/NodeManager.ts`

### 6.3 Missing Commands

Implement 25+ missing main menu commands:

**Numeric SysOp Commands:**
- [1] - Account Editing
- [2] - View CallersLog
- [3] - Edit File Directories
- [4] - Edit Any Text File
- [5] - List System Directories
- [0] - Remote Shell
- [DS] - Sysop Download
- [FM] - File Maintenance
- [US] - Sysop Upload
- [VS] - Sysop Text View

**User Commands:**
- [<<][>>] - Message Base Navigation
- [FR] - Reverse File Listings
- [FS] - Full Status View
- [MS] - Run Mailscan
- [OLM] - Send Online Message
- [Q] - Quiet Node
- [RZ] - Zmodem Upload
- [UP] - Display Uptime
- [VER] - Version Information
- [CF] - Conference Configuration
- [VO] - Voting Booth

**File**: `/web/backend/src/handlers/command.handler.ts`

**Implementation**: Use MCP tool to search express.e for each command, implement 1:1

### 6.4 ToolTypes Support

Add missing ToolType support:

**Node Configuration (NODE.INFO)**:
- SYSTEM_PASSWORD, NEWUSER_PASSWORD
- AUTOVAL_PRESET, AUTOVAL_DELAY, AUTOVAL_PASSWORD
- PLAYPEN, FTPPORT, FTPDATAPORT

**Access Control (ACCESS.INFO)**:
- ACS.OVERRIDE_DEFAULTS, ACS.NO_TIMEOUT
- ACS.OVERRIDE_TIMELIMIT, ACS.OVERRIDE_CHATLIMIT
- ACS.EALL_MESSAGES, ACS.PAGE_SYSOP

**BBS Config (BBSCONFIG.INFO)**:
- SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_SSL
- SYSOP_EMAIL, BBS_EMAIL
- MAIL_ON_*, EXECUTE_ON_*
- HISTORY, LANGUAGE_BASE

**Conference (CONF.INFO)**:
- FREEDOWNLOADS
- INTERNETNAME, REALNAME, USERNAME
- NO_NEWSCAN, FORCE_NEWSCAN
- FTP_*

**Files**: Multiple `.info` parser files

---

## Phase 7: MEDIUM Priority Wiki Fixes

### 7.1 QWK/REP Verification

Verify QWK packet format matches spec:
- MESSAGES.DAT format
- CONTROL.DAT content
- Numeric area IDs
- REP packet processing
- QWKCFG.INFO support

**File**: `/web/backend/src/services/qwk.service.ts`

### 7.2 Door Interface Documentation

Document AREXX and Traditional door interfaces:
- AREXX Interface (AIM) with REXXDOOR utility
- Traditional Interface with PARADOOR utility
- XIM Interface (already implemented)

**File**: NEW: `/Documentation/4-Door-Developers/DOOR_INTERFACES.md`

### 7.3 Path Verification

Verify all BBS paths match wiki specs:
```
BBS:COMPUTERLIST.INFO
BBS:Commands/BBSCmd/
BBS:Commands/NODE{x}CMD/
BBS:Commands/CONF{x}CMD/
BBS:Commands/SysCmd/
BBS:FCheck/
BBS:Protocols/
BBS:help/
BBS:BBSHELP.TXT
BBS:BULLHELP.TXT
BBS:utils/
BBS:ZOOM/
```

**File**: `/web/backend/src/utils/bbs-paths.util.ts`

---

## Implementation Order

### Week 1: Critical Fixes
**Days 1-2**:
- Phase 1: BBSInfo population ✓
- Phase 2: AmigaDOS functions
- Phase 3: Exec CopyMem
- Phase 4: argv[0] fix

**Day 3**:
- Phase 5: ~Dx MCI terminator
- Phase 6.1: SysCmd integration (start)

### Week 2: High Priority
**Days 4-5**:
- Phase 6.2: Startup sequence
- Phase 6.3: Missing commands (start - implement 10 most critical)

**Day 6**:
- Phase 6.3: Missing commands (continue)
- Phase 6.4: ToolTypes support

### Week 3: Medium Priority
**Day 7**:
- Phase 7.1: QWK/REP verification
- Phase 7.2: Door interface docs
- Phase 7.3: Path verification

---

## Testing Strategy

1. **After Each Phase**: Run diagnostic door, verify that phase's tests pass
2. **Continuous**: Keep diagnostic door output, compare before/after
3. **Integration**: Test with real doors (WHO, Bulls, etc.) after each major phase
4. **Regression**: Ensure previous phases still pass after new changes

---

## Success Metrics

- **Diagnostic Tests**: 100% pass rate (currently ~85%)
- **Wiki Compliance**: All documented features implemented
- **AmiExpress Compatibility**: Can run unmodified Amiga doors
- **Code Coverage**: All implemented features have tests

---

## Completion Checklist

- [ ] Phase 1: BBSInfo population (CRITICAL)
- [ ] Phase 2: AmigaDOS library functions (6 functions)
- [ ] Phase 3: Exec CopyMem function
- [ ] Phase 4: argv[0] node number fix
- [ ] Phase 5: ~Dx MCI terminator
- [ ] Phase 6.1: SysCmd integration (20+ hooks)
- [ ] Phase 6.2: Startup sequence verification
- [ ] Phase 6.3: Missing commands (25+)
- [ ] Phase 6.4: ToolTypes support
- [ ] Phase 7.1: QWK/REP verification
- [ ] Phase 7.2: Door interface documentation
- [ ] Phase 7.3: Path verification

**Total Progress**: 0 of 12 phases complete

---

**Created**: 2025-12-16
**Status**: Planning complete, ready for implementation
**Next Action**: Begin Phase 1 - BBSInfo population fix
