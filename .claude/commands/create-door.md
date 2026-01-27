# Create TypeScript Door

Create a new TypeScript door for AmiExpress-Web BBS using the neo-blessed SDK.

## Required Input

The user should provide:
- **Door name**: The name of the door (e.g., "my-game", "file-manager")
- **Door type**: What kind of door (game, utility, chat, information display, etc.)
- **Brief description**: What the door should do

If not provided, ask the user for these details before proceeding.

---

## Step 1: Read Required Documentation

**MANDATORY**: Before writing ANY code, read these files:

1. `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` - TypeScript door patterns
2. `sdk/README.md` - SDK overview and quick start
3. `Documentation/4-Door-Developers/DOOR_INPUT_MANAGER_GUIDE.md` - Input handling

Use the Read tool to read each file. Do NOT skip this step.

---

## Step 2: Create Door Directory Structure

Create the door in `Doors/{door-name}/`:

```
Doors/{door-name}/
  package.json
  tsconfig.json
  esbuild.config.mjs
  index.ts          # Main entry point
  app.ts            # Application logic (optional, for complex doors)
  {door-name}.info  # Amiga .info file for BBS registration
```

---

## Step 3: Create package.json

```json
{
  "name": "{door-name}",
  "version": "1.0.0",
  "description": "{description}",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "build:watch": "node esbuild.config.mjs --watch",
    "dev": "npm run build:watch"
  },
  "doorType": "hybrid",
  "bbsDoor": {
    "name": "{DoorName}",
    "command": "{CMD}",
    "description": "{description}",
    "author": "AmiExpress-Web",
    "version": "1.0.0",
    "minAccessLevel": 10
  },
  "devDependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Step 4: Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["./*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 5: Create esbuild.config.mjs

```javascript
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: [
    '@amiexpress/bbs-door-sdk',
    '@amiexpress/bbs-door-sdk/*',
    'neo-blessed',
    'neo-blessed/*'
  ],
  banner: {
    js: `import { createRequire } from 'module';
const require = createRequire(import.meta.url);`
  }
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
```

---

## Step 6: Create the .info File

Create `{door-name}.info` with these tooltypes:

```
LOCATION=Doors/{door-name}
STACK=20000
PRELOADER=YES
```

**IMPORTANT**: The .info file is a binary Amiga format. Use the info-editor CLI:

```bash
# Create from existing template or use the editor
npx tsx web/backend/src/scripts/info-editor.ts Doors/{door-name}/{door-name}.info set LOCATION "Doors/{door-name}"
npx tsx web/backend/src/scripts/info-editor.ts Doors/{door-name}/{door-name}.info set STACK 20000
npx tsx web/backend/src/scripts/info-editor.ts Doors/{door-name}/{door-name}.info set PRELOADER YES
```

Or copy an existing .info file and modify it.

---

## Step 7: Create index.ts (Main Entry Point)

```typescript
import type { DoorSession, DoorModule } from '@amiexpress/bbs-door-sdk';
import { App } from './app.js';

const door: DoorModule = {
  run: async (session: DoorSession): Promise<void> => {
    const app = new App(session);
    await app.run();
  }
};

export default door;
```

---

## Step 8: Create app.ts (Application Logic)

Use this template with DoorInputManager:

```typescript
import type { DoorSession } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Widgets } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export class App {
  private session: DoorSession;
  private screen!: Widgets.Screen;
  private inputManager!: DoorInputManager;
  private resolveExit!: () => void;

  constructor(session: DoorSession) {
    this.session = session;
  }

  async run(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveExit = resolve;
      this.initializeUI();
    });
  }

  private initializeUI(): void {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: '{Door Title}',
      fullUnicode: true,
      input: this.session.input,
      output: this.session.output,
      terminal: 'xterm-256color',
      cursor: { artificial: true, shape: 'block', blink: true, color: 'white' }
    });

    // Initialize input manager - CRITICAL for proper input handling
    this.inputManager = new DoorInputManager(this.session, this.screen, {
      enableGameMode: false,    // Set true for real-time games
      enableGrabKeys: true,     // Capture all keys
      enableMouse: true,        // Enable mouse events
      debug: false,
      debugName: '{DoorName}'
    });

    // Create UI components
    this.createUI();

    // Enable input handling
    this.inputManager.enable();

    // Render
    this.screen.render();
  }

  private createUI(): void {
    // Main container
    const mainBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-3',  // Reserve 3 rows for footer
      style: { fg: 'white', bg: 'black' }
    });

    // Title bar
    blessed.box({
      parent: mainBox,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: '{center}{bold}{Door Title}{/bold}{/center}',
      style: { fg: 'white', bg: 'blue' }
    });

    // Content area
    const contentBox = blessed.box({
      parent: mainBox,
      top: 1,
      left: 0,
      width: '100%',
      height: '100%-1',
      content: 'Welcome to {Door Name}!\n\nPress Q or ESC to quit.',
      style: { fg: 'cyan', bg: 'black' }
    });

    // Footer with buttons
    const footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: { fg: 'white', bg: 'gray' }
    });

    // Quit button
    const quitButton = blessed.button({
      parent: footer,
      bottom: 1,
      left: 2,
      width: 10,
      height: 1,
      content: '{center}Quit{/center}',
      style: {
        fg: 'white',
        bg: 'red',
        focus: { fg: 'white', bg: 'blue' },
        hover: { fg: 'white', bg: 'blue' }
      },
      mouse: true,
      keys: true
    });

    quitButton.on('press', () => this.quit());

    // Key bindings
    this.screen.key(['q', 'Q', 'escape'], () => this.quit());
  }

  private quit(): void {
    // CRITICAL: Disable input manager before destroying screen
    this.inputManager.disable();
    this.screen.destroy();
    this.resolveExit();
  }
}
```

---

## Step 9: Build and Test

```bash
# Install dependencies
cd Doors/{door-name}
npm install

