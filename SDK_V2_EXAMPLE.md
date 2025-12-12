# SDK v2.0 - Usage Examples

## Simple Door Example

```typescript
// doors/hello/index.ts
import { Door, AnsiColor } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'Hello World',
  version: '1.0.0',
  author: 'You',
});

door.onStart(async (ctx) => {
  await ctx.output.clear();
  await ctx.output.setForeground(AnsiColor.Cyan);
  await ctx.output.writeLine('Welcome to Hello World!');
  await ctx.output.reset();
  await ctx.output.writeLine(`Hello, ${ctx.user.username}!`);
  await ctx.output.writeLine('');
  await ctx.output.writeLine('Press Q to quit...');
});

door.onInput(async (ctx, key) => {
  if (key.key.toLowerCase() === 'q') {
    await ctx.output.writeLine('Goodbye!');
    await door.exit();
  }
});

export = door;  // Export Door instance
```

## BBSLinkWall Migrated

**BEFORE (Old Pattern):**
```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  // Get wall entries
  const wall = await getWall();

  // Display
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m=== BBSLink Wall ===\x1b[0m\r\n\r\n');

  for (const entry of wall) {
    socket.emit('ansi-output', `${entry.user}: ${entry.message}\r\n`);
  }

  socket.emit('ansi-output', '\r\nPress Q to quit, P to post...\r\n');

  // Input handling
  bbsSession.doorInputHandler = (data: string) => {
    const key = data.toLowerCase();

    if (key === 'q') {
      bbsSession.doorInputHandler = null;
      socket.emit('door:close');
    } else if (key === 'p') {
      postMessage(socket, bbsSession, user);
    }
  };

  await new Promise<void>((resolve) => {
    socket.once('door:close', resolve);
    socket.once('disconnect', resolve);
  });
}
```

**AFTER (SDK v2.0):**
```typescript
import { Door, AnsiColor } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'BBSLink Wall',
  version: '2.0.0',
  author: 'BBSLink Team',
});

door.onStart(async (ctx) => {
  await displayWall(ctx);
});

door.onInput(async (ctx, key) => {
  const k = key.key.toLowerCase();

  if (k === 'q') {
    await door.exit();
  } else if (k === 'p') {
    await postMessage(ctx);
  } else if (k === 'r') {
    await displayWall(ctx);
  }
});

async function displayWall(ctx: DoorContext) {
  const wall = await getWall();

  await ctx.output.clear();
  await ctx.output.setForeground(AnsiColor.Cyan);
  await ctx.output.writeLine('=== BBSLink Wall ===');
  await ctx.output.reset();
  await ctx.output.writeLine('');

  for (const entry of wall) {
    await ctx.output.write(`[${entry.user}] `);
    await ctx.output.writeLine(entry.message);
  }

  await ctx.output.writeLine('');
  await ctx.output.writeLine('[Q]uit [P]ost [R]efresh');
}

async function postMessage(ctx: DoorContext) {
  await ctx.output.clear();
  await ctx.output.writeLine('Post a message:');
  await ctx.output.writeLine('');

  const message = await ctx.input.getLine('Message: ', 100);

  if (message) {
    await saveMessage(ctx.user.username, message);
    await ctx.output.writeLine('');
    await ctx.output.writeLine('Message posted!');
    await ctx.output.writeLine('');
    await ctx.input.waitForKeyPress('\r');
  }

  await displayWall(ctx);
}

export = door;
```

## Game with Storage

```typescript
import { Door, AnsiColor } from '@amiexpress/bbs-door-sdk';

interface GameState {
  score: number;
  level: number;
  lives: number;
}

const door = new Door({
  name: 'My Game',
  version: '1.0.0',
  author: 'You',
});

door.onStart(async (ctx) => {
  // Load saved game
  const savedState = await ctx.storage.load<GameState>('gamestate');

  const state: GameState = savedState || {
    score: 0,
    level: 1,
    lives: 3,
  };

  await ctx.output.clear();

  if (savedState) {
    await ctx.output.writeLine('Welcome back!');
    await ctx.output.writeLine(`Score: ${state.score} Level: ${state.level}`);
  } else {
    await ctx.output.writeLine('New game started!');
  }

  // Store state in context for input handlers
  (ctx as any).gameState = state;
});

door.onInput(async (ctx, key) => {
  const state = (ctx as any).gameState as GameState;

  if (key.key.toLowerCase() === 'q') {
    // Save game
    await ctx.storage.save('gamestate', state);
    await ctx.output.writeLine('Game saved!');
    await door.exit();
  }

  // ... game logic
});

export = door;
```

