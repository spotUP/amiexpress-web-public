# SDK Blessed Helpers - Quick Reference

**Last Updated:** December 24, 2024

## Purpose

The SDK blessed-helpers module provides wrapper functions for neo-blessed widgets that automatically add `tags: true` to prevent tag rendering bugs.

## The Problem

Without `tags: true`, blessed renders color tags as literal text:

```typescript
// WITHOUT tags:true
const box = blessed.box({
  content: '{cyan-fg}Hello{/cyan-fg}'
});
// Renders: "{cyan-fg}Hello{/cyan-fg}" (literal text)

// WITH tags:true
const box = blessed.box({
  tags: true,
  content: '{cyan-fg}Hello{/cyan-fg}'
});
// Renders: "Hello" (with cyan foreground color)
```

## The Solution

Always use SDK helpers that automatically add `tags: true`:

```typescript
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const box = createBox({
  content: '{cyan-fg}Hello{/cyan-fg}'
});
// Automatically includes tags:true
```

## Available Helpers

Import from `@amiexpress/bbs-door-sdk/utils/blessed-helpers`:

```typescript
import {
  createBox,       // Box widget (containers, panels)
  createList,      // List widget (selectable items)
  createText,      // Text widget (labels, headers)
  createTextarea,  // Textarea widget (multi-line input)
  createButton,    // Button widget (clickable buttons)
  createTable,     // Table widget (tabular data)
  createLog        // Log widget (scrolling logs)
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

## Quick Start

### Basic Door Structure

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export async function createApp(session: DoorSession) {
  const { bbs } = session;

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data)
  });

  // Connect input
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Create UI using helpers
  const container = createBox({
    parent: screen,
    width: '100%',
    height: '100%'
  });

  const list = createList({
    parent: container,
    top: 0,
    width: '100%',
    height: '100%-3',
    keys: true,
    vi: true,
    items: [
      '{yellow-fg}Option 1{/yellow-fg}',
      '{green-fg}Option 2{/green-fg}'
    ]
  });

  // Handle quit
  screen.key(['q', 'Q'], () => {
    screen.destroy();
  });

  // Cleanup on destroy
  screen.on('destroy', () => {
    if (session.bbsSession) {
      session.bbsSession.doorInputHandler = null;
    }
  });

  screen.render();

  // Wait for exit
  return new Promise<void>((resolve) => {
    screen.on('destroy', () => resolve());
  });
}
```

## Best Practices

### 1. Always Use Helpers

```typescript
// GOOD - Uses SDK helper
const box = createBox({ ... });

// BAD - Direct blessed call (missing tags:true)
const box = blessed.box({ ... });
```

### 2. Use dockBorders

```typescript
const screen = blessed.screen({
  smartCSR: true,
  dockBorders: true  // Makes borders dock to screen edges
});
```

### 3. Use Responsive Layouts

```typescript
// GOOD - Percentage-based (responsive)
const box = createBox({
  width: '100%',
  height: '100%-4'
});

// BAD - Fixed pixels (not responsive)
const box = createBox({
  width: 80,
  height: 20
});
```

### 4. Tag Syntax Reference

Common blessed tags (work automatically with SDK helpers):

```typescript
'{cyan-fg}Cyan text{/cyan-fg}'
'{red-bg}Red background{/red-bg}'
'{bold}Bold text{/bold}'
'{underline}Underlined{/underline}'
'{center}Centered{/center}'
'{inverse}Inverted colors{/inverse}'
```

### 5. No Emojis

```typescript
// GOOD - ASCII only
content: '[OK] Task complete'
content: '[ERROR] Failed to load'
content: '* Item 1'

// BAD - Emojis break BBS terminals
content: '✅ Task complete'
content: '❌ Failed to load'
```

## Widget-Specific Examples

### createBox (Containers)

```typescript
const container = createBox({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
  label: ' My Container '
});
```

### createList (Selectable Lists)

```typescript
const list = createList({
  parent: screen,
  width: '100%',
  height: '100%-4',
  keys: true,
  vi: true,
  mouse: true,
  style: {
    selected: { bg: 'blue', fg: 'white' },
    item: { fg: 'white' }
  }
});

list.setItems([
  '{yellow-fg}[TS]{/yellow-fg} Door 1',
  '{cyan-fg}[XIM]{/cyan-fg} Door 2'
]);

list.on('select', (item, index) => {
  console.log(`Selected: ${index}`);
});
```