# Build
npm run build

# Start BBS servers (from project root)
./dev/scripts/start-servers.sh

# Test in browser at http://localhost:3001
# Run the door command: {CMD}
```

---

## Key Rules to Follow

1. **ALWAYS use DoorInputManager** - Never manually manage input state
2. **ALWAYS use SDK widgets** - See widget rule below
3. **Reserve 3+ rows for footer** - Prevents clipped controls
4. **Use blessed tags for colors** - `{red-fg}text{/}` not ANSI codes
5. **Clean up on exit** - Call `inputManager.disable()` before `screen.destroy()`
6. **No emojis** - Use ASCII characters only
7. **Modern UX** - Windows, panels, mouse support, focus management
8. **Test input cleanup** - After exiting, BBS input must still work

---

## CRITICAL: SDK Widget Rule

**ALWAYS use widgets from the blessed SDK (`@amiexpress/bbs-door-sdk/engines/ui/blessed`).**

### Available SDK Widgets

Check what's available in the SDK:
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Core widgets
blessed.screen()
blessed.box()
blessed.text()
blessed.line()
blessed.scrollablebox()
blessed.scrollabletext()
blessed.bigtext()
blessed.list()
blessed.filemanager()
blessed.listtable()
blessed.listbar()
blessed.form()
blessed.input()
blessed.textarea()
blessed.textbox()
blessed.button()
blessed.checkbox()
blessed.radioset()
blessed.radiobutton()
blessed.table()
blessed.prompt()
blessed.question()
blessed.message()
blessed.loading()
blessed.log()
blessed.progressbar()
blessed.terminal()

// Extended SDK widgets (check sdk/engines/ui/blessed/widgets/)
blessed.contextmenu()
blessed.dockablePanel()
blessed.multiplayerLobby()
// ... and others
```

### When a Widget Doesn't Exist

If you need a widget that's NOT in the SDK, **STOP and ask the user**:

> "The UI requires a `{widget-type}` widget which doesn't exist in the SDK.
>
> **Options:**
> 1. **Create SDK widget** (Recommended) - I'll create a reusable widget in `sdk/engines/ui/blessed/widgets/` that all doors can use
> 2. **Door-specific exception** - Write the widget code directly in this door only (not reusable, use sparingly)
>
> Which approach should I take?"

### Why This Matters

- **SDK widgets are reusable** - Fix once, benefit all doors
- **Consistent behavior** - All doors work the same way
- **Easier maintenance** - Updates in one place
- **No workarounds** - Per CLAUDE.md Rule #14, fix root causes in SDK

### Creating a New SDK Widget

If user chooses to create an SDK widget:

1. Create widget in `sdk/engines/ui/blessed/widgets/{widget-name}.ts`
2. Export from `sdk/engines/ui/blessed/index.ts`
3. Add TypeScript types
4. Document in `sdk/README.md`
5. Then use it in the door

Example SDK widget structure:
```typescript
// sdk/engines/ui/blessed/widgets/my-widget.ts
import blessed, { Widgets } from 'neo-blessed';

export interface MyWidgetOptions extends Widgets.BoxOptions {
  // Custom options
}

export function myWidget(options: MyWidgetOptions): Widgets.BoxElement {
  const widget = blessed.box({
    ...options,
    // Widget implementation
  });

  // Add custom behavior

  return widget;
}
```

### Door-Specific Exception (Use Sparingly)

Only if user explicitly chooses this AND the widget is truly unique to this door:

```typescript
// In app.ts - clearly mark as exception
// NOTE: Door-specific widget - not suitable for SDK due to {reason}
function createSpecialWidget(options: any) {
  // Implementation
}
```

Document WHY it's not in the SDK in a comment.

---

## Common Patterns

### Dialog/Modal
```typescript
import { DialogManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const dialog = new DialogManager(this.screen);
const result = await dialog.confirm('Are you sure?', 'Confirm Action');
```

### Lists and Tables
```typescript
const list = blessed.list({
  parent: this.screen,
  items: ['Item 1', 'Item 2', 'Item 3'],
  keys: true,
  mouse: true,
  style: {
    selected: { fg: 'white', bg: 'blue' }
  }
});
```

### Text Input
```typescript
const textbox = blessed.textbox({
  parent: this.screen,
  inputOnFocus: true,
  style: { fg: 'white', bg: 'black' }
});
textbox.focus();
```

---

## After Creating the Door

1. **Build it**: `cd Doors/{door-name} && npm run build`
2. **Restart servers**: `./dev/scripts/start-servers.sh`
3. **Test thoroughly**: Enter door, interact, exit, verify BBS input works
4. **Test 5+ times**: Input must work correctly every time after exit

---

## Reference Examples

Look at these existing doors for patterns:
- `Doors/grandmaster/` - Chess game with full UI
- `Doors/livechat/` - Multi-user chat
- `Doors/card-lobby/` - Card game lobby with dialogs

---

## Session Data Access

The `DoorSession` object provides access to user and BBS information:

