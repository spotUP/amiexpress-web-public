# Backend Architecture

**Last Updated**: 2025-12-09 (Session 13 - Post Refactoring)

This document describes the backend architecture after the major refactoring completed in Session 13.

## Directory Structure

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

## Layer Architecture

### 1. Entry Point Layer
**File**: `index.ts`

Responsibilities:
- Express app initialization
- Socket.IO setup
- HTTP server creation
- Route registration
- Middleware configuration
- Server startup

### 2. Handler Layer
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

### 3. Service Layer
**Directory**: `services/`

Business logic and complex operations (38 files):

**Key Services**:
- **AREXX Interpreter** (`arexx.service.ts`) - Full AREXX language support
- **QWK/REP Mail** (`qwk.service.ts`) - Offline mail packet generation
- **Node Manager** (`node-manager.service.ts`) - Multi-node coordination
- **Configuration** (`config.service.ts`) - BBS configuration management
- **Import/Export** - Amiga BBS data migration
- **Batch Scheduler** - Scheduled tasks and batch jobs

### 4. Database Layer
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

### 5. Utility Layer
**Directory**: `utils/`

Shared utility functions (55 files):

**Categories**:
- **File Operations**: amigafs, file-diz, file-flag, archive extraction
- **Message System**: message-pointers, message-file
- **Security**: acs, permissions, screen-security
- **Amiga Compatibility**: petscii, amiga-command-parser
- **BBS Operations**: bbs-paths, download-ratios

### 6. Amiga Emulation Layer
**Directory**: `amiga-emulation/`

68K CPU emulation for running Amiga binary doors:

**Components**:
- **CPU** - MOIRA 68000 emulator
- **API** - AmigaOS API implementation (dos.library, exec.library, etc.)
- **Session** - Door lifecycle and message handling
- **XIM** - Extended Interface Module protocol
- **Loader** - Amiga binary loading and relocation

## Design Patterns

### 1. Dependency Injection (Clean Architecture)
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

**See**: [CLEAN_ARCHITECTURE.md](./CLEAN_ARCHITECTURE.md) for full details.

### 2. Repository Pattern
**Used In**: `database/`

Separates data access logic from business logic. Each entity type has its own repository.

```typescript
class UserRepository extends BaseRepository {
  async getUserById(id: string): Promise<User | null>
  async createUser(data: CreateUserData): Promise<User>
  async updateUser(id: string, data: Partial<User>): Promise<void>
}
```

### 3. Service Layer Pattern
**Used In**: `services/`

Complex business logic isolated from handlers and database.

**Benefits**:
- Reusable across handlers
- Framework-agnostic
- Easier to test
- Single responsibility

### 4. Feature-Based Organization
**Used In**: `handlers/`

Handlers organized by BBS feature (messages, files, chat) rather than by technical layer.

**Benefits**:
- Easy to find related code
- Clear module boundaries
- Supports team specialization

## Data Flow

### Typical Request Flow

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

### Example: User Login

```
1. Client sends login credentials via Socket.IO
2. auth.handler.ts receives 'login' event
3. UserRepository.authenticateUser() called
4. Database query executed
5. Password verified with bcrypt
6. JWT token generated
7. Response sent to client
```

## Key Technologies

- **Runtime**: Node.js 18+ with TypeScript
- **Web Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: SQLite (via better-sqlite3)
- **Authentication**: JWT + bcrypt
- **Emulation**: MOIRA (68000 CPU emulator)
- **File Formats**: AmigaDOS, QWK/REP, AREXX
- **DI Container**: tsyringe (Clean Architecture implementation)

## Code Organization Principles

1. **Feature-Based Structure** - Code organized by BBS feature, not technical layer
2. **Separation of Concerns** - Clear boundaries between handlers, services, and repositories
3. **Single Responsibility** - Each module has one primary purpose
4. **Dependency Injection** - Loose coupling via injected dependencies
5. **Type Safety** - Full TypeScript coverage
6. **Modular Design** - Small, focused files (< 2000 lines guideline)

## Recent Refactoring (Session 13)

**Phase 2-4 Refactoring** reorganized 40 files (22,956 lines) into feature-based directories:

- Created 10 new subdirectories
- Moved 37 handler files into feature groups
- Moved 3 large services from root to services/
- Eliminated 1,873 lines through deduplication
- Maintained 0 TypeScript errors throughout

**Result**: Significantly improved code organization, maintainability, and navigability.

## Development Guidelines

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

## Future Improvements

1. **Complete DI Migration**: Convert all handlers to use constructor injection with `@injectable()`
2. **Complete Database Migration**: Finish replacing legacy `database.ts` with repositories
3. **Split Core Handlers**: Further modularize command/door/screen handlers (requires express.e verification)
4. **Use Case Classes**: Create explicit use case services for complex operations
5. **API Documentation**: Generate OpenAPI/Swagger docs
6. **Performance Monitoring**: Add performance metrics
7. **Error Handling**: Standardize error handling across layers

**See [CLEAN_ARCHITECTURE.md](./CLEAN_ARCHITECTURE.md) for Clean Architecture implementation details.**

---

**Note**: This architecture was established during the major Session 13 refactoring (Dec 2025). All movable code is now organized into logical feature-based directories.
