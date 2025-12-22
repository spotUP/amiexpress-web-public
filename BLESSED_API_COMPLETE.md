# Blessed/Neo-Blessed Complete API Reference

This is a comprehensive API reference for blessed/neo-blessed terminal UI library, extracted from official documentation, source code analysis, and the AmiExpress Web SDK implementation.

## Table of Contents

1. [Element/Node Options](#elementnode-options)
2. [Scrollbar Features](#scrollbar-features)
3. [Docking Features](#docking-features)
4. [Transparency & Shadow](#transparency--shadow)
5. [Widget-Specific Options](#widget-specific-options)
6. [Advanced Features](#advanced-features)
7. [Event System](#event-system)
8. [Mouse Support](#mouse-support)
9. [Keyboard Support](#keyboard-support)
10. [Focus Management](#focus-management)

---

## Element/Node Options

All blessed widgets inherit from the base `Element` class and support these common options:

### Positioning Options

| Option | Type | Description |
|--------|------|-------------|
| `left` | `number \| string` | Left position (px, `'50%'`, `'center'`, `'50%-5'`) |
| `right` | `number \| string` | Right offset from parent's right edge |
| `top` | `number \| string` | Top position (px, `'50%'`, `'center'`, `'50%-5'`) |
| `bottom` | `number \| string` | Bottom offset from parent's bottom edge |
| `width` | `number \| string` | Width (px, `'50%'`, `'50%-5'`) |
| `height` | `number \| string` | Height (px, `'50%'`, `'50%-5'`) |
| `align` | `'left' \| 'center' \| 'right'` | Horizontal text alignment |
| `valign` | `'top' \| 'middle' \| 'bottom'` | Vertical text alignment |

**Position Calculation Priority:**
- Horizontal: `left+right` > `left+width` > `right+width` > `width` > defaults
- Vertical: `top+bottom` > `top+height` > `bottom+height` > `height` > defaults
- If only `left` specified: extends to right edge
- If only `top` specified: extends to bottom edge
- Use `right: 0` instead of `width: '100%-2'` to avoid overflow issues

**Position Formats:**
- Numbers: `10` (absolute pixels)
- Percentages: `'50%'` (percent of parent)
- Offsets: `'50%-5'` (percent with offset)
- Center: `'center'` (centers element)
- Negative: `-1` (offset from end)

### Scrolling Options

| Option | Type | Description |
|--------|------|-------------|
| `scrollable` | `boolean` | Enable scrolling (creates ScrollableBox behavior) |
| `alwaysScroll` | `boolean` | Ignore childOffset, change childBase on every scroll |
| `baseLimit` | `number` | Limit to childBase (default: Infinity) |
| `scrollbar` | `object \| boolean` | Scrollbar configuration (see Scrollbar section) |

### Visual Options

| Option | Type | Description |
|--------|------|-------------|
| `shadow` | `boolean` | Draw translucent 2-cell wide, 1-cell high shadow (bottom-right offset) |
| `hidden` | `boolean` | Element is hidden initially |
| `ch` | `string` | Background character (default: `' '` whitespace) |
| `style` | `object` | Style configuration (see Style Options) |
| `border` | `object \| string` | Border configuration (see Border Options) |
| `padding` | `number \| object` | Padding (number = all sides, object = per-side) |

### Border Options

| Option | Type | Description |
|--------|------|-------------|
| `border.type` | `string` | `'line'`, `'heavy'`, `'double'`, `'round'`, `'ascii'`, `'bg'`, `'none'` |
| `border.fg` | `string \| number` | Border foreground color |
| `border.bg` | `string \| number` | Border background color |
| `border.ch` | `string` | Border character (for `'bg'` type) |
| `dockBorders` | `boolean` | Auto-dock borders with adjacent elements (experimental) |
| `ignoreDockContrast` | `boolean` | Dock borders even if colors/attributes differ |

**Border Docking:**
- `dockBorders`: Automatically connects borders between adjacent elements
- Without docking: `┌─────────┌─────────┐` (overlapping)
- With docking: `┌─────────┬─────────┐` (connected)
- `ignoreDockContrast`: Allows docking even with different colors (may look odd)

### Style Options

```typescript
style: {
  // Basic colors
  fg: 'white',              // Foreground color
  bg: 'blue',               // Background color
  bold: true,               // Bold text
  underline: true,          // Underline text
  blink: true,              // Blinking text
  inverse: true,            // Inverse colors
  invisible: true,          // Invisible text

  // Border style
  border: {
    fg: 'cyan',             // Border foreground
    bg: 'black',            // Border background
  },

  // Scrollbar style
  scrollbar: {
    fg: 'blue',             // Scrollbar foreground
    bg: 'gray',             // Scrollbar background (track)
  },

  // Hover style (requires mouse: true)
  hover: {
    bg: 'green',            // Background on hover
    fg: 'white',            // Foreground on hover
  },

  // Focus style
  focus: {
    border: {
      fg: 'yellow',         // Border color when focused
    },
  },
}
```

**Transparency:**
- `style.transparent = true`: Sets opacity to 50%
- Uses color blending algorithm for backgrounds
- Characters cannot be blended, only background colors
- Also supports: `'none'`, `'default'` for transparent backgrounds

### Interaction Options

| Option | Type | Description |
|--------|------|-------------|
| `clickable` | `boolean` | Element responds to click events |
| `keyable` | `boolean` | Element can receive keyboard input |
| `focusable` | `boolean` | Element can be focused |
| `input` | `boolean` | Element is an input widget |
| `mouse` | `boolean` | Enable mouse support (also sets clickable) |
| `draggable` | `boolean` | Element can be dragged (use `enableDrag()` method) |

### Content Options

| Option | Type | Description |
|--------|------|-------------|
| `content` | `string` | Element's text content |
| `tags` | `boolean` | Enable tag parsing (`{red-fg}text{/}`) **CRITICAL** |
| `wrap` | `boolean` | Word wrap content (default: true) |
| `label` | `string` | Label text for element |
| `hoverText` | `string` | Floating text on mouseover |

**Tag Parsing - CRITICAL:**
```typescript
// WRONG - tags show as literal text
const box = blessed.box({
  content: '{red-fg}Error{/red-fg}'
  // Missing: tags: true
});
// Shows: {red-fg}Error{/red-fg}

// CORRECT - tags are parsed
const box = blessed.box({
  content: '{red-fg}Error{/red-fg}',
  tags: true  // REQUIRED
});
// Shows: Error (in red)
```

**Always use SDK helpers to auto-enable tags:**
```typescript
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const box = createBox({
  content: '{red-fg}Error{/red-fg}'
  // tags: true is automatic
});
```

### Other Options

| Option | Type | Description |
|--------|------|-------------|
| `parent` | `Element` | Parent element |
| `screen` | `Screen` | Screen instance |
| `fixed` | `boolean` | Element has fixed position (doesn't scroll with parent) |
| `shrink` | `boolean` | Shrink/flex/grow to content and children |
| `vi` | `boolean` | Enable vi-style navigation keys (j/k for up/down) |
| `keys` | `boolean` | Enable keyboard navigation |

---

## Scrollbar Features

### Scrollbar Configuration

```typescript
scrollbar: {
  ch: ' ',           // Character for scrollbar thumb (default: ' ')
  track: {
    ch: '░',         // Character for scrollbar track
  },
  style: {
    fg: 'blue',      // Scrollbar foreground
    bg: 'gray',      // Scrollbar background (track)
    inverse: true,   // Inverse scrollbar
  },
}
```

**Simple boolean:**
```typescript
scrollable: true,
scrollbar: true      // Use defaults
```

**Styled scrollbar:**
```typescript
scrollable: true,
scrollbar: {
  ch: ' ',
  style: {
    bg: 'blue'
  }
}
```

### Scrollbar-Related Options

| Option | Type | Description |
|--------|------|-------------|
| `scrollbar` | `object \| boolean` | Enable and configure scrollbar |
| `scrollbar.ch` | `string` | Character for thumb |
| `scrollbar.track.ch` | `string` | Character for track |
| `scrollbar.style` | `object` | Style for scrollbar (fg, bg, inverse) |
| `alwaysScroll` | `boolean` | Ignore childOffset, always scroll |
| `baseLimit` | `number` | Limit to childBase (default: Infinity) |

**Scrollbar behavior:**
- Only visible when `scrollable: true`
- Appears on right edge of element
- Track = background rail, Thumb = current position indicator
- Supports mouse wheel scrolling
- Supports keyboard scrolling (up/down, j/k if vi: true)

---

## Docking Features

### Border Docking

| Option | Type | Description |
|--------|------|-------------|
| `dockBorders` | `boolean` | Auto-dock borders with adjacent elements |
| `ignoreDockContrast` | `boolean` | Dock even if colors differ |

**How docking works:**

Without docking:
```
┌─────────┌─────────┐
│  Box 1  │  Box 2  │
└─────────└─────────┘
```

With docking:
```
┌─────────┬─────────┐
│  Box 1  │  Box 2  │
└─────────┴─────────┘
```

**Example:**
```typescript
const box1 = blessed.box({
  left: 0,
  width: '50%',
  height: 10,
  border: { type: 'line', fg: 'cyan' },
  dockBorders: true
});

const box2 = blessed.box({
  left: '50%',
  width: '50%',
  height: 10,
  border: { type: 'line', fg: 'cyan' },
  dockBorders: true
});
// Borders connect at boundary: ┬ instead of overlapping
```

**ignoreDockContrast:**
```typescript
const box1 = blessed.box({
  border: { type: 'line', fg: 'red' },
  dockBorders: true,
  ignoreDockContrast: true  // Dock even though colors differ
});

const box2 = blessed.box({
  border: { type: 'line', fg: 'blue' },
  dockBorders: true,
  ignoreDockContrast: true
});
// May produce multi-colored borders at connection points
```

---

## Transparency & Shadow

### Transparency Options

| Method | Description |
|--------|-------------|
| `style.transparent = true` | 50% opacity, blends with background |
| `style.bg = 'transparent'` | See-through background |
| `style.bg = 'none'` | No background |
| `style.bg = 'default'` | Default terminal background |

**Color Blending:**
- Characters **cannot** be blended
- Background colors **can** be blended
- Uses color blending algorithm for 50% opacity
- Foremost element blends with background behind it

**Example:**
```typescript
const overlay = blessed.box({
  style: {
    fg: 'white',
    bg: 'transparent',  // See-through
    transparent: true,  // 50% opacity
  },
  content: 'Overlay text'
});
```

### Shadow Options

| Option | Type | Description |
|--------|------|-------------|
| `shadow` | `boolean` | Enable translucent shadow |

**Shadow characteristics:**
- 50% opacity
- 2 cells wide
- 1 cell high
- Offset to bottom-right
- Automatically darkens background behind element

**Example:**
```typescript
const box = blessed.box({
  width: 30,
  height: 10,
  border: { type: 'line' },
  shadow: true  // Adds drop shadow
});
```

---

## Widget-Specific Options

### Box

Base container widget (inherits all Element options).

```typescript
const box = blessed.box({
  // All Element options +
  scrollable: true,
  alwaysScroll: false,
  baseLimit: Infinity,
});
```

### List

```typescript
interface ListOptions extends ElementOptions {
  items: string[];          // List items
  selected: number;         // Initially selected index
  interactive: boolean;     // Enable selection
  keys: boolean;            // Enable keyboard navigation
  vi: boolean;              // Enable vi keys (j/k)
  mouse: boolean;           // Enable mouse selection
  wrapItems: boolean;       // Wrap long items (default: true)
  style: {
    selected: {             // Style for selected item
      fg: 'black',
      bg: 'cyan',
    },
    item: {                 // Style for unselected items
      fg: 'gray',
    },
  },
}
```

**List Navigation:**
- Up/Down arrows: Move selection
- j/k: Move selection (if `vi: true`)
- Enter/Space: Select item (emits `'select'` event)
- Mouse click: Select item (if `mouse: true`)

### ListTable

Selectable table (extends List).

```typescript
interface ListTableOptions extends ListOptions {
  rows: string[][];         // Table rows
  headers: string[];        // Column headers (optional)
  columnWidth: number[];    // Width per column
  columnSpacing: number;    // Spacing between columns
  pad: number;              // Cell padding
  noCellBorders: boolean;   // Disable cell borders
  wrap: false;              // Don't wrap (default for tables)
}
```

### Listbar

Horizontal menu bar.

```typescript
interface ListbarOptions extends ElementOptions {
  commands: {               // Menu items
    'File': { callback: () => {} },
    'Edit': { callback: () => {} },
  },
  style: {
    bg: 'blue',             // Background (default)
    item: {
      fg: 'gray',           // Inactive tabs (default)
    },
    selected: {
      fg: 'white',          // Active tab (default)
    },
  },
  autoCommandKeys: boolean; // Auto-assign number keys
  mouse: boolean;           // Enable mouse clicks
}
```

### Form

Form container for input widgets.

```typescript
interface FormOptions extends ElementOptions {
  keys: boolean;            // Enable keyboard navigation
  vi: boolean;              // Enable vi keys
}

// Events:
form.on('submit', () => {
  // Form submitted (all fields validated)
});

form.on('reset', () => {
  // Form reset
});
```

### Textbox

Single-line text input.

```typescript
interface TextboxOptions extends ElementOptions {
  keys: boolean;            // Enable keyboard input
  mouse: boolean;           // Enable mouse clicks
  inputOnFocus: boolean;    // Start input on focus
  value: string;            // Initial value
  secret: boolean;          // Hide characters
  censor: boolean;          // Replace with asterisks
}

// Methods:
textbox.setValue('text');
textbox.getValue();
textbox.clearValue();
textbox.submit();
```

### Textarea

Multi-line text input (extends Textbox).

```typescript
interface TextareaOptions extends TextboxOptions {
  // All Textbox options
}
```

### Button

Clickable button.

```typescript
interface ButtonOptions extends ElementOptions {
  keys: boolean;            // Enable keyboard (Enter to press)
  mouse: boolean;           // Enable mouse clicks
  style: {
    fg: 'white',
    bg: 'blue',             // Default background
    hover: {
      bg: 'blue',           // Hover background (default: blue)
    },
    focus: {
      bg: 'blue',           // Focus background (default: blue)
    },
  },
}

// Events:
button.on('press', () => {
  // Button pressed
});
```

**Button best practices:**
- Reserve footer space (min 3 rows) to avoid clipping
- Place with `bottom: 0` inside parent
- Default hover/active background is blue (keep for consistency)

### Checkbox

Boolean checkbox input.

```typescript
interface CheckboxOptions extends ElementOptions {
  checked: boolean;         // Initial state
  mouse: boolean;           // Enable mouse toggle
  keys: boolean;            // Enable keyboard toggle (Space)
}

// Appearance:
// [X] = checked
// [ ] = unchecked
```

### RadioButton / RadioSet

Radio button group.

```typescript
interface RadioButtonOptions extends ElementOptions {
  checked: boolean;         // Initial state
  mouse: boolean;
  keys: boolean;
}

interface RadioSetOptions extends ElementOptions {
  // Container for RadioButton widgets
}

// Appearance:
// (O) = selected
// ( ) = unselected
```

### Table

Static data table.

```typescript
interface TableOptions extends ElementOptions {
  rows: string[][];         // Table data
  data: string[][];         // Alias for rows
  headers: string[];        // Column headers
  columnWidth: number[];    // Width per column
  columnSpacing: number;    // Spacing between columns (default: 1)
  pad: number;              // Cell padding
  noCellBorders: boolean;   // Disable cell borders
  fillCellBorders: boolean; // Fill borders with characters
  style: {
    header: {               // Header row style
      fg: 'white',
      bold: true,
    },
    cell: {                 // Cell style
      fg: 'gray',
    },
  },
}
```

### Log

Auto-scrolling log viewer.

```typescript
interface LogOptions extends ElementOptions {
  scrollback: number;       // Max lines to keep (default: Infinity)
  scrollOnInput: boolean;   // Auto-scroll on new lines
}

// Methods:
log.log('message');         // Add log line
log.add('message');         // Alias for log()
```

### ProgressBar

Progress indicator.

```typescript
interface ProgressBarOptions extends ElementOptions {
  orientation: 'horizontal' | 'vertical';
  filled: number;           // Percentage filled (0-100)
  value: number;            // Alias for filled
  ch: string;               // Filled character
  pch: string;              // Progress character (for orientation)
  style: {
    bar: {                  // Filled portion style
      bg: 'blue',
    },
  },
}

// Methods:
progressBar.setProgress(50);  // Set to 50%
```

### Message / Question / Prompt

Dialog widgets.

```typescript
// Message (info display)
message.display('Hello!', (err) => {
  // Callback when dismissed
});

// Question (yes/no)
question.ask('Are you sure?', (err, value) => {
  // value = true/false
});

// Prompt (text input)
prompt.input('Enter name:', 'default', (err, value) => {
  // value = entered text
});
```

**CRITICAL - Dialog Heights:**
- **NEVER use `height: 'shrink'`** - breaks nested element rendering
- Use fixed heights: Message/Question = 9, Prompt = 12
- Split long prompts into 2 lines if exceeding 80 columns

### Loading

Loading indicator.

```typescript
loading.load('Loading...');  // Show spinner
loading.stop();              // Hide spinner
```

### BigText

Large ASCII art text.

```typescript
interface BigTextOptions extends ElementOptions {
  content: string;          // Text to display
  font: string;             // Font style (4 built-in fonts)
  fch: string;              // Fill character
}
```

### FileManager

File browser with navigation.

```typescript
interface FileManagerOptions extends ElementOptions {
  cwd: string;              // Initial directory
  keys: boolean;            // Enable keyboard navigation
  vi: boolean;              // Enable vi keys
  style: {
    selected: {             // Selected file style
      fg: 'black',
      bg: 'cyan',
    },
  },
}

// Events:
fileManager.on('file', (file) => {
  // File selected
});

fileManager.on('cd', (dir) => {
  // Directory changed
});
```

### Terminal

Terminal emulator with history.

```typescript
interface TerminalOptions extends ElementOptions {
  handler: (command: string) => void;  // Command handler
  shell: string;            // Shell path (Node.js only)
  args: string[];           // Shell arguments
}
```

### Canvas

Drawing canvas (character-based).

```typescript
const canvas = blessed.canvas({
  width: 40,
  height: 20,
});

// Methods:
canvas.drawLine(x1, y1, x2, y2);
canvas.drawRect(x, y, width, height);
canvas.drawCircle(x, y, radius);
canvas.drawText(x, y, 'text');
canvas.clear();
canvas.render();
```

**Canvas Notes:**
- Character-based rendering (not pixel-based)
- Requires attach before calling `setData()`
- Widget automatically defers data until attached

---

## Advanced Features

### Z-Index / Focus Management

Blessed manages focus through a focus stack, not z-index.

```typescript
// Focus element
element.focus();

// Focus stack
screen.focusPush(element);  // Push onto stack
screen.focusPop();          // Pop from stack

// Get focused element
const focused = screen.getFocused();  // Method, not property!

// WRONG:
if (screen.focused === element) {}    // focused is boolean, not element

// CORRECT:
if (screen.getFocused() === element) {}
```

### Drag & Resize

```typescript
// Enable dragging
element.enableDrag((data) => {
  console.log(`Dragged to ${data.left}, ${data.top}`);
});

// Disable dragging
element.disableDrag();

// Enable resizing (drag bottom-right corner)
element.enableResize((data) => {
  console.log(`Resized to ${data.width}x${data.height}`);
});
```

### Animations

```typescript
let frame = 0;
setInterval(() => {
  box.setContent(`Frame: ${frame++}`);
  screen.render();
}, 100);
```

### Custom Event Propagation

```typescript
const parent = blessed.box({ parent: screen });
const child = blessed.box({ parent });

parent.on('custom', () => {
  console.log('Parent received event');
});

child.on('custom', () => {
  console.log('Child received event');
});

child.emit('custom');  // Both handlers fire (event bubbles)
```

---

## Event System

### Core Events

| Event | Description |
|-------|-------------|
| `'attach'` | Element attached to parent/screen |
| `'detach'` | Element detached from parent |
| `'destroy'` | Element destroyed |
| `'show'` | Element shown |
| `'hide'` | Element hidden |
| `'render'` | Element rendered |
| `'focus'` | Element focused |
| `'blur'` | Element lost focus |

### Mouse Events

| Event | Trigger |
|-------|---------|
| `'click'` | Mouse click |
| `'mousedown'` | Mouse button pressed |
| `'mouseup'` | Mouse button released |
| `'mousemove'` | Mouse moved |
| `'mouseenter'` | Mouse entered element |
| `'mouseleave'` | Mouse left element |
| `'wheeldown'` | Mouse wheel down |
| `'wheelup'` | Mouse wheel up |

**Mouse event data:**
```typescript
element.on('click', (data: MouseEvent) => {
  console.log(data.x, data.y);        // Click coordinates
  console.log(data.button);           // 'left' | 'middle' | 'right'
  console.log(data.shift, data.ctrl); // Modifier keys
});
```

### Keyboard Events

| Event | Trigger |
|-------|---------|
| `'keypress'` | Any key pressed |
| `'key <name>'` | Specific key (e.g., `'key enter'`) |

**Key binding:**
```typescript
// Single key
screen.key('q', () => {
  process.exit(0);
});

// Multiple keys
screen.key(['q', 'C-c'], () => {
  process.exit(0);
});

// Key names: 'up', 'down', 'left', 'right', 'enter', 'escape', 'backspace', etc.
// Modifiers: 'C-' (Ctrl), 'M-' (Alt), 'S-' (Shift)
```

### Widget-Specific Events

| Widget | Event | Description |
|--------|-------|-------------|
| List | `'select'` | Item selected |
| List | `'action'` | Item activated (Enter) |
| Form | `'submit'` | Form submitted |
| Form | `'reset'` | Form reset |
| Button | `'press'` | Button pressed |
| Textbox | `'submit'` | Input submitted (Enter) |
| Textbox | `'cancel'` | Input cancelled (Escape) |
| FileManager | `'file'` | File selected |
| FileManager | `'cd'` | Directory changed |

---

## Mouse Support

### Enabling Mouse

```typescript
// Global mouse support
screen.enableMouse();

// Per-element mouse support
element.enableMouse();

// Disable mouse
screen.disableMouse();
```

### Mouse Events Flow

```
User Input → Program.parseMouseEvent()
          → Program.emit('mouse', event)
          → Screen.handleMouseEvent()
          → Screen.getElementsAt(x, y)
          → Element.onMouse(event)
          → Element.emit('click' | 'mousedown' | 'mouseup' | etc.)
```

### Mouse Event Handling

```typescript
// Click events
box.on('click', handleClick);
box.on('mousedown', handleClick);  // More responsive

// Hover tracking
box.on('mouseenter', () => {
  box.style.bg = 'blue';
  screen.render();
});

box.on('mouseleave', () => {
  box.style.bg = 'black';
  screen.render();
});

// Drag support
box.enableDrag();
```

**Function Key Handling (F1-F12):**
```typescript
// Function keys require escape sequence handling
if (session.bbsSession) {
  session.bbsSession.doorInputHandler = (data: string) => {
    // F1: \x1bOP or \x1b[11~
    if (data === '\x1bOP' || data === '\x1b[11~') {
      showHelp();
      return;
    }
    // F2: \x1bOQ or \x1b[12~
    if (data === '\x1bOQ' || data === '\x1b[12~') {
      toggleSidebar();
      return;
    }
    screen._handleData(data);
  };
}
```

---

## Keyboard Support

### Key Bindings

```typescript
// Element-specific keys
element.key(['up', 'k'], () => element.scroll(-1));
element.key(['down', 'j'], () => element.scroll(1));

// Global keys
screen.key(['q', 'C-c'], () => {
  screen.destroy();
  process.exit(0);
});
```

### Vi-Style Navigation

```typescript
const list = blessed.list({
  keys: true,
  vi: true,     // Enable j/k for up/down
  items: ['Item 1', 'Item 2', 'Item 3'],
});
```

### Key Names

**Arrow keys:** `'up'`, `'down'`, `'left'`, `'right'`

**Special keys:** `'enter'`, `'escape'`, `'space'`, `'backspace'`, `'delete'`, `'insert'`, `'home'`, `'end'`, `'pageup'`, `'pagedown'`, `'tab'`

**Function keys:** `'f1'`-`'f12'`

**Modifiers:**
- `'C-'` = Ctrl (e.g., `'C-c'`)
- `'M-'` = Alt/Meta (e.g., `'M-x'`)
- `'S-'` = Shift (e.g., `'S-up'`)

**Vi keys (if `vi: true`):**
- `j` = down
- `k` = up
- `h` = left
- `l` = right
- `g` = top
- `G` = bottom

---

## Focus Management

### Focus Methods

```typescript
// Focus element
element.focus();

// Check if focused
const isFocused = screen.getFocused() === element;

// Focus stack
screen.focusPush(element);
screen.focusPop();

// Focus events
element.on('focus', () => {
  console.log('Focused');
});

element.on('blur', () => {
  console.log('Lost focus');
});
```

### Tab Navigation

```typescript
// Cycle through focusable elements
screen.key('tab', () => {
  screen.focusNext();
});

screen.key('S-tab', () => {
  screen.focusPrevious();
});
```

### Focus Border Effects

```typescript
// Store default colors
const defaultBorders = new Map();
defaultBorders.set(box1, 'yellow');
defaultBorders.set(box2, 'magenta');

// Handler
function setFocusBorder(element, focused) {
  const defaultColor = defaultBorders.get(element) || 'white';
  const newColor = focused ? 'white' : defaultColor;
  if (element.style?.border) {
    element.style.border.fg = newColor;
  }
  screen.render();
}

// Attach
box1.on('focus', () => setFocusBorder(box1, true));
box1.on('blur', () => setFocusBorder(box1, false));
```

---

## Best Practices

### Layout

1. **Use `right: 0` instead of `width: '100%-2'`** to avoid overflow
2. **Reserve footer space (min 3 rows)** for buttons to avoid clipping
3. **Use fixed heights for dialogs** (never `height: 'shrink'`)
4. **Split long prompts into 2 lines** if exceeding 80 columns

### Keyboard Navigation

1. **Always provide keyboard alternatives** to mouse interactions
2. **Use `tab`/`shift+tab`** to cycle focus
3. **Provide single-key shortcuts** for primary actions
4. **Enable `vi: true`** for power users

### Tags & Colors

1. **Always use `tags: true`** when using color tags
2. **Use SDK helpers** (`createBox`, `createList`) to auto-enable tags
3. **Avoid bold ANSI** (`\x1b[1;XXm`) - use `\x1b[0;XXm`

### Mouse Support

1. **Always enable mouse:** `screen.enableMouse()`
2. **Handle both `click` and `mousedown`** for better responsiveness
3. **Return focus after click** on non-focusable elements

### Rendering

1. **Call `screen.render()`** after UI updates
2. **Enable smartCSR** for optimization: `screen = blessed.screen({ smartCSR: true })`
3. **Clean up properly:** disable mouse, delete handlers, destroy screen

---

## Sources

This API reference was compiled from:

- [blessed GitHub repository](https://github.com/chjj/blessed)
- [blessed npm package](https://www.npmjs.com/package/blessed)
- [neo-blessed GitHub](https://github.com/embarklabs/neo-blessed)
- [neo-blessed npm](https://www.npmjs.com/package/neo-blessed)
- [Blessed Cheatsheet](https://devhints.io/blessed)
- [ScrollableBox Options Documentation](https://cancerberosgx.github.io/demos/accursed/api/blessed/interfaces/_blessed_d_.widgets.scrollableboxoptions.html)
- AmiExpress Web SDK blessed implementation (`~/Code/amiexpress-web/sdk/engines/ui/blessed/`)
- Neo-Blessed Developer Guide (`~/Code/amiexpress-web/sdk/engines/ui/blessed/NEO_BLESSED_GUIDE.md`)

**Last Updated:** December 22, 2025