```typescript
// User information
const username = this.session.user?.username;        // Current user's name
const userId = this.session.user?.id;                // User ID
const accessLevel = this.session.user?.accessLevel;  // Access level (0-255)
const realName = this.session.user?.realName;        // Real name if set

// Node information
const nodeNumber = this.session.node;                // Current node number (1-99)

// Terminal information
const termWidth = this.session.terminalWidth || 80;  // Terminal width
const termHeight = this.session.terminalHeight || 24; // Terminal height

// Time information
const timeLeft = this.session.timeRemaining;         // Minutes remaining (if available)

// Input/Output streams
const input = this.session.input;                    // Readable stream
const output = this.session.output;                  // Writable stream

// Send raw output (bypass blessed)
this.session.output.write('Raw text to terminal\r\n');

// BBS functions (if available)
await this.session.sendMessage?.(targetNode, 'Hello!');  // Send to another node
```

### Checking Permissions

```typescript
// Check if user has sufficient access
if ((this.session.user?.accessLevel || 0) < 100) {
  // Show "access denied" and exit
  return;
}

// Check for sysop
const isSysop = (this.session.user?.accessLevel || 0) >= 255;
```

---

## Error Handling

**ALWAYS wrap door logic in try/catch to ensure clean exit on errors.**

```typescript
export class App {
  private session: DoorSession;
  private screen!: Widgets.Screen;
  private inputManager!: DoorInputManager;
  private resolveExit!: () => void;

  async run(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveExit = resolve;

      try {
        this.initializeUI();
      } catch (error) {
        this.handleFatalError(error);
      }
    });
  }

  private handleFatalError(error: unknown): void {
    // Log the error
    console.error('[DoorName] Fatal error:', error);

    // Try to show error to user
    try {
      if (this.screen) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.showErrorDialog(errorMsg);
      } else {
        // Screen not initialized, write directly
        this.session.output.write(`\r\n{red-fg}Error: ${error}{/}\r\n`);
      }
    } catch {
      // Ignore display errors during error handling
    }

    // Clean exit
    this.quit();
  }

  private showErrorDialog(message: string): void {
    const errorBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: 'line',
      style: { fg: 'white', bg: 'red', border: { fg: 'white' } }
    });

    errorBox.error(message, () => {
      this.quit();
    });
  }

  // Wrap async operations
  private async loadData(): Promise<void> {
    try {
      const data = await this.fetchSomething();
      this.processData(data);
    } catch (error) {
      // Handle gracefully - show message but don't crash
      this.showNotification(`Failed to load data: ${error}`);
    }
  }
}
```

### Error Boundaries for Event Handlers

```typescript
// Wrap event handlers to prevent crashes
this.screen.key(['enter'], () => {
  try {
    this.handleEnter();
  } catch (error) {
    console.error('[DoorName] Error in enter handler:', error);
    this.showNotification('An error occurred');
  }
});

// Helper for safe event handling
private safeHandler(fn: () => void | Promise<void>): () => void {
  return () => {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.catch(error => {
          console.error('[DoorName] Async handler error:', error);
        });
      }
    } catch (error) {
      console.error('[DoorName] Handler error:', error);
    }
  };
}

// Usage
button.on('press', this.safeHandler(() => this.doSomething()));
```

---

## Logging and Debugging

### Development Logging

```typescript
export class App {
  private debug = true;  // Set false for production
  private debugName = 'MyDoor';

  private log(...args: any[]): void {
    if (this.debug) {
      console.log(`[${this.debugName}]`, ...args);
    }
  }

  private logError(...args: any[]): void {
    console.error(`[${this.debugName}] ERROR:`, ...args);
  }

  private logState(): void {
    if (this.debug) {
      console.log(`[${this.debugName}] State:`, {
        user: this.session.user?.username,
        node: this.session.node,
        screenSize: `${this.screen.width}x${this.screen.height}`,
        focusedElement: this.screen.focused?.type
      });
    }
  }
}
```

### Debug Panel (Development Only)

```typescript
private createDebugPanel(): void {
  if (!this.debug) return;

  const debugBox = blessed.log({
    parent: this.screen,
    bottom: 4,
    right: 0,
    width: 40,
    height: 10,
    border: 'line',
    label: ' Debug ',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ', style: { bg: 'yellow' } },
    style: { fg: 'green', bg: 'black', border: { fg: 'gray' } }
  });

  // Log to debug panel
  this.debugLog = (msg: string) => {
    debugBox.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    this.screen.render();
  };
}

private debugLog: (msg: string) => void = () => {};
```

### Checking Logs

Logs appear in:
- Backend console when running `./dev/scripts/start-servers.sh`
- `logs/backend.log` for persistent logs
- Browser console (F12) for frontend issues

---

## Reading .info Tooltypes (Door Configuration)

Doors can read configuration from their .info file tooltypes:

```typescript
import { readInfoFile } from '@amiexpress/bbs-door-sdk/utils/info-file';
// Or if not in SDK, read manually

interface DoorConfig {
  maxPlayers: number;
  timeLimit: number;
  customSetting: string;
}

private async loadConfig(): Promise<DoorConfig> {
  const defaults: DoorConfig = {
    maxPlayers: 4,
    timeLimit: 30,
    customSetting: 'default'
  };

  try {
    // Read tooltypes from .info file
    // The .info file path is typically: Doors/{door-name}/{door-name}.info
    const infoPath = `Doors/${this.doorName}/${this.doorName}.info`;
    const tooltypes = await this.readTooltypes(infoPath);

    return {
      maxPlayers: parseInt(tooltypes['MAXPLAYERS'] || '') || defaults.maxPlayers,
      timeLimit: parseInt(tooltypes['TIMELIMIT'] || '') || defaults.timeLimit,
      customSetting: tooltypes['CUSTOMSETTING'] || defaults.customSetting
    };
  } catch (error) {
    this.log('Failed to read config, using defaults:', error);
    return defaults;
  }
}

// Example .info tooltypes:
// LOCATION=Doors/my-door
// STACK=20000
// PRELOADER=YES
// MAXPLAYERS=8
// TIMELIMIT=60
// CUSTOMSETTING=advanced
```

