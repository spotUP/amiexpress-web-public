# TypeScript Door Development Guide

**Updated:** 2025-12-02
**For:** AmiExpress BBS SDK - Server-Side TypeScript Doors

This guide covers creating TypeScript doors that run on the BBS backend server.

---

## Table of Contents

1. [Door Pattern](#door-pattern)
2. [Door Session Object](#door-session-object)
3. [Output](#output)
4. [Input Handling](#input-handling)
5. [Complete Example](#complete-example)
6. [Installation](#installation)
7. [Testing](#testing)

---

## Door Pattern

All server-side TypeScript doors use the `runDoor()` async function pattern:

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession, bbs, params } = doorSession;

  // Your door logic here
}
```

This function is called by the BBS when a user executes your door command.

---

## Door Session Object

The `doorSession` parameter contains everything you need to interact with the BBS:

```typescript
{
  socket: Socket,        // Socket.IO socket for I/O
  user: User,            // Current user object
  bbsSession: Session,   // BBS session (for input routing)
  bbs: BBSApi,          // BBS API functions
  params: string[]       // Command-line parameters from .info file
}
```

### User Object

```typescript
{
  id: string,
  username: string,
  email: string,
  secLevel: number,
  location: string,
  // ... other user properties
}
```

---

## Output

Send ANSI output to the terminal using `socket.emit('ansi-output', text)`:

```typescript
socket.emit('ansi-output', '\x1b[2J\x1b[H');  // Clear screen
socket.emit('ansi-output', `\x1b[32mHello, ${user.username}!\x1b[0m\r\n`);  // Green text
socket.emit('ansi-output', 'Normal text\r\n');
```

### ANSI Color Codes

- Clear screen: `\x1b[2J\x1b[H`
- Colors: `\x1b[30-37m` (foreground), `\x1b[40-47m` (background)
- Reset: `\x1b[0m`
- Line endings: Always use `\r\n` (not just `\n`)

Common colors:
```typescript
const COLORS = {
  BLACK:   '\x1b[30m',
  RED:     '\x1b[31m',
  GREEN:   '\x1b[32m',
  YELLOW:  '\x1b[33m',
  BLUE:    '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN:    '\x1b[36m',
  WHITE:   '\x1b[37m',
  RESET:   '\x1b[0m'
};
```

---

## Input Handling

**CRITICAL:** Use `bbsSession.doorInputHandler` for all input. Do NOT use `socket.on('user-input')` or `socket.once('user-input')` - those patterns are deprecated and don't work correctly.

### Wait for Any Key

```typescript
socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m\r\n');

await new Promise<void>((resolve) => {
  const inputHandler = (data: string) => {
    delete bbsSession.doorInputHandler;
    resolve();
  };
  bbsSession.doorInputHandler = inputHandler;
});
```

### Get User Input

```typescript
socket.emit('ansi-output', 'Enter your name: ');

const name = await new Promise<string>((resolve) => {
  const inputHandler = (data: string) => {
    delete bbsSession.doorInputHandler;
    resolve(data.trim());
  };
  bbsSession.doorInputHandler = inputHandler;
});

socket.emit('ansi-output', `\r\nHello, ${name}!\r\n`);
```

### Input with Timeout

```typescript
socket.emit('ansi-output', 'Press any key (or wait 5 seconds)...\r\n');

await new Promise<void>((resolve) => {
  const timeout = setTimeout(() => {
    delete bbsSession.doorInputHandler;
    resolve();
  }, 5000);

  const inputHandler = (data: string) => {
    clearTimeout(timeout);
    delete bbsSession.doorInputHandler;
    resolve();
  };

  bbsSession.doorInputHandler = inputHandler;
});
```

### Menu Selection

```typescript
socket.emit('ansi-output', '\r\n\x1b[36mMain Menu:\x1b[0m\r\n');
socket.emit('ansi-output', '\x1b[33m1.\x1b[0m Play Game\r\n');
socket.emit('ansi-output', '\x1b[33m2.\x1b[0m View Scores\r\n');
socket.emit('ansi-output', '\x1b[33m3.\x1b[0m Quit\r\n\r\n');
socket.emit('ansi-output', 'Your choice: ');

const choice = await new Promise<string>((resolve) => {
  const inputHandler = (data: string) => {
    delete bbsSession.doorInputHandler;
    resolve(data.trim());
  };
  bbsSession.doorInputHandler = inputHandler;
});

switch (choice) {
  case '1':
    socket.emit('ansi-output', '\r\nStarting game...\r\n');
    break;
  case '2':
    socket.emit('ansi-output', '\r\nShowing scores...\r\n');
    break;
  case '3':
    socket.emit('ansi-output', '\r\nGoodbye!\r\n');
    return;
  default:
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice!\x1b[0m\r\n');
}
```

---

## Complete Example

Here's a complete guessing game door:

```typescript
/**
 * Number Guessing Game Door
 * A simple door that demonstrates input/output patterns
 */

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  // Clear screen and show header
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[1;36m╔════════════════════════════════════╗\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[1;36m║  \x1b[1;33mNumber Guessing Game\x1b[1;36m           ║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[1;36m╚════════════════════════════════════╝\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mWelcome, ${user.username}!\x1b[0m\r\n\r\n`);
  socket.emit('ansi-output', 'I\'m thinking of a number between 1 and 100.\r\n');
  socket.emit('ansi-output', 'You have 10 guesses to find it!\r\n\r\n');

  const secret = Math.floor(Math.random() * 100) + 1;
  let guesses = 0;
  let won = false;

  while (guesses < 10 && !won) {
    // Prompt for guess
    socket.emit('ansi-output', `\x1b[33mGuess ${guesses + 1}/10:\x1b[0m `);

    // Get input
    const input = await new Promise<string>((resolve) => {
      const inputHandler = (data: string) => {
        delete bbsSession.doorInputHandler;
        resolve(data.trim());
      };
      bbsSession.doorInputHandler = inputHandler;
    });

    const guess = parseInt(input);
    guesses++;

    if (isNaN(guess)) {
      socket.emit('ansi-output', '\x1b[31mPlease enter a number!\x1b[0m\r\n\r\n');
      guesses--; // Don't count invalid input
      continue;
    }

    if (guess === secret) {
      socket.emit('ansi-output', `\r\n\x1b[1;32m★ Correct! You won in ${guesses} guesses! ★\x1b[0m\r\n\r\n`);
      won = true;
    } else if (guess < secret) {
      socket.emit('ansi-output', '\x1b[34mToo low! Try again.\x1b[0m\r\n\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[35mToo high! Try again.\x1b[0m\r\n\r\n');
    }
  }

  if (!won) {
    socket.emit('ansi-output', `\x1b[31mGame over! The number was ${secret}.\x1b[0m\r\n\r\n`);
  }

  socket.emit('ansi-output', 'Thanks for playing!\r\n\r\n');
  socket.emit('ansi-output', '\x1b[32mPress any key to exit...\x1b[0m');

  // Wait for keypress
  await new Promise<void>((resolve) => {
    const inputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve();
    };
    bbsSession.doorInputHandler = inputHandler;
  });
}
```

---

## Installation

### 1. Create Package Structure

```
my-door/
├── index.ts          # Door implementation
├── package.json      # Door metadata
├── tsconfig.json     # TypeScript configuration
└── README.md         # Door documentation
```

### 2. Create package.json

```json
{
  "name": "my-door",
  "version": "1.0.0",
  "description": "My awesome BBS door",
  "main": "index.ts",
  "doorPattern": "runDoor",
  "buildable": true,
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@types/node": "^22.0.0",
    "socket.io": "^4.8.1"
  }
}
```

### 3. Create .info File

Create `Commands/BBSCmd/MY-DOOR.info`:

```
FORM
ICON
LOCATION=doors/my-door
TYPE=TS
MULTINODE=YES
STACK=65536
ACCESS=0
NAME=MY-DOOR
```

### 4. Copy to BBS

```bash
# Copy door to BBS doors directory
cp -r my-door /path/to/amiexpress-web/doors/

# The .info file tells BBS where to find the door
```

---

## Testing

1. **Type Check:**
   ```bash
   cd /path/to/amiexpress-web/web/backend
   npx tsc --noEmit
   ```

2. **Run in BBS:**
   - Connect to BBS
   - Type `/MY-DOOR` at main menu
   - Test all features

3. **Check Logs:**
   ```bash
   tail -f /path/to/amiexpress-web/logs/backend.log
   ```

---

## Best Practices

1. **Always clean up:** Delete `bbsSession.doorInputHandler` when done with input
2. **Use \r\n:** Never use just `\n` for line endings
3. **Clear screen:** Start with `\x1b[2J\x1b[H` for clean display
4. **Reset colors:** End with `\x1b[0m` to reset terminal
5. **Test thoroughly:** Test with different terminal sizes and speeds
6. **Handle errors:** Wrap door logic in try/catch blocks
7. **No emojis:** Use ASCII art instead (better compatibility)

---

## Common Pitfalls

### ❌ WRONG - Using socket.on/once

```typescript
// DON'T DO THIS
socket.once('user-input', (data) => {
  // This doesn't work!
});
```

### ✅ CORRECT - Using bbsSession.doorInputHandler

```typescript
// DO THIS INSTEAD
bbsSession.doorInputHandler = (data: string) => {
  delete bbsSession.doorInputHandler;
  // Handle input
};
```

### ❌ WRONG - Using \n for line endings

```typescript
// DON'T DO THIS
socket.emit('ansi-output', 'Hello\n');
```

### ✅ CORRECT - Using \r\n for line endings

```typescript
// DO THIS INSTEAD
socket.emit('ansi-output', 'Hello\r\n');
```

---

## See Also

- [API Reference](./API_REFERENCE.md)
- [ANSI String Utilities](./ANSI_STRING_UTILITIES.md)
- [NEO-Blessed UI Guide](./NEO_BLESSED_UI.md)
- [Example Doors](../examples/)

---

**Last Updated:** 2025-12-02
**SDK Version:** 1.0.0
