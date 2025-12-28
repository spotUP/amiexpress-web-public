# LVO Offset Audit Report - CRITICAL ISSUES FOUND
**Date**: 2025-12-16
**Status**: 🚨 EMERGENCY - 25+ functions have WRONG offsets

## Executive Summary

Comprehensive audit of dos.library reveals **systematic offset errors** affecting 25+ functions. Nearly every V36+ buffered I/O function, path manipulation function, and CLI function has incorrect LVO offset.

**Impact**: HIGH - This causes:
- Diagnostic test failures
- Door crashes when calling common functions
- Incorrect function dispatch (calling wrong function)
- Memory corruption when parameters don't match

## dos.library Discrepancies

| Function | Our Offset | Official Offset | Severity | Notes |
|----------|------------|-----------------|----------|-------|
| **FOpen** | -588 | **-1302** | 🔴 CRITICAL | Off by 714! Wrong function called |
| **FClose** | -594 | **-1308** | 🔴 CRITICAL | Off by 714! |
| **FRead** | -600 | **-324** | 🔴 CRITICAL | Off by 276! |
| **FWrite** | -606 | **-330** | 🔴 CRITICAL | Off by 276! |
| **FGets** | -612 | **-336** | 🔴 CRITICAL | Off by 276! |
| **FPuts** | -618 | **-342** | 🔴 CRITICAL | Off by 276! |
| **FFlush** | -636 | **-360** | 🔴 CRITICAL | Off by 276! |
| **FGetC** | -642 | **-306** | 🔴 CRITICAL | Off by 336! |
| **FPutC** | -648 | **-312** | 🔴 CRITICAL | Off by 336! |
| **FSeek** | -678 | ❓ (not in table) | 🟡 UNKNOWN | May be V37+ or misnamed |
| **FTell** | -684 | ❓ (not in table) | 🟡 UNKNOWN | May be V37+ or misnamed |
| **FilePart** | -288 | **-870** | 🔴 CRITICAL | Off by 582! |
| **PathPart** | -294 | **-876** | 🔴 CRITICAL | Off by 582! |
| **AddPart** | -300 | **-882** | 🔴 CRITICAL | Off by 582! |
| **NameFromLock** | -324 | **-402** | 🔴 CRITICAL | Off by 78! Conflicts with FRead offset! |
| **NameFromFH** | -330 | **-408** | 🔴 CRITICAL | Off by 78! Conflicts with FWrite offset! |
| **Fault** | -390 | **-468** | 🔴 CRITICAL | Off by 78! |
| **PrintFault** | -396 | **-474** | 🔴 CRITICAL | Off by 78! Conflicts with GetProgramName! |
| **SetIoErr** | -348 | **-462** | 🔴 CRITICAL | Off by 114! |
| **GetCurrentDirName** | -462 | **-564** | 🔴 CRITICAL | Wrong func - should be GetCliCurrentDirName |
| **GetProgramName** | -474 | **-576** | 🔴 CRITICAL | Wrong func - should be GetCliProgramName, -474 is PrintFault! |
| **SetProgramDir** | -492 | **-594** | 🔴 CRITICAL | Off by 102! -492 is Cli() |
| **GetProgramDir** | -498 | **-600** | 🔴 CRITICAL | Off by 102! -498 is CreateNewProc() |
| **CheckSignal** | -834 | **-792** | 🟡 HIGH | Off by 42 |
| **FreeArgs** | -810 | **-858** | 🟡 HIGH | Off by 48 |
| **FindVar** | -924 | **-918** | 🟡 HIGH | Off by 6 |
| **ReadArgs** | -804 | **-798** | 🟡 HIGH | Off by 6 |

## Patterns Identified

### Pattern 1: Buffered I/O Functions (V36+)
**ALL buffered I/O functions have wrong offsets**, consistently off by ~276-714:
- FOpen through FPuts: Off by 276
- FGetC/FPutC: Off by 336
- FOpen/FClose: Off by 714 (most severe!)

