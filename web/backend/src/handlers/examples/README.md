# Handler Examples (Clean Architecture)

This directory contains example handlers demonstrating best practices for Clean Architecture.

## Modern Handler Pattern

**File**: `modern-handler.example.ts`

### Key Features

✓ **Class-based** with `@injectable()` decorator
✓ **Constructor injection** of dependencies
✓ **Thin adapter layer** - delegates to use cases
✓ **Easy to test** - inject mocks via constructor
✓ **Type-safe** - full TypeScript support

### Usage

```typescript
import { container } from '../../container';
import { ModernHandler } from './examples/modern-handler.example';

// In Socket.IO connection handler
io.on('connection', (socket) => {
  const handler = container.resolve(ModernHandler);
  handler.registerHandlers(socket, session);
});
```

### Testing

```typescript
describe('ModernHandler', () => {
  let handler: ModernHandler;
  let mockDb: any;

  beforeEach(() => {
    mockDb = { query: jest.fn(), save: jest.fn() };
    handler = new ModernHandler(mockDb, mockConfig);
  });

  it('should handle command', async () => {
    await handler.handleExampleCommand(mockSocket, mockSession, { value: 'test' });
    expect(mockDb.save).toHaveBeenCalled();
  });
});
```

## Migration Path for Existing Handlers

### Phase 1: Use Case Services (DONE ✓)
- Created `services/use-cases/` directory
- Extracted business logic to use case services
- Example: `AuthenticationUseCase`, `ChatRoomUseCase`

### Phase 2: Handler Classes (IN PROGRESS)
- Convert function-based handlers to classes
- Use `@injectable()` decorator
- Inject dependencies via constructor

**Example Conversion**:

**Before** (function-based):
```typescript
import { getDatabase, getConfig } from './command-handler/dependency-injection';

export async function handleCommand(socket, session, command) {
  const db = getDatabase();
  const config = getConfig();
  // Business logic mixed with handler
  const user = await db.authenticateUser(username, password);
  socket.emit('result', user);
}
```

**After** (class-based):
```typescript
import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../container';
import { AuthenticationUseCase } from '../services/use-cases/authentication.use-case';

@injectable()
export class CommandHandler {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    private authUseCase: AuthenticationUseCase
  ) {}

  async handleCommand(socket, session, command) {
    // Delegate to use case (business logic)
    const result = await this.authUseCase.authenticate(username, password);
    socket.emit('result', result);
  }
}
```

### Phase 3: Remove Legacy DI (FUTURE)
- Once all handlers are converted, remove `dependency-injection.ts`
- All dependencies injected via constructor
- No more global getters/setters

## Guidelines for New Handlers

### DO:
✓ Create handler as class with `@injectable()`
✓ Inject dependencies via constructor
✓ Keep handler thin (just adapter logic)
✓ Delegate business logic to use cases
✓ Write unit tests with mocked dependencies

### DON'T:
✗ Use global `getDatabase()`, `getConfig()` functions
✗ Put business logic in handlers
✗ Access database directly from handlers
✗ Create handlers as standalone functions
✗ Mix framework code with domain logic

## Benefits

1. **Testability**: Easy to inject mocks
2. **Clarity**: Explicit dependencies in constructor
3. **Maintainability**: Clear separation of concerns
4. **Flexibility**: Easy to swap implementations
5. **Type Safety**: Full TypeScript compile-time checking

## See Also

- [CLEAN_ARCHITECTURE.md](../../../Documentation/3-Developers/CLEAN_ARCHITECTURE.md) - Full guide
- [BACKEND_ARCHITECTURE.md](../../../Documentation/3-Developers/BACKEND_ARCHITECTURE.md) - Architecture overview
- `services/use-cases/` - Business logic layer
