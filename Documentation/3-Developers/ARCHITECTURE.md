# Architecture Overview (Summary)
**Comprehensive architecture notes, audits, and modularization plans now reside in `archive/` (see `DIRECTORY_STRUCTURE_ANALYSIS.md`, `SECURITY_FIXES.md`, `MODULARIZATION_REPORT.md`).**

## 1. Technology Stack
- **Frontend**: React 18 + TypeScript, two renderers. **xterm.js** renders ANSI screens (fonts `Topaz`/`mOsOul`) and also the legacy PETSCII-as-Unicode path (PUA glyphs from `PetMe64`, `packages/terminal/src/components/BBSTerminal.tsx`) for `petscii-output` text delivered to a session that is still on the ANSI surface. **PetsciiCanvas** (`packages/terminal/src/petscii/PetsciiCanvas.tsx`) is THE surface for a PETSCII session (web `P` answer): `BBSTerminal.tsx` hides xterm and routes every `ansi-output`/`petscii-output` string through one `AnsiToPetsciiTransducer` (SDK, `@amiexpress/bbs-door-sdk/petscii`) into a baud-paced queue feeding a `PetsciiMachine` (KERNAL-accurate 40x25 screen-code + color-RAM emulator, also in the SDK); `petscii-bytes` (raw `.seq`) are fed directly and `observe()`d by the transducer so its cursor/charset oracle stays in step, and a door that owns the terminal bypasses the pacing queue. Login echo goes through the same seam (`packages/terminal/src/utils/login-key-machine.ts`), canvas keys reach the server through the SDK's `petsciiInputToAscii`, and the surface is per session state (`packages/terminal/src/petscii/surface-state.ts`) - a later session answering `A` is plain xterm again.
- **Backend**: Node/Express + TypeScript handles command parsing, door management, and MCP-driven express.e references. PETSCII conversion: the SDK owns the core (`sdk/petscii/`: machine, palette, screen codes, transducer, keyboard input map, 40-column wrap); `web/backend/src/utils/petscii.util.ts` keeps the PUA renderer and thin wrappers, `web/backend/src/utils/petscii-unicode-map.ts` the screen-code -> Unicode fallback, and `web/backend/src/utils/c64-palette.ts` re-exports the SDK's VIC-II palettes (Colodore default, Pepto). Real C64 telnet callers get one transducer per session in `server/connection-emitter.ts` - prompts, menus and blessed door frames arrive as PETSCII with cursor, colors and reverse video intact; IAC doubling stays in the telnet transport. Prose is word-wrapped to the session width at the `emitText` choke (`web/backend/src/utils/wrap-for-session.util.ts`), gated on `session.petsciiMode` so 80-column output for every non-C64 platform stays byte-identical. Doors call `BBSApi.writePetscii(Buffer)` to emit `petscii-bytes` directly.
- **Database**: SQLite stores 110+ AmiExpress fields; migrations manage schema changes (see `DATABASE.md`).

**Known PETSCII limitations** (by design, not bugs): the C64 has no per-cell background, so ANSI background SGRs are dropped per cell - the screen background and border are global and follow the CCGMS terminal convention (`$02 <colour>` sets both, `$0E` blacks both, the terminal default is black rather than BASIC blue; see `thoughts/shared/research/2026-09-01_true-petscii-reference.md` section 3). Card suits, bullets, rounded corners and diagonals are bank-0-only glyphs and are substituted in the text bank; 80-column positioned UIs are reduced by the door adapter for 68K doors marked `C64_ADAPT` (the adapter replays the door's ANSI onto a virtual 80x25 grid and narrows each finished frame to 40 columns, columns kept side by side and any column that lost characters ending in `>`), and clamped to 40x25 otherwise (the 40-col plan's `MIN_COLUMNS` gate and table layouts decide which doors should reach a C64 at all); Ctrl/Cmd/Alt chords are deliberately not sent from the canvas (they stay browser shortcuts); `BBSApi.writePetsciiLine(Buffer)` still converts to the PUA/xterm path, not raw bytes; PETSCII screens bypass MCI codes and `~SP` screen-pause sequences (raw binary content, not text).

