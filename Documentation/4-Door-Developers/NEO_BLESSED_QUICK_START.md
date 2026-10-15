# Neo-Blessed Quick Start Guide

**Build modern UI doors in 5 minutes** - This guide gets you started with neo-blessed UI doors using the correct SDK patterns.

## The Golden Rule

**❌ NEVER DO THIS:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
const box = blessed.box({ ... });  // WRONG - No mouse, broken cleanup
```

**✅ ALWAYS DO THIS:**
```typescript
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
const box = createBox({ ... });  // CORRECT - Full support
```

## Minimal Working Door

```typescript
import {
  createScreen,
  createBox,
  createList,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export async function runDoor(doorSession: any): Promise<void> {
  const { bbsSession, bbs } = doorSession;

  // 1. Create screen
  const screen = createScreen(bbs, {
    title: 'My Door',
    smartCSR: false,
    fastCSR: false,
  });

  // 2. Create input manager (handles cleanup automatically)
  const inputManager = new DoorInputManager(bbsSession, screen, {
    enableGameMode: true,
    enableGrabKeys: true,
    enableMouse: true,
  });

  // 3. Enable input and mouse
  inputManager.enable();
  screen.program.enableMouse();

  // 4. Clear screen
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();
  screen.render();
  await new Promise(r => setTimeout(r, 200));

  // 5. Create UI using SDK helpers
  const box = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 10,
    border: { type: 'line' },
    content: '{center}{bold}{cyan-fg}Hello World!{/cyan-fg}{/bold}\n\n' +
             '{center}Press Q to quit{/center}',
    style: { border: { fg: 'cyan' }, bg: 'black' }
  });

  box.focus();
  screen.render();

  // 6. Handle input
  await new Promise<void>((resolve) => {
    screen.on('keypress', (ch: any, key: any) => {
      if (key.name === 'q') resolve();
    });
  });

  // 7. Cleanup
  screen.remove(box);
  inputManager.disable();
  screen.destroy();
}
```

## SDK Helpers Reference

All helpers are in `@amiexpress/bbs-door-sdk/utils/blessed-helpers`:

```typescript
import {
  createScreen,        // Create screen with BBS output
  createBox,           // Box/panel with border and label
  createList,          // List with items (menus, selections)
  createText,          // Static text display
  createTextbox,       // Single-line text input
  createTextarea,      // Multi-line text input
  createButton,        // Clickable button
  createTable,         // Table with rows/columns
  createLog,           // Scrolling log viewer
  DoorInputManager,    // Automatic input cleanup (REQUIRED)
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

## Common Patterns

### Menu with Mouse Support

```typescript
const menu = createList({
  parent: screen,
  top: 5,
  left: 10,
  width: 30,
  height: 8,
  border: { type: 'line' },
  label: ' Menu ',
  items: [
    '[{bold}P{/bold}] Play',
    '[{bold}S{/bold}] Scores',
    '[{bold}Q{/bold}] Quit'
  ],
  keys: true,      // Enable keyboard
  vi: true,        // Arrow keys
  mouse: true,     // Click support
  style: {
    border: { fg: 'cyan' },
    selected: { bg: 'cyan', fg: 'black' },
    item: { fg: 'white' },
    bg: 'black'
  }
});

menu.on('select', (item, index) => {
  // User clicked or pressed Enter
  console.log('Selected:', index);
});

menu.focus();
```

### Text Input Dialog

```typescript
const inputBox = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 7,
  border: { type: 'line' },
  label: ' Enter Name ',
  style: { border: { fg: 'yellow' }, bg: 'black' }
});

const textbox = createTextbox({
  parent: inputBox,
  top: 2,
  left: 2,
  width: '100%-4',
  height: 1,
  keys: true,
  inputOnFocus: true,
  style: { fg: 'white', bg: 'blue' }
});

textbox.on('submit', (value: string) => {
  console.log('User entered:', value);
});

textbox.focus();
```

### Header + Content + Footer Layout

```typescript
const header = createBox({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '{center}{bold}{cyan-fg}=== MY DOOR ==={/cyan-fg}{/bold}{/center}',
  style: { fg: 'cyan', bg: 'black' }
});

const content = createBox({
  parent: screen,
  top: 3,
  left: 2,
  width: '100%-4',
  height: '100%-6',
  border: { type: 'line' },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  keys: true,
  vi: true,
  style: { border: { fg: 'cyan' }, bg: 'black' }
});

const footer = createBox({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: '{center}[Q] Quit  |  [H] Help{/center}',
  style: { fg: 'gray', bg: 'black' }
});

content.focus();
```

## Colors and Formatting

Neo-blessed uses **blessed tags** for colors (enabled automatically by SDK helpers):

```typescript
const box = createBox({
  parent: screen,
  content:
    '{red-fg}Red text{/red-fg}\n' +
    '{green-fg}Green text{/green-fg}\n' +
    '{bold}Bold text{/bold}\n' +
    '{cyan-fg}{bold}Cyan bold{/bold}{/cyan-fg}\n' +
    '{inverse}Inverse (highlight){/inverse}\n' +
    '{center}Centered text{/center}',
  style: { bg: 'black' }
});
```

**Available colors:**
- Standard: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`
- Bright: `lightred`, `lightgreen`, `lightyellow`, `lightblue`, `lightmagenta`, `lightcyan`, `lightwhite`

**Styles:**
- `{bold}...{/bold}` - Bold text
- `{inverse}...{/inverse}` - Reverse colors (for highlights)
- `{center}...{/center}` - Center text
- `{left}...{/left}` - Left align
- `{right}...{/right}` - Right align

## Critical Cleanup Pattern

**ALWAYS clean up before exiting** - This prevents BBS input from breaking:

```typescript
async function showScreen(screen) {
  // Enable mouse
  screen.program.enableMouse();

  // Create widgets
  const header = createBox({ ... });
  const menu = createList({ ... });
  const footer = createBox({ ... });

  // ... user interaction ...

  // CLEANUP - Remove ALL widgets
  screen.remove(header);
  screen.remove(menu);
  screen.remove(footer);
}
```

**With DoorInputManager (recommended):**

```typescript
const inputManager = new DoorInputManager(bbsSession, screen, {
  enableGameMode: true,
  enableGrabKeys: true,
  enableMouse: true,
});

inputManager.enable();  // Start

// ... door logic ...

inputManager.disable();  // Cleanup automatically done
```

## Common Mistakes

### 1. Using `blessed.box()` instead of `createBox()`

❌ **WRONG:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
const box = blessed.box({ parent: screen, ... });
```

✅ **CORRECT:**
```typescript
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
const box = createBox({ parent: screen, ... });
```

**Why:** SDK helpers add:
- Automatic `tags: true` (colors work)
- Proper mouse event handling
- Better cleanup behavior
- Consistent API across all doors

### 2. Forgetting `screen.program.enableMouse()`

Mouse clicks won't work without this at the start of every screen.

### 3. Forgetting `vi: true` on lists

Arrow keys won't navigate without `vi: true`.

### 4. Not cleaning up widgets

Widgets will "ghost" on screen if you don't `screen.remove()` them.

### 5. Forgetting `bg: 'black'` in styles

Backgrounds will show random colors without explicit black background.

## Reference Implementations

Study these working doors to learn patterns:

- **Simple menu:** `Doors/whip/ui/main-menu.ts`
- **Complex UI:** `Doors/grandmaster/ui/menu.ts`
- **Multiple screens:** `Doors/whip/ui/kanban-board.ts`
- **Text input:** `Doors/whip/ui/project-list.ts` (showProjectEditor)
- **Scrolling content:** `Doors/whip/ui/achievements.ts`

## Full Documentation

For complete details, see:
- [TYPESCRIPT_DOOR_GUIDE.md](TYPESCRIPT_DOOR_GUIDE.md) - Complete guide
- [DOOR_INPUT_MANAGER_GUIDE.md](DOOR_INPUT_MANAGER_GUIDE.md) - Input cleanup
- [NEO_BLESSED_COLOR_GUIDE.md](NEO_BLESSED_COLOR_GUIDE.md) - Colors and formatting

## Summary Checklist

Before releasing your door:

- ✅ All widgets use SDK helpers (`createBox`, not `blessed.box`)
- ✅ Mouse enabled (`screen.program.enableMouse()`)
- ✅ Keyboard nav enabled (`vi: true` on lists)
- ✅ DoorInputManager used for input cleanup
- ✅ All widgets removed on exit (`screen.remove()`)
- ✅ Background colors set (`bg: 'black'`)
- ✅ Tested: Exit door → type in BBS immediately (input works)
- ✅ Tested: Mouse clicks work on menus
- ✅ Tested: Arrow keys navigate lists
- ✅ No `blessed.box()` or `blessed.list()` calls anywhere

## Form Inputs and Buttons

### Complete Form Example

**✅ CORRECT - Use SDK widgets with proper event handling:**

```typescript
import {
  createBox,
  createTextbox,
  createList,
  createButton
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

async function showEditForm(screen: any, data: any): Promise<void> {
  return new Promise((resolve) => {
    screen.program.enableMouse();

    // Modal container
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 20,
      border: { type: 'line' },
      label: ' Edit Form ',
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    // Name input
    const nameLabel = createBox({
      parent: modal,
      top: 1,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Name:',
      style: { fg: 'white', bg: 'black' }
    });

    const nameInput = createTextbox({
      parent: modal,
      top: 2,
      left: 2,
      width: '100%-4',
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: data.name || '',
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Category dropdown
    const categoryLabel = createBox({
      parent: modal,
      top: 4,
      left: 2,
      width: 30,
      height: 1,
      content: 'Category:',
      style: { fg: 'white', bg: 'black' }
    });

    const categories = ['Option 1', 'Option 2', 'Option 3'];
    const categoryList = createList({
      parent: modal,
      top: 5,
      left: 2,
      width: 30,
      height: 7,
      border: { type: 'line' },
      keys: true,
      vi: true,
      mouse: true,
      items: categories,
      selected: 0,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    // Save button
    const saveBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 15,
      width: 12,
      height: 3,
      content: ' Save ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: { bg: 'lightgreen', fg: 'black' },
        hover: { bg: 'lightgreen', fg: 'black' }
      }
    });

    // Cancel button
    const cancelBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 40,
      width: 12,
      height: 3,
      content: ' Cancel ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: { bg: 'lightred', fg: 'black' },
        hover: { bg: 'lightred', fg: 'black' }
      }
    });

    const cleanup = () => {
      screen.remove(modal);
      screen.render();
    };

    // Save handler
    const save = async () => {
      data.name = nameInput.getValue();
      data.category = categories[categoryList.selected || 0];

      if (!data.name.trim()) {
        // TODO: Show error message
        return;
      }

      cleanup();
      resolve();
    };

    // Event handlers
    saveBtn.on('press', () => save());
    cancelBtn.on('press', () => {
      cleanup();
      resolve();
    });

    // Keyboard shortcuts
    screen.on('keypress', (ch: any, key: any) => {
      if (key.name === 'escape') {
        cleanup();
        resolve();
      } else if (key.name === 'enter' && key.ctrl) {
        save();
      }
    });

    nameInput.focus();
    screen.render();
  });
}
```

**❌ WRONG - Manual field rendering:**
```typescript
// DON'T DO THIS - No proper widgets, no mouse support
let currentField = 0;
const render = () => {
  let content = `Name: ${currentField === 0 ? '{inverse}' : ''}${data.name}{/inverse}\n`;
  content += `Category: ${currentField === 1 ? '{inverse}' : ''}${data.category}{/inverse}\n`;
  // ... manual rendering ...
  box.setContent(content);
};
```

## Blessed Dialogs

### Confirmation Dialog

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

async function confirmDelete(screen: any, itemName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const question = blessed.question({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        bg: 'black'
      },
      label: ' Confirm Delete '
    });

    question.ask(`Delete "${itemName}"?\n\n(Y/N)`, (answer: boolean) => {
      screen.remove(question);
      screen.render();
      resolve(answer);
    });
  });
}

