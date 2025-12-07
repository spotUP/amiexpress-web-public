# RTW Door Documentation Index

Complete index of all RTW debugging documentation created during November 11, 2025 session.

---

## Start Here 🎯

**New to this issue?** Read these in order:

1. **RTW_COMPREHENSIVE_STATUS_20251111.md** (400+ lines)
   - Complete status report with all findings
   - Timeline of debugging attempts
   - Technical architecture diagrams
   - Recommended next steps
   - **READ THIS FIRST**

2. **RTW_NEXT_STEPS.md** (200+ lines)
   - Quick-start guide for future work
   - 5-minute tests to run first
   - Most likely issues and fixes
   - Time-boxed approach (stop after 2 hours)
   - **READ THIS SECOND**

3. **CURRENT_STATUS.md** (updated)
   - Project-wide status
   - 68K door work marked as PAUSED
   - Instructions to revert code changes

---

## Investigation Documents (Chronological)

These documents trace the debugging journey. Read for historical context only.

### RTW_EXIT_ROOT_CAUSE_20251111.md
- **Topic**: Initial investigation of RTW exit code 30
- **Finding**: RTW exits at PC 0x117C after byte-copy loop
- **Status**: Superseded by later findings

### RTW_TRUE_ROOT_CAUSE_20251111.md
- **Topic**: Corrected disassembly analysis
- **Finding**: No code corruption; RTW exits before reaching PutMsg calls
- **Key Lesson**: Always verify file offsets when disassembling
- **Status**: Partially correct

### RTW_LIBRARY_TRAP_BUG_20251111.md
- **Topic**: Library trap mechanism analysis
- **Finding**: PutMsg/Wait traps installed but never triggered
- **Comparison**: Other traps (AllocMem, FreeMem) work correctly
- **Status**: Misleading - traps work, RTW just doesn't call them

### RTW_FINAL_ROOT_CAUSE_20251111.md
- **Topic**: FindPort analysis
- **Finding**: FindPort("AEDoorPort2") is never called by RTW
- **Evidence**: Trap installed but never triggered
- **Hypothesis**: Initialization check fails, skips FindPort
- **Status**: Accurate - FindPort is indeed never called

### RTW_ABSOLUTE_ROOT_CAUSE_20251111.md
- **Topic**: Memory layout discovery
- **Finding**: RTW creates port at A4+0x450, tests A4+0x474 (different locations!)
- **Discovery**: Dead code at 0x1B0-0x1C0 that would set A4+0x474 is unreachable
- **Solution**: Port injection at both locations
- **Status**: Accurate - this IS a root cause, but not the ONLY cause

### RTW_WHO_STACK_CORRUPTION_FIX_20251111.md
- **Topic**: WHO door investigation (parallel to RTW)
- **Finding**: Stack corruption in WHO due to missing RTS handlers
- **Fix**: Added proper RTS sentinel and return path
- **Result**: WHO now reaches completion without crashes
- **Status**: WHO-specific, not applicable to RTW

### RTW_WHO_DBRA_LOOP_BUG_20251111.md
- **Topic**: DBRA loop investigation in WHO
- **Finding**: DBRA loop exits correctly, not the problem
- **Status**: Red herring

### RTW_NO_CODE_CORRUPTION_CONCLUSION_20251111.md
- **Topic**: Verification that RTW binary is not corrupted
- **Method**: Compared memory contents to file bytes
- **Result**: Perfect match - no corruption
- **Status**: Confirmed

---

## Technical Reference Documents

### AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
- **Topic**: Complete guide to AmigaDOS file I/O
- **Content**:
  - Open(), Read(), Write(), Close() specifications
  - FileHandle structure layout
  - Path resolution and file locking
  - Error codes and handling
- **Use**: Reference when implementing dos.library calls
- **Status**: Complete reference

### AMIGADOS_FILE_IO_PHASE_3_COMPLETE_20251111.md
- **Topic**: Phase 3 file I/O completion status
- **Completed**: Seek(), ExNext(), ExamineFH()
- **Status**: Historical record

### AMIGADOS_FILE_IO_PHASE_4_COMPLETE_20251111.md
- **Topic**: Phase 4 file I/O completion status
- **Completed**: Lock(), UnLock(), DupLock(), ParentDir()
- **Status**: Historical record

---

## Code Analysis Documents

### RTW_DOOR_DEBUGGING_SESSION_20251111.md
- **Topic**: RTW initialization code analysis
- **Content**: PC trace from 0x11CE to 0x124C (27 PCs)
- **Findings**: Path RTW takes before critical test
- **Status**: Raw data for analysis

### RTW_EARLY_EXIT_INVESTIGATION_20251111.md
- **Topic**: Why RTW exits before message loop
- **Findings**: Critical test at 0x124C determines exit vs IPC
- **Status**: Led to port injection solution

### RTW_RELOCATION_DEBUGGING_20251111.md
- **Topic**: Hunk relocation verification
- **Finding**: Relocations applied correctly
- **Status**: Ruled out relocation as cause