## 2. Core Services
- **Input Flow**: Inputs flow from Socket.io through `command.handler.ts` into the `BBSState` machine; commands map to express.e states and LVO functions referenced in `archive/EXPRESS_E_DEEP_AUDIT.md`.
- **Door Manager**: Supports XIM, SIM, TIM protocols; uses harness scripts and the type-safe `XIMProtocol.ts` command table.
- **AREXX Engine**: Interprets Amiga Arexx scripts; all phases (Discussions, `AREXX_PHASE2`, etc.) now archived to keep this summary lean.

## 3. Directory & Module Layout
- `web/backend/src` holds features organized into **feature-based subdirectories** (handlers/message, handlers/file, handlers/chat, etc.) after the Session 13 refactoring.
- **See `BACKEND_ARCHITECTURE.md`** for the complete directory structure, including 9 handler subdirectories, 38 services, and 11 database repositories.
- CLI tooling and script modules live under `dev/scripts` (see `BBS-CLI-IMPLEMENTATION.md` in the archive).
- Security modules use bcrypt, rate limiting, and session management; refer to `archive/BCRYPT_MIGRATION_COMPLETE.md` for upgrade reasoning.

## 4. Observability
- Logs (`logs/backend.log`, `logs/door-68k.log`, `STDERR`) provide the same debugging data express.e features when running under `DEBUG_XIM_OUTPUT=1` or the door harness.
- Use `Pick` commands to trace express.e's `JH_*` message flows, replicating the original 135 commands (highlighted in `archive/COMMAND_HANDLER_MODULARIZATION.md`).

**Next:** Keep this overview updated for new subsystems, but rely on the archived docs for in-depth reasoning.

---

## Merged from Backend Architecture

### Directory Structure

```
web/backend/src/
├── handlers/              # Request handlers (Socket.IO & HTTP)
│   ├── message/          # Message system handlers (4 files, 2,389 lines)
│   ├── file/             # File operations handlers (5 files, 3,183 lines)
│   ├── chat/             # Chat system handlers (6 files, 3,124 lines)
│   ├── commands/         # BBS command handlers (10 files, 5,431 lines)
│   ├── user/             # User management handlers (4 files, 2,556 lines)
│   ├── admin/            # Admin/utility handlers (3 files, 1,194 lines)
│   ├── content/          # Content display handlers (3 files, 939 lines)
│   ├── transfer/         # Transfer handlers (2 files, 758 lines)
│   ├── operations/       # BBS operations handlers (3 files, 698 lines)
│   ├── command-handler/  # Command infrastructure (3 files)
│   ├── command.handler.ts           # Core command routing (3,781 lines)
│   ├── door.handler.ts              # Door execution engine (2,168 lines)
│   ├── screen.handler.ts            # Screen rendering (1,648 lines)
│   └── command-execution.handler.ts # Command dispatcher (370 lines)
│
├── services/              # Business logic layer (38 files)
│   ├── arexx.service.ts           # AREXX interpreter (2,053 lines)
│   ├── qwk.service.ts             # QWK/REP offline mail (946 lines)
│   ├── node-manager.service.ts    # Node management (685 lines)
│   ├── config.service.ts          # Configuration service (1,673 lines)
│   ├── amiga-parser.service.ts    # Amiga data parsing
│   ├── amiga-export.service.ts    # Amiga data export
│   ├── batch-scheduler.ts         # Batch job scheduling
│   ├── import-*.service.ts        # Import services
│   └── ... (30+ more services)
│
├── database/              # Data access layer (11 repositories)
│   ├── BaseRepository.ts          # Base class for all repositories
│   ├── user-repository.ts         # User CRUD operations
│   ├── message-repository.ts      # Message CRUD operations
│   ├── file-repository.ts         # File CRUD operations
│   ├── conference-repository.ts   # Conference operations
│   ├── config-repository.ts       # Configuration storage
│   ├── chat-repository.ts         # Chat history
│   ├── session-repository.ts      # Session logs
│   ├── webhook-repository.ts      # Webhook management
│   └── ... (more repositories)
│
├── amiga-emulation/       # 68K emulator for running Amiga doors
│   ├── api/              # AmigaOS API implementation
│   ├── cpu/              # MOIRA 68000 CPU emulator
│   ├── session/          # Door session management
│   ├── xim/              # XIM protocol
│   └── loader/           # Binary loading
│
├── utils/                 # Utility functions (55 files)
│   ├── amigafs.ts        # Case-insensitive filesystem
│   ├── petscii.util.ts   # PETSCII conversion
│   ├── acs.util.ts       # Access Control System
│   ├── file-*.util.ts    # File utilities
│   ├── message-*.util.ts # Message utilities
│   └── ... (50+ more utilities)
│
├── constants/             # Static constants
│   ├── bbs-states.ts     # BBS state machine
│   ├── acs-codes.ts      # Access control codes
│   ├── ansi-codes.ts     # ANSI escape sequences
│   └── ... (7 files total)
│
├── types/                 # TypeScript type definitions
│   ├── amiga-import.ts   # Import types
│   ├── message-pointers.ts # Message system types
│   └── ... (5 files total)
│
├── server/                # Server setup and initialization
│   ├── initialization.ts # Data loading & dependency injection
│   ├── routes-setup.ts   # HTTP route registration
│   ├── socket-handlers.ts # Socket.IO event handlers
│   └── ... (more server modules)
│
├── middleware/            # Express middleware
├── nodes/                 # Node management
├── doors/                 # Door manager
├── amigaguide/           # AmigaGuide parser/viewer
├── api/                  # REST API routes
├── scripts/              # Build scripts
│
├── index.ts              # Main entry point (1,022 lines)
├── database.ts           # Legacy database (being replaced)
├── config.ts             # Configuration loader
└── types.ts              # Global types
```


