# TypeScript Door Troubleshooting Guide

**CRITICAL**: This guide prevents common errors when creating or updating TypeScript doors. Read this BEFORE creating any door.

## Table of Contents

1. [Common Errors and Solutions](#common-errors-and-solutions)
2. [Required Door Structure](#required-door-structure)
3. [Import Paths](#import-paths)
4. [Export Patterns](#export-patterns)
5. [Compilation Checklist](#compilation-checklist)
6. [Testing Checklist](#testing-checklist)

---

## Common Errors and Solutions

### Error: "Invalid TypeScript door: Must export Door instance or runDoor() function"

**Cause**: The door's main file doesn't export the required pattern.

**Solution**: Your door MUST export either:

#### Option 1: SDK v2.0 Door Instance (RECOMMENDED)

**File Structure**:
```
my-door/
├── package.json  (main: "index.ts")
├── tsconfig.json (include: ["index.ts", "app.ts"])
├── index.ts      (exports Door instance)
└── app.ts        (contains createApp() logic)
```

**index.ts** (Entry Point):
```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'My Door',
  version: '1.0.0',
  author: 'Your Name',
});

door.onStart(async (ctx: any) => {
  // ctx = { socket, bbsSession, user, bbs, params }
  await createApp(ctx);
});

door.onClose(async (ctx: any) => {
  // Cleanup handled by createApp
});

door.onError(async (ctx: any, error: Error) => {
  console.error('Door error:', error);
});

export default door;  // CRITICAL: Must export Door instance as default
```

**app.ts** (Door Logic):
```typescript
export async function createApp(session: any) {
  const { bbs, user, socket } = session;
  // Your door logic here
}
```

**package.json**:
```json
{
  "name": "my-door",
  "main": "index.ts",  // MUST point to index.ts, not app.ts
  "type": "module"
}
```

**tsconfig.json**:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["index.ts", "app.ts"],  // MUST include index.ts first
  "exclude": ["node_modules", "dist"]
}
```

#### Option 2: Legacy runDoor() Pattern (NOT RECOMMENDED)

**package.json**:
```json
{
  "name": "my-door",
  "main": "index.ts",
  "type": "module"
}
```

**index.ts**:
```typescript
export async function runDoor(session: any) {
  const { bbs, user, socket, params } = session;
  // Door logic here
}
```

**WHY Option 1 is Better**:
- Separates entry point (index.ts) from logic (app.ts)
- Easier to maintain and test
- Follows SDK v2.0 patterns
- Better lifecycle management (onStart, onClose, onError)

---

### Error: "Cannot find module '../../engines/ui/blessed'"

**Cause**: Using relative imports instead of package imports.

**WRONG** (Relative Imports):
```typescript
// DO NOT DO THIS
import blessed from '../../engines/ui/blessed';
import { createBox } from '../../utils/blessed-helpers';
```

**CORRECT** (Package Imports):
```typescript
// ALWAYS DO THIS
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

**Why**: Relative imports break when the door is compiled and executed from a different location. Package imports work from any location.

**Search and Replace** (fix all at once):
```bash
# From your door directory
find . -name "*.ts" -exec sed -i '' \
  "s|from '../../../engines/ui/blessed'|from '@amiexpress/bbs-door-sdk/engines/ui/blessed'|g" {} \;
find . -name "*.ts" -exec sed -i '' \
  "s|from '../../engines/ui/blessed'|from '@amiexpress/bbs-door-sdk/engines/ui/blessed'|g" {} \;
find . -name "*.ts" -exec sed -i '' \
  "s|from '../../utils/blessed-helpers'|from '@amiexpress/bbs-door-sdk/utils/blessed-helpers'|g" {} \;
```

---

### Error: "Module has no exported member 'Widgets'"

**Cause**: The blessed module doesn't export a `Widgets` namespace. Types are exported directly.

**WRONG**:
```typescript
import blessed, { Screen, Widgets } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

function createInputHistory(screen: Screen, inputBox: Widgets.TextboxElement) {
  // ...
}
```

**CORRECT**:
```typescript
import blessed, { Screen, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

function createInputHistory(screen: Screen, inputBox: Textbox) {
  // ...
}
```

**Available Type Exports**:
```typescript
import type {
  Screen,
  Element,
  Box,
  Text,
  List,
  Form,
  Textbox,
  Input,
  Textarea,
  Button,
  ProgressBar,
  Table,
  Log,
  ScrollableBox,
  ScrollableText,
  Checkbox,
  RadioButton,
  RadioSet,
  Message,
  Question,
  Prompt,
  Loading,
  // ... and many more
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
```

---

### Error: "Cannot find name 'loadingBox'" or Other Undefined Variables

**Cause**: Variable declared in one scope but used in another, or never declared at all.

**Example of the Problem**:
```typescript
// In app.ts
function showLoading(text: string) {
  loadingBox.load(text);  // ERROR: loadingBox is not defined
}
```

**Solution**: Declare the variable BEFORE using it.

```typescript
// Create the loading widget first
const loadingBox = blessed.loading({
  parent: screen,
  top: 'center',
  left: 'center',
  width: '50%',
  height: 5,
  label: ' Loading ',
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' },
  },
  hidden: true,
});

// Now you can use it
function showLoading(text: string) {
  loadingBox.load(text);
}
```

**Common Pattern**: Widgets must be created BEFORE functions that use them.

---

### Error: "Argument of type '(tab: "channels" | "users") => void' is not assignable to parameter of type '(t: string) => void'"

**Cause**: Function with strict type (union type) passed to function expecting broader type.

**Solution**: Create a wrapper function that accepts the broader type and validates it.

**WRONG**:
```typescript
function switchSidebarTab(tab: 'channels' | 'users') {
  // ...
}

// Passed directly to function expecting (t: string) => void
setupKeyboardShortcuts(screen, ..., switchSidebarTab, ...);  // ERROR
```

**CORRECT**:
```typescript
function switchSidebarTab(tab: 'channels' | 'users') {
  // ...
}

// Create wrapper
const switchSidebarTabWrapper = (t: string) => {
  if (t === 'channels' || t === 'users') {
    switchSidebarTab(t);
  }
};

// Pass wrapper
setupKeyboardShortcuts(screen, ..., switchSidebarTabWrapper, ...);  // OK
```

---

### Error: "Unicode escape sequences are only available when the Unicode (u) flag or the Unicode Sets (v) flag is set"

**Cause**: Regex uses Unicode escape sequences without the `u` flag.

**WRONG**:
```typescript
text.replace(/[\u{0300}-\u{036F}]/g, '')  // Missing 'u' flag
```

**CORRECT**:
```typescript
text.replace(/[\u{0300}-\u{036F}]/gu, '')  // Added 'u' flag
```

**Pattern**: All regex with `\u{...}` escape sequences MUST have the `u` flag.

---

### Error: "Object literal may only specify known properties, and 'index' does not exist in type 'ListOptions'"

**Cause**: Attempting to set z-index using an `index` property in blessed element options.

**WRONG**:
```typescript
const commandSuggestions = createList({
  parent: screen,
  bottom: 10,
  left: 0,
  width: 60,
  height: 10,
  index: 1000,  // ERROR: 'index' is not a valid option
  style: {
    fg: 'white',
    bg: 'black',
  },
});
```

**CORRECT**:
```typescript
const commandSuggestions = createList({
  parent: screen,
  bottom: 10,
  left: 0,
  width: 60,
  height: 10,
  style: {
    fg: 'white',
    bg: 'black',
  },
});

// Set z-index AFTER creation using setIndex() method
commandSuggestions.setIndex(1000);
```

**Why**: Blessed elements use a `setIndex(index: number)` method to control z-index (stacking order), not an `index` property in the options object.

**Use Cases**:
- Autocomplete suggestions that must appear above chat logs
- Modal dialogs that overlay other content
- Context menus that should appear on top
- Tooltips and popups

**Common Pattern**:
```typescript
// Create overlay element
const overlay = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  border: { type: 'line' },
  hidden: true,
});

// Set high z-index to ensure it appears above other elements
overlay.setIndex(999);
```

**Z-Index Guidelines**:
- Default elements: 0-100
- Overlays and popups: 100-500
- Autocomplete/suggestions: 500-900
- Modal dialogs: 900-999
- Critical alerts: 1000+

---

## Required Door Structure

### Minimal SDK v2.0 Door

```
my-door/
├── package.json       # Metadata and dependencies
├── tsconfig.json      # TypeScript configuration
├── index.ts           # Entry point (exports Door instance)
├── app.ts             # Main door logic
└── README.md          # Documentation
```

### Full Featured Door

```
my-door/
├── package.json
├── tsconfig.json
├── index.ts           # Entry point
├── app.ts             # Main logic
├── core/              # Core modules
│   ├── state.ts       # State management
│   └── formatter.ts   # Formatting utilities
├── services/          # Services
│   └── events.ts      # Event handling
├── handlers/          # Event handlers
│   ├── message.ts
│   └── command.ts
├── ui/                # UI components
│   ├── screen.ts
│   ├── menu-bar.ts
│   └── status-bar.ts
├── overlays/          # Modal overlays
│   ├── help-screen.ts
│   └── settings.ts
├── features/          # Feature modules
│   └── file-sharing.ts
├── commands/          # Slash commands
│   └── index.ts
├── utils/             # Utilities
│   └── format.ts
├── types/             # Type definitions
│   └── index.ts
└── README.md
```

---

## Import Paths

### ALWAYS Use Package Imports

```typescript
// Core SDK
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';

// Blessed UI Engine
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

// Blessed Helpers (RECOMMENDED for all widget creation)
import {
  createBox,
  createList,
  createText,
  createTextarea,
  createButton,
  createTable,
  createLog
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { colorize, Tags } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Blessed Utilities
import { stripTags, cleanTags } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/helpers';

// Audio Engine
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';

// Type Imports
import type { Screen, Element, Box, List, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Log } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';
```

### NEVER Use Relative Imports for SDK Modules

```typescript
// WRONG - Will break
import blessed from '../../engines/ui/blessed';
import { createBox } from '../../utils/blessed-helpers';

// CORRECT - Always works
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

### Relative Imports OK for Door-Internal Modules

```typescript
// OK - Internal door modules
import { createInitialState } from './core/state';
import { MessageHandler } from './handlers/message';
import { createMenuBar } from './ui/menu-bar';
```

---

## Export Patterns

### SDK v2.0 Pattern (REQUIRED for New Doors)

**index.ts**:
```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'My Door',
  version: '1.0.0',
  author: 'Your Name',
});

door.onStart(async (ctx: any) => {
  await createApp(ctx);
});

door.onClose(async (ctx: any) => {
  // Cleanup
});

door.onError(async (ctx: any, error: Error) => {
  console.error('Door error:', error);
});

export default door;  // CRITICAL: default export
```

**app.ts**:
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export async function createApp(session: any) {
  const { bbs, user, socket, params } = session;

  const screen = blessed.screen({
    smartCSR: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data)
  });

  // Door logic

  await new Promise<void>((resolve) => {
    screen.key(['C-c', 'q'], () => {
      screen.destroy();
      resolve();
    });
  });
}
```

---

## Compilation Checklist

Before running your door, ALWAYS:

### 1. Check package.json

```bash
cd sdk/doors/your-door
cat package.json | grep main
# MUST show: "main": "index.ts"
```

### 2. Build the Door

```bash
cd sdk/doors/your-door
npm run build
```

**Expected Output**: No errors (silence or build success message)

**If you see errors**:
- Read each error carefully
- Fix ALL errors before proceeding
- Run `npm run build` again
- Repeat until zero errors

### 3. Check Build Output

```bash
ls -la dist/
# MUST show: index.js, app.js, and other compiled files
```

### 4. Verify Types

```bash
cd ../../  # Back to SDK root
npm run build  # Rebuild SDK to pick up your door
```

---

## Testing Checklist

### 1. Test in BBS

```bash
# Start BBS servers
./dev/scripts/start-servers.sh

# Connect to BBS
# Open browser: http://localhost:3001/
# Login, run your door command
```

### 2. Check for Errors

**Common Error Messages**:
- "Invalid TypeScript door" → Check export pattern (index.ts must export Door instance)
- "Cannot find module" → Check import paths (use package imports)
- "Module has no exported member" → Check type imports (no Widgets namespace)
- "undefined variable" → Check variable declarations (create widgets before using)

### 3. Fix and Rebuild

```bash
# After fixing errors
cd sdk/doors/your-door
npm run build

# Restart servers to pick up changes
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

---

## Quick Reference

### File Structure Template

```typescript
// index.ts (Entry Point)
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({ name: 'My Door', version: '1.0.0', author: 'Me' });
door.onStart(async (ctx: any) => await createApp(ctx));
door.onClose(async (ctx: any) => {});
door.onError(async (ctx: any, error: Error) => console.error(error));
export default door;

// app.ts (Door Logic)
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export async function createApp(session: any) {
  const { bbs, user, socket } = session;
  const screen = blessed.screen({ output: (data: string) => bbs.write(data) });
  const box = createBox({ parent: screen, content: 'Hello!' });
  screen.render();
  await new Promise<void>((resolve) => screen.key(['q'], () => { screen.destroy(); resolve(); }));
}
```

### package.json Template

```json
{
  "name": "my-door",
  "version": "1.0.0",
  "description": "My awesome BBS door",
  "main": "index.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../.."
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  },
  "amiexpress": {
    "doorName": "My Door",
    "command": "MYDOOR",
    "description": "My awesome door",
    "version": "1.0.0",
    "author": "Your Name",
    "minSecurityLevel": 0,
    "multiNode": true,
    "engine": "blessed"
  }
}
```

### tsconfig.json Template

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["index.ts", "app.ts", "**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Prevention Rules

### NEVER

1. ❌ Use relative imports for SDK modules (`../../engines/ui/blessed`)
2. ❌ Export `createApp()` directly from index.ts without Door instance wrapper
3. ❌ Set `"main": "app.ts"` in package.json
4. ❌ Forget to include `index.ts` in tsconfig.json
5. ❌ Import `Widgets` namespace from blessed
6. ❌ Use variables before declaring them
7. ❌ Set z-index using `index` property in element options
8. ❌ Commit without running `npm run build` first

### ALWAYS

1. ✅ Use package imports (`@amiexpress/bbs-door-sdk/...`)
2. ✅ Export Door instance as default in index.ts
3. ✅ Set `"main": "index.ts"` in package.json
4. ✅ Include both index.ts and app.ts in tsconfig.json
5. ✅ Import types directly (Box, List, Textbox, etc.)
6. ✅ Declare widgets before using them
7. ✅ Use `element.setIndex(number)` method for z-index control
8. ✅ Run `npm run build` and fix ALL errors before testing

---

## Examples

See these working examples in `/sdk/doors/`:

- **doors-menu** - Simple door with menu list
- **door-manager** - SysOp door with advanced UI
- **livechat** - Full-featured chat with complex UI
- **neo-blessed-demo** - Widget showcase

Study their structure and copy the patterns.

---

## Getting Help

If you're stuck:

1. Read this guide again (seriously, read it all)
2. Check the error message EXACTLY - it tells you what's wrong
3. Look at working examples in `/sdk/doors/`
4. Search for the error in this guide
5. Fix ONE error at a time, rebuild, test

**Most errors are simple**:
- Wrong import path
- Missing export
- Undeclared variable
- Wrong package.json setting

**Fix methodically**:
- Read error
- Understand error
- Fix error
- Rebuild
- Test

**Don't**:
- Skip reading errors
- Fix multiple things at once
- Test without rebuilding
- Commit broken code