---

## File I/O with amigafs

**CRITICAL: Always use amigafs for file operations - AmigaOS is case-insensitive!**

```typescript
// WRONG - Don't use fs directly
import * as fs from 'fs';  // NO!

// CORRECT - Use amigafs
import * as amigafs from '@amiexpress/bbs-door-sdk/utils/amigafs';
// Or from backend: import * as amigafs from '../utils/amigafs';

// Check if file exists (case-insensitive)
if (amigafs.existsSync('Doors/MyDoor/Data.txt')) {
  // Works even if actual file is "data.TXT" or "DATA.txt"
}

// Read file
const content = amigafs.readFileSync('Doors/MyDoor/scores.dat', 'utf-8');

// Write file
amigafs.writeFileSync('Doors/MyDoor/scores.dat', JSON.stringify(scores));

// Read directory
const files = amigafs.readdirSync('Doors/MyDoor/Data');

// Create directory
amigafs.mkdirSync('Doors/MyDoor/Data', { recursive: true });

// Get file stats
const stats = amigafs.statSync('Doors/MyDoor/config.json');

// Available functions (22 total):
// existsSync, readFileSync, writeFileSync, appendFileSync
// readdirSync, mkdirSync, rmdirSync, unlinkSync
// statSync, lstatSync, realpathSync, renameSync
// copyFileSync, accessSync, chmodSync, chownSync
// readFile, writeFile, readdir, mkdir, stat, access
```

### Door Data Directory Pattern

```typescript
private getDataPath(filename: string): string {
  return `Doors/${this.doorName}/data/${filename}`;
}

private ensureDataDir(): void {
  const dataDir = `Doors/${this.doorName}/data`;
  if (!amigafs.existsSync(dataDir)) {
    amigafs.mkdirSync(dataDir, { recursive: true });
  }
}

private loadScores(): ScoreEntry[] {
  const path = this.getDataPath('scores.json');
  if (!amigafs.existsSync(path)) {
    return [];
  }
  try {
    return JSON.parse(amigafs.readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

private saveScores(scores: ScoreEntry[]): void {
  this.ensureDataDir();
  amigafs.writeFileSync(
    this.getDataPath('scores.json'),
    JSON.stringify(scores, null, 2)
  );
}
```

---

## Focus Management

Proper focus handling ensures keyboard navigation works correctly.

```typescript
export class App {
  private focusableElements: Widgets.BlessedElement[] = [];
  private currentFocusIndex = 0;

  private createUI(): void {
    // Create elements and track focusable ones
    const button1 = blessed.button({ /* ... */ keys: true, mouse: true });
    const button2 = blessed.button({ /* ... */ keys: true, mouse: true });
    const input1 = blessed.textbox({ /* ... */ keys: true, mouse: true });

    // Build focus order
    this.focusableElements = [button1, input1, button2];

    // Set initial focus
    this.focusableElements[0].focus();

    // Tab/Shift+Tab navigation
    this.screen.key(['tab'], () => this.focusNext());
    this.screen.key(['S-tab'], () => this.focusPrevious());
  }

  private focusNext(): void {
    this.currentFocusIndex = (this.currentFocusIndex + 1) % this.focusableElements.length;
    this.focusableElements[this.currentFocusIndex].focus();
    this.screen.render();
  }

  private focusPrevious(): void {
    this.currentFocusIndex = (this.currentFocusIndex - 1 + this.focusableElements.length) % this.focusableElements.length;
    this.focusableElements[this.currentFocusIndex].focus();
    this.screen.render();
  }

  // Focus specific element
  private focusElement(element: Widgets.BlessedElement): void {
    const index = this.focusableElements.indexOf(element);
    if (index !== -1) {
      this.currentFocusIndex = index;
      element.focus();
      this.screen.render();
    }
  }
}
```

### Focus Indicators

```typescript
// Style focused elements clearly
const button = blessed.button({
  style: {
    fg: 'white',
    bg: 'gray',
    focus: {
      fg: 'white',
      bg: 'blue',        // Highlight when focused
      bold: true
    },
    hover: {
      fg: 'white',
      bg: 'blue'
    }
  }
});

// Show focus ring around containers
element.on('focus', () => {
  element.style.border = { fg: 'yellow' };
  this.screen.render();
});

element.on('blur', () => {
  element.style.border = { fg: 'white' };
  this.screen.render();
});
```

---

## Screen Size Handling

Handle different terminal sizes gracefully.

