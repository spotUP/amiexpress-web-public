# Neo-Blessed Developer Guide

## Overview

Neo-Blessed is a browser-compatible port of the blessed terminal UI library. It provides rich TUI widgets for creating interactive BBS door applications.

Modern Door Expectation

Always aim for modern, desktop-like doors with windows, panels, and mouse support. We are building next-level doors, not 90's text menus.

## Getting Started

### Door Entry Point (REQUIRED)

TypeScript doors **MUST** export a `runDoor()` function. This is the entry point the BBS calls when launching your door.

TypeScript doors **MUST** also include a `.info` file in `Commands/BBSCmd/`. The BBS registers doors at startup by scanning BBSCMD entries.

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

### 1d. Amiga ASCII Borders (Required)

All SDK UI panels and windows must use the Amiga ASCII border style. This is the
standard for BBS UI and should be used for any `border: { type: 'ascii' }` box.

Visual rules:
- Corners: top `.` bottom `` ` `` and `'`
- Horizontal: `-`
- Vertical: `|`
- Labels are rendered as `[ LABEL ]` and start after two dashes: `.--[ LABEL ]--`

Example:

```text
.--[ FLOP ]--------------------------------.
|                                          |
`------------------------------------------'
```

The SDK renderer (`sdk/engines/ui/blessed/core/screen.ts`) now enforces this framing
implicitly, so you do not need to hand-edit the corner characters or insert the
dash paddings yourself. Simply request `border: { type: 'ascii', labelStyle: { fg: 'yellow' } }`
and provide a label; the `. --[ LABEL ]` styling is applied automatically, complete
with the yellow headline text that defines the Neo-Blessed panel identity. Follow
this pattern for every new panel or window so the lobby stays faithful to the
classic Amiga Guru aesthetics.

### 1e. Keyboard Navigation (Required)

Doors must be fully keyboard navigable in addition to mouse support. Provide a
predictable focus order and hotkeys for primary actions.

- Add `tab` / `shift+tab` to cycle focus through panels, lists, and button rows.
- Ensure lists/listbars have `keys: true` and use left/right or up/down to move.
- Provide single-key shortcuts for actions (e.g., `c` for Create, `j` for Join).
- Never rely on mouse-only interactions.

### 1f. Modal Backgrounds and Overlays (Required)

Modal windows must be fully opaque and must dim the background so users cannot
see or click through. This is required for both web and telnet clients.

Rules:
- Always show a full-screen `blessed.overlay` behind any modal dialog.
- Use a solid background on the modal itself: set `style.bg` and `ch: ' '`.
- Do not use `style.bg: 'transparent'` for modal containers.
- Hide the overlay when the modal closes.

Example:

```typescript
// Full-screen dim overlay (supports web opacity)
const modalOverlay = blessed.overlay({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0.6,
  hidden: true,
  style: { bg: 'black' },
});

const modal = blessed.box({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  label: ' Settings ',
  border: { type: 'line' },
  hidden: true,
  ch: ' ', // solid fill
  style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
});

function showModal() {
  modalOverlay.show();
  modal.show();
  modal.setFront();
  modal.focus();
  screen.render();
}

function hideModal() {
  modal.hide();
  modalOverlay.hide();
  screen.render();
}
```

### 1g. Responsive Modal Centering (Automatic)

**All modal widgets automatically stay centered in responsive layouts.** When the terminal resizes (80x24 to 120x40, etc.), modals recalculate their center position dynamically.

**Widgets with auto-centering:**
- `Message` - Simple message dialogs
- `Question` - Yes/No confirmation dialogs
- `Prompt` - Text input dialogs
- `Loading` - Loading spinners with overlay

**How it works:**

When you call `.display()`, `.ask()`, `.showInput()`, or `.load()`, the widget:
1. Calculates center based on **current** screen dimensions (not hardcoded 80x25)
2. Listens for screen resize events
3. Recalculates center position when terminal size changes
4. Cleans up listeners on destroy

**Example - Message widget:**

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const message = new blessed.Message({
  parent: screen,
  text: 'Connection lost!',
  overlay: true,
  overlayOpacity: 0.7,
});

// Shows centered in current terminal size
// Stays centered if user resizes terminal
message.display();

// In 80x24 terminal  → position (20, 7)
// In 120x40 terminal → position (40, 15)
// In 160x50 terminal → position (60, 20)
```

