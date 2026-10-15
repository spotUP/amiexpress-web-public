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
