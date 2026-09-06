# Clean Architecture Implementation

**Last Updated**: 2025-12-09

This document describes the Clean Architecture implementation in the AmiExpress-Web backend.

## Overview

AmiExpress-Web follows **pragmatic Clean Architecture** principles:
- Clear separation of layers (Handlers → Services → Repositories)
- Dependency inversion via DI container
- Business logic isolated from frameworks
- Testable, maintainable code structure

We adopt the **high-value** parts of Clean Architecture without dogmatic enforcement.

## Architecture Layers

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

### Layer 1: Frameworks & Drivers (index.ts, server/)
- Express app setup
- Socket.IO configuration
- HTTP server creation
- Route registration
- **Dependency**: None (outermost layer)

### Layer 2: Interface Adapters (handlers/)
- Socket.IO event handlers
- HTTP request handlers
- Request validation
- Response formatting
- **Dependency**: Services (via DI container)

### Layer 3: Use Cases (services/)
- Business logic
- Workflow orchestration
- Domain rule enforcement
- Framework-agnostic operations
- **Dependency**: Repositories

### Layer 4: Domain (types/, constants/)
- TypeScript interfaces
- Domain entities
- Business constants
- Pure TypeScript (no dependencies)

### Layer 5: Data Access (database/)
- Repository pattern
- CRUD operations
- Query logic
- **Dependency**: Database (SQLite)

## Dependency Injection Container

We use **tsyringe** for dependency injection, replacing the previous setter-based pattern.

### Container Configuration

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

### Using the Container

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

## Migration Strategy

We're migrating **incrementally** to avoid breaking changes:

### Phase 1: DI Container (COMPLETE ✓)
- Added tsyringe dependency
- Created `src/container.ts` with token-based registration
- Updated `tsconfig.json` for decorators
- Converted `dependency-injection.ts` to delegate to container
- Initialize container in `server/initialization.ts`
- All existing code still works (backward compatible)

### Phase 2: Remove Direct Database Access (FUTURE)
- Create use case services for command execution, door management
- Move database logic from handlers to services
- Handlers become thin adapters

### Phase 3: Constructor Injection (FUTURE)
- Convert handlers to classes with `@injectable()`
- Use `@inject()` decorators for dependencies
- Remove getter functions from `dependency-injection.ts`

## Benefits Achieved

### 1. Testability
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

### 2. Clear Dependencies
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

### 3. Flexibility
- Easy to swap implementations (e.g., SQLite → PostgreSQL)
- Mock dependencies for testing
- Hot-reload configuration changes

### 4. Separation of Concerns
- Handlers: Request/response only
- Services: Business logic
- Repositories: Data access
- Each layer has single responsibility

## Design Patterns Used

### 1. Dependency Injection
**Pattern**: Constructor injection via tsyringe
**Where**: All services and handlers (gradually migrating)
**Why**: Loose coupling, testability, flexibility

### 2. Repository Pattern
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

### 3. Service Layer Pattern
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

### 4. Adapter Pattern
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

## File Organization

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

## Comparison with Traditional Architecture

| Aspect | Traditional | Clean Architecture |
|--------|-------------|-------------------|
| **Dependencies** | Handlers import database directly | Handlers depend on services via DI |
| **Testing** | Hard (global state) | Easy (inject mocks) |
| **Business Logic** | Mixed in handlers | Isolated in services |
| **Database Access** | Scattered everywhere | Centralized in repositories |
| **Flexibility** | Hard to change tech | Easy to swap implementations |

## Guidelines for New Code

### DO:
✓ Use DI container for all dependencies
✓ Put business logic in services
✓ Use repository pattern for data access
✓ Keep handlers thin (just adapters)
✓ Write tests with mocked dependencies

### DON'T:
✗ Import database directly in handlers
✗ Put business logic in handlers
✗ Use global state or singletons
✗ Mix framework code with domain logic
✗ Skip dependency injection

### Example: Adding a New Feature

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

## Testing Strategy

### Unit Tests (Services)
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

### Integration Tests (Handlers)
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

## Future Improvements

1. **Full Constructor Injection**: Convert all handlers to classes with `@injectable()`
2. **Use Case Classes**: Create explicit use case classes for complex operations
3. **Domain Entities**: Add rich domain entities with behavior (e.g., User.changePassword())
4. **Architectural Tests**: Add tests to enforce layer boundaries

## References

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [tsyringe Documentation](https://github.com/microsoft/tsyringe)
- [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) - Directory structure
- [FILE_SIZE_GUIDELINES.md](./FILE_SIZE_GUIDELINES.md) - File organization

---

**Note**: This is a **pragmatic** implementation - we adopt high-value Clean Architecture principles without dogmatic purity. The goal is maintainable, testable code, not architectural perfection.