// Usage
const confirmed = await confirmDelete(screen, 'My Item');
if (confirmed) {
  // Delete the item
}
```

### Selection Dialog

```typescript
async function selectOption(screen: any, options: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 12,
      border: { type: 'line' },
      label: ' Select Option ',
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    const list = createList({
      parent: modal,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      items: options,
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    const cleanup = () => {
      screen.remove(modal);
      screen.render();
    };

    list.on('select', (item: any, index: number) => {
      cleanup();
      resolve(options[index]);
    });

    screen.on('keypress', (ch: any, key: any) => {
      if (key.name === 'escape') {
        cleanup();
        resolve(null);
      }
    });

    list.focus();
    screen.render();
  });
}

// Usage
const choice = await selectOption(screen, ['Option A', 'Option B', 'Option C']);
if (choice) {
  console.log('Selected:', choice);
}
```

### Message Dialog

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

async function showMessage(screen: any, message: string): Promise<void> {
  return new Promise((resolve) => {
    const msg = blessed.message({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        bg: 'black'
      },
      label: ' Message '
    });

    msg.display(message, () => {
      screen.remove(msg);
      screen.render();
      resolve();
    });
  });
}

// Usage
await showMessage(screen, 'Task completed successfully!');
```

## Critical Rules for Forms

1. **NEVER use manual field rendering** - Always use proper blessed widgets
2. **ALWAYS wrap async handlers** - Event handlers must not be async directly
3. **ALWAYS enable mouse** - `screen.program.enableMouse()` at screen start
4. **ALWAYS add bg: 'black'** - Prevents color bleeding
5. **ALWAYS cleanup** - Remove all widgets on exit
6. **ALWAYS focus first input** - Call `.focus()` on the first input field

