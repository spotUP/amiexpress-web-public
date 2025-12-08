# Quick Start Guide

Get started with the AmiExpress BBS Door SDK in minutes!

## Installation

```bash
# Clone or download the SDK
git clone https://github.com/amiexpress/sdk.git

# Navigate to SDK directory
cd sdk

# Install dependencies
npm install

# Build the SDK
npm run build
```

## Your First Door (5 Minutes)

### Option 1: Quick Start Helper

```typescript
import { quickStart } from '@amiexpress/sdk';

quickStart('Hello World', async (door, user) => {
  door.clearScreen();
  door.send(`\r\n\r\nWelcome to my door, ${user.name}!\r\n\r\n`);
  door.send('Press any key to exit...\r\n');
  await door.waitForInput(user.id);
  door.disconnect(user.id);
});
```

### Option 2: Full Control

```typescript
import { Door, GraphicsEngine, AudioEngine } from '@amiexpress/sdk';

const door = new Door({
  name: 'My Awesome Game',
  version: '1.0.0',
  author: 'Your Name'
});

const gfx = new GraphicsEngine({ width: 80, height: 24 });
const audio = new AudioEngine();

door.onConnect(async (user) => {
  await audio.init();

  gfx.clear();
  gfx.drawText(10, 10, `Hello, ${user.name}!`, AnsiColor.Yellow);

  door.sendAnsi(gfx.render(), user.id);
  audio.playSound('welcome');

  await door.wait(2000);
  door.disconnect(user.id);
});

door.start();
```

## Running Your Door

```bash
# Compile TypeScript
npx tsc your-door.ts

# Run the door
node your-door.js

# Or use preview mode
npm run preview
```

## Preview Mode

The SDK includes a browser-based preview system:

```bash
# Start preview server
npm run preview

# Open browser to http://localhost:8080
# Select your door and test in real-time!
```

## Creating a Game (10 Minutes)

Let's create a simple guessing game:

```typescript
import { Door, AnsiColor } from '@amiexpress/sdk';

const door = new Door({
  name: 'Number Guessing Game',
  version: '1.0.0',
  author: 'You'
});

door.onConnect(async (user) => {
  door.clearScreen(user.id);
  door.send('\r\n=== Number Guessing Game ===\r\n\r\n', user.id);
  door.send('I\'m thinking of a number between 1 and 100.\r\n\r\n', user.id);

  const secret = Math.floor(Math.random() * 100) + 1;
  let guesses = 0;
  let won = false;

  while (guesses < 10 && !won) {
    const input = await door.prompt('Your guess: ', user.id);
    const guess = parseInt(input);
    guesses++;

    if (isNaN(guess)) {
      door.send('Please enter a number!\r\n', user.id);
      continue;
    }

    if (guess === secret) {
      door.send(`\r\n🎉 Correct! You won in ${guesses} guesses!\r\n\r\n`, user.id);
      won = true;
    } else if (guess < secret) {
      door.send('Too low! Try again.\r\n', user.id);
    } else {
      door.send('Too high! Try again.\r\n', user.id);
    }
  }

  if (!won) {
    door.send(`\r\nGame over! The number was ${secret}.\r\n\r\n`, user.id);
  }

  door.send('Thanks for playing!\r\n', user.id);
  await door.wait(2000);
  door.disconnect(user.id);
});

door.start();
```

## Using the Graphics Engine

```typescript
import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/sdk';

const door = new Door({ name: 'Graphics Demo', version: '1.0.0', author: 'You' });
const gfx = new GraphicsEngine({ width: 80, height: 24 });

door.onConnect(async (user) => {
  // Clear screen
  gfx.clear(AnsiColor.Blue);

  // Draw a box
  gfx.drawBox({ x: 10, y: 5, width: 60, height: 15 }, 'double', AnsiColor.Yellow);

  // Draw text
  gfx.drawText(15, 7, 'Welcome to the Graphics Demo!', AnsiColor.White);

  // Draw a filled rectangle
  gfx.drawRect({ x: 15, y: 10, width: 20, height: 5 }, '█', AnsiColor.Green);

  // Send to terminal
  door.sendAnsi(gfx.render(), user.id);

  await door.waitForInput(user.id);
  door.disconnect(user.id);
});

door.start();
```

## Using Sound Effects

```typescript
import { Door, AudioEngine } from '@amiexpress/sdk';

const door = new Door({ name: 'Sound Demo', version: '1.0.0', author: 'You' });
const audio = new AudioEngine();

door.onConnect(async (user) => {
  await audio.init();

  door.send('\r\nSound Effects Demo\r\n\r\n', user.id);

  door.send('1. Laser\r\n', user.id);
  door.send('2. Explosion\r\n', user.id);
  door.send('3. Jump\r\n', user.id);
  door.send('4. Coin\r\n', user.id);
  door.send('5. Power-up\r\n', user.id);
  door.send('Q. Quit\r\n\r\n', user.id);

  while (true) {
    const key = await door.waitForInput(user.id);
    if (!key) continue;

    if (key.key === '1') audio.playSound('laser');
    else if (key.key === '2') audio.playSound('explosion');
    else if (key.key === '3') audio.playSound('jump');
    else if (key.key === '4') audio.playSound('coin');
    else if (key.key === '5') audio.playSound('powerup');
    else if (key.key === 'q' || key.key === 'Q') break;
  }

  audio.dispose();
  door.disconnect(user.id);
});

door.start();
```

## Creating a Menu

```typescript
import { Door, MenuSystem } from '@amiexpress/sdk';

const door = new Door({ name: 'Menu Demo', version: '1.0.0', author: 'You' });

door.onConnect(async (user) => {
  const menu = new MenuSystem({
    title: 'Main Menu',
    style: 'retro-neon',
    navigation: 'arrow-keys',
    modal: false,
    position: { x: 25, y: 8 }
  });

  menu.addItem('Start Game', () => {
    door.send('\r\nStarting game...\r\n', user.id);
  }, { key: 'S' });

  menu.addItem('Options', () => {
    door.send('\r\nOpening options...\r\n', user.id);
  }, { key: 'O' });

  menu.addItem('Quit', () => {
    door.disconnect(user.id);
  }, { key: 'Q' });

  await menu.show(door, user.id);
});

door.start();
```

## Next Steps

1. **Explore Examples**: Check out `examples/tetris/` for a full game
2. **Read API Docs**: See `docs/api/` for complete API reference
3. **Watch Tutorials**: Visit `docs/videos.md` for video guides
4. **Join Community**: Get help and share your doors!

## Packaging Your Door

When you're ready to release:

```bash
# Create BBS-ready release ZIP
npm run pack your-door-name

# Output: releases/your-door-name-v1.0.0.zip
# Includes: FILE_ID.DIZ, .NFO, README.TXT, all assets
```

## Tips

- Use `door.clearScreen()` before drawing complex screens
- Always call `audio.init()` before playing sounds
- Test in preview mode before deploying to BBS
- Keep terminal output to 80x24 for compatibility
- Use ANSI colors sparingly for readability

## Troubleshooting

**Q: My door doesn't show any output**
- Make sure you're calling `door.send()` or `door.sendAnsi()`
- Check that your door is started with `door.start()`

**Q: Audio doesn't work**
- Call `await audio.init()` after user connects
- Browser auto-play policies require user interaction first

**Q: Graphics are garbled**
- Ensure terminal supports ANSI escape codes
- Test in preview mode first
- Keep to 80x24 screen size

## Support

- Documentation: `docs/`
- Examples: `examples/`
- Issues: https://github.com/amiexpress/sdk/issues

Happy coding! 🎮