**Example - Question widget:**

```typescript
const question = new blessed.Question({
  parent: screen,
  text: 'Try to reconnect?',
  overlay: true,
});

question.ask('Continue?', (answer: boolean) => {
  if (answer) {
    reconnect();
  } else {
    exit();
  }
});
// Auto-centers and stays centered on resize
```

**Custom modals - Manual centering:**

For custom dialogs not using built-in widgets, use the modal helpers:

```typescript
import { makeModalResponsive, centerElement } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Custom modal box
const myModal = blessed.box({
  parent: screen,
  width: 50,
  height: 15,
  border: { type: 'line' },
  label: ' My Dialog ',
});

// Enable responsive centering
const cleanup = makeModalResponsive(myModal);

// Show modal
myModal.show();
myModal.setFront();
screen.render();

// Later, when destroying modal
cleanup();  // Remove resize listener
myModal.destroy();
```

**Helper functions:**

```typescript
import { centerElement, makeModalResponsive, showModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// One-time center (doesn't track resizes)
centerElement(myModal);

// Enable auto-recentering on resize
const cleanup = makeModalResponsive(myModal);

// Complete modal management (backdrop + centering)
const cleanup = showModal(myModal, {
  backdrop: true,
  backdropOpacity: 0.6,
  onClose: () => console.log('Modal closed'),
});
```

**Key points:**
- Built-in modals (Message, Question, Prompt, Loading) handle this automatically
- Modal size (width/height) is fixed, but **position** adjusts to stay centered
- Works with any terminal size - not hardcoded to 80x25
- Cleanup happens automatically on widget destroy
- For custom modals, use `makeModalResponsive()` helper

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

## Widget Reference

### Core Widgets

| Widget | Purpose | Key Options |
|--------|---------|-------------|
| Box | Container | border, label, style, content |
| Text | Static text | tags, content |
| List | Selectable list | items, keys, vi, mouse, selected style |
| Button | Clickable button | mouse, style (bg, hover, focus) |
| Form | Form container | keys, submit event |
| Textbox | Text input | inputOnFocus, mouse, border |

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

## Advanced Terminal Control (Phase 4 Features)

### Terminal Modes

Control terminal behavior with mode commands:

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const screen = blessed.screen({ /* ... */ });
const program = screen.program;

// Set/Reset standard modes
program.setMode('4');    // Insert mode
program.resetMode('4');  // Replace mode

// DEC private modes (with ?)
program.decset('25');   // Show cursor
program.decrst('25');   // Hide cursor
program.decset('47');   // Use alternate screen buffer
program.decrst('47');   // Use normal screen buffer

// Convenient buffer switching
program.alternateBuffer();  // or program.smcup()
program.normalBuffer();     // or program.rmcup()
```

**Common DEC Modes:**
- `?25` - Cursor visibility (show/hide)
- `?47` / `?1049` - Alternate screen buffer
- `?1000` - Mouse X & Y on button press/release
- `?1002` - Cell motion mouse tracking
- `?1006` - SGR mouse mode (better encoding)

### Character Sets

Support international characters and special graphics:

```typescript
// Designate character set to G0-G3 level
program.charset('ascii', 0);   // G0 = US ASCII (default)
program.charset('uk', 1);      // G1 = UK character set
program.charset('acs', 0);     // G0 = DEC Special Graphics (line drawing)

// Quick switching
program.smacs();  // Enter alternate charset mode (DEC Special Graphics)
program.rmacs();  // Exit to ASCII