```typescript
export class App {
  private minWidth = 80;
  private minHeight = 24;

  private initializeUI(): void {
    this.screen = blessed.screen({ /* ... */ });

    // Check minimum size
    if (!this.checkScreenSize()) {
      this.showSizeError();
      return;
    }

    // Handle resize events
    this.screen.on('resize', () => {
      if (this.checkScreenSize()) {
        this.handleResize();
      } else {
        this.showSizeError();
      }
    });

    this.createUI();
  }

  private checkScreenSize(): boolean {
    const width = this.screen.width as number;
    const height = this.screen.height as number;
    return width >= this.minWidth && height >= this.minHeight;
  }

  private showSizeError(): void {
    const width = this.screen.width as number;
    const height = this.screen.height as number;

    // Clear and show error
    this.screen.children.forEach(child => child.destroy());

    blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 'shrink',
      height: 'shrink',
      content: `Terminal too small!\n\nCurrent: ${width}x${height}\nRequired: ${this.minWidth}x${this.minHeight}\n\nPlease resize your terminal.`,
      style: { fg: 'red', bg: 'black' },
      border: 'line'
    });

    this.screen.render();
  }

  private handleResize(): void {
    // Recreate UI for new size or adjust layouts
    this.log(`Resized to ${this.screen.width}x${this.screen.height}`);

    // Option 1: Recreate UI
    // this.screen.children.forEach(child => child.destroy());
    // this.createUI();

    // Option 2: Just re-render (if using percentage-based layouts)
    this.screen.render();
  }

  // Responsive layout helpers
  private getContentWidth(): number | string {
    const width = this.screen.width as number;
    if (width >= 120) return 100;      // Fixed width on large screens
    if (width >= 100) return '80%';    // Percentage on medium
    return '100%';                      // Full width on small
  }
}
```

---

## Keyboard Shortcuts

Standard keyboard shortcut patterns for doors.

```typescript
export class App {
  private setupKeyboardShortcuts(): void {
    // Standard shortcuts
    this.screen.key(['q', 'Q', 'escape'], () => this.quit());
    this.screen.key(['?', 'f1', 'h', 'H'], () => this.showHelp());
    this.screen.key(['r', 'R', 'f5'], () => this.refresh());

    // Navigation
    this.screen.key(['tab'], () => this.focusNext());
    this.screen.key(['S-tab'], () => this.focusPrevious());
    this.screen.key(['home'], () => this.focusFirst());
    this.screen.key(['end'], () => this.focusLast());

    // Actions (use with modifier or function keys)
    this.screen.key(['C-s'], () => this.save());           // Ctrl+S
    this.screen.key(['C-n'], () => this.newItem());        // Ctrl+N
    this.screen.key(['delete', 'C-d'], () => this.deleteItem()); // Delete or Ctrl+D
    this.screen.key(['enter'], () => this.selectItem());
    this.screen.key(['space'], () => this.toggleItem());

    // Number shortcuts (for menus)
    for (let i = 1; i <= 9; i++) {
      this.screen.key([i.toString()], () => this.selectOption(i));
    }
  }

  private showHelp(): void {
    const helpContent = `
{bold}Keyboard Shortcuts{/bold}

{cyan-fg}Navigation:{/}
  Tab / Shift+Tab  - Move between items
  Arrow keys       - Navigate within item
  Home / End       - First / Last item

{cyan-fg}Actions:{/}
  Enter            - Select / Confirm
  Space            - Toggle option
  Ctrl+S           - Save
  Ctrl+N           - New item
  Delete           - Delete item

{cyan-fg}General:{/}
  ? / F1 / H       - This help
  R / F5           - Refresh
  Q / Escape       - Quit

Press any key to close...
    `.trim();

    const helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 22,
      content: helpContent,
      border: 'line',
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      label: ' Help ',
      keys: true
    });

    helpBox.key(['escape', 'q', 'enter', 'space'], () => {
      helpBox.destroy();
      this.screen.render();
    });

    helpBox.focus();
    this.screen.render();
  }
}
```

### Shortcut Hints in UI

```typescript
// Footer with shortcut hints
const shortcutBar = blessed.box({
  parent: this.screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: ' {gray-fg}Q{/}:Quit  {gray-fg}?{/}:Help  {gray-fg}Tab{/}:Next  {gray-fg}Enter{/}:Select',
  style: { fg: 'white', bg: 'blue' }
});
```

---

## Loading ANSI Art Screens

Display ANSI art files (.ans, .txt) from the Screens directory.

```typescript
import * as amigafs from '@amiexpress/bbs-door-sdk/utils/amigafs';

export class App {
  private async displayScreen(screenName: string): Promise<void> {
    // Try multiple extensions and paths
    const paths = [
      `Screens/${screenName}`,
      `Screens/${screenName}.ans`,
      `Screens/${screenName}.txt`,
      `Doors/${this.doorName}/Screens/${screenName}`,
      `Doors/${this.doorName}/Screens/${screenName}.ans`
    ];

    for (const path of paths) {
      if (amigafs.existsSync(path)) {
        const content = amigafs.readFileSync(path, 'utf-8');
        this.showAnsiContent(content);
        return;
      }
    }

    this.log(`Screen not found: ${screenName}`);
  }

  private showAnsiContent(content: string): void {
    // Create fullscreen box for ANSI display
    const ansiBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      content: content,
      style: { fg: 'white', bg: 'black' },
      scrollable: true,
      keys: true,
      mouse: true
    });

    // Press any key to continue
    ansiBox.key(['escape', 'enter', 'space', 'q'], () => {
      ansiBox.destroy();
      this.screen.render();
    });

    ansiBox.focus();
    this.screen.render();
  }

  // For splash screens with auto-dismiss
  private async showSplash(screenName: string, durationMs = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.displayScreen(screenName);

      const timeout = setTimeout(() => {
        resolve();
      }, durationMs);

      // Allow early dismiss
      this.screen.onceKey(['escape', 'enter', 'space'], () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
```

---

## Progress Indicators

### Loading Spinner

