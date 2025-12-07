# AmiExpress Backend Modularization Guide

## Overview
This document tracks the modularization effort to transform the monolithic `index.ts` (3,618 lines) into a maintainable, modular architecture.

## Progress Summary

### ✅ Phase 1: Foundation (COMPLETED)
**Status:** Fully implemented and tested
**Impact:** Reduced code duplication, improved maintainability

#### Created Files:
1. **constants/ansi-codes.ts** (42 lines)
   - ANSI color codes and terminal control sequences
   - No bold text styles (following AmiExpress guidelines)
   - Cursor movement and line control

2. **constants/bbs-states.ts** (72 lines)
   - BBSState enum (AWAIT, LOGON, LOGGEDON)
   - LoggedOnSubState enum (50+ states)
   - SessionStatus enum

3. **utils/ansi.util.ts** (110 lines)
   - `AnsiUtil` class with formatting helpers
   - `colorize()`, `error()`, `success()`, `warning()`, `header()`
   - `pressKeyPrompt()`, `headerBox()`, `menuOption()`
   - Eliminates hardcoded ANSI escapes throughout codebase

4. **utils/error-handling.util.ts** (140 lines)
   - `ErrorHandler` class for standardized responses
   - `sendError()`, `sendSuccess()`, `sendWarning()`
   - `permissionDenied()`, `invalidInput()`, `notFound()`
   - Reduces ~30+ instances of duplicate error handling

5. **middleware/auth.middleware.ts** (36 lines)
   - JWT authentication middleware factory
   - `authenticateToken(db)` function
   - `AuthRequest` interface extension

6. **handlers/auth.handler.ts** (190 lines)
   - `AuthHandler` class
   - `login()`, `register()`, `refresh()` methods
   - Complete authentication business logic

#### Updated Files:
- **index.ts**: Removed ~200 lines, added modular imports
  - Removed duplicate enum definitions
  - Replaced inline auth code with handler
  - Cleaner, more maintainable structure

### 📊 Statistics

**Before Modularization:**
- index.ts: 3,618 lines (monolithic)
- database.ts: 2,264 lines (monolithic)
- Total: 7,928 lines across 6 files

**After Phase 1:**
- index.ts: ~3,450 lines (reduced by ~170 lines)
- New modular files: 6 files, ~590 lines
- Code duplication eliminated: ~30+ duplicate patterns
- **Reusability gained:** Utility functions can be used across all handlers

---

## 🔄 Phase 2: File Operations Handler (NEXT)

### Identified Functions (14 functions, ~1,100 lines)

#### Display Functions:
1. `displayFileAreaContents()` (lines 319-349) - Show files in an area
2. `displayFileList()` (lines 352-424) - Main file listing
3. `displayDirectorySelectionPrompt()` (lines 425-431) - Dir selection
4. `displaySelectedFileAreas()` (lines 432-459) - Show selected areas
5. `displayFileMaintenance()` (lines 460-495) - Maintenance menu
6. `displayFileStatus()` (lines 770-824) - File statistics
7. `displayNewFiles()` (lines 825-881) - New files since date
8. `displayNewFilesInDirectories()` (lines 882-1366) - New files by dir

#### Action Functions:
9. `handleFileDelete()` (lines 496-588) - Delete files
10. `handleFileMove()` (lines 589-674) - Move files
11. `handleFileSearch()` (lines 675-769) - Search for files
12. `handleFileDownload()` (lines 1367-1419) - Download file
13. `handleFileDeleteConfirmation()` (lines 3060-3109) - Confirm delete
14. `handleFileMoveConfirmation()` (lines 3110-3192) - Confirm move

### Recommended Structure:

```typescript
// handlers/file.handler.ts
export class FileHandler {
  constructor(
    private db: Database,
    private ansiUtil: AnsiUtil,
    private errorHandler: ErrorHandler
  ) {}

  // Display methods
  displayFileAreaContents(socket, session, area): void
  displayFileList(socket, session, params, reverse): void
  displayDirectorySelectionPrompt(socket, session, fileAreas, reverse, nonStop): void
  displaySelectedFileAreas(socket, session, fileAreas, dirSpan, reverse, nonStop): void
  displayFileMaintenance(socket, session, params): void
  displayFileStatus(socket, session, params): void
  displayNewFiles(socket, session, params): void
  displayNewFilesInDirectories(socket, session, searchDate, dirSpan, nonStop): void

  // Action methods
  handleFileDelete(socket, session, params): void
  handleFileMove(socket, session, params): void
  handleFileSearch(socket, session, params): void
  handleFileDownload(socket, session, fileIndex): void
  handleFileDeleteConfirmation(socket, session, input): void
  handleFileMoveConfirmation(socket, session, input): void
}
```

### Benefits:
- Reduce index.ts by ~1,100 lines (30% reduction)
- Centralize all file operations logic
- Easier to test file operations in isolation
- Can reuse AnsiUtil and ErrorHandler
- Consistent error handling across file operations