// Invoke G1/G2/G3 as current
program.setG(1);  // Use G1 character set
program.setG(2);  // Use G2 character set
```

**Supported Charsets:**
- `ascii`, `us`, `usascii` - US ASCII
- `uk` - UK
- `french`, `frenchcanadian`, `german`, `italian`, `spanish`, `swedish`, `dutch`, `finnish`, `swiss`
- `acs`, `scld` - DEC Special Character and Line Drawing Set
- `isolatin` - ISO Latin

### Terminal Queries

Query terminal capabilities and cursor position:

```typescript
// Get cursor position
program.getCursor((err, data) => {
  if (!err && data) {
    console.log(`Cursor at: row ${data.y}, col ${data.x}`);
  }
});

// Device status report
program.deviceStatus(6, (err, data) => {
  // Parameter 6 = cursor position
  // Returns cursor row/column
});

// Query terminal type/version
program.sendDeviceAttributes('', (err, data) => {
  // Returns terminal identification
  // Format: CSI ? Pp ; Pv ; Pc c
  // Pp = terminal type (0=VT100, 1=VT220)
  // Pv = firmware version
  // Pc = ROM cartridge number
});
```

**Note:** Terminal response handling in browser environment returns errors. These methods send the correct ANSI codes but full response parsing requires WebSocket integration (deferred for browser compatibility).

### Advanced Screen Methods

#### Visual Effects

Apply hover, focus, and blur effects dynamically:

```typescript
const myBox = blessed.box({
  parent: screen,
  content: 'Hover over me!',
  style: { fg: 'white', bg: 'black' },
});

// Define effects
screen.setEffects(
  myBox,           // Element to apply effects to
  null,            // Focus element (optional)
  'mouseover',     // Event to trigger "over" state
  'mouseout',      // Event to trigger "out" state
  {
    mouseover: { fg: 'yellow', bg: 'blue' },   // Hover style
    mouseout: { fg: 'white', bg: 'black' },    // Normal style
  }
);
```

#### Screen Capture

Take a text screenshot of the current screen buffer:

```typescript
// Capture entire screen
const screenshot = screen.screenshot();
console.log(screenshot);  // Plain text representation

// Capture specific region
const region = screen.screenshot(
  0,    // start x
  80,   // end x
  0,    // start y
  24    // end y
);

// Save to file or send over network
await fs.writeFile('screenshot.txt', screenshot);
```

#### External Programs (Node.js Only)

These methods throw errors in browser environment but are available for Node.js-based doors:

```typescript
// Spawn external program
try {
  const ps = screen.spawn('ls', ['-la']);
  ps.on('exit', (code) => {
    console.log('Exited with code:', code);
  });
} catch (err) {
  // Browser: "spawn() not supported in browser environment"
}

// Execute and get success status
screen.exec('grep', ['pattern', 'file.txt'], {}, (err, success) => {
  if (success) console.log('Command succeeded');
});

// Open text editor
screen.readEditor({ editor: 'vim' }, (err, data) => {
  if (!err) console.log('Edited text:', data);
});

// Display image via w3mimgdisplay
screen.displayImage('/path/to/image.png', (err, success) => {
  if (!err) console.log('Image displayed');
});
```

**Browser Compatibility:** External program methods are stubbed with clear error messages in browser environment. Only `setEffects()` and `screenshot()` are fully functional across both browser and Node.js.

## Best Practices

1. **Always enable mouse**: `screen.enableMouse()` and disable on cleanup
2. **Wire input handler**: Set `session.bbsSession.doorInputHandler`
3. **Clean up properly**: Disable mouse, delete handler, destroy screen
4. **Use fixed heights for dialogs**: Don't use 'shrink'
5. **Cast to `any` when needed**: TypeScript types are sometimes too strict
6. **Focus management**: Call `.focus()` on the element you want focused
7. **Render after changes**: Call `screen.render()` after UI updates
8. **Mode control**: Use `program.decset()` / `program.decrst()` for terminal modes
9. **Character sets**: Use `program.charset()` for international support
10. **Visual effects**: Use `screen.setEffects()` for dynamic hover/focus styling
11. **Screen capture**: Use `screen.screenshot()` for debugging or logging
12. **Terminal queries**: Aware of browser limitations for response handling

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