```typescript
private showLoading(message = 'Loading...'): Widgets.BoxElement {
  const spinnerChars = ['|', '/', '-', '\\'];
  let spinnerIndex = 0;

  const loadingBox = blessed.box({
    parent: this.screen,
    top: 'center',
    left: 'center',
    width: message.length + 6,
    height: 3,
    content: `{center}${spinnerChars[0]} ${message}{/center}`,
    border: 'line',
    style: { fg: 'cyan', bg: 'black', border: { fg: 'cyan' } }
  });

  const interval = setInterval(() => {
    spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
    loadingBox.setContent(`{center}${spinnerChars[spinnerIndex]} ${message}{/center}`);
    this.screen.render();
  }, 100);

  // Store interval for cleanup
  (loadingBox as any)._spinnerInterval = interval;

  this.screen.render();
  return loadingBox;
}

private hideLoading(loadingBox: Widgets.BoxElement): void {
  const interval = (loadingBox as any)._spinnerInterval;
  if (interval) clearInterval(interval);
  loadingBox.destroy();
  this.screen.render();
}

// Usage
const loader = this.showLoading('Fetching data...');
try {
  await this.fetchData();
} finally {
  this.hideLoading(loader);
}
```

### Progress Bar

```typescript
private createProgressBar(label: string): Widgets.ProgressBarElement {
  return blessed.progressbar({
    parent: this.screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 3,
    border: 'line',
    label: ` ${label} `,
    style: {
      fg: 'white',
      bg: 'black',
      bar: { bg: 'green' },
      border: { fg: 'cyan' }
    },
    filled: 0,
    orientation: 'horizontal'
  });
}

// Usage
const progress = this.createProgressBar('Downloading');
this.screen.render();

for (let i = 0; i <= 100; i += 10) {
  progress.setProgress(i);
  progress.setLabel(` Downloading ${i}% `);
  this.screen.render();
  await this.sleep(100);
}

progress.destroy();
this.screen.render();
```

---

## Game Mode vs Non-Game Mode

Choose the right mode based on your door's input needs.

### When to Use Game Mode

```typescript
// Game mode: enableGameMode: true
// - Real-time games (action, arcade)
// - Raw key input needed (no line buffering)
// - Need immediate key response
// - Arrow keys, WASD, etc.

this.inputManager = new DoorInputManager(this.session, this.screen, {
  enableGameMode: true,    // <-- Game mode ON
  enableGrabKeys: true,
  enableMouse: true
});

// In game mode, you receive raw key events
this.screen.key(['up', 'w', 'W'], () => this.moveUp());
this.screen.key(['down', 's', 'S'], () => this.moveDown());
this.screen.key(['left', 'a', 'A'], () => this.moveLeft());
this.screen.key(['right', 'd', 'D'], () => this.moveRight());
this.screen.key(['space'], () => this.fire());
```

### When NOT to Use Game Mode

```typescript
// Non-game mode: enableGameMode: false
// - Menu-driven interfaces
// - Form input
// - Text entry
// - Normal navigation

this.inputManager = new DoorInputManager(this.session, this.screen, {
  enableGameMode: false,   // <-- Game mode OFF (default)
  enableGrabKeys: true,
  enableMouse: true
});

// Normal blessed key handling works
this.screen.key(['enter'], () => this.selectItem());
this.screen.key(['tab'], () => this.focusNext());
```

### Hybrid: Switching Modes

```typescript
// Some doors need both - e.g., menu to select game, then game mode
private startGame(): void {
  // Switch to game mode
  this.inputManager.disable();
  this.inputManager = new DoorInputManager(this.session, this.screen, {
    enableGameMode: true,
    enableGrabKeys: true,
    enableMouse: false  // Often disable mouse in games
  });
  this.inputManager.enable();

  this.setupGameControls();
}

private returnToMenu(): void {
  // Switch back to menu mode
  this.inputManager.disable();
  this.inputManager = new DoorInputManager(this.session, this.screen, {
    enableGameMode: false,
    enableGrabKeys: true,
    enableMouse: true
  });
  this.inputManager.enable();

  this.showMainMenu();
}
```

---

## Timers and Intervals

**CRITICAL: Always clean up timers on exit!**

```typescript
export class App {
  private timers: NodeJS.Timeout[] = [];
  private intervals: NodeJS.Timeout[] = [];

  // Safe timer creation
  private setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(callback, ms);
    this.timers.push(timer);
    return timer;
  }

  // Safe interval creation
  private setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(callback, ms);
    this.intervals.push(interval);
    return interval;
  }

  // Clear specific timer
  private clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    const index = this.timers.indexOf(timer);
    if (index > -1) this.timers.splice(index, 1);
  }

  // Clear specific interval
  private clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    const index = this.intervals.indexOf(interval);
    if (index > -1) this.intervals.splice(index, 1);
  }

  // Clean up ALL timers - call in quit()
  private cleanupTimers(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.intervals.forEach(i => clearInterval(i));
    this.timers = [];
    this.intervals = [];
  }

  private quit(): void {
    // CRITICAL: Clean up timers FIRST
    this.cleanupTimers();

    this.inputManager.disable();
    this.screen.destroy();
    this.resolveExit();
  }

  // Usage example - game loop
  private startGameLoop(): void {
    this.setInterval(() => {
      this.updateGame();
      this.renderGame();
      this.screen.render();
    }, 1000 / 30);  // 30 FPS
  }

  // Usage example - countdown timer
  private startCountdown(seconds: number, onComplete: () => void): void {
    let remaining = seconds;

    const interval = this.setInterval(() => {
      remaining--;
      this.updateTimerDisplay(remaining);

      if (remaining <= 0) {
        this.clearInterval(interval);
        onComplete();
      }
    }, 1000);
  }
}
```