### Async Handler Pattern

**❌ WRONG:**
```typescript
screen.on('keypress', async (ch: any, key: any) => {
  await doSomething();  // Error: async handler not allowed
});
```

**✅ CORRECT:**
```typescript
screen.on('keypress', (ch: any, key: any) => {
  (async () => {
    await doSomething();  // Wrapped in IIFE
  })();
});
```

## Button Patterns

### Action Buttons

```typescript
const deleteBtn = createButton({
  parent: container,
  top: 10,
  left: 5,
  width: 15,
  height: 3,
  content: ' Delete ',
  align: 'center',
  keys: true,
  mouse: true,
  style: {
    fg: 'white',
    bg: 'red',
    focus: { bg: 'lightred', fg: 'black' },
    hover: { bg: 'lightred', fg: 'black' }
  }
});

deleteBtn.on('press', () => {
  (async () => {
    const confirmed = await confirmDelete(screen, 'Item');
    if (confirmed) {
      await deleteItem();
    }
  })();
});
```

### Navigation Buttons

```typescript
const backBtn = createButton({
  parent: container,
  bottom: 1,
  right: 2,
  width: 12,
  height: 3,
  content: ' Back ',
  align: 'center',
  keys: true,
  mouse: true,
  style: {
    fg: 'white',
    bg: 'blue',
    focus: { bg: 'lightblue', fg: 'black' },
    hover: { bg: 'lightblue', fg: 'black' }
  }
});

backBtn.on('press', () => {
  cleanup();
  resolve();
});
```

## Complete Door Example

See `Doors/whip/ui/` for production examples:
- **task-editor.ts** - Form with textboxes, lists, and buttons
- **project-list.ts** - List with create/edit/delete dialogs
- **kanban-board.ts** - Multi-column list with modal dialogs