### Layer Architecture

#### 1. Entry Point Layer
**File**: `index.ts`

Responsibilities:
- Express app initialization
- Socket.IO setup
- HTTP server creation
- Route registration
- Middleware configuration
- Server startup

#### 2. Handler Layer
**Directory**: `handlers/`

Organized by feature into 9 subdirectories plus 4 core handlers:

**Feature Subdirectories**:
- `message/` - Message reading, posting, scanning
- `file/` - File upload, download, listing, maintenance
- `chat/` - Sysop chat, group chat, internode chat
- `commands/` - BBS command implementations (10 handlers)
- `user/` - Registration, authentication, account management
- `admin/` - Admin tools, import, session logs
- `content/` - Bulletins, file viewing, search
- `transfer/` - Batch downloads, offline mail
- `operations/` - Conference ops, navigation, flags

**Core Handlers** (require express.e verification to split):
- `command.handler.ts` - Central command routing and dispatch
- `door.handler.ts` - Door execution engine
- `screen.handler.ts` - Screen rendering and MCI parsing
- `command-execution.handler.ts` - Command execution logic

#### 3. Service Layer
**Directory**: `services/`

Business logic and complex operations (38 files):

**Key Services**:
- **AREXX Interpreter** (`arexx.service.ts`) - Full AREXX language support
- **QWK/REP Mail** (`qwk.service.ts`) - Offline mail packet generation
- **Node Manager** (`node-manager.service.ts`) - Multi-node coordination
- **Configuration** (`config.service.ts`) - BBS configuration management
- **Import/Export** - Amiga BBS data migration
- **Batch Scheduler** - Scheduled tasks and batch jobs

#### 4. Database Layer
**Directory**: `database/`

Modular repository pattern (11 repositories):

Each repository extends `BaseRepository` and provides:
- CRUD operations for a specific entity type
- Type-safe query methods
- Transaction support
- Validation

**Repository Pattern Benefits**:
- Clear separation of data access
- Reusable query logic
- Easy to test
- Type safety

#### 5. Utility Layer
**Directory**: `utils/`

Shared utility functions (55 files):

**Categories**:
- **File Operations**: amigafs, file-diz, file-flag, archive extraction
- **Message System**: message-pointers, message-file
- **Security**: acs, permissions, screen-security
- **Amiga Compatibility**: petscii, amiga-command-parser
- **BBS Operations**: bbs-paths, download-ratios

#### 6. Amiga Emulation Layer
**Directory**: `amiga-emulation/`

68K CPU emulation for running Amiga binary doors:

**Components**:
- **CPU** - MOIRA 68000 emulator
- **API** - AmigaOS API implementation (dos.library, exec.library, etc.)
- **Session** - Door lifecycle and message handling
- **XIM** - Extended Interface Module protocol
- **Loader** - Amiga binary loading and relocation


### Design Patterns

