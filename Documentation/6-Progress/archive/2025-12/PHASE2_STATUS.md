# Phase 2: File Organization - Status Report

**Date**: 2025-12-08
**Status**: IN PROGRESS

---

## Overview

Phase 2 focuses on splitting large files that violate the 2,000 line rule while maintaining 1:1 alignment with express.e sources.

---

## Files Requiring Splitting

### 1. command.handler.ts - 3,812 lines (PRIORITY 1)
**Status**: PARTIALLY MODULARIZED
**Location**: `/web/backend/src/handlers/command.handler.ts`

**Current Structure**:
- Main command routing logic: ~3,812 lines
- Already extracted to `/handlers/command-handler/`:
  - `command-execution.ts` (19.7KB) - Command execution logic
  - `core.ts` (14.6KB) - Core command processing
  - `input-handlers.ts` (19.1KB) - Input handling
  - `internal-commands.ts` (23.3KB) - Internal command implementations
  - `menu.ts` (5.7KB) - Menu display logic
  - `pre-login.ts` (7.5KB) - Pre-login command handling
  - `types.ts` (1.8KB) - Type definitions
  - `dependency-injection.ts` (2.3KB) - DI setup
  - `command-processing.ts` (3KB) - Command processing utilities
  - `input-helpers.ts` (2.3KB) - Input helper functions
  - `index.ts` (7.2KB) - Barrel exports

**Problem**: Main `command.handler.ts` still contains massive routing logic that should be split

**Proposed Refactoring**:
```
handlers/command/
├── command.handler.ts (main entry, ~300 lines)
├── command-router.ts (routing logic, ~600 lines)
├── command-state.ts (state management, ~400 lines)
└── [existing command-handler/ files remain]
```

**Critical Constraint**: MUST verify against express.e command module before splitting

**Actions Required**:
1. Analyze current command.handler.ts to identify routing vs execution logic
2. Extract routing logic to `command-router.ts`
3. Extract state management to `command-state.ts`
4. Reduce main file to thin entry point (~300 lines)
5. Verify all command flows still match express.e

---

### 2. index.ts - 2,474 lines (PRIORITY 2)
**Status**: MONOLITHIC
**Location**: `/web/backend/src/index.ts`

**Current Structure**:
- Single massive file containing:
  - Server setup
  - Express middleware
  - Route handlers
  - Socket.IO configuration
  - Initialization logic

**Proposed Refactoring**:
```
server/
├── index.ts (main entry, ~200 lines)
├── express-setup.ts (Express config, ~300 lines)
├── middleware-setup.ts (middleware, ~400 lines)
├── routes-setup.ts (routes, ~500 lines)
├── socket-setup.ts (Socket.IO, ~600 lines)
└── initialization.ts (startup, ~400 lines)
```

**Critical Constraint**: NO express.e verification needed (infrastructure only)

**Actions Required**:
1. Create `/server/` subdirectory
2. Extract Express setup to `express-setup.ts`
3. Extract middleware to `middleware-setup.ts`
4. Extract routes to `routes-setup.ts`
5. Extract Socket.IO to `socket-setup.ts`
6. Extract initialization to `initialization.ts`
7. Update main index.ts to orchestrate
8. Verify server starts and all routes work

---

### 3. Handler Organization (PRIORITY 3)
**Status**: SOMEWHAT ORGANIZED
**Location**: `/web/backend/src/handlers/`

**Current Issues**:
- 55+ handler files in flat structure
- Message handlers split across 4 files (2,389 lines total):
  - `message-entry.handler.ts` (802 lines)
  - `message-scan.handler.ts` (470 lines)
  - `messaging.handler.ts` (583 lines)
  - `message-commands.handler.ts` (534 lines)

**Proposed Organization**:
```
handlers/
├── command/           (command routing - already exists)
├── message/           (NEW - consolidate message handlers)
│   ├── message.handler.ts (main entry)
│   ├── message-entry.ts (composition)
│   ├── message-scan.ts (reading)
│   ├── message-commands.ts (command routing)
│   └── message-utils.ts (shared helpers)
├── file/              (NEW - consolidate file handlers)
│   ├── file.handler.ts
│   ├── file-listing.ts
│   └── file-maintenance.ts
├── door/
│   └── door.handler.ts
└── [other handlers remain]
```

**Actions Required**:
1. Create `message/` subdirectory
2. Move and consolidate 4 message handler files
3. Create `file/` subdirectory
4. Move file-related handlers
5. Update imports throughout codebase

---

## Phase 2 Progress Tracking

### ✅ Completed:
- Phase 1 infrastructure improvements (390+ lines saved)

### 🔄 In Progress:
- Analysis of command.handler.ts structure

### ⏳ Pending:
- Split command.handler.ts
- Split index.ts
- Organize handlers by feature
- Full validation and testing

---

## Risk Assessment

### Low Risk (Safe to proceed):
- **index.ts splitting**: Pure infrastructure, no BBS logic
- **Handler organization**: Moving files, updating imports

### Medium Risk (Requires careful testing):
- **command.handler.ts splitting**: Complex routing logic, but already partially modularized

### High Risk (Requires express.e verification):
- **Command routing changes**: MUST match express.e command priority and flow

---

## Testing Strategy

For each split:
1. **TypeScript Compilation**: Must pass `npx tsc --noEmit`
2. **Server Startup**: Must start without errors
3. **Command Testing**: Run `./dev/scripts/test-all-commands-quick.sh`
4. **Door Testing**: Run a sample door to verify routing
5. **Message Testing**: Test message entry/reading
6. **File Testing**: Test file upload/download

---

## Estimated Timeline

- **command.handler.ts splitting**: 2-3 hours (requires careful analysis)
- **index.ts splitting**: 1-2 hours (straightforward)
- **Handler organization**: 2-3 hours (mainly moving files)
- **Testing**: 1-2 hours (comprehensive validation)

**Total Phase 2**: 6-10 hours of focused work

---

## Next Steps

1. Complete analysis of command.handler.ts
2. Create refactoring plan with exact line ranges
3. Extract routing logic to new files
4. Run comprehensive tests
5. Commit and push

**Context Constraint**: Current session at ~110K/200K tokens
**Recommendation**: Save progress, continue in fresh session
