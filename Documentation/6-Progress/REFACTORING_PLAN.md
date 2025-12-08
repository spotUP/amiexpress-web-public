# Refactoring and Optimization Plan

**Date**: 2025-12-08
**Status**: ANALYSIS COMPLETE - AWAITING IMPLEMENTATION

---

## ⚠️ CRITICAL CONSTRAINT

**MUST stay 1:1 with AmiExpress express.e sources when refactoring**

All refactoring MUST:
1. Preserve exact behavior from express.e
2. NOT change command logic or flow
3. NOT alter state transitions
4. Use MCP tools to verify against express.e before ANY changes
5. Only refactor code organization, NOT business logic

**What CAN be refactored:**
- File organization (move handlers to subdirectories)
- Extract duplicate code to utilities
- Consolidate repository boilerplate
- Clean up imports and exports
- Improve type definitions

**What CANNOT be refactored:**
- Command implementation logic (must match express.e)
- BBS state machine (must match express.e)
- Door execution flow (must match express.e)
- Message system logic (must match express.e)
- File operation sequences (must match express.e)

---

## Project Statistics

**Backend Codebase:**
- 542 TypeScript files
- 268,711 total lines
- Handlers: 55 files, 31,390 lines
- Services: 35 files, 15,770 lines
- Utils: 61 files, 12,301 lines
- Amiga Emulation: 42 files, 35,281 lines

**Files Violating 2,000 Line Rule:**
1. `DosLibrary.ts` - 4,952 lines (dos.library emulation)
2. `LibraryTraps.ts` - 3,910 lines (Amiga library call traps)
3. `command.handler.ts` - 3,812 lines (command routing)
4. `ExecLibrary.ts` - 3,263 lines (exec.library emulation)
5. `index.ts` - 2,474 lines (main server)
6. `database.ts` - 2,444 lines (database layer)
7. `DoorMessageHandler.ts` - 2,174 lines (XIM protocol)
8. `door.handler.ts` - 2,167 lines (door execution)
9. `arexx.ts` - 2,053 lines (AREXX interpreter)

---

## Phase 1: Safe Infrastructure Improvements (NO express.e changes)

### 1.1 Consolidate AmigaFS Implementation
**Impact**: High
**Risk**: Low
**Express.e Impact**: NONE - Pure utility consolidation

**Action:**
```bash
# Delete duplicate fs-amiga.util.ts
rm web/backend/src/utils/fs-amiga.util.ts
rm web/backend/src/utils/fs-amiga.util.js

# Find all imports and migrate to amigafs
grep -r "from.*fs-amiga.util" web/backend/src/
# Replace all with: import * as amigafs from '../utils/amigafs';
```

**Files to update:**
- Search for all `fs-amiga.util` imports
- Replace with `amigafs` imports
- Verify all tests pass

---

### 1.2 Extract Protocol Utilities
**Impact**: Medium
**Risk**: Low
**Express.e Impact**: NONE - Pure utility extraction

**Action:**
Create `web/backend/src/services/transfer-protocol.util.ts`:
```typescript
// CRC-16 calculation (from xmodem/ymodem)
export const CRC_POLY = 0x1021;
export function calculateCRC16(data: Buffer): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8);
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ CRC_POLY) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

// Protocol control characters
export const CONTROL_CHARS = {
  SOH: 0x01,  // Start of 128-byte block
  STX: 0x02,  // Start of 1024-byte block
  EOT: 0x04,  // End of transmission
  ACK: 0x06,  // Acknowledge
  NAK: 0x15,  // Negative acknowledge
  CAN: 0x18,  // Cancel
  SUB: 0x1A   // Substitute/EOF
} as const;
```

**Files to update:**
- `services/xmodem-transfer.service.ts` (remove CRC, import from util)
- `services/ymodem-transfer.service.ts` (remove CRC, import from util)

---

### 1.3 Create BaseRepository Class
**Impact**: Very High
**Risk**: Low
**Express.e Impact**: NONE - Pure database abstraction

**Action:**
Create `web/backend/src/database/BaseRepository.ts`:
```typescript
export abstract class BaseRepository<T> {
  constructor(protected db: any) {}

  protected requireDb(): void {
    if (!this.db) {
      throw new Error(`Database not initialized for ${this.constructor.name}`);
    }
  }

  protected prepare(sql: string) {
    this.requireDb();
    return this.db.prepare(sql);
  }

  protected run(sql: string, params: any[] = []): any {
    const stmt = this.prepare(sql);
    return stmt.run(...params);
  }

  protected get(sql: string, params: any[] = []): T | undefined {
    const stmt = this.prepare(sql);
    return stmt.get(...params);
  }

  protected all(sql: string, params: any[] = []): T[] {
    const stmt = this.prepare(sql);
    return stmt.all(...params);
  }
}
```