### Pattern 2: Path Manipulation Functions
**ALL path functions off by 582**:
- FilePart, PathPart, AddPart consistently wrong

### Pattern 3: Name Functions
**ALL name functions off by 78**:
- NameFromLock, NameFromFH, Fault, PrintFault

### Pattern 4: CLI Functions
**ALL CLI functions off by 102**:
- GetProgramDir, SetProgramDir wrong
- Function name errors (GetProgramName vs GetCliProgramName)

## Root Cause Analysis

These systematic offsets suggest:
1. **Wrong SDK version**: Our offsets may be from V34 or earlier
2. **Documentation error**: Original implementation used wrong source
3. **Manual calculation error**: Someone calculated offsets incorrectly

The official table is from **AmigaOS SDK 3.9/3.2R4** which is the standard.

## Impact Assessment

**Functions Affected**: 25+
**Doors Impacted**: ANY door using:
- Buffered file I/O (most doors)
- Path manipulation (most doors)
- CLI argument parsing (many doors)
- Variable access (some doors)

**Severity**:
- 🔴 CRITICAL (20 functions): Wrong function called, crashes likely
- 🟡 HIGH (5 functions): Minor offset errors
- ❓ UNKNOWN (2 functions): May be V37+ or misnamed

## Recommended Fix Strategy

### Phase 1: IMMEDIATE (High Risk Functions)
Fix buffered I/O functions first (most commonly used):
1. FOpen: -588 → -1302
2. FClose: -594 → -1308
3. FRead: -600 → -324
4. FWrite: -606 → -330
5. FGets: -612 → -336
6. FPuts: -618 → -342
7. FGetC: -642 → -306
8. FPutC: -648 → -312
9. FFlush: -636 → -360

### Phase 2: Path & Name Functions
10. FilePart: -288 → -870
11. PathPart: -294 → -876
12. AddPart: -300 → -882
13. NameFromLock: -324 → -402
14. NameFromFH: -330 → -408
15. Fault: -390 → -468
16. PrintFault: -396 → -474

### Phase 3: CLI & Misc Functions
17. SetIoErr: -348 → -462
18. GetCurrentDirName: -462 → -564 (rename to GetCliCurrentDirName)
19. GetProgramName: -474 → -576 (rename to GetCliProgramName)
20. SetProgramDir: -492 → -594
21. GetProgramDir: -498 → -600
22. CheckSignal: -834 → -792
23. FreeArgs: -810 → -858
24. FindVar: -924 → -918
25. ReadArgs: -804 → -798

### Phase 4: Verification
- Check for offset conflicts (multiple functions at same offset)
- Verify old offsets aren't used by any doors
- Re-run diagnostic tests

## Conflict Resolution

**Offset Conflicts to Resolve:**
- -324: Currently NameFromLock, needs to be FRead, move NameFromLock to -402
- -330: Currently NameFromFH, needs to be FWrite, move NameFromFH to -408
- -474: Currently GetProgramName, needs to be PrintFault, move GetProgramName to -576
- -492: Currently SetProgramDir, needs to be Cli, move SetProgramDir to -594
- -498: Currently GetProgramDir, needs to be CreateNewProc, move GetProgramDir to -600

## Next Steps

1. ✅ Create this audit report
2. ⏳ Fix all 25+ offsets systematically
3. ⏳ Check for missing functions (functions in official table but not implemented)
4. ⏳ Verify TypeScript compilation
5. ⏳ Re-test with diagnostic door
6. ⏳ Audit exec.library (similar issues likely)
7. ⏳ Audit other libraries

## Estimated Fix Time

- Fix all dos.library offsets: 1-2 hours
- Test and verify: 30 minutes
- exec.library audit and fix: 1 hour
- Other libraries: 30 minutes

**Total**: 3-4 hours for complete LVO audit and fixes

---

**Priority**: 🔴 BLOCKING - Must fix before any other features
**Severity**: CRITICAL - Affects door compatibility fundamentally
