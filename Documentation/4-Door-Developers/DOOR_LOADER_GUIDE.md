# DoorLoader Guide

**Professional loading screens with ANSI progress bars for TypeScript doors**

The `DoorLoader` utility provides a polished loading experience for SDK doors that need time to initialize assets, connect to servers, or perform other startup tasks.

---

## Features

- **Visual Progress Bar**: Uses neo-blessed Gauge widget for smooth ANSI progress bars
- **Status Messages**: Display what's currently loading
- **Percentage Display**: Shows exact progress (0-100%)
- **Spinner Mode**: Animated spinner for indeterminate loading
- **Overlay Support**: Semi-transparent overlay to dim background
- **Simple API**: Easy to integrate into any door

---

## Basic Usage

```typescript
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  output: (data: string) => bbs.write(data),
});

// Create loader
const loader = new DoorLoader(screen);

// Show loader
loader.show('Loading game assets...');

// Update progress as you load
loader.update(25, 'Loading sprites...');
loader.update(50, 'Loading sounds...');
loader.update(75, 'Loading levels...');
loader.update(100, 'Ready!');

// Brief pause to show "Ready!" message
await loader.delay(500);

// Hide loader
loader.hide();
```

---

## API Reference

### Constructor

```typescript
new DoorLoader(screen: Screen, options?: DoorLoaderOptions)
```

**Options:**
- `overlay?: boolean` - Show semi-transparent overlay (default: `true`)
- `overlayOpacity?: number` - Overlay opacity 0-1 (default: `0.5`)
- `barColor?: string` - Progress bar color (default: `'cyan'`)
- `spinner?: boolean` - Enable spinner for indeterminate loading (default: `false`)
- `spinnerFrames?: string[]` - Spinner animation frames (default: `['|', '/', '-', '\\']`)
- `spinnerInterval?: number` - Spinner speed in milliseconds (default: `80`)

### Methods

#### `show(message?: string): void`
Show the loader with optional initial message.

```typescript
loader.show('Initializing...');
```

#### `update(percent: number, message?: string): void`
Update progress bar and optionally change the message.

```typescript
loader.update(50, 'Loading sprites...');
```

- `percent`: Progress from 0-100
- `message`: Optional status message

#### `hide(): void`
Hide the loader.

```typescript
loader.hide();
```

#### `setMessage(message: string): void`
Update the message without changing progress.

```typescript
loader.setMessage('Almost done...');
```

#### `delay(ms: number): Promise<void>`
Helper method for adding delays (useful for showing "Ready!" briefly).

```typescript
await loader.delay(500);
```

#### `destroy(): void`
Clean up and destroy the loader (call before destroying screen).

```typescript
loader.destroy();
screen.destroy();
```

---

## Examples

### Example 1: Determinate Progress

Use when you know the loading progress (0-100%):

```typescript
const loader = new DoorLoader(screen, {
  overlay: true,
  barColor: 'green',
});

loader.show('Starting...');

// Phase 1
loader.update(20, 'Loading configuration...');
await loadConfig();

// Phase 2
loader.update(50, 'Loading assets...');
await loadAssets();

// Phase 3
loader.update(80, 'Initializing engine...');
await initEngine();

// Done
loader.update(100, 'Ready!');
await loader.delay(800);
loader.hide();
```

### Example 2: Indeterminate Progress (Spinner)

Use when you don't know exact progress:

```typescript
const loader = new DoorLoader(screen, {
  overlay: true,
  spinner: true,  // Enable spinner mode
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],  // Braille spinner
});

// Show spinner (no progress bar)
loader.show('Connecting to server...');
await connectToServer();

// Update message while spinning
loader.setMessage('Authenticating...');
await authenticate();

// Switch to progress bar when you know progress
loader.update(50, 'Downloading data...');
await downloadData();

loader.update(100, 'Done!');
await loader.delay(500);
loader.hide();
```

### Example 3: Custom Styling

```typescript
const loader = new DoorLoader(screen, {
  overlay: true,
  overlayOpacity: 0.7,  // Darker overlay
  barColor: 'magenta',  // Magenta progress bar
  spinner: true,
  spinnerFrames: ['◐', '◓', '◑', '◒'],  // Circle spinner
  spinnerInterval: 100,  // Slower animation
});
```

### Example 4: Real Door Integration

```typescript
export async function createApp(session: DoorSession) {
  const { bbs, user } = session;

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    output: (data: string) => bbs.write(data),
  });

  // Setup input handler
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Create loader
  const loader = new DoorLoader(screen, {
    barColor: 'cyan',
  });

  try {
    // Show loading
    loader.show('Initializing game...');
    screen.render();

    // Load game data
    loader.update(20, 'Loading sprites...');
    const sprites = await loadSprites();

    loader.update(40, 'Loading sounds...');
    const sounds = await loadSounds();

    loader.update(60, 'Loading levels...');
    const levels = await loadLevels();

    loader.update(80, 'Initializing engine...');
    const engine = new GameEngine(sprites, sounds, levels);

    loader.update(100, 'Ready!');
    await loader.delay(800);

    // Hide loader and start game
    loader.hide();
    await startGame(screen, engine);

  } finally {
    // Cleanup
    loader.destroy();
    screen.destroy();
  }
}
```