#### 1. Dependency Injection (Clean Architecture)
**Used In**: All layers
**Container**: tsyringe

Dependencies are managed via a centralized DI container:

```typescript
// Container initialization (server/initialization.ts)
import { initializeContainer } from '../container';

initializeContainer({
  db,
  config,
  conferences,
  messageBases,
  // ... all dependencies
});

// Usage (backward compatible)
import { getDatabase, getConfig } from './command-handler/dependency-injection';
const db = getDatabase(); // Delegates to container

// Usage (future pattern)
@injectable()
class CommandHandler {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    @inject(DI_TOKENS.Config) private config: any
  ) {}
}
```

**See**: [CLEAN_ARCHITECTURE.md](ARCHITECTURE.md) for full details.

#### 2. Repository Pattern
**Used In**: `database/`

Separates data access logic from business logic. Each entity type has its own repository.

```typescript
class UserRepository extends BaseRepository {
  async getUserById(id: string): Promise<User | null>
  async createUser(data: CreateUserData): Promise<User>
  async updateUser(id: string, data: Partial<User>): Promise<void>
}
```

#### 3. Service Layer Pattern
**Used In**: `services/`

Complex business logic isolated from handlers and database.

**Benefits**:
- Reusable across handlers
- Framework-agnostic
- Easier to test
- Single responsibility

#### 4. Feature-Based Organization
**Used In**: `handlers/`

Handlers organized by BBS feature (messages, files, chat) rather than by technical layer.

**Benefits**:
- Easy to find related code
- Clear module boundaries
- Supports team specialization


### Data Flow

#### Typical Request Flow

```
1. Client (Socket.IO or HTTP)
   ↓
2. Handler (routes request)
   ↓
3. Service (business logic)
   ↓
4. Repository (data access)
   ↓
5. Database (SQLite)
   ↓
6. Repository (returns data)
   ↓
7. Service (processes data)
   ↓
8. Handler (formats response)
   ↓
9. Client (receives response)
```

#### Example: User Login

```
1. Client sends login credentials via Socket.IO
2. auth.handler.ts receives 'login' event
3. UserRepository.authenticateUser() called
4. Database query executed
5. Password verified with bcrypt
6. JWT token generated
7. Response sent to client
```


### Key Technologies

- **Runtime**: Node.js 18+ with TypeScript
- **Web Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: SQLite (via better-sqlite3)
- **Authentication**: JWT + bcrypt
- **Emulation**: MOIRA (68000 CPU emulator)
- **File Formats**: AmigaDOS, QWK/REP, AREXX
- **DI Container**: tsyringe (Clean Architecture implementation)


### Code Organization Principles

1. **Feature-Based Structure** - Code organized by BBS feature, not technical layer
2. **Separation of Concerns** - Clear boundaries between handlers, services, and repositories
3. **Single Responsibility** - Each module has one primary purpose
4. **Dependency Injection** - Loose coupling via injected dependencies
5. **Type Safety** - Full TypeScript coverage
6. **Modular Design** - Small, focused files (< 2000 lines guideline)


### Recent Refactoring (Session 13)

**Phase 2-4 Refactoring** reorganized 40 files (22,956 lines) into feature-based directories:

- Created 10 new subdirectories
- Moved 37 handler files into feature groups
- Moved 3 large services from root to services/
- Eliminated 1,873 lines through deduplication
- Maintained 0 TypeScript errors throughout

**Result**: Significantly improved code organization, maintainability, and navigability.


### Development Guidelines

1. **File Placement**:
   - Handlers → `handlers/{feature}/`
   - Business logic → `services/`
   - Data access → `database/`
   - Utilities → `utils/`
   - Types → `types/`

2. **File Size**:
   - Target: < 1000 lines
   - Warning: > 1500 lines
   - Refactor: > 2000 lines (unless core handler)

3. **Naming Conventions**:
   - Handlers: `{feature}.handler.ts`
   - Services: `{feature}.service.ts`
   - Repositories: `{entity}-repository.ts`
   - Utils: `{purpose}.util.ts`

4. **Import Organization**:
   - External imports first
   - Internal imports grouped by layer
   - Type imports separate

5. **Express.e Verification**:
   - Core handlers (command, door, screen) require express.e verification before major changes
   - Check MCP server for express.e source when implementing features


### Future Improvements

