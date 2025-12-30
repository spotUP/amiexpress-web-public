# Neo-Blessed Developer Guide

## Overview

Neo-Blessed is a browser-compatible port of the blessed terminal UI library. It provides rich TUI widgets for creating interactive BBS door applications.

Modern Door Expectation

Always aim for modern, desktop-like doors with windows, panels, and mouse support. We are building next-level doors, not 90's text menus.

## Getting Started

### Door Entry Point (REQUIRED)

TypeScript doors **MUST** export a `runDoor()` function. This is the entry point the BBS calls when launching your door.

**index.ts** (entry point):
```typescript
import { createApp } from './app.js';

/** Door metadata (optional but recommended) */
export const metadata = {
  name: 'My Neo-Blessed Door',
  version: '1.0.0',
  description: 'Interactive TUI application',
  author: 'Your Name',
  command: 'MYDOOR',
};

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

/** Main door entry point - REQUIRED by SDK */
export async function runDoor(session: DoorSession): Promise<void> {
  const app = await createApp(session);
  await app.run();
}

// Default export (optional, for compatibility)
export default { runDoor, metadata };
```

**IMPORTANT**: Without `runDoor()` export, you'll get:
```
Invalid TypeScript door: Must export Door instance or runDoor() function
```

### Basic Setup

**app.ts** (main application):
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

export async function createApp(session: DoorSession) {
  const { bbs } = session;

  // Create screen with output handler
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data),
  });

  // Wire up input handling
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Enable mouse support
  screen.enableMouse();

  // Create your UI here...

  // Cleanup on exit
  function cleanup() {
    screen.disableMouse();
    if (session.bbsSession) {
      delete session.bbsSession.doorInputHandler;
    }
    screen.destroy();
    bbs.write('\x1b[2J\x1b[H');
  }

  return {
    async run() {
      screen.render();
      await new Promise<void>((resolve) => {
        screen.on('destroy', resolve);
      });
    }
  };
}
```

## Critical Lessons Learned

### 1. Dialog Widgets (Message, Question, Prompt)

**NEVER use `height: 'shrink'`** - it breaks nested element rendering.

```typescript
// WRONG - Dialog won't render correctly
const dialog = blessed.question({
  parent: screen,
  width: '50%',
  height: 'shrink',  // DON'T DO THIS
});

// CORRECT - Let widget use default fixed height
const dialog = blessed.question({
  parent: screen,
  width: 50,
  // height uses widget default (9)
  style: { fg: 'white', bg: 'black' },
});
```

Default heights:
- `Question`: 9 lines
- `Message`: 9 lines
- `Prompt`: 12 lines

### 1b. Prompt Width (80 Columns)

BBS terminals are 80 columns wide. If a prompt or instruction line will exceed 80 characters, split it into two clean lines instead of letting it wrap mid-word.

```typescript
await ctx.output.writeLine('Enter a short description for your table.');
const description = await ctx.input.getLine('Description (max 60 chars): ', 60);
```

### 1c. Button Placement (Avoid Clipping)

Buttons use borders and padding, so they need real vertical space. To avoid clipped or partially visible buttons:

- Reserve a footer row for buttons (minimum height 3).
- Place buttons with `bottom: 0` inside the modal.
- Reduce content height to leave room for footer + borders.
- Avoid placing buttons at `top: 0` in small windows.
- Test at 80x24 and 80x25 to confirm visibility.
- Buttons default to a blue hover/active background for consistency. Keep that as the
  standard unless there is a strong design reason to override it.

Example layout math:

```typescript
const modal = blessed.box({ width: 70, height: 18, border: { type: 'ascii' } });
const footerHeight = 3;
const content = blessed.scrollabletext({
  parent: modal,
  top: 1,
  left: 1,
  right: 1,
  bottom: footerHeight + 1, // 1 for border line above footer
});
const backButton = blessed.button({
  parent: modal,
  bottom: 0,
  right: 2,
  width: 10,
  height: 3,
  content: '[Back]',
});
```

### 1d. Keyboard Navigation (Required)

Doors must be fully keyboard navigable in addition to mouse support. Provide a
predictable focus order and hotkeys for primary actions.

- Add `tab` / `shift+tab` to cycle focus through panels, lists, and button rows.
- Ensure lists/listbars have `keys: true` and use left/right or up/down to move.
- Provide single-key shortcuts for actions (e.g., `c` for Create, `j` for Join).
- Never rely on mouse-only interactions.

### 2. Focus Border Effects

To show visual focus feedback, track default border colors and change on focus/blur:

```typescript
// Store default border colors
const panelDefaultBorders = new Map<any, string>();
panelDefaultBorders.set(inputBox, 'yellow');
panelDefaultBorders.set(userList, 'magenta');