---

## 🔄 Phase 3: Message & Conference Handlers (PLANNED)

### Message Handler Functions (~250 lines):
- Message posting workflow
- Message reading
- Message threading
- Message search

### Conference Handler Functions (~150 lines):
- Conference joining
- Conference switching
- Conference scanning
- Bulletin display

---

## 🔄 Phase 4: Door, Chat & Account Handlers (PLANNED)

### Door Handler (~200 lines):
- Door listing
- Door execution
- Door session management

### Chat Handler (~250 lines):
- Sysop paging
- Chat sessions
- Multi-user chat rooms

### Account Handler (~200 lines):
- Password changes
- Settings management
- Statistics display

---

## 🔄 Phase 5: Database Repository Pattern (PLANNED)

### Split database.ts (2,264 lines → ~300 lines)

**Create Repositories:**
```
repositories/
├── base.repository.ts           # Base class with common patterns
├── user.repository.ts           # User CRUD (~200 lines)
├── message.repository.ts        # Message operations (~180 lines)
├── file.repository.ts           # File entry operations (~150 lines)
├── session.repository.ts        # Session management (~120 lines)
├── conference.repository.ts     # Conference/MessageBase (~130 lines)
├── chat.repository.ts           # OLM and internode chat (~280 lines)
└── network.repository.ts        # QWK/FTN operations (~140 lines)
```

**Remaining in database.ts:**
- Connection pool management
- Health check monitoring
- Reconnection logic
- Schema initialization
- Repository coordination

---

## Benefits Achieved (Phase 1)

### ✅ Code Quality
- **Eliminated ~30+ duplicate error handling patterns**
- **Centralized ANSI formatting** (no more `\x1b[31m` scattered everywhere)
- **Type safety improved** with proper interfaces and enums
- **Single Responsibility Principle** enforced

### ✅ Maintainability
- **Authentication logic isolated** - easier to update JWT implementation
- **Utility functions reusable** across all future handlers
- **Constants centralized** - single source of truth for states and colors
- **Easier debugging** - smaller, focused files

### ✅ Testability
- **AuthHandler can be unit tested** independently
- **AnsiUtil functions testable** without Socket.IO
- **ErrorHandler testable** without full app context
- **Middleware testable** with mocked database

### ✅ Collaboration
- **Multiple developers can work on different handlers** without conflicts
- **Clear file organization** - easy to find relevant code
- **Documented interfaces** - clear contracts between modules

---

## Estimated Final Impact

**When fully modularized:**
- index.ts: 3,618 lines → ~800 lines (78% reduction)
- database.ts: 2,264 lines → ~300 lines (87% reduction)
- Total new files: ~35 modular files (~200-400 lines each)
- Code duplication: Eliminated
- Maintainability: Significantly improved
- Test coverage potential: Greatly increased

---

## Next Steps

1. ✅ **Phase 1 complete** - Foundation solid, server running
2. ⏭️ **Phase 2** - Extract file operations handler (14 functions, ~1,100 lines)
3. ⏭️ **Phase 3** - Extract message & conference handlers (~400 lines)
4. ⏭️ **Phase 4** - Extract door, chat & account handlers (~650 lines)
5. ⏭️ **Phase 5** - Split database.ts into repositories (~1,900 lines to extract)

---

## Testing Strategy

After each phase:
1. **Verify server starts without errors** ✅ (Phase 1 complete)
2. **Test affected endpoints** (authentication working)
3. **Check for TypeScript compilation errors** (none)
4. **Validate functionality** (all features working)
5. **Monitor for regressions** (none detected)

---

## Migration Notes

### What's Safe to Use Now:
- `import { ANSI } from '../constants/ansi-codes'` ✅
- `import { AnsiUtil } from '../utils/ansi.util'` ✅
- `import { ErrorHandler } from '../utils/error-handling.util'` ✅
- `import { BBSState, LoggedOnSubState } from '../constants/bbs-states'` ✅
- `import { authenticateToken } from '../middleware/auth.middleware'` ✅
- `import { AuthHandler } from '../handlers/auth.handler'` ✅

### Example Usage:
```typescript
// Old way (scattered throughout codebase):
socket.emit('ansi-output', '\r\n\x1b[31mError message\x1b[0m\r\n');
socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
session.menuPause = false;
session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;

// New way (centralized, reusable):
ErrorHandler.sendError(socket, 'Error message', {
  showPrompt: true,
  nextState: LoggedOnSubState.DISPLAY_CONF_BULL,
  clearMenuPause: true
});
```

---

## Conclusion

Phase 1 establishes a solid foundation for the modularization effort. The authentication system is fully extracted and working, demonstrating the viability of this approach. Utility modules eliminate code duplication and provide reusable building blocks for future handlers.

The codebase is now ready for the next phase of extraction, with patterns established and proven through the successful authentication refactoring.