1. **Complete DI Migration**: Convert all handlers to use constructor injection with `@injectable()`
2. **Complete Database Migration**: Finish replacing legacy `database.ts` with repositories
3. **Split Core Handlers**: Further modularize command/door/screen handlers (requires express.e verification)
4. **Use Case Classes**: Create explicit use case services for complex operations
5. **API Documentation**: Generate OpenAPI/Swagger docs
6. **Performance Monitoring**: Add performance metrics
7. **Error Handling**: Standardize error handling across layers

**See [CLEAN_ARCHITECTURE.md](ARCHITECTURE.md) for Clean Architecture implementation details.**

---

**Note**: This architecture was established during the major Session 13 refactoring (Dec 2025). All movable code is now organized into logical feature-based directories.

---

## Merged from Clean Architecture Implementation

### Overview

AmiExpress-Web follows **pragmatic Clean Architecture** principles:
- Clear separation of layers (Handlers → Services → Repositories)
- Dependency inversion via DI container
- Business logic isolated from frameworks
- Testable, maintainable code structure

We adopt the **high-value** parts of Clean Architecture without dogmatic enforcement.


### Architecture Layers

```
┌──────────────────────────────────────────┐
│  Frameworks & Drivers (Express, Socket.IO)│
├──────────────────────────────────────────┤
│  Interface Adapters (Handlers)           │  ← Request/Response mapping
├──────────────────────────────────────────┤
│  Use Cases (Services)                    │  ← Business logic
├──────────────────────────────────────────┤
│  Domain (Types, Entities)                │  ← Core domain models
├──────────────────────────────────────────┤
│  Data Access (Repositories)              │  ← Database operations
└──────────────────────────────────────────┘
```

#### Layer 1: Frameworks & Drivers (index.ts, server/)
- Express app setup
- Socket.IO configuration
- HTTP server creation
- Route registration
- **Dependency**: None (outermost layer)

#### Layer 2: Interface Adapters (handlers/)
- Socket.IO event handlers
- HTTP request handlers
- Request validation
- Response formatting
- **Dependency**: Services (via DI container)

#### Layer 3: Use Cases (services/)
- Business logic
- Workflow orchestration
- Domain rule enforcement
- Framework-agnostic operations
- **Dependency**: Repositories

#### Layer 4: Domain (types/, constants/)
- TypeScript interfaces
- Domain entities
- Business constants
- Pure TypeScript (no dependencies)

#### Layer 5: Data Access (database/)
- Repository pattern
- CRUD operations
- Query logic
- **Dependency**: Database (SQLite)


### Dependency Injection Container

We use **tsyringe** for dependency injection, replacing the previous setter-based pattern.

#### Container Configuration

**File**: `src/container.ts`

```typescript
import 'reflect-metadata';
import { container } from 'tsyringe';

export const DI_TOKENS = {
  Database: Symbol.for('Database'),
  Config: Symbol.for('Config'),
  Conferences: Symbol.for('Conferences'),
  // ... more tokens
} as const;

// Initialize container at startup
export function initializeContainer(dependencies: {
  db: any;
  config: ConfigManager;
  // ... more deps
}) {
  container.registerInstance(DI_TOKENS.Database, dependencies.db);
  container.registerInstance(DI_TOKENS.Config, dependencies.config);
  // ... register all dependencies
}
```

#### Using the Container

**Initialization** (`server/initialization.ts`):
```typescript
import { initializeContainer } from '../container';

export async function initializeData() {
  // Load data
  const db = await loadDatabase();
  const config = new ConfigManager();
  const conferences = await loadConferences();

  // Initialize DI container
  initializeContainer({
    db,
    config,
    conferences,
    // ... all dependencies
  });
}
```

**Current Pattern** (backward compatible):
```typescript
// handlers/command.handler.ts
import { getDatabase, getConfig } from './command-handler/dependency-injection';

async function handleCommand(socket, session, command) {
  const db = getDatabase();
  const config = getConfig();
  // Use dependencies
}
```

**Future Pattern** (constructor injection):
```typescript
import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../container';

@injectable()
class CommandHandler {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    @inject(DI_TOKENS.Config) private config: any
  ) {}

  async handleCommand(socket, session, command) {
    // Use this.db, this.config
  }
}
```


### Migration Strategy