// Focus border handler
function setFocusBorder(panel: any, focused: boolean) {
  const defaultColor = panelDefaultBorders.get(panel) || 'white';
  const newColor = focused ? 'white' : defaultColor;
  if (panel.style?.border) {
    panel.style.border.fg = newColor;
  }
  screen.render();
}

// Attach handlers
for (const [panel] of panelDefaultBorders) {
  panel.on('focus', () => setFocusBorder(panel, true));
  panel.on('blur', () => setFocusBorder(panel, false));
}
```

### 3. Function Keys (F1-F12)

Function keys must be handled directly via escape sequences:

```typescript
if (session.bbsSession) {
  session.bbsSession.doorInputHandler = (data: string) => {
    // F1 escape sequences
    if (data === '\x1bOP' || data === '\x1b[11~') {
      showHelp();
      return;
    }
    // F2
    if (data === '\x1bOQ' || data === '\x1b[12~') {
      toggleSidebar();
      return;
    }
    screen._handleData(data);
  };
}
```

### 4. Mouse Click Responsiveness

For better click response on tabs/buttons, handle both `click` and `mousedown`:

```typescript
const tabs = blessed.box({ /* ... */ });

tabs.on('click', handleTabClick);
tabs.on('mousedown', handleTabClick);  // More responsive

function handleTabClick(event: any) {
  const pos = tabs._getCoords?.();
  if (pos && event.x !== undefined) {
    const relativeX = event.x - pos.xi;
    // Determine which tab was clicked based on relativeX
  }
  inputBox.focus();  // Return focus after click
}
```

### 5. Tree Widget Navigation

Tree widget supports standard navigation keys:

**Navigation Keys:**
- **Up/Down**: Navigate between nodes
- **Left**: Collapse current node (or jump to parent if already collapsed)
- **Right**: Expand current node (or jump to first child if already expanded)
- **Enter/Space/+**: Toggle expand/collapse

```typescript
const tree = contrib.tree({
  parent: screen,
  keys: true,      // Enable keyboard navigation
  vi: true,        // Enable j/k for up/down
  mouse: true,     // Enable mouse clicks
  template: { lines: true },  // Show tree lines
});

tree.setData({
  name: 'Root',
  extended: true,  // Start expanded
  children: {
    'Folder 1': {
      extended: false,  // Start collapsed
      children: { 'File 1': {}, 'File 2': {} }
    },
    'Folder 2': { children: { 'File 3': {} } },
  },
});

tree.on('select', (node) => {
  console.log('Selected:', node.name);
});
```

The Tree widget internally forwards keypress events to its List component for navigation.

### 6. Screen Focus Detection

Use `screen.getFocused()` (method) not `screen.focused` (boolean):

```typescript
// WRONG - focused is a boolean
if (this.screen.focused === this.rows) { }

// CORRECT - getFocused() returns the Element
if (this.screen.getFocused() === this.rows) { }
```

### 7. TypeScript Type Assertions

Neo-blessed types are sometimes restrictive. Use `as any` for flexibility:

```typescript
// Style options may need casting
const list = blessed.list({
  style: {
    fg: 'white',
    selected: { fg: 'black', bg: 'cyan' },
  } as any,
  wrapItems: true, // Wrap long items to the next row (default)
  items: ['Item 1', 'Item 2'],
});

// Commands object for listbar
blessed.listbar({
  style: {
    bg: 'blue',
    item: { fg: 'gray' },    // Inactive tabs (default)
    selected: { fg: 'white' } // Active tab (default)
  } as any,
  commands: {
    'File': { callback: () => {} },
    'Edit': { callback: () => {} },
  } as any,
});
```

Listbars default to gray inactive items and white active items on a blue
background. Hover/active states should stay blue for consistency. Override with
`style.item` and `style.selected` only when you need a different look.

List items wrap by default. Use `wrapItems: false` on List widgets that render
columns or fixed-width layouts (or use `ListTable` for true tables). For
dynamic lists, toggle at runtime with `list.setWrapItems(true/false)`.

### 8. Socket.IO Room-Based Chat

For multi-user chat, auto-join a default room:

```typescript
socket.on('room:list', (data: any) => {
  const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

  if (rooms.length > 0) {
    // Auto-join default room
    if (!state.currentChannel) {
      const defaultRoom = rooms.find(r => r.room_name === 'general')
        || rooms[0];
      socket.emit('room:join', { roomName: defaultRoom.room_name });
    }
  } else {
    // Create default room if none exist
    socket.emit('room:create', {
      roomName: 'general',
      topic: 'General chat',
      isPublic: true
    });
  }
});