**Repositories to refactor (9 files):**
- `user-repository.ts`
- `file-repository.ts`
- `message-repository.ts`
- `conference-repository.ts`
- `session-repository.ts`
- `config-repository.ts`
- `webhook-repository.ts`
- `chat-repository.ts`
- `bulletin-repository.ts`

**Example refactor:**
```typescript
// Before
export class UserRepository {
  constructor(private db: any) {}

  async create(data: any): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(SQL);
    return stmt.run(...params);
  }
}

// After
export class UserRepository extends BaseRepository<User> {
  constructor(db: any) {
    super(db);
  }

  async create(data: any): Promise<any> {
    return this.run(SQL, params);
  }
}
```

**Estimated savings**: ~150+ lines of boilerplate

---

## Phase 2: File Organization (NO logic changes)

### 2.1 Split Large Files (CAREFULLY - Verify express.e alignment)

**Files to split:**

#### 2.1.1 command.handler.ts (3,812 lines)
**CRITICAL**: Verify against express.e before splitting

**Current structure:**
```
command.handler.ts (3,812 lines)
├── Command routing
├── Priority resolution (SYSCMD → BBSCMD → Internal)
├── State management
└── Input handling
```

**Proposed split:**
```
handlers/command/
├── command.handler.ts (main entry, ~300 lines)
├── command-router.ts (routing logic, ~400 lines)
├── command-priority.ts (priority resolution, ~300 lines)
├── command-state.ts (state management, ~400 lines)
└── command-input.ts (input handling, ~400 lines)
```

**VERIFY AGAINST**: `mcp__amiexpress-docs__read_express_module "commands"`

---

#### 2.1.2 DosLibrary.ts (4,952 lines)
**CRITICAL**: This is dos.library emulation - changes require NDK verification

**Current structure:**
```
DosLibrary.ts (4,952 lines)
├── File operations (Open, Close, Read, Write, Seek)
├── Directory operations (CreateDir, DeleteFile, Rename)
├── Lock/FileLock handling
├── Environment variables (GetVar, SetVar)
├── Path resolution (PathPart, FilePart, AddPart)
└── Process management (Execute, SystemTagList)
```

**Proposed split:**
```
amiga-emulation/api/dos/
├── DosLibrary.ts (main class, ~500 lines)
├── dos-file-ops.ts (file operations, ~800 lines)
├── dos-directory-ops.ts (directory ops, ~600 lines)
├── dos-lock-manager.ts (lock handling, ~700 lines)
├── dos-environment.ts (env vars, ~500 lines)
├── dos-path-utils.ts (path operations, ~600 lines)
└── dos-process.ts (process management, ~800 lines)
```

**VERIFY AGAINST**: `mcp__amiexpress-docs__search_ndk_autodocs "dos.library"`

---

#### 2.1.3 LibraryTraps.ts (3,910 lines)
**CRITICAL**: This is the 68K trap handler - extremely sensitive

**Current structure:**
```
LibraryTraps.ts (3,910 lines)
└── Giant switch statement for all library calls
```

**Proposed split:**
```
amiga-emulation/api/traps/
├── LibraryTraps.ts (main dispatcher, ~500 lines)
├── exec-traps.ts (exec.library traps, ~800 lines)
├── dos-traps.ts (dos.library traps, ~1000 lines)
├── icon-traps.ts (icon.library traps, ~400 lines)
├── intuition-traps.ts (intuition.library traps, ~600 lines)
└── utility-traps.ts (utility.library traps, ~400 lines)
```

**VERIFY AGAINST**: `mcp__amiexpress-docs__search_ndk_autodocs` for each library

---

#### 2.1.4 database.ts (2,444 lines)
**NOTE**: Being modularized, but still large

**Action**: Continue existing modularization effort
- Move remaining queries to appropriate repositories
- Keep only database initialization in main file

---

#### 2.1.5 index.ts (2,474 lines)
**Current structure:**
```
index.ts (2,474 lines)
├── Server setup
├── Middleware registration
├── Route handlers
├── Socket.IO handlers
└── Initialization
```

**Proposed split:**
```
server/
├── index.ts (main entry, ~200 lines)
├── express-setup.ts (Express config, ~300 lines)
├── middleware-setup.ts (middleware, ~400 lines)
├── routes-setup.ts (routes, ~500 lines)
├── socket-setup.ts (Socket.IO, ~600 lines)
└── initialization.ts (startup, ~400 lines)
```

**VERIFY**: NO express.e verification needed (server infrastructure only)