### RTW_CODE_CORRUPTION_BUG_20251111.md
- **Topic**: Investigation of suspected code corruption
- **Result**: No corruption found
- **Status**: False alarm

### RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md
- **Topic**: WHY both RTW and WHO produce no output
- **Findings**: Multiple potential causes listed
- **Status**: Speculative - needs testing

---

## Current Code State

### Modified Files

**web/backend/src/amiga-emulation/AmigaDoorSession.ts**
- Line 46: `private rtwPortInjected: boolean = false;`
- Lines 1061-1094: Port injection at PC 0x124C
  - Injects BBS door port at A4+0x44C (0xA0000)
  - Injects reply port at A4+0x450 and A4+0x474
- Lines 1096-1109: Debug logging at critical test

**To Revert**:
```bash
git checkout web/backend/src/amiga-emulation/AmigaDoorSession.ts
```

### Unchanged Files (No Fixes Needed)

- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Library implementations
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - Trap handlers
- `web/backend/src/amiga-emulation/loader/HunkLoader.ts` - Hunk loading
- `doors/RTW/rtw` - RTW binary (unchanged)
- `doors/WHO/who` - WHO binary (unchanged)

---

## Key Files for Future Work

### If Implementing FindPort

1. `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
   - Add `findPort(namePtr: number): number` method
   - Search `publicPorts` map, return address or 0

2. `web/backend/src/amiga-emulation/api/LibraryTraps.ts`
   - Add case for offset -390 (FindPort) in `handleExecTrap()`
   - Call `execLibrary.findPort()`, set D0 register

### If Testing WHO Door

1. Connect to BBS at http://localhost:5174
2. Login as sysop/sysop
3. Type: `/DOOR WHO`
4. Check `logs/backend.log` for output

### If Implementing Native TypeScript Doors

1. Create new directory: `web/backend/src/doors/native/`
2. Implement door logic in TypeScript
3. Use Socket.IO for BBS communication (no IPC emulation)
4. Register in `door.handler.ts`

---

## Test Commands

```bash
# Check recent RTW logs
tail -500 logs/backend.log | grep -E "RTW-FIX|CRITICAL-TEST|PutMsg" | tail -20

# Find port injection execution
grep "RTW-FIX.*Injecting" logs/backend.log | tail -5

# Check if FindPort ever called
grep "FindPort" logs/backend.log

# Verify AEDoorPort2 creation
grep "AEDoorPort2" logs/backend.log | tail -3

# See all library calls in last run
grep "INTERCEPTED" logs/backend.log | tail -30
```

---

## Quick Reference

### Memory Layout
```
A4+0x000: Port name string
A4+0x44C: BBS door port (AEDoorPort2) = 0xA0000
A4+0x450: RTW reply port (created) = varies
A4+0x474: RTW reply port (tested) = 0 (injected)
```

### Critical PCs
```
0x1068: Creates port, stores at A4+0x450
0x124C: Tests A4+0x474 - EXIT or IPC
0x1B0-0x1C0: Dead code (would set A4+0x474)
```

### Library Offsets
```
-366 (0xFE92): PutMsg
-318 (0xFEC2): Wait
-390 (0xFE7A): FindPort (not implemented)
-372: CreatePort
```

---

## Document Statistics

- **Total Documents**: 15 files
- **Total Lines**: 2,500+ lines of documentation
- **Key Documents**: 2 (Comprehensive Status, Next Steps)
- **Investigation Docs**: 8 chronological analysis files
- **Technical Refs**: 3 implementation guides
- **Code Modified**: 1 file (AmigaDoorSession.ts)

---

## Time Investment

- **Debugging**: 3-4 days intensive work
- **Issues Found**: 5+ separate problems
- **Fixes Implemented**: 3 major fixes
- **Working Result**: None (RTW still produces no output)
- **Documentation**: Complete and comprehensive

---

## Next Person Checklist

Before attempting any fixes:

- [ ] Read `RTW_COMPREHENSIVE_STATUS_20251111.md` completely
- [ ] Read `RTW_NEXT_STEPS.md` for quick-start
- [ ] Test WHO door (5 minutes)
- [ ] Check if FindPort needs implementing (15 minutes)
- [ ] Add IPC logging (10 minutes)
- [ ] Set 2-hour time limit
- [ ] If no progress in 2 hours, consider native rewrite or mark unsupported

**DO NOT**:
- Guess at solutions without understanding
- Add more PC-specific hacks
- Spend more than 2 hours without progress
- Skip testing simpler doors first

---

## Contact Points

**Questions About**:
- Overall status → Read `RTW_COMPREHENSIVE_STATUS_20251111.md`
- How to continue → Read `RTW_NEXT_STEPS.md`
- Memory layout → See `RTW_ABSOLUTE_ROOT_CAUSE_20251111.md`
- Port injection code → See `AmigaDoorSession.ts:1061-1094`
- Alternative approaches → See "Alternative Approaches" in Comprehensive Status

**This index last updated**: 2025-11-11