// Auto-join after creating
socket.on('room:created', (data: any) => {
  if (!state.currentChannel) {
    socket.emit('room:join', { roomName: data.roomName });
  }
});
```

### 9. Tab Key Handlers

**CRITICAL:** Tab key handlers on elements NEVER fire because Screen intercepts Tab first.
Always put Tab handlers at screen level:

```typescript
// WRONG - Tab handlers on elements never fire
usernameInput.key(['tab'], () => {
  passwordInput.focus();  // NEVER CALLED!
});

// CORRECT - Tab handlers at screen level
screen.key(['tab'], () => {
  const focused = screen.getFocused();

  if (focused === usernameInput) {
    passwordInput.focus();
  } else if (focused === passwordInput) {
    loginButton.focus();
  } else if (focused === loginButton) {
    usernameInput.focus();
  }

  screen.render();
  return false;  // Prevent default Tab handling
});
```

### 10. Textbox vs Textarea

Use the correct input widget for your use case:

| Helper | Widget | Enter Key Behavior | Use Case |
|--------|--------|-------------------|----------|
| `createTextbox()` | Textbox | Emits 'submit' event | Single-line: username, password, search |
| `createTextarea()` | Textarea | Inserts newline | Multi-line: message composition |

```typescript
// Single-line input - Enter submits
const usernameInput = createTextbox({
  parent: modal,
  top: 2,
  left: 2,
  width: 30,
  height: 1,
});

// Multi-line input - Enter inserts newline (use Shift+Tab to submit)
const messageInput = createTextarea({
  parent: modal,
  top: 2,
  left: 2,
  width: 60,
  height: 10,
});
```

### 11. Focus/Hover/Disabled Styles

Define state-specific styles in widget options. The Screen automatically applies them during rendering:

```typescript
const button = createButton({
  content: 'Submit',
  style: {
    fg: 'white',
    bg: 'green',
    focus: { fg: 'black', bg: 'cyan' },    // Applied when button has focus
    hover: { fg: 'black', bg: 'cyan' },    // Applied when mouse hovers
    disabled: { fg: 'gray', bg: 'black' }, // Applied when element.disabled = true
  },
});

// Disable a widget
button.disabled = true;
screen.render();  // Will now show disabled style
```

## Widget Reference

### Core Widgets

| Widget | Purpose | Key Options |
|--------|---------|-------------|
| Box | Container | border, label, style, content |
| Text | Static text | tags, content |
| List | Selectable list | items, keys, vi, mouse, selected style |
| Button | Clickable button | mouse, style (bg, hover, focus, disabled) |
| Form | Form container | keys, submit event |
| Textbox | Single-line input (Enter=submit) | inputOnFocus, mouse, border, secret |
| Textarea | Multi-line input (Enter=newline) | scrollable, mouse, border |

### Dialog Widgets

| Widget | Purpose | Method |
|--------|---------|--------|
| Message | Info display | `display(text, callback)` |
| Question | Yes/No | `ask(text, callback)` |
| Prompt | Text input | `showInput(text, value, callback)` |
| Loading | Progress | `load(text)` / `stop()` |

### Data Widgets

| Widget | Purpose | Method |
|--------|---------|--------|
| Table | Static table | `setData(rows)` |
| ListTable | Selectable table | `setData(rows)`, select event |
| Log | Auto-scroll log | `log(text)` |
| ScrollableText | Scrollable content | content, mouse |
| ProgressBar | Progress indicator | `setProgress(percent)` |
| BigText | Large ASCII text | content property |

### Contrib Widgets

| Widget | Purpose | Method |
|--------|---------|--------|
| Tree | Hierarchical view | `setData(tree)` |
| Gauge | Progress gauge | `setPercent(n)` |
| GaugeList | Multiple gauges | Use `gauges` option (see below) |
| Sparkline | Mini chart | `setData(titles, datasets)` |
| Line | Line chart | `setData(series[])` |
| Bar | Bar chart | `setData({ titles, data })` |
| StackedBar | Stacked bars | `setData({ barCategory, stackedCategory, data })` |
| Donut | Donut chart | `setData([{ label, percent, color }])` |
| LCD | Digital display | `setDisplay(text)` |
| Grid | Grid layout | `grid.set(row, col, rowSpan, colSpan, widget, options)` |

### 9. GaugeList Uses Different API

**GaugeList does NOT use `setData()`** - it uses `gauges` option or `setGauges()`:

```typescript
// WRONG - setData takes no arguments in GaugeList
gaugeList.setData([{ percent: 75 }]);

