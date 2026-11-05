# Neo-Blessed Mouse Integration Guide

Complete mouse support is built into the SDK at the core level. All neo-blessed doors automatically get full mouse integration without any extra configuration.

## Table of Contents

1. [Automatic Features](#automatic-features)
2. [Mouse Wheel Scrolling](#mouse-wheel-scrolling)
3. [Clicking Buttons](#clicking-buttons)
4. [Window Dragging](#window-dragging)
5. [Window Resizing](#window-resizing)
6. [Context Menus](#context-menus)
7. [Disabling Mouse Features](#disabling-mouse-features)
8. [Examples](#examples)

---

## Automatic Features

These features work automatically on all neo-blessed widgets:

### Click to Focus
Any `focusable: true` element can be clicked to receive focus.

### Click to Select
List items can be clicked to select them (unless disabled with `disableMouseSelect()`).

### Hover Effects
Elements with `hover` style automatically show hover effects on mouse-over.

---

## Mouse Wheel Scrolling

**Automatic** - Works on all scrollable widgets without configuration.

### Supported Widgets
- **List** - Scrolls selection (view follows)
- **Log** - Scrolls content up/down
- **Textarea** - Scrolls content vertically
- **ScrollableBox** - Scrolls content
- **ScrollableText** - Scrolls content

### Example
```typescript
import { createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Mouse wheel scrolling works automatically
const list = createList({
  parent: screen,
  items: ['Item 1', 'Item 2', ...],
  mouse: true,  // Default: true
});

// Users can now scroll with mouse wheel!
```

---

## Clicking Buttons

**Automatic** - Buttons respond to clicks by default.

```typescript
import { createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const button = createButton({
  parent: screen,
  content: 'Click Me',
  mouse: true,  // Default: true
});

button.on('press', () => {
  console.log('Button clicked!');
});
```

---

## Window Dragging

**Automatic** - Set `draggable: true` to make any element draggable.

```typescript
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const window = createBox({
  parent: screen,
  width: 40,
  height: 15,
  border: { type: 'line' },
  draggable: true,  // Enable dragging
  label: ' Drag Me ',
});

// User can now click and drag this window around the screen
```

### How It Works
1. Click and hold on the element
2. Drag to new position
3. Release to drop

**Note:** The entire element is draggable, not just the title bar.

---

## Window Resizing

**Automatic** - Set `resizable: true` to add resize handles.

```typescript
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const window = createBox({
  parent: screen,
  width: 40,
  height: 15,
  border: { type: 'line' },
  resizable: true,  // Enable resizing
  draggable: true,  // Often used together
});

// Resize handle appears in bottom-right corner
```

### How It Works
1. Click and hold on bottom-right corner (2x2 area)
2. Drag to resize
3. Release to finish

**Note:** Minimum size is 5x5 to prevent collapsing.

---

## Context Menus

Right-click menus for any element.

### Basic Usage

```typescript
import { addContextMenu } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const box = createBox({ parent: screen, /* ... */ });

const menu = addContextMenu(box, screen, [
  { label: 'Copy', action: () => copyContent() },
  { label: 'Paste', action: () => pasteContent() },
  { separator: true },
  { label: 'Delete', action: () => deleteContent() },
]);
```

### Advanced Options

```typescript
addContextMenu(element, screen, [
  {
    label: 'Edit',
    action: () => edit(),
  },
  {
    label: 'Disabled Action',
    action: () => console.log('Should not run'),
    disabled: true,  // Grayed out, not clickable
  },
  {
    separator: true,  // Visual separator
  },
  {
    label: 'Danger Zone',
    action: () => dangerousAction(),
  },
]);
```

### Manual Context Menu

```typescript
import { ContextMenu } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const menu = new ContextMenu({
  parent: screen,
  items: [
    { label: 'Action 1', action: () => {} },
    { label: 'Action 2', action: () => {} },
  ],
});

// Show at specific position
menu.showAt(x, y);

// Or show on element event
element.on('mousedown', (event) => {
  if (event.button === 'right') {
    menu.showAt(event.x, event.y);
  }
});
```

### Context Menu Features
- **Keyboard navigation**: Up/Down arrows, Enter to select, Escape to close
- **Mouse navigation**: Hover to highlight, click to select
- **Auto-positioning**: Stays on screen (won't clip at edges)
- **Click outside to close**: Clicking anywhere else closes the menu

---

## Disabling Mouse Features

### Disable Mouse on Specific Element

```typescript
const list = createList({
  mouse: false,  // Disable all mouse events
  items: ['Item 1', 'Item 2'],
});
```

### Disable Click Selection (Keep Other Mouse Features)

```typescript
import { disableMouseSelect, enableMouseSelect } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const list = createList({ items: [...] });

disableMouseSelect(list);  // Can't click to select
// Mouse wheel still works

// Re-enable later
enableMouseSelect(list);
```

### Disable Mouse Globally

```typescript
screen.disableMouse();  // Disable all mouse events

// Re-enable later
screen.enableMouse();
```

---

## Examples

### Complete Interactive Window

```typescript
import { createScreen, createBox, createButton, addContextMenu } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

// Draggable, resizable window
const window = createBox({
  parent: screen,
  top: 2,
  left: 5,
  width: 50,
  height: 20,
  border: { type: 'line' },
  label: ' My Window ',
  draggable: true,
  resizable: true,
  mouse: true,
});

// Button inside window
const btn = createButton({
  parent: window,
  content: 'Click Me',
  top: 1,
  left: 2,
  mouse: true,
});

btn.on('press', () => {
  window.setContent('Button was clicked!');
  screen.render();
});

// Right-click context menu
addContextMenu(window, screen, [
  { label: 'Minimize', action: () => window.hide() },
  { label: 'Close', action: () => screen.destroy() },
]);

screen.render();
```

### Scrollable List with Context Menu

```typescript
import { createList, addContextMenu } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const list = createList({
  parent: screen,
  items: Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`),
  mouse: true,  // Wheel scrolling enabled
  keys: true,
  vi: true,
});

// Right-click for actions
addContextMenu(list, screen, [
  {
    label: 'View Details',
    action: () => {
      const item = list.items[list.selected];
      console.log('Selected:', item);
    },
  },
  { separator: true },
  { label: 'Delete', action: () => deleteItem(list.selected) },
]);
```

### Game with Custom Mouse Handling

```typescript
// Disable default click selection for custom mouse handling
import { disableMouseSelect } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const gameBoard = createBox({
  parent: screen,
  mouse: true,  // Mouse events enabled
});

disableMouseSelect(gameBoard);  // But don't select on click

gameBoard.on('click', (event) => {
  // Custom click handling for game
  const x = event.x;
  const y = event.y;
  handleGameClick(x, y);
});

gameBoard.on('mousemove', (event) => {
  // Track mouse for paddle/cursor movement
  updateCursor(event.x, event.y);
});
```

---

## Mouse Event Reference

All mouse events receive an event object with:

```typescript
interface MouseEvent {
  x: number;              // Absolute screen X coordinate
  y: number;              // Absolute screen Y coordinate
  action: string;         // 'mousedown' | 'mouseup' | 'mousemove' | 'wheelup' | 'wheeldown'
  button?: string;        // 'left' | 'middle' | 'right'
  shift?: boolean;        // Shift key held
  ctrl?: boolean;         // Ctrl key held
  meta?: boolean;         // Alt/Meta key held
}
```

### Available Events
- `mousedown` - Mouse button pressed
- `mouseup` - Mouse button released
- `click` - Complete click (down + up)
- `mousemove` - Mouse moved
- `mouseenter` - Mouse entered element
- `mouseleave` - Mouse left element
- `wheelup` - Mouse wheel scrolled up
- `wheeldown` - Mouse wheel scrolled down

---

## Best Practices

1. **Enable mouse by default** - Most users expect mouse support
2. **Provide keyboard alternatives** - Not all terminals support mouse
3. **Visual feedback** - Use hover styles to show what's clickable
4. **Cursor hints** - Labels like "Drag to move" help users discover features
5. **Test on real terminals** - Mouse support varies across terminal emulators

---

## Compatibility

Mouse support requires:
- Terminal with mouse reporting (most modern terminals)
- BBS client with mouse passthrough (AmiExpress web terminal supports this)

Graceful degradation: All mouse features have keyboard equivalents.

---

## Troubleshooting

### Mouse events not working?

1. Check `mouse: true` is set (default for most widgets)
2. Ensure `screen.enableMouse()` was called (automatic in createScreen)
3. Check element is `clickable: true` for click events

### Context menu not appearing?

1. Verify right-click is being detected: `event.button === 'right'`
2. Ensure menu parent is the screen (not the clicked element)
3. Check z-index with `menu.setFront()`

### Drag/resize not working?

1. Set `draggable: true` or `resizable: true`
2. Ensure element has absolute positioning (not `center`)
3. Check element is not `fixed: true`

---

## Merged from Game Mode and Mouse Events for TypeScript Doors

### Overview

By default, TypeScript doors receive keyboard input through the standard terminal path, which is subject to OS key repeat delays (~300ms before repeat starts). For interactive UI frameworks like neo-blessed, or games requiring responsive input, you need to enable **game mode** and **mouse events**.


### Enabling Game Mode

Game mode bypasses OS key repeat delays and provides:
- Immediate key response with no initial delay
- Fast key repeat (33ms interval = ~30 keys/second)
- Raw keydown/keyup events for multi-key support

#### How to Enable

In your door's initialization, call `bbs.enableGameMode()`:

```typescript
export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs } = session;

  // Enable game mode for smooth keyboard input
  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  // ... rest of door initialization
}
```

#### When to Use Game Mode

- **DO use** for:
  - Interactive UI frameworks (neo-blessed, blessed)
  - Games requiring responsive controls
  - Any door where holding arrow keys should scroll smoothly

- **DON'T use** for:
  - Simple menu-driven doors using `bbs.getKey()` prompts
  - Doors that only need single key presses
  - Text input forms


### Enabling Mouse Events

Mouse events allow your door to receive clicks, drags, and wheel scroll events.

#### How to Enable

Call `bbs.enableMouseEvents()` in your door initialization:

```typescript
export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs } = session;

  // Enable mouse events for click/wheel support
  if (bbs?.enableMouseEvents) {
    bbs.enableMouseEvents();
  }

  // ... rest of door initialization
}
```

#### For Neo-Blessed Doors

Neo-blessed doors need BOTH the screen's mouse mode AND the BBS API mouse events:

```typescript
// Create screen
const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  output: (data: string) => bbs.write(data),
});