## Advanced: Using BBS API

```typescript
import { Door, AnsiColor } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'Who\'s Online',
  version: '1.0.0',
  author: 'You',
  accessLevel: 0,
});

door.onStart(async (ctx) => {
  await ctx.output.clear();
  await ctx.output.setForeground(AnsiColor.Cyan);
  await ctx.output.writeLine('=== Who\'s Online ===');
  await ctx.output.reset();
  await ctx.output.writeLine('');

  if (ctx.bbs) {
    const onlineUsers = await ctx.bbs.getOnlineUsers();

    for (const user of onlineUsers) {
      await ctx.output.writeLine(`[${user.id}] ${user.username}`);
    }
  } else {
    await ctx.output.writeLine('BBS API not available');
  }

  await ctx.output.writeLine('');
  await ctx.output.writeLine('Press any key to exit...');
});

door.onInput(async (ctx, key) => {
  await door.exit();
});

export = door;
```

## Type Safety Benefits

**Old Pattern (No Types):**
```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession, user } = doorSession;

  // What properties does socket have? Unknown!
  // What properties does user have? Unknown!
  // Typos not caught until runtime
  socket.emit('ansi-output', `Hello ${user.usernmae}`);  // Typo!
}
```

**New Pattern (Full Types):**
```typescript
import { Door, DoorContext } from '@amiexpress/bbs-door-sdk';

const door = new Door({ /* config */ });

door.onStart(async (ctx: DoorContext) => {
  // IDE autocomplete works!
  // Typos caught at compile time
  await ctx.output.writeLine(`Hello ${ctx.user.username}`);
  //                                    ^^^^^^^^^^^^^^^^
  //                                    TypeScript knows this property exists

  await ctx.output.writeLine(`Hello ${ctx.user.usernmae}`);  // ERROR: Property 'usernmae' does not exist
});

export = door;
```

## Error Handling

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';

const door = new Door({ /* config */ });

door.onStart(async (ctx) => {
  // This might throw
  const data = await fetchDataFromAPI();
  await ctx.output.writeLine(data);
});

door.onError(async (ctx, error) => {
  await ctx.output.writeLine('');
  await ctx.output.setForeground(AnsiColor.Red);
  await ctx.output.writeLine(`Error: ${error.message}`);
  await ctx.output.reset();
  await ctx.output.writeLine('');
  await ctx.output.writeLine('Press any key to exit...');

  // Log error
  console.error('[MyDoor] Error:', error);
});

export = door;
```

## Benefits Summary

| Feature | Old Pattern | SDK v2.0 |
|---------|-------------|----------|
| Type Safety | No | Yes |
| Autocomplete | No | Yes |
| Error Handling | Manual | Built-in |
| Storage API | Manual fs | Clean API |
| Input Parsing | Manual | Automatic |
| Code Reuse | Copy-paste | Import |
| Testing | Hard | Easy |
| Documentation | Scattered | Centralized |

## Migration Checklist

- [ ] Replace `export async function runDoor` with `const door = new Door`
- [ ] Move start logic to `door.onStart()`
- [ ] Move input handler to `door.onInput()`
- [ ] Replace `socket.emit()` with `ctx.output.*`
- [ ] Replace manual input handling with `ctx.input.*`
- [ ] Replace manual storage with `ctx.storage.*`
- [ ] Change `export async function runDoor` to `export = door`
- [ ] Add types to handler parameters
- [ ] Test door
- [ ] Update package.json (doorPattern no longer needed)