---

## Multi-Node Awareness

For doors that interact across multiple BBS nodes.

```typescript
export class App {
  private nodeNumber: number;
  private lockFile: string;

  constructor(session: DoorSession) {
    this.session = session;
    this.nodeNumber = session.node || 1;
    this.lockFile = `Doors/${this.doorName}/node${this.nodeNumber}.lock`;
  }

  // Check if another instance is running on same node
  private async acquireNodeLock(): Promise<boolean> {
    if (amigafs.existsSync(this.lockFile)) {
      // Lock exists - check if stale
      try {
        const stats = amigafs.statSync(this.lockFile);
        const age = Date.now() - stats.mtimeMs;
        if (age > 60000) {  // Stale if older than 60 seconds
          amigafs.unlinkSync(this.lockFile);
        } else {
          return false;  // Lock is active
        }
      } catch {
        // Error reading lock, try to proceed
      }
    }

    // Create lock file
    amigafs.writeFileSync(this.lockFile, `${Date.now()}\n${this.nodeNumber}`);
    return true;
  }

  private releaseNodeLock(): void {
    try {
      if (amigafs.existsSync(this.lockFile)) {
        amigafs.unlinkSync(this.lockFile);
      }
    } catch {
      // Ignore errors releasing lock
    }
  }

  // Get active nodes running this door
  private getActiveNodes(): number[] {
    const nodes: number[] = [];
    for (let i = 1; i <= 99; i++) {
      const lockFile = `Doors/${this.doorName}/node${i}.lock`;
      if (amigafs.existsSync(lockFile)) {
        try {
          const stats = amigafs.statSync(lockFile);
          if (Date.now() - stats.mtimeMs < 60000) {
            nodes.push(i);
          }
        } catch {
          // Ignore
        }
      }
    }
    return nodes;
  }

  // Simple file-based messaging between nodes
  private sendToNode(targetNode: number, message: object): void {
    const msgFile = `Doors/${this.doorName}/msg_to_${targetNode}.json`;
    const messages = this.readMessages(msgFile);
    messages.push({
      from: this.nodeNumber,
      time: Date.now(),
      data: message
    });
    amigafs.writeFileSync(msgFile, JSON.stringify(messages));
  }

  private checkMessages(): object[] {
    const msgFile = `Doors/${this.doorName}/msg_to_${this.nodeNumber}.json`;
    const messages = this.readMessages(msgFile);
    // Clear after reading
    if (messages.length > 0) {
      amigafs.writeFileSync(msgFile, '[]');
    }
    return messages;
  }

  private readMessages(file: string): any[] {
    if (!amigafs.existsSync(file)) return [];
    try {
      return JSON.parse(amigafs.readFileSync(file, 'utf-8'));
    } catch {
      return [];
    }
  }

  // Clean up on exit
  private quit(): void {
    this.releaseNodeLock();
    this.cleanupTimers();
    this.inputManager.disable();
    this.screen.destroy();
    this.resolveExit();
  }
}
```

---

## Data Persistence

Patterns for saving door state, scores, and user data.

```typescript
interface ScoreEntry {
  username: string;
  score: number;
  date: string;
}

interface UserState {
  lastPlayed: string;
  highScore: number;
  level: number;
  settings: Record<string, any>;
}

export class App {
  private dataDir: string;

  constructor(session: DoorSession) {
    this.session = session;
    this.dataDir = `Doors/${this.doorName}/data`;
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!amigafs.existsSync(this.dataDir)) {
      amigafs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Global scores (all users)
  private loadScores(): ScoreEntry[] {
    const path = `${this.dataDir}/scores.json`;
    if (!amigafs.existsSync(path)) return [];
    try {
      return JSON.parse(amigafs.readFileSync(path, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveScores(scores: ScoreEntry[]): void {
    // Keep top 100
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 100);
    amigafs.writeFileSync(
      `${this.dataDir}/scores.json`,
      JSON.stringify(scores, null, 2)
    );
  }

  private addScore(score: number): void {
    const scores = this.loadScores();
    scores.push({
      username: this.session.user?.username || 'Unknown',
      score,
      date: new Date().toISOString()
    });
    this.saveScores(scores);
  }

  // Per-user state
  private getUserStateFile(): string {
    const username = this.session.user?.username || 'guest';
    // Sanitize username for filename
    const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '_');
    return `${this.dataDir}/user_${safeUsername}.json`;
  }

  private loadUserState(): UserState {
    const path = this.getUserStateFile();
    const defaults: UserState = {
      lastPlayed: '',
      highScore: 0,
      level: 1,
      settings: {}
    };

    if (!amigafs.existsSync(path)) return defaults;
    try {
      return { ...defaults, ...JSON.parse(amigafs.readFileSync(path, 'utf-8')) };
    } catch {
      return defaults;
    }
  }

  private saveUserState(state: UserState): void {
    state.lastPlayed = new Date().toISOString();
    amigafs.writeFileSync(
      this.getUserStateFile(),
      JSON.stringify(state, null, 2)
    );
  }

  // Atomic save (write to temp, then rename)
  private atomicSave(path: string, data: string): void {
    const tempPath = `${path}.tmp`;
    amigafs.writeFileSync(tempPath, data);
    amigafs.renameSync(tempPath, path);
  }
}
```

---

## Common Pitfalls

**Avoid these common mistakes that break doors:**