---

### 2.2 Consolidate Handler Structure

**Current structure:**
```
handlers/
├── command.handler.ts
├── message-entry.handler.ts
├── message-scan.handler.ts
├── messaging.handler.ts
├── message-commands.handler.ts
├── file.handler.ts
├── file-listing.handler.ts
├── file-maintenance.handler.ts
├── door.handler.ts
├── ... (55 files total)
```

**Proposed structure:**
```
handlers/
├── command/
│   ├── command.handler.ts
│   ├── command-router.ts
│   ├── command-priority.ts
│   └── command-state.ts
├── message/
│   ├── message.handler.ts
│   ├── message-entry.ts
│   ├── message-scan.ts
│   └── message-commands.ts
├── file/
│   ├── file.handler.ts
│   ├── file-listing.ts
│   └── file-maintenance.ts
├── door/
│   └── door.handler.ts
└── ... (organized by feature)
```

**VERIFY AGAINST**: express.e module structure

---

## Phase 3: Code Quality Improvements (NO behavior changes)

### 3.1 Improve Type Definitions
**Risk**: Low
**Express.e Impact**: NONE

**Action:**
- Add stricter types to function signatures
- Replace `any` with proper types where possible
- Add JSDoc comments for complex functions

---

### 3.2 Consolidate Error Handling
**Risk**: Low
**Express.e Impact**: NONE - Infrastructure only

**Action:**
- Use `ErrorHandler` utility consistently
- Standardize error messages
- Add error context where missing

---

### 3.3 Optimize Imports
**Risk**: Very Low
**Express.e Impact**: NONE

**Action:**
- Remove unused imports (careful verification)
- Organize imports (third-party → local → types)
- Use barrel exports where appropriate

---

## Implementation Strategy

### Stage 1: Infrastructure (1-2 days)
1. Consolidate AmigaFS
2. Extract protocol utilities
3. Create BaseRepository
4. Refactor 9 repositories

**Validation:**
- Run all tests: `npm test`
- Type check: `npx tsc --noEmit`
- Run BBS: `./dev/scripts/start-servers.sh`
- Test commands: `./dev/scripts/test-all-commands-quick.sh`

---

### Stage 2: File Organization (3-5 days)
1. Split `command.handler.ts` (verify against express.e)
2. Split `index.ts` (server infrastructure)
3. Organize handlers by feature

**Validation:**
- CRITICAL: Verify against express.e for command logic
- Run all tests
- Test all commands
- Test door execution
- Test message system

---

### Stage 3: Library Emulation (5-7 days) - HIGHEST RISK
1. Split `DosLibrary.ts` (verify against NDK)
2. Split `LibraryTraps.ts` (verify against NDK)
3. Split `ExecLibrary.ts` (verify against NDK)

**Validation:**
- CRITICAL: Test with vamos as ground truth
- Run all 68K doors: `./dev/scripts/test-all-68k-doors.sh`
- Verify door execution matches vamos output
- Check door logs for regressions

---

### Stage 4: Code Quality (2-3 days)
1. Improve type definitions
2. Consolidate error handling
3. Optimize imports

**Validation:**
- Type check passes
- All tests pass
- No behavior changes

---

## Success Metrics

**Code Health:**
- All files under 2,000 lines
- TypeScript strict mode enabled
- Zero `any` types in new code
- 90%+ test coverage for new utilities

**Behavior Preservation:**
- All commands work identically to before
- All doors execute correctly
- Message system functions properly
- No regressions in BBS functionality

**Maintainability:**
- Clear separation of concerns
- Consistent patterns across codebase
- Easy to locate and modify features
- Reduced code duplication (30-40% reduction)

---

## Risk Mitigation

### For Each Refactoring Step:
1. **Before**: Use MCP tools to verify express.e behavior
2. **During**: Make changes in small, testable increments
3. **After**: Run comprehensive test suite
4. **Validate**: Compare behavior with original implementation

### High-Risk Areas (Require Extra Verification):
- Command routing and priority (express.e:commands module)
- Door execution flow (express.e:doors module)
- Message system logic (express.e:messaging module)
- Library emulation (NDK 3.2R4 documentation)
- File operations (dos.library behavior)

### Emergency Rollback Plan:
- All changes committed in small, atomic commits
- Each commit includes validation results
- Can revert any step independently
- Git branches for major refactoring stages

---

## Conclusion

This refactoring plan focuses on **safe, incremental improvements** that:
- Preserve express.e behavior 100%
- Improve code organization and maintainability
- Reduce duplication and complexity
- Enable easier future development

**All changes must be verified against express.e sources using MCP tools.**

No business logic changes without explicit express.e verification.