// CORRECT - Use gauges option in constructor
const gaugeList = contrib.gaugeList({
  parent: demoBox,
  gaugeSpacing: 1,
  gaugeHeight: 1,
  gauges: [
    { showLabel: true, stack: [{ percent: 75, stroke: 'green' }] },
    { showLabel: true, stack: [{ percent: 50, stroke: 'blue' }] },
  ],
});

// OR use setGauges() after attach
gaugeList.setGauges([
  { showLabel: true, stack: [{ percent: 75, stroke: 'green' }] },
]);
```

Note: Each gauge uses a `stack` array which can have multiple segments for stacked progress bars.

### 10. Window Features (Drag, Resize, Transparency)

**Draggable Windows:**
```typescript
const window = blessed.box({
  parent: screen,
  width: 30, height: 10,
  label: ' Draggable ',
  border: { type: 'line' },
  mouse: true,
});

// Enable dragging anywhere on the window
window.enableDrag((data) => {
  console.log(`Window at: ${data.x}, ${data.y}`);
});

// Later, disable if needed
window.disableDrag();
```

**Resizable Windows:**
```typescript
const window = blessed.box({
  parent: screen,
  width: 30, height: 10,
  label: ' Resizable ',
  border: { type: 'line' },
  mouse: true,
});

// Resize by dragging bottom-right corner
window.enableResize((data) => {
  console.log(`New size: ${data.width}x${data.height}`);
});
```

**Transparent Backgrounds:**
```typescript
// Use 'transparent' for see-through backgrounds
const overlay = blessed.box({
  parent: screen,
  style: {
    fg: 'white',
    bg: 'transparent',  // Background shows through!
    border: { fg: 'cyan' },
  },
  content: 'Text with no background',
});

// Also works with: 'none', 'default'
```

## Best Practices

1. **Always enable mouse**: `screen.enableMouse()` and disable on cleanup
2. **Wire input handler**: Set `session.bbsSession.doorInputHandler`
3. **Clean up properly**: Disable mouse, delete handler, destroy screen
4. **Use fixed heights for dialogs**: Don't use 'shrink'
5. **Cast to `any` when needed**: TypeScript types are sometimes too strict
6. **Focus management**: Call `.focus()` on the element you want focused
7. **Render after changes**: Call `screen.render()` after UI updates

## Testing

Use the **Neo-Blessed Showcase** door (command: `NEOSHOWCASE`) to interactively test all widgets. It provides:

- **15 demo categories** covering ALL widgets:
  1. Basic Widgets (Box, Text, Line, ScrollableBox, ScrollableText)
  2. List Widgets (List, ListTable, Listbar)
  3. Input Widgets (Textbox, Textarea, Passbox, Checkbox, RadioButton, RadioSet)
  4. Dialog Widgets (Message, Question, Prompt, Loading, Overlay)
  5. Data Widgets (Table, Log, BigText, ProgressBar)
  6. Interactive (Button, Form, Layout)
  7. Media Widgets (Canvas, Image, ANSIImage, Video, IFrame)
  8. Special Widgets (FileManager, FileBox, Terminal, Viewport)
  9. Contrib Charts (Line, Bar, StackedBar, Donut, Sparkline)
  10. Contrib Gauges (Gauge, GaugeList, LCD)
  11. Contrib Data (Tree, Table, Log, Map, Picture, Markdown)
  12. Contrib Layouts (Grid, Carousel)
  13. Window Features (Draggable, Resizable, Transparency)
  14. Stress Test (50 widgets)
  15. View Results (test summary)
- Automated test result tracking with pass/fail/n/a status
- View Results summary showing all tested widgets

Run the showcase to verify neo-blessed functionality before developing new doors.
