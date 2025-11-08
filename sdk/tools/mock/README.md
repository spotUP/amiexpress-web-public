### Mock Data Provider for Door Development

This module provides a sandboxed testing environment for BBS doors, allowing you to develop and test without a full BBS infrastructure.

## Features

- **Mock Users**: Simulate user connections with customizable properties
- **Mock File System**: Sandboxed file storage for door data
- **Auto-Connect**: Automatically connect a test user on door start
- **Input Simulation**: Send keyboard input to doors programmatically
- **Development Sessions**: Easy setup and cleanup for testing

## Quick Start

### Basic Usage

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';
import { setupMockDevelopment } from '@amiexpress/bbs-door-sdk/tools/mock';

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
});

// Set up mock development mode
setupMockDevelopment(door, {
  name: 'TestUser',
  securityLevel: 100,
  timeLeft: 60
});

door.onConnect((user) => {
  console.log(`User ${user.name} connected!`);
  door.send(`Welcome, ${user.name}!`);
});

door.start(); // Auto-connects TestUser
```

### Advanced Usage

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';
import { MockDataProvider } from '@amiexpress/bbs-door-sdk/tools/mock';

const door = new Door({ name: 'Test Door' });
const mockData = new MockDataProvider({
  verbose: true,
  dataDir: './.test-data',
  enableMockFS: true
});

door.onConnect((user) => {
  console.log(`Connected: ${user.name}`);
});

// Create and connect a mock user
door.start();
const user = mockData.simulateUserConnect(door, {
  name: 'AdminUser',
  securityLevel: 255
});

// Simulate input
setTimeout(() => {
  mockData.simulateInput(door, user.id, 'A');
  mockData.simulateInput(door, user.id, 'Enter');
}, 1000);

// Simulate disconnect after 5 seconds
setTimeout(() => {
  mockData.simulateDisconnect(door, user.id);
}, 5000);
```

## API Reference

### `setupMockDevelopment(door, userOptions, config)`

Quick helper to set up mock development environment.

**Parameters:**
- `door`: Door instance
- `userOptions`: Mock user properties (name, securityLevel, etc.)
- `config`: Mock data provider configuration

**Returns:** MockDataProvider instance

### `MockDataProvider`

#### Constructor Options

```typescript
new MockDataProvider({
  dataDir: './.mock-data',      // Directory for mock file storage
  autoConnect: true,             // Auto-connect user on start
  defaultUser: {},               // Default user properties
  enableMockFS: true,            // Enable mock file system
  verbose: false                 // Enable logging
})
```

#### Methods

##### `createMockUser(options)`
Create a mock user with custom properties.

```typescript
const user = mockData.createMockUser({
  name: 'TestUser',
  securityLevel: 50,
  timeLeft: 30
});
```

##### `simulateUserConnect(door, options)`
Simulate a user connecting to the door.

```typescript
const user = mockData.simulateUserConnect(door, {
  name: 'Player1',
  securityLevel: 100
});
```

##### `simulateInput(door, userId, key)`
Simulate keyboard input from a user.

```typescript
mockData.simulateInput(door, user.id, 'A');
mockData.simulateInput(door, user.id, 'Enter');
mockData.simulateInput(door, user.id, 'ArrowUp');
```

##### `simulateDisconnect(door, userId)`
Simulate a user disconnecting.

```typescript
mockData.simulateDisconnect(door, user.id);
```

##### `readMockFile(filename)` / `writeMockFile(filename, content)`
Read/write mock files (sandboxed to data directory).

```typescript
mockData.writeMockFile('highscores.json', JSON.stringify(scores));
const data = mockData.readMockFile('highscores.json');
```

##### `createDevSession(door, userOptions)`
Create a development session with auto-cleanup.

```typescript
const { user, cleanup } = mockData.createDevSession(door, {
  name: 'DevUser',
  securityLevel: 255
});

// ... test your door ...

cleanup(); // Clean up when done
```

## Mock User Properties

```typescript
interface MockUserOptions {
  id?: number;              // User ID (auto-generated if not provided)
  name?: string;            // User name
  realName?: string;        // Real name
  location?: string;        // Location
  securityLevel?: number;   // Security level (0-255)
  timeLeft?: number;        // Time left in minutes
  uploads?: number;         // Upload count
  downloads?: number;       // Download count
  posts?: number;           // Post count
  lastCall?: Date;          // Last call date
  flags?: string[];         // User flags
}
```

## Examples

### Testing with Multiple Users

```typescript
const mockData = new MockDataProvider();

door.start();

const user1 = mockData.simulateUserConnect(door, { name: 'Player1' });
const user2 = mockData.simulateUserConnect(door, { name: 'Player2' });

// Simulate a game session
mockData.simulateInput(door, user1.id, 'A');
mockData.simulateInput(door, user2.id, 'B');
```

### File System Testing

```typescript
const mockData = new MockDataProvider({
  enableMockFS: true,
  dataDir: './.test-data'
});

// Write mock data
mockData.writeMockFile('config.json', JSON.stringify({ theme: 'dark' }));

// Read it back
const config = JSON.parse(mockData.readMockFile('config.json')!);

// List all files
const files = mockData.listMockFiles();
console.log('Mock files:', files);

// Clean up
mockData.clearAll();
```

### Integration with Preview Server

The preview server automatically uses MockDataProvider when running doors in development mode. No additional setup required!

```bash
npm run preview
# Opens browser, select your door
# Mock user auto-connects for testing
```

## Best Practices

1. **Use Realistic Test Data**: Create mock users that match actual BBS user scenarios
2. **Test Edge Cases**: Try different security levels, timeLeft values, etc.
3. **Clean Up**: Use `clearAll()` or dev sessions to clean up between tests
4. **Sandbox File System**: Keep mock data in separate directories
5. **Automate Testing**: Use mock data in automated test suites

## Notes

- Mock file system is sandboxed to prevent accidental file operations
- Path traversal attempts are blocked for security
- Auto-connect happens 100ms after `door.start()` to allow initialization
- Verbose mode logs all mock operations for debugging
