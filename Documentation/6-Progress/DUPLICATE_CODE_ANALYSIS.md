# Duplicate Code Analysis Report

**Date:** 2025-11-06
**Status:** Analysis Complete

## Executive Summary

Found **520-730 lines** of duplicate code across 6 major categories. High-priority consolidations identified in archive extractors, path utilities, and security checking.

## Critical Duplications

### 1. Archive Extraction Functions ⚠️ CRITICAL
**Impact:** 300-400 line reduction

**Duplicate implementations across 6 files:**
- `src/utils/lha-extractor.ts`
- `src/utils/zip-extractor.ts`
- `src/utils/lzx-extractor.ts` (768+ lines)
- `src/utils/tar-extractor.ts`
- `src/utils/dms-extractor.ts`
- `src/utils/lzh-parser.ts`

**Duplicated functions:**
- `extractFileDizFrom[Format]()` - FILE_ID.DIZ extraction logic (6x)
- `list[Format]Files()` - File listing (6x)
- `extractFileFrom[Format]()` - Generic extraction (3x)
- Case-insensitive filename matching (6x)

**Recommendation:**
Create unified `ArchiveExtractor` class with:
- Abstract interface for archive operations
- Shared FILE_ID.DIZ search logic
- Format-specific implementations as plugins

---

### 2. EXAMINE Command Execution 🔴 HIGH
**Impact:** 40-60 line reduction

**Duplicate in:**
- `src/utils/file-test.util.ts:221` - runExamineCommands()
- `src/utils/file-diz.util.ts:43` - runExamineCommands()

**Duplicated logic:**
- Loop through EXAMINE, EXAMINE1, EXAMINE2 commands
- Placeholder replacement (%f, %p, %w, %n)
- Timeout execution
- Error handling

**Recommendation:**
Single `runExamineCommands()` with configurable validator callback

---

### 3. Security/ACS Checking 🔴 HIGH
**Impact:** 100-150 line reduction

**Overlap in:**
- `src/utils/security.util.ts` - checkSecurity()
- `src/utils/acs.util.ts` - checkSecurity() (duplicate!)
- `src/utils/permissions.util.ts` - Hardcoded security levels

**Used in:** 31 handler files

**Recommendation:**
- Merge `security.util.ts` + `acs.util.ts`
- Make `permissions.util.ts` use centralized ACS
- Single source of truth for permission checking

---

### 4. Path Construction Functions 🟡 MEDIUM
**Impact:** 80-120 line reduction

**Duplicate getDirFilePath() in:**
- `src/utils/dir-file.util.ts:21`
- `src/utils/max-dirs.util.ts:41`
- `src/utils/dir-file-reader.util.ts:230`

**Other duplicate path functions:**
- `getConferenceDir()` - file-hold.util.ts:151
- `getHoldDir()` - multiple files
- `getNodeWorkDir()` - file-diz.util.ts:22
- `getPlaypenDir()` - file-diz.util.ts:27

**Recommendation:**
Create centralized `BBSPaths` utility module

---

## Implementation Plan

### Phase 1: High-Priority Consolidations
1. **Archive Extractors** - Create `src/utils/archive-extractor.ts`
2. **EXAMINE Runner** - Unify in `file-test.util.ts`
3. **Security** - Merge security.util + acs.util

### Phase 2: Medium-Priority
4. **Path Construction** - Create `src/utils/bbs-paths.util.ts`

### Files to Create:
- `src/utils/archive-extractor.ts`
- `src/utils/bbs-paths.util.ts`

### Files to Merge:
- `src/utils/security.util.ts` + `src/utils/acs.util.ts` → `src/utils/security.util.ts`

### Files to Refactor:
- All 6 archive extractors
- `file-test.util.ts` and `file-diz.util.ts`
- `permissions.util.ts`

## Benefits

- **520-730 lines** of code eliminated
- **Improved maintainability** - Bug fixes in one place
- **Better test coverage** - Fewer functions to test
- **Reduced cognitive load** - Single source of truth

## Status: ✅ Analysis Complete

Next step: Task 2 - Modularize monolithic files