### 1. Forgetting Input Cleanup
```typescript
// WRONG - Input breaks after exit
private quit(): void {
  this.screen.destroy();  // Missing inputManager.disable()!
  this.resolveExit();
}

// CORRECT
private quit(): void {
  this.inputManager.disable();  // ALWAYS disable first
  this.screen.destroy();
  this.resolveExit();
}
```

### 2. Timer Leaks
```typescript
// WRONG - Interval keeps running after door exits
setInterval(() => this.update(), 100);

// CORRECT - Track and clean up
this.intervals.push(setInterval(() => this.update(), 100));
// Then in quit(): this.intervals.forEach(i => clearInterval(i));
```

### 3. Using fs Instead of amigafs
```typescript
// WRONG - Case-sensitive, breaks on AmigaOS paths
import * as fs from 'fs';
fs.existsSync('Doors/MyDoor/Data.txt');

// CORRECT - Case-insensitive
import * as amigafs from '@amiexpress/bbs-door-sdk/utils/amigafs';
amigafs.existsSync('Doors/MyDoor/Data.txt');
```

### 4. Not Handling Resize
```typescript
// WRONG - UI breaks on terminal resize
// (no resize handler)

// CORRECT
this.screen.on('resize', () => {
  this.screen.render();  // At minimum, re-render
});
```

### 5. Blocking the Event Loop
```typescript
// WRONG - Freezes UI
while (processing) {
  doExpensiveWork();
}

// CORRECT - Use async/await or setTimeout
async processData() {
  for (const item of items) {
    await this.processItem(item);
    await this.sleep(0);  // Yield to event loop
  }
}
```

### 6. Raw ANSI Codes
```typescript
// WRONG - Breaks blessed color handling
content: '\x1b[31mRed text\x1b[0m'

// CORRECT - Use blessed tags
content: '{red-fg}Red text{/}'
```

### 7. Emojis in Output
```typescript
// WRONG - Terminal encoding issues
content: '✓ Success! 🎉'

// CORRECT - ASCII only
content: '[OK] Success!'
```

### 8. Not Reserving Footer Space
```typescript
// WRONG - Buttons get clipped
const mainBox = blessed.box({ height: '100%' });

// CORRECT - Reserve footer rows
const mainBox = blessed.box({ height: '100%-3' });
```

### 9. Uncaught Promise Rejections
```typescript
// WRONG - Crashes on error
button.on('press', async () => {
  await this.doAsyncThing();  // If this throws, door crashes
});

// CORRECT - Handle errors
button.on('press', async () => {
  try {
    await this.doAsyncThing();
  } catch (error) {
    this.showError(error);
  }
});
```

### 10. Hardcoded Dimensions
```typescript
// WRONG - Breaks on different terminal sizes
const box = blessed.box({ width: 80, height: 24 });

// CORRECT - Use percentages or calculate
const box = blessed.box({ width: '100%', height: '100%-3' });
// Or
const width = Math.min(80, this.screen.width as number - 4);
```

---

## Comprehensive Test Checklist

Run through this checklist before considering a door complete:

### Basic Functionality
- [ ] Door starts without errors
- [ ] All UI elements render correctly
- [ ] All buttons/controls are clickable
- [ ] All keyboard shortcuts work
- [ ] Help screen displays (? or F1)
- [ ] Quit works (Q, ESC, quit button)

### Input Handling
- [ ] Tab navigation works through all focusable elements
- [ ] Shift+Tab navigates backwards
- [ ] Mouse clicks work on all interactive elements
- [ ] Text input fields accept text
- [ ] No keys are "stuck" or repeated

### Exit Behavior (CRITICAL)
- [ ] Exit via Q key - BBS input works after
- [ ] Exit via ESC key - BBS input works after
- [ ] Exit via quit button - BBS input works after
- [ ] Exit via menu option - BBS input works after
- [ ] Test exit 5+ times in a row - input must work every time
- [ ] Type a BBS command immediately after exit - should work

### Error Handling
- [ ] Door handles missing data files gracefully
- [ ] Door handles corrupted data files gracefully
- [ ] Error messages display clearly
- [ ] Door doesn't crash on unexpected input
- [ ] Door recovers from network issues (if applicable)

### Screen/Terminal
- [ ] Works at 80x24 minimum
- [ ] Resize doesn't break layout
- [ ] Resize doesn't cause errors
- [ ] Content doesn't overflow screen
- [ ] Footer is always visible

### Data Persistence (if applicable)
- [ ] Scores/state saves correctly
- [ ] Scores/state loads on re-entry
- [ ] Data survives server restart
- [ ] Per-user data is isolated

### Multi-Node (if applicable)
- [ ] Multiple users can run simultaneously
- [ ] Node locking prevents conflicts
- [ ] Cross-node messaging works
- [ ] Lock files clean up on exit

### Performance
- [ ] UI is responsive (no lag)
- [ ] No memory leaks during extended use
- [ ] Timers/intervals don't accumulate
- [ ] CPU usage is reasonable

### Visual/UX
- [ ] Colors display correctly
- [ ] Focus indicators are visible
- [ ] Current state is always clear
- [ ] No visual glitches on redraw

### Edge Cases
- [ ] Works for brand new user (no saved data)
- [ ] Works for user with maximum data
- [ ] Handles rapid key presses
- [ ] Handles rapid mouse clicks
- [ ] Works if user has low access level (if restricted)

### Final Verification
```bash
# Build fresh
cd Doors/{door-name}
rm -rf dist node_modules
npm install
npm run build

# Restart BBS
./dev/scripts/start-servers.sh

# Test in browser
# Run door at least 5 times, testing exit each time
```
