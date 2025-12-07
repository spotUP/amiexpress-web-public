# AmiExpress SDK Test Suite

Comprehensive test coverage for the BBS Door SDK.

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode (auto-rerun on changes)
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── graphics-engine.test.ts
│   ├── input-engine.test.ts
│   ├── physics-engine.test.ts
│   └── audio-engine.test.ts
│
└── integration/             # Integration tests for multiple components
    ├── game-loop.test.ts
    └── multiplayer.test.ts
```

## Writing Tests

### Unit Tests

Test individual components in isolation:

```typescript
import { GraphicsEngine } from '../../engines/graphics/graphics-engine';

describe('GraphicsEngine', () => {
  let gfx: GraphicsEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
  });

  test('should draw text', () => {
    gfx.drawText(10, 10, 'Hello', AnsiColor.White);
    const output = gfx.render();
    expect(output).toContain('Hello');
  });
});
```

### Integration Tests

Test multiple components working together:

```typescript
describe('Game Loop Integration', () => {
  let gfx: GraphicsEngine;
  let physics: PhysicsEngine;
  let input: InputEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
    physics = new PhysicsEngine({ gravity: { x: 0, y: 9.8 } });
    input = new InputEngine();
  });

  test('should move player with input', () => {
    // Create player physics body
    const player = physics.createBody({
      id: 'player',
      position: { x: 10, y: 10 },
      size: { width: 2, height: 2 },
      mass: 1
    });

    // Bind controls
    input.bindAction('left', 'ArrowLeft', () => {
      physics.applyForce('player', { x: -10, y: 0 });
    });

    // Simulate input
    input.processInput({
      key: 'ArrowLeft',
      ctrl: false,
      alt: false,
      shift: false,
      code: 37
    });

    physics.update(0.016);

    expect(player.velocity.x).toBeLessThan(0);
  });
});
```

## Coverage Goals

- **Unit Tests**: 80% code coverage minimum
- **Integration Tests**: All critical user paths
- **Performance Tests**: Key operations under expected thresholds

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Pull requests
- Main branch merges

## Best Practices

1. **Test Naming**: Use descriptive test names
   - ✅ `should move sprite when position changes`
   - ❌ `test1`

2. **Arrange-Act-Assert**: Structure tests clearly
   ```typescript
   test('should apply gravity', () => {
     // Arrange
     const body = physics.createBody({...});

     // Act
     physics.update(1);

     // Assert
     expect(body.position.y).toBeGreaterThan(0);
   });
   ```

3. **Test Isolation**: Each test should be independent
   - Use `beforeEach()` for setup
   - Don't rely on test execution order

4. **Mock External Dependencies**:
   - Mock BBS connections
   - Mock file system operations
   - Mock network calls

## Debugging Tests

```bash
# Run a specific test file
npm test graphics-engine.test.ts

# Run tests matching a pattern
npm test -- -t "should draw text"

# Run with verbose output
npm test -- --verbose
```

## Performance Testing

Performance thresholds:
- Graphics render: < 16ms (60fps)
- Physics update: < 8ms
- Input processing: < 1ms

Example performance test:

```typescript
test('should render under 16ms', () => {
  const start = Date.now();

  gfx.clear();
  gfx.drawSprite('player');
  gfx.render();

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(16);
});
```

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure all tests pass
3. Maintain coverage above 80%
4. Add integration tests for user-facing features