// CRITICAL: Set BOTH flags for input routing (see TYPESCRIPT_DOOR_TROUBLESHOOTING.md)
session.bbsSession.inDoorManager = true;  // Required for input to reach your door
session.bbsSession.doorInputHandler = (data: string) => {
  screen._handleData(data);
};

// Enable mouse on BOTH screen (ANSI) and BBS API (Socket.IO)
screen.enableMouse();
if (bbs?.enableMouseEvents) {
  bbs.enableMouseEvents();
}
```

#### Mouse Event Types

The door receives these JSON events through the input handler:

```typescript
// Mouse click
{ type: 'mouse-click', x: 10, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse drag (button held while moving)
{ type: 'mouse-drag', x: 11, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse up (button released)
{ type: 'mouse-up', x: 11, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse wheel
{ type: 'mouse-wheel', x: 10, y: 5, deltaY: -100, shift: false, ctrl: false, alt: false }
// deltaY < 0 = scroll up, deltaY > 0 = scroll down

// Mouse hover (movement without button)
{ type: 'mouse-hover', x: 12, y: 6, shift: false, ctrl: false, alt: false }
```

Button values: 0 = left, 1 = middle, 2 = right


### Complete Example

Here's a complete neo-blessed door with game mode and mouse support:

```typescript
import * as blessed from '@amiexpress/bbs-door-sdk/engines/ui/neo-blessed';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs, user } = session;

  // Enable game mode for smooth keyboard input
  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data),
  });

  // Set up input routing
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Enable mouse on both screen and BBS API
  screen.enableMouse();
  if (bbs?.enableMouseEvents) {
    bbs.enableMouseEvents();
  }

  // Create a scrollable list
  const list = blessed.list({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    items: ['Item 1', 'Item 2', 'Item 3', /* ... */],
    keys: true,
    mouse: true,
    scrollbar: { ch: ' ', style: { bg: 'cyan' } },
    style: {
      selected: { bg: 'blue', fg: 'white' },
    },
  });

  list.focus();

  // Handle selection
  list.on('select', (item, index) => {
    // Handle item selection
  });

  // Handle quit
  screen.key(['escape', 'q', 'C-c'], () => {
    screen.destroy();
  });

  // Initial render
  screen.render();

  // Wait for door to close
  return new Promise<void>((resolve) => {
    screen.once('destroy', resolve);
  });
}
```


### Technical Details

#### How Game Mode Works

1. Door calls `bbs.enableGameMode()`
2. Backend emits `game-mode` event to frontend
3. Frontend switches to raw keydown/keyup mode:
   - Blocks xterm.js from handling keys
   - Captures keydown events via window listener
   - Immediately sends `key-down` event to backend
   - Starts key repeat timer (33ms interval)
   - On keyup, stops repeat and sends `key-up` event
4. Backend converts key names to ANSI sequences (e.g., `ArrowDown` → `\x1b[B`)
5. Door receives ANSI sequences through input handler

#### How Mouse Events Work

1. Door calls `bbs.enableMouseEvents()`
2. Backend sets `session.mouseEventsEnabled = true`
3. Frontend captures mouse events via native event listeners
4. Frontend sends events via Socket.IO (`mouse-click`, `mouse-wheel`, etc.)
5. Backend forwards as JSON to `session.doorInputHandler`
6. Neo-blessed's `_handleData` parses JSON and emits blessed events

#### Key Repeat Timing

- Initial key press: Sent immediately
- Repeat starts: After first 33ms interval
- Repeat rate: 33ms (~30 keys/second)
- No initial delay (unlike OS default ~300ms)

### Troubleshooting (from GAME_MODE_AND_MOUSE)

### Keys not responding or slow
- Ensure `bbs.enableGameMode()` is called
- Check browser console for `[GameMode] RECEIVED: ENABLED`

### Mouse wheel not working
- Ensure `bbs.enableMouseEvents()` is called
- For neo-blessed: also call `screen.enableMouse()`
- Check backend log for `mouseEnabled= true`

### Mouse clicks not registering
- Ensure input handler is set: `session.bbsSession.doorInputHandler = ...`
- For neo-blessed: ensure handler calls `screen._handleData(data)`