We're migrating **incrementally** to avoid breaking changes:

#### Phase 1: DI Container (COMPLETE ✓)
- Added tsyringe dependency
- Created `src/container.ts` with token-based registration
- Updated `tsconfig.json` for decorators
- Converted `dependency-injection.ts` to delegate to container
- Initialize container in `server/initialization.ts`
- All existing code still works (backward compatible)

#### Phase 2: Remove Direct Database Access (FUTURE)
- Create use case services for command execution, door management
- Move database logic from handlers to services
- Handlers become thin adapters

#### Phase 3: Constructor Injection (FUTURE)
- Convert handlers to classes with `@injectable()`
- Use `@inject()` decorators for dependencies
- Remove getter functions from `dependency-injection.ts`


### Benefits Achieved

#### 1. Testability
**Before**: Hard to test handlers (global state, setter functions)
```typescript
// Hard to test
let db: any;
export function setDatabase(database: any) { db = database; }
function handleCommand() { db.query(...); }
```

**After**: Easy to test (inject mocks)
```typescript
// Easy to test
@injectable()
class CommandHandler {
  constructor(@inject(DI_TOKENS.Database) private db: any) {}
}

// In tests
const mockDb = { query: jest.fn() };
container.registerInstance(DI_TOKENS.Database, mockDb);
```

#### 2. Clear Dependencies
**Before**: Hidden dependencies (global imports)
```typescript
// Hidden dependency on database.ts
import { db } from '../database';
function handleCommand() { db.query(...); }
```

**After**: Explicit dependencies (constructor parameters)
```typescript
// Clear what this handler needs
@injectable()
class CommandHandler {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    @inject(DI_TOKENS.Config) private config: any
  ) {}
}
```

#### 3. Flexibility
- Easy to swap implementations (e.g., SQLite → PostgreSQL)
- Mock dependencies for testing
- Hot-reload configuration changes

#### 4. Separation of Concerns
- Handlers: Request/response only
- Services: Business logic
- Repositories: Data access
- Each layer has single responsibility


### Design Patterns Used

#### 1. Dependency Injection
**Pattern**: Constructor injection via tsyringe
**Where**: All services and handlers (gradually migrating)
**Why**: Loose coupling, testability, flexibility

#### 2. Repository Pattern
**Pattern**: Data access abstraction
**Where**: `database/` directory (11 repositories)
**Why**: Isolate database logic, reusable queries

**Example**:
```typescript
class UserRepository extends BaseRepository {
  async getUserById(id: string): Promise<User | null> {
    return this.db.getUserById(id);
  }
}
```

#### 3. Service Layer Pattern
**Pattern**: Business logic in services
**Where**: `services/` directory (38 files)
**Why**: Reusable logic, framework-agnostic

**Example**:
```typescript
class MessageService {
  constructor(
    private messageRepo: MessageRepository,
    private userRepo: UserRepository
  ) {}

  async postMessage(userId: string, content: string) {
    const user = await this.userRepo.getUserById(userId);
    if (!user.canPost) throw new Error('No permission');
    return this.messageRepo.createMessage({ userId, content });
  }
}
```

#### 4. Adapter Pattern
**Pattern**: Convert between layers
**Where**: Handlers (convert Socket.IO events to service calls)
**Why**: Isolate framework details

**Example**:
```typescript
// Handler (adapter layer)
socket.on('post-message', async (data) => {
  const result = await messageService.postMessage(session.userId, data.content);
  socket.emit('message-posted', { success: true });
});
```


### File Organization

```
web/backend/src/
├── container.ts                    # DI container configuration
├── index.ts                        # App entry point
│
├── handlers/                       # Interface Adapters layer
│   ├── message/                   # Message handlers
│   ├── file/                      # File handlers
│   └── command-handler/
│       └── dependency-injection.ts # Backward-compatible DI adapter
│
├── services/                       # Use Cases layer
│   ├── arexx.service.ts
│   ├── qwk.service.ts
│   └── ... (38 files)
│
├── database/                       # Data Access layer
│   ├── BaseRepository.ts
│   ├── user-repository.ts
│   └── ... (11 repositories)
│
├── types/                         # Domain layer
│   ├── amiga-import.ts
│   └── message-pointers.ts
│
├── constants/                     # Domain layer
│   ├── bbs-states.ts
│   └── acs-codes.ts
│
└── server/                        # Initialization
    ├── initialization.ts          # DI container setup
    └── routes-setup.ts
```