### createText (Labels)

```typescript
const label = createText({
  parent: screen,
  top: 0,
  left: 0,
  content: '{bold}{cyan-fg}Header Text{/cyan-fg}{/bold}'
});
```

### createButton (Clickable Buttons)

```typescript
const button = createButton({
  parent: screen,
  top: 10,
  left: 'center',
  width: 20,
  height: 3,
  content: '{center}OK{/center}',
  style: {
    bg: 'blue',
    fg: 'white',
    focus: {
      bg: 'cyan',
      fg: 'black'
    }
  }
});

button.on('press', () => {
  console.log('Button pressed');
});
```

## Migration Guide

### Converting Existing Doors

1. **Install SDK** (if using standalone door):
   ```json
   {
     "dependencies": {
       "@amiexpress/bbs-door-sdk": "file:../../sdk"
     }
   }
   ```

2. **Add Import**:
   ```typescript
   import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
   ```

3. **Replace Direct Calls**:
   ```typescript
   // Before
   const box = blessed.box({ ... });
   const list = blessed.list({ ... });

   // After
   const box = createBox({ ... });
   const list = createList({ ... });
   ```

4. **Add dockBorders**:
   ```typescript
   const screen = blessed.screen({
     smartCSR: true,
     dockBorders: true  // Add this
   });
   ```

5. **Build and Test**:
   ```bash
   npm run build
   ```

## Examples in Codebase

Reference these doors for complete examples:

- **Basic Listing:** `sdk/doors/doors-menu/app.ts`
- **Management UI:** `sdk/doors/door-manager/app.ts`
- **Comprehensive Demo:** `sdk/doors/neo-blessed-showcase/app.ts`
- **Real-time Chat:** `sdk/doors/livechat/app.ts`
- **Game Example:** `Doors/fire-emblem-v2/index.ts`

## Common Patterns

### Door with Header/Footer

```typescript
const header = createBox({
  parent: screen,
  top: 0,
  width: '100%',
  height: 3,
  content: '{center}{bold}MY DOOR{/bold}{/center}',
  style: { bg: 'blue', fg: 'white' }
});

const footer = createBox({
  parent: screen,
  bottom: 0,
  width: '100%',
  height: 3,
  content: '{yellow-fg}Q:{/yellow-fg} Quit'
});
```

### Scrollable Content

```typescript
const content = createBox({
  parent: screen,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'blue' }
  },
  keys: true,
  vi: true
});
```

### Modal/Overlay

```typescript
const modal = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 12,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } }
});

// Set high z-index to ensure modal appears above other elements
modal.setIndex(900);

screen.key(['escape'], () => {
  modal.destroy();
  screen.render();
});
```

**Z-Index Control:**

Use `element.setIndex(number)` to control stacking order (z-index):

```typescript
// Create autocomplete overlay
const autocomplete = createList({
  parent: screen,
  top: 10,
  left: 0,
  width: 60,
  height: 8,
  hidden: true
});

// Set high z-index to appear above chat/content
autocomplete.setIndex(800);

// Common z-index ranges:
// - Default elements: 0-100
// - Overlays and popups: 100-500
// - Autocomplete/suggestions: 500-900
// - Modal dialogs: 900-999
// - Critical alerts: 1000+
```

**IMPORTANT:** Never use `index` as a property in element options - it will cause a TypeScript error. Always use the `setIndex()` method after creating the element.

## Troubleshooting

### Tags Render as Literal Text

**Problem:** `{cyan-fg}Hello{/cyan-fg}` renders as literal text

**Solution:** Use SDK helpers (they add `tags: true` automatically)

### Widget Not Showing

**Problem:** Created widget but nothing appears

**Solution:**
1. Check parent is set
2. Call `screen.render()` after creating widgets
3. Verify position/size (use percentages, not pixels)

### Input Not Working

**Problem:** Key presses don't work

**Solution:**
```typescript
// Connect input handler
session.bbsSession.doorInputHandler = (data: string) => {
  screen._handleData(data);
};
```

---

## Summary

- **Always** use SDK blessed-helpers
- **Always** add `dockBorders: true` to screen
- **Always** use percentage-based layouts
- **Never** use emojis
- **Never** call blessed.* directly

For questions or issues, see `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`
