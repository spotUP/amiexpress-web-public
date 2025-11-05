# Monolithic Files Analysis Report

**Date:** 2025-11-06
**Status:** Analysis Complete

## Files Requiring Modularization

### Critical (2000+ lines)

#### 1. `src/database.ts` - 2,985 lines ⚠️ CRITICAL
**Current state:** Single massive file handling all database operations

**Should be split into:**
- `src/database/index.ts` - Main Database class and exports
- `src/database/user-operations.ts` - User CRUD
- `src/database/message-operations.ts` - Message/conference operations
- `src/database/file-operations.ts` - File area operations
- `src/database/door-operations.ts` - Door management
- `src/database/qwk-operations.ts` - QWK/FTN operations
- `src/database/arexx-operations.ts` - AREXX script operations
- `src/database/session-operations.ts` - Session management
- `src/database/schema.ts` - Table definitions
- `src/database/migrations.ts` - Database migrations

**Estimated:** 10 focused modules of 250-350 lines each

---

#### 2. `src/index.ts` - 2,801 lines ⚠️ CRITICAL
**Current state:** Main application file with everything

**Should be split into:**
- `src/index.ts` - Express app setup, middleware, basic routes (300 lines)
- `src/server/socket-handler.ts` - Socket.IO connection logic
- `src/server/session-manager.ts` - BBSSession management
- `src/server/state-machine.ts` - BBS state machine logic
- `src/server/input-handler.ts` - User input processing
- `src/server/routes.ts` - HTTP route definitions
- `src/types/session.ts` - BBSSession interface (already partially done)

**Estimated:** 7 focused modules of 200-400 lines each

---

#### 3. `src/handlers/command.handler.ts` - 2,739 lines 🔴 HIGH
**Current state:** Massive command routing and processing

**Should be split into:**
- `src/handlers/command.handler.ts` - Main router (300 lines)
- `src/handlers/commands/internal-commands.ts` - A-Z internal commands
- `src/handlers/commands/syscmd-handler.ts` - SYSCMD routing
- `src/handlers/commands/bbscmd-handler.ts` - BBSCMD routing
- `src/handlers/commands/command-priority.ts` - Priority logic
- `src/handlers/commands/command-parser.ts` - Input parsing

**Estimated:** 6 modules of 300-500 lines each

---

#### 4. `src/doors/phreakWars.ts` - 2,378 lines 🔴 HIGH
**Current state:** Complete game implementation in one file

**Should be split into:**
- `src/doors/phreakWars/index.ts` - Main game loop
- `src/doors/phreakWars/game-state.ts` - State management
- `src/doors/phreakWars/player.ts` - Player operations
- `src/doors/phreakWars/combat.ts` - Battle system
- `src/doors/phreakWars/economy.ts` - Banking/trading
- `src/doors/phreakWars/events.ts` - Random events
- `src/doors/phreakWars/ui.ts` - Display rendering
- `src/doors/phreakWars/database.ts` - Game data persistence

**Estimated:** 8 modules of 250-350 lines each

---

#### 5. `src/amiga-emulation/XIMProtocol.ts` - 2,237 lines 🔴 HIGH
**Current state:** Complete XIM message handling protocol

**Should be split into:**
- `src/amiga-emulation/XIMProtocol/index.ts` - Main protocol class
- `src/amiga-emulation/XIMProtocol/message-types.ts` - Message type enums
- `src/amiga-emulation/XIMProtocol/parsers.ts` - Message parsing
- `src/amiga-emulation/XIMProtocol/handlers.ts` - Message handlers
- `src/amiga-emulation/XIMProtocol/serializers.ts` - Message serialization
- `src/amiga-emulation/XIMProtocol/constants.ts` - Protocol constants

**Estimated:** 6 modules of 300-400 lines each

---

### High Priority (1500-2000 lines)

#### 6. `src/arexx.ts` - 1,905 lines 🟡 MEDIUM
**Should be split into:**
- `src/arexx/index.ts` - Main interpreter
- `src/arexx/parser.ts` - AREXX syntax parsing
- `src/arexx/executor.ts` - Command execution
- `src/arexx/builtins.ts` - Built-in functions
- `src/arexx/variables.ts` - Variable management

---

#### 7. `src/doors/DoorManager.ts` - 1,668 lines 🟡 MEDIUM
**Should be split into:**
- `src/doors/DoorManager.ts` - Main manager
- `src/doors/amiga-door-scanner.ts` - Amiga door detection
- `src/doors/typescript-door-loader.ts` - TypeScript door loading
- `src/doors/door-validator.ts` - Door validation

---

#### 8. `src/amiga-emulation/api/DosLibrary.ts` - 1,568 lines 🟡 MEDIUM
**Should be split into:**
- `src/amiga-emulation/api/DosLibrary/index.ts`
- `src/amiga-emulation/api/DosLibrary/file-operations.ts`
- `src/amiga-emulation/api/DosLibrary/directory-operations.ts`
- `src/amiga-emulation/api/DosLibrary/lock-operations.ts`

---

### Medium Priority (1000-1500 lines)

#### 9. `src/handlers/file.handler.ts` - 1,038 lines
#### 10. `src/handlers/info-commands.handler.ts` - 1,002 lines
#### 11. `src/qwk.ts` - 946 lines
#### 12. `src/utils/lzx-extractor.ts` - 930 lines
#### 13. `src/handlers/internode-chat.handler.ts` - 925 lines

---

## Modularization Strategy

### Phase 1: Critical Infrastructure (Week 1)
1. **database.ts** - Split into 10 modules
2. **index.ts** - Split into 7 modules

### Phase 2: Core Handlers (Week 2)
3. **command.handler.ts** - Split into 6 modules
4. **phreakWars.ts** - Split into game modules

### Phase 3: Amiga Emulation (Week 3)
5. **XIMProtocol.ts** - Split into protocol modules
6. **DosLibrary.ts** - Split into DOS operation modules

### Phase 4: Supporting Files (Week 4)
7. **arexx.ts** - Split into interpreter modules
8. **DoorManager.ts** - Split into scanner/loader modules
9. Other 1000+ line files

---

## Benefits

- **Improved maintainability** - Smaller, focused modules
- **Better testing** - Test individual components
- **Parallel development** - Multiple devs can work simultaneously
- **Faster IDE performance** - Smaller files load faster
- **Better code review** - Easier to review smaller changes
- **Reduced cognitive load** - Understand one module at a time

---

## Guidelines for Modularization

### File Size Targets:
- ✅ **200-400 lines** - Ideal
- ⚠️ **400-600 lines** - Acceptable
- 🔴 **600+ lines** - Consider splitting

### Module Organization:
- Group related functionality
- Clear, descriptive file names
- Exports through index.ts barrel files
- Maintain single responsibility principle

### Testing:
- Each module should be testable independently
- Mock dependencies at module boundaries
- Unit tests for each module

---

## Status: ✅ Analysis Complete

### Totals:
- **13 monolithic files** identified
- **2000+ lines:** 5 files
- **1000-2000 lines:** 8 files

### Estimated Work:
- **50-60 new focused modules** to create
- **13 monolithic files** to refactor/remove
- **Net result:** Better organized codebase with ~60-70 well-structured modules

Next: Begin Phase 1 modularization