### Comparison with Traditional Architecture

| Aspect | Traditional | Clean Architecture |
|--------|-------------|-------------------|
| **Dependencies** | Handlers import database directly | Handlers depend on services via DI |
| **Testing** | Hard (global state) | Easy (inject mocks) |
| **Business Logic** | Mixed in handlers | Isolated in services |
| **Database Access** | Scattered everywhere | Centralized in repositories |
| **Flexibility** | Hard to change tech | Easy to swap implementations |


### Guidelines for New Code

#### DO:
✓ Use DI container for all dependencies
✓ Put business logic in services
✓ Use repository pattern for data access
✓ Keep handlers thin (just adapters)
✓ Write tests with mocked dependencies

#### DON'T:
✗ Import database directly in handlers
✗ Put business logic in handlers
✗ Use global state or singletons
✗ Mix framework code with domain logic
✗ Skip dependency injection

#### Example: Adding a New Feature

**Task**: Add user profile update feature

**Step 1: Create Service (Use Case)**
```typescript
// services/user-profile.service.ts
@injectable()
export class UserProfileService {
  constructor(
    @inject(DI_TOKENS.Database) private db: any
  ) {}

  async updateProfile(userId: string, updates: ProfileUpdate) {
    // Validation
    if (!updates.username || updates.username.length < 3) {
      throw new Error('Username too short');
    }

    // Business logic
    const existingUser = await this.db.getUserByUsername(updates.username);
    if (existingUser && existingUser.id !== userId) {
      throw new Error('Username taken');
    }

    // Update
    return this.db.updateUser(userId, updates);
  }
}
```

**Step 2: Create Handler (Adapter)**
```typescript
// handlers/user/profile.handler.ts
import { container } from '../../container';
import { UserProfileService } from '../../services/user-profile.service';

export function registerProfileHandlers(io: Server) {
  io.on('connection', (socket) => {
    socket.on('update-profile', async (data) => {
      try {
        const service = container.resolve(UserProfileService);
        const result = await service.updateProfile(session.userId, data);
        socket.emit('profile-updated', { success: true, user: result });
      } catch (error) {
        socket.emit('profile-error', { message: error.message });
      }
    });
  });
}
```

**Step 3: Register in DI Container**
```typescript
// container.ts
container.register(UserProfileService, { useClass: UserProfileService });
```


### Testing Strategy

#### Unit Tests (Services)
```typescript
describe('UserProfileService', () => {
  let service: UserProfileService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      getUserByUsername: jest.fn(),
      updateUser: jest.fn()
    };
    service = new UserProfileService(mockDb);
  });

  it('should update profile', async () => {
    mockDb.getUserByUsername.mockResolvedValue(null);
    mockDb.updateUser.mockResolvedValue({ id: '1', username: 'newname' });

    const result = await service.updateProfile('1', { username: 'newname' });

    expect(result.username).toBe('newname');
    expect(mockDb.updateUser).toHaveBeenCalledWith('1', { username: 'newname' });
  });

  it('should reject duplicate username', async () => {
    mockDb.getUserByUsername.mockResolvedValue({ id: '2', username: 'taken' });

    await expect(
      service.updateProfile('1', { username: 'taken' })
    ).rejects.toThrow('Username taken');
  });
});
```

#### Integration Tests (Handlers)
```typescript
describe('Profile Handler', () => {
  let socket: any;
  let service: UserProfileService;

  beforeEach(() => {
    socket = { emit: jest.fn(), on: jest.fn() };
    service = container.resolve(UserProfileService);
    jest.spyOn(service, 'updateProfile');
  });

  it('should handle profile update', async () => {
    const handler = getProfileHandler();
    await handler(socket, { username: 'newname' });

    expect(service.updateProfile).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('profile-updated', expect.anything());
  });
});
```


### Future Improvements

1. **Full Constructor Injection**: Convert all handlers to classes with `@injectable()`
2. **Use Case Classes**: Create explicit use case classes for complex operations
3. **Domain Entities**: Add rich domain entities with behavior (e.g., User.changePassword())
4. **Architectural Tests**: Add tests to enforce layer boundaries