---

## Best Practices

### 1. Show Meaningful Messages

Update the message to show what's happening:

```typescript
loader.update(10, 'Connecting to database...');
loader.update(30, 'Loading user data...');
loader.update(50, 'Initializing game state...');
loader.update(70, 'Loading assets...');
loader.update(90, 'Finalizing setup...');
loader.update(100, 'Ready!');
```

### 2. Use Realistic Progress Increments

Don't jump from 0% to 100% instantly:

```typescript
// BAD: Too fast, no user feedback
loader.update(0);
await loadEverything();
loader.update(100);

// GOOD: Show progress
loader.update(0, 'Starting...');
loader.update(25, 'Loading configs...');
loader.update(50, 'Loading assets...');
loader.update(75, 'Initializing...');
loader.update(100, 'Done!');
```

### 3. Show "Ready!" Briefly Before Hiding

```typescript
loader.update(100, 'Ready!');
await loader.delay(500);  // Brief pause
loader.hide();
```

### 4. Use Spinner for Unknown Duration

If you can't estimate progress, use spinner mode:

```typescript
// Connecting to remote server (unknown time)
const loader = new DoorLoader(screen, { spinner: true });
loader.show('Connecting...');
await connect();

// Switch to progress bar when downloading
loader.update(0, 'Downloading...');
// ... update as download progresses
```

### 5. Always Destroy the Loader

```typescript
try {
  // ... use loader
} finally {
  loader.destroy();
  screen.destroy();
}
```

---

## Styling Guide

### Colors

Only 16 ANSI colors are supported:
- `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`

```typescript
const loader = new DoorLoader(screen, {
  barColor: 'cyan',  // Progress bar color
});
```

### Spinner Frames

#### ASCII Spinners (Best compatibility)
```typescript
spinnerFrames: ['|', '/', '-', '\\']
spinnerFrames: ['.', 'o', 'O', 'o']
spinnerFrames: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
```

#### Unicode Spinners (If terminal supports it)
```typescript
spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
spinnerFrames: ['◐', '◓', '◑', '◒']
spinnerFrames: ['◴', '◷', '◶', '◵']
```

### Overlay Opacity

Adjust overlay darkness:

```typescript
overlayOpacity: 0.3  // Light overlay
overlayOpacity: 0.5  // Medium overlay (default)
overlayOpacity: 0.7  // Dark overlay
```

---

## Advanced Usage

### Multiple Loading Phases

```typescript
// Phase 1: Initial connection
loader.show('Connecting...');
await connect();

// Phase 2: Authentication
loader.setMessage('Authenticating...');
await authenticate();

// Phase 3: Data loading (with progress)
loader.update(0, 'Downloading...');
for (let i = 0; i <= 100; i += 10) {
  await downloadChunk(i);
  loader.update(i, `Downloading... ${i}%`);
}

loader.update(100, 'Complete!');
await loader.delay(500);
loader.hide();
```

### Conditional Loading Screen

Only show loader if initialization takes time:

```typescript
const startTime = Date.now();
const loader = new DoorLoader(screen);

// Start loading without showing loader yet
const promise = loadAssets();

// Show loader only if it takes more than 500ms
const timer = setTimeout(() => {
  loader.show('Loading...');
}, 500);

await promise;
clearTimeout(timer);

// Hide if it was shown
if (loader.isVisible) {
  loader.hide();
}
```

---

## Troubleshooting

### Progress bar not showing
Make sure to call `screen.render()` after `loader.show()`:

```typescript
loader.show('Loading...');
screen.render();  // IMPORTANT
```

### Spinner not animating
The spinner needs the event loop to run. Make sure you're using `async/await`:

```typescript
// BAD: Blocks event loop
loader.show('Loading...');
const data = syncLoadData();  // Blocks spinner

// GOOD: Allows spinner to animate
loader.show('Loading...');
const data = await asyncLoadData();  // Spinner animates
```

### Overlay not dimming background
Check that overlay is enabled:

```typescript
const loader = new DoorLoader(screen, {
  overlay: true,  // Make sure this is true
  overlayOpacity: 0.5
});
```

---

## See Also

- [Door Development Guide](DOOR_DEVELOPMENT.md)
- [Neo-Blessed Color Guide](NEO_BLESSED_COLOR_GUIDE.md)
- [SDK Examples](../../sdk/examples/)
