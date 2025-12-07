# Neo-Blessed UI Engine

## Overview

The **UIEngine** provides a powerful ncurses-like widget system for creating sophisticated ASCII/ANSI user interfaces in BBS doors. Built on the [neo-blessed](https://github.com/embarklabs/neo-blessed) library, it offers a DOM-like API for terminal applications with rich widgets, efficient rendering, and comprehensive input handling.

## Why Use Neo-Blessed?

### Key Benefits

- **Rich Widget Library**: 20+ ready-to-use widgets including boxes, lists, forms, tables, progress bars, and more
- **Efficient Rendering**: Only redraws screen changes (damage-based rendering), not the entire screen
- **Professional UIs**: Create polished interfaces with borders, colors, scrolling, and navigation
- **Mouse + Keyboard**: Full support for both input methods
- **Focus Management**: Automatic focus handling and tab navigation
- **BBS-Ready**: Designed for remote terminal sessions with multiple concurrent users

### Perfect For

- Interactive menus and forms
- File browsers and editors
- Dialog boxes and prompts
- Progress indicators
- Data tables and lists
- Game UIs with status bars and panels
- Any door requiring professional UI interaction

## Quick Start

### Basic Example

```typescript
import { UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';

// Create UI engine
const ui = new UIEngine({
  width: 80,
  height: 24,
  smartCSR: true,
  enableMouse: true,
  enableKeys: true,
});

// Create helpers for common patterns
const helpers = new UIHelpers(ui);

// Create a centered welcome box
const box = ui.createBox({
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  content: '{center}{bold}Welcome to My Door!{/bold}{/center}\n\n{center}Press any key to continue{/center}',
  tags: true,
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'blue',
    border: { fg: 'cyan' },
  },
});

// Render the screen
ui.render();

// Handle key press
ui.onKey(['enter', 'space', 'escape'], () => {
  ui.destroy();
});
```

## Core Concepts

### 1. Screen Management

The UIEngine manages a virtual screen that renders to ANSI escape sequences:

```typescript
const ui = new UIEngine({
  width: 80,          // Terminal width
  height: 24,         // Terminal height
  smartCSR: true,     // Smart cursor optimization
  fastCSR: true,      // Fast scrolling optimization
  useBCE: true,       // Back-color-erase optimization
  autoPadding: true,  // Auto-handle borders/padding
  fullUnicode: false, // Enable for CJK characters
  terminal: 'ansi',   // Terminal type
  enableMouse: true,  // Mouse support
  enableKeys: true,   // Keyboard support
});
```

### 2. Widget Hierarchy

Widgets form a parent-child tree structure:

```typescript
// Screen (root)
//   └── Box (container)
//       ├── Text (label)
//       ├── List (menu items)
//       └── Button (action)

const container = ui.createBox({ /* ... */ });
const label = ui.createText({ parent: container, /* ... */ });
const list = ui.createList({ parent: container, /* ... */ });
const button = ui.createButton({ parent: container, /* ... */ });
```

### 3. Positioning System

Positions and sizes support multiple formats:

```typescript
{
  // Numeric values (cells)
  top: 5,
  left: 10,
  width: 40,
  height: 20,

  // Percentages
  width: '50%',      // 50% of parent width
  height: '75%',     // 75% of parent height

  // Percentages with offsets
  width: '50%-2',    // 50% minus 2 cells
  top: '50%+5',      // 50% plus 5 cells

  // Keywords
  top: 'center',     // Vertical center
  left: 'center',    // Horizontal center
  width: 'half',     // 50% (same as '50%')
  height: 'shrink',  // Auto-size to content
}
```

### 4. Styling System

Comprehensive styling options:

```typescript
{
  style: {
    // Basic colors
    fg: 'white',           // Foreground
    bg: 'blue',            // Background

    // Text attributes
    bold: true,
    underline: true,
    blink: false,
    inverse: false,

    // Sub-element styling
    border: {
      fg: 'cyan',
      bg: 'black',
    },
    scrollbar: {
      fg: 'white',
      bg: 'blue',
    },

    // Interactive states
    focus: {
      fg: 'black',
      bg: 'cyan',
      border: { fg: 'green' },
    },
    hover: {
      fg: 'yellow',
      bg: 'blue',
    },
  },
}
```

**Supported Colors**: black, red, green, yellow, blue, magenta, cyan, white, gray, lightgray, brightred, brightgreen, brightyellow, brightblue, brightmagenta, brightcyan, brightwhite

**256-Color Support**: Use hex values like `#ff0000` for 256-color terminals

### 5. Content Markup

Use tags for inline styling:

```typescript
{
  content: '{bold}Bold text{/bold} {red-fg}Red text{/red-fg} {center}Centered{/center}',
  tags: true,  // Enable tag parsing
}
```

**Common Tags**:
- Style: `{bold}`, `{underline}`, `{blink}`, `{inverse}`
- Colors: `{red-fg}`, `{blue-bg}`, `{cyan-fg}`, etc.
- Alignment: `{left}`, `{center}`, `{right}`
- Vertical: `{top}`, `{middle}`, `{bottom}`
- Spacing: `{|}` (dynamic spacing)
- Cancel: `{/}` (cancel all styles)
- Escape: `{open}` → `{`, `{close}` → `}`

## Widget Reference

### Box Widgets

#### Box

The fundamental building block for layouts:

```typescript
const box = ui.createBox({
  top: 2,
  left: 2,
  width: 50,
  height: 10,
  content: 'Box content',
  border: { type: 'line' },  // line, bg, or custom
  style: { fg: 'white', bg: 'black' },
  scrollable: true,          // Enable scrolling
  alwaysScroll: true,        // Always show scrollbar
  tags: true,                // Parse content tags
  id: 'my-box',              // Optional ID for lookup
});
```

#### Text

Optimized for simple text display:

```typescript
const text = ui.createText({
  top: 1,
  left: 1,
  content: 'Simple text',
  style: { fg: 'cyan' },
});
```

#### Line

Create horizontal or vertical dividers:

```typescript
const line = ui.createLine({
  top: 5,
  left: 0,
  width: '100%',
  orientation: 'horizontal',  // or 'vertical'
  type: 'line',               // line, bg, or custom
  style: { fg: 'cyan' },
});
```

### List Widgets

#### List

Scrollable, selectable list with keyboard/mouse navigation:

```typescript
const list = ui.createList({
  top: 2,
  left: 2,
  width: 30,
  height: 15,
  items: ['Item 1', 'Item 2', 'Item 3'],
  border: { type: 'line' },
  label: ' Menu ',
  style: {
    selected: {
      bg: 'blue',
      fg: 'white',
    },
    item: {
      fg: 'cyan',
    },
  },
  keys: true,    // Arrow keys, j/k, etc.
  vi: true,      // Vi-style navigation
  mouse: true,   // Mouse clicks
});

// Handle selection
list.on('select', (item, index) => {
  console.log(`Selected: ${item.content} at index ${index}`);
});

// Handle specific key
list.key('d', () => {
  const index = list.selected;
  list.removeItem(index);
});
```

**List Methods**:
- `select(index)` - Select item by index
- `add(item)` / `addItem(item)` - Add item
- `removeItem(index)` - Remove item
- `setItems(items)` - Replace all items
- `getItem(index)` - Get item at index
- `getItemIndex(item)` - Find item index
- `up(amount)` / `down(amount)` - Navigate
- `clearItems()` - Remove all items

#### FileManager

Directory browser with file selection:

```typescript
const fm = ui.createFileManager({
  top: 2,
  left: 2,
  width: 50,
  height: 20,
  cwd: '/home/user',  // Starting directory
  border: { type: 'line' },
  label: ' File Browser ',
});

fm.on('file', (file) => {
  console.log(`Selected file: ${file}`);
});

fm.on('cd', (dir) => {
  console.log(`Changed to: ${dir}`);
});
```

#### ListTable

Tabular data display:

```typescript
const table = ui.createListTable({
  top: 2,
  left: 2,
  width: 60,
  height: 20,
  data: [
    ['Name', 'Score', 'Level'],  // Header row
    ['Alice', '1250', '5'],
    ['Bob', '980', '4'],
    ['Carol', '1500', '6'],
  ],
  border: { type: 'line' },
  style: {
    header: {
      fg: 'white',
      bg: 'blue',
      bold: true,
    },
    cell: {
      fg: 'cyan',
      selected: {
        bg: 'blue',
      },
    },
  },
});
```

### Form Widgets

#### Form

Container for input elements:

```typescript
const form = ui.createForm({
  top: 2,
  left: 2,
  width: 50,
  height: 20,
  border: { type: 'line' },
  label: ' Login ',
  keys: true,
});

const username = ui.createTextbox({
  parent: form,
  top: 2,
  left: 2,
  width: 30,
  height: 3,
  label: 'Username:',
  border: { type: 'line' },
  name: 'username',  // Form field name
});

const password = ui.createTextbox({
  parent: form,
  top: 6,
  left: 2,
  width: 30,
  height: 3,
  label: 'Password:',
  border: { type: 'line' },
  secret: true,  // Hide input
  name: 'password',
});

const submit = ui.createButton({
  parent: form,
  bottom: 2,
  left: 'center',
  width: 12,
  height: 3,
  content: 'Login',
  border: { type: 'line' },
});

// Handle form submission
form.on('submit', (data) => {
  console.log('Form data:', data);
  // data = { username: '...', password: '...' }
});

// Handle button click
submit.on('press', () => {
  form.submit();
});
```

#### Textbox

Single-line text input:

```typescript
const textbox = ui.createTextbox({
  top: 5,
  left: 5,
  width: 40,
  height: 3,
  label: 'Name:',
  value: 'Default value',  // Initial value
  secret: false,           // Password mode
  censor: false,           // Show asterisks
  border: { type: 'line' },
  inputOnFocus: true,      // Auto-enter input mode
});

// Get value
textbox.on('submit', () => {
  const value = textbox.getValue();
  console.log('User entered:', value);
});

// Cancel
textbox.on('cancel', () => {
  console.log('Input cancelled');
});

// Start input
textbox.focus();
textbox.readInput();
```

#### Textarea

Multi-line text input:

```typescript
const textarea = ui.createTextarea({
  top: 2,
  left: 2,
  width: 60,
  height: 15,
  border: { type: 'line' },
  label: ' Message ',
  value: 'Initial text...',
  keys: true,
  mouse: true,
});

textarea.on('submit', () => {
  const content = textarea.getValue();
  console.log('User entered:', content);
});
```

#### Button

Clickable button:

```typescript
const button = ui.createButton({
  bottom: 2,
  left: 'center',
  width: 15,
  height: 3,
  content: 'Click Me',
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'blue',
    focus: {
      bg: 'cyan',
    },
  },
});

button.on('press', () => {
  console.log('Button pressed!');
});

// Keyboard shortcuts
button.key('enter', () => {
  button.press();
});
```

#### Checkbox

Boolean selection:

```typescript
const checkbox = ui.createCheckbox({
  top: 5,
  left: 5,
  width: 20,
  height: 1,
  content: 'Enable sound',
  checked: true,
  mouse: true,
  keys: true,
});

checkbox.on('check', () => {
  console.log('Checked!');
});

checkbox.on('uncheck', () => {
  console.log('Unchecked!');
});

// Get state
const isChecked = checkbox.checked;
```

#### RadioSet

Mutually exclusive options:

```typescript
const radioSet = ui.createRadioSet({
  top: 5,
  left: 5,
  width: 30,
  height: 10,
});

const radio1 = ui.createButton({
  parent: radioSet,
  top: 0,
  left: 0,
  content: '( ) Option 1',
});

const radio2 = ui.createButton({
  parent: radioSet,
  top: 2,
  left: 0,
  content: '( ) Option 2',
});

const radio3 = ui.createButton({
  parent: radioSet,
  top: 4,
  left: 0,
  content: '( ) Option 3',
});
```

### Prompt Widgets

#### Message Dialog

```typescript
const msg = ui.createMessage({
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  label: ' Alert ',
  border: { type: 'line' },
});

msg.display('Something happened!', 3, () => {
  console.log('Message closed');
});
```

#### Prompt Dialog

```typescript
const prompt = ui.createPrompt({
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  label: ' Enter Name ',
  border: { type: 'line' },
});

prompt.input('What is your name?', '', (err, value) => {
  if (!err) {
    console.log('User entered:', value);
  }
});
```

#### Loading Spinner

```typescript
const loading = ui.createLoading({
  top: 'center',
  left: 'center',
  width: 30,
  height: 5,
  label: ' Loading ',
  border: { type: 'line' },
});

loading.load('Please wait...');

// Stop after 3 seconds
setTimeout(() => {
  loading.stop();
}, 3000);
```

### Data Display Widgets

#### ProgressBar

```typescript
const progress = ui.createProgressBar({
  top: 10,
  left: 10,
  width: 50,
  height: 3,
  border: { type: 'line' },
  filled: 0,  // 0-100
  style: {
    bar: {
      bg: 'blue',
      fg: 'white',
    },
  },
});

// Update progress
progress.setProgress(50);  // 50%

// Increment
progress.progress(10);  // Add 10%
```

#### Log

Scrollable output log:

```typescript
const log = ui.createLog({
  top: 2,
  left: 2,
  width: 60,
  height: 20,
  border: { type: 'line' },
  label: ' System Log ',
  scrollback: 1000,  // Max lines
  scrollOnInput: true,
});

// Add log lines
log.log('System started');
log.log('User connected');
log.log('{red-fg}Error occurred!{/red-fg}');
```

#### Table

```typescript
const table = ui.createTable({
  top: 2,
  left: 2,
  width: 60,
  height: 20,
  border: { type: 'line' },
  data: [
    ['Col1', 'Col2', 'Col3'],
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
  ],
  pad: 2,  // Cell padding
});

// Update data
table.setData([
  ['New', 'Data', 'Here'],
  ['Row', '2', 'Data'],
]);
```

## UI Helpers

The `UIHelpers` class provides high-level patterns for common BBS UI needs:

### Menu Creation

```typescript
const helpers = new UIHelpers(ui);

const menu = helpers.createMenu({
  top: 2,
  left: 2,
  width: 30,
  height: 15,
  title: 'Main Menu'
}, [
  {
    label: 'New Game',
    key: 'n',
    action: () => startNewGame(),
  },
  {
    label: 'Load Game',
    key: 'l',
    action: () => loadGame(),
  },
  {
    label: 'Options',
    key: 'o',
    action: () => showOptions(),
  },
  {
    label: 'Quit',
    key: 'q',
    action: () => quit(),
  },
]);
```

### Dialogs

```typescript
// Alert dialog
await helpers.showAlert({
  title: 'Error',
  message: 'Could not load file!',
});

// Confirmation dialog
const confirmed = await helpers.showConfirm({
  title: 'Confirm',
  message: 'Delete this item?',
});

if (confirmed) {
  deleteItem();
}

// Input dialog
const name = await helpers.showInput({
  title: 'Enter Name',
  label: 'Your name:',
  defaultValue: 'Player',
});

// List selection
const selection = await helpers.showListSelection({
  title: 'Choose Character',
  items: ['Warrior', 'Mage', 'Rogue', 'Cleric'],
});
```

### Layout Helpers

```typescript
// Status bar
const statusBar = helpers.createStatusBar({
  position: 'bottom',
});
statusBar.setContent(' HP: 100/100 | MP: 50/50 | Gold: 1250 ');

// Title bar
const titleBar = helpers.createTitleBar(
  'My BBS Door',
  'Version 1.0'
);

// Panel
const panel = helpers.createPanel('Statistics', {
  top: 2,
  left: 2,
  width: 40,
  height: 10,
  content: 'Stats go here...',
});

// Progress indicator
const { bar, label } = helpers.createProgressIndicator({
  top: 10,
  left: 10,
  width: 50,
  label: 'Loading resources...',
});

bar.setProgress(75);

// Text viewer
const viewer = helpers.createTextViewer({
  top: 2,
  left: 2,
  width: 70,
  height: 20,
  title: 'Help Text',
  content: longHelpText,
});

// Data table
const dataTable = helpers.createDataTable({
  top: 2,
  left: 2,
  width: 60,
  height: 20,
  title: 'High Scores',
  data: [
    ['Rank', 'Name', 'Score'],
    ['1', 'Alice', '15000'],
    ['2', 'Bob', '12000'],
    ['3', 'Carol', '10000'],
  ],
});
```

## Event Handling

### Element Events

```typescript
// Mouse events
element.on('click', () => { /* ... */ });
element.on('mousedown', () => { /* ... */ });
element.on('mouseup', () => { /* ... */ });
element.on('mousemove', () => { /* ... */ });
element.on('mouseover', () => { /* ... */ });
element.on('mouseout', () => { /* ... */ });
element.on('wheelup', () => { /* ... */ });
element.on('wheeldown', () => { /* ... */ });

// Focus events
element.on('focus', () => { /* ... */ });
element.on('blur', () => { /* ... */ });

// Visibility events
element.on('show', () => { /* ... */ });
element.on('hide', () => { /* ... */ });

// Layout events
element.on('move', () => { /* ... */ });
element.on('resize', () => { /* ... */ });

// Rendering events
element.on('prerender', () => { /* ... */ });
element.on('render', () => { /* ... */ });
```

### Keyboard Handling

```typescript
// Single key
element.key('enter', (ch, key) => {
  console.log('Enter pressed');
});

// Multiple keys
element.key(['escape', 'q'], (ch, key) => {
  console.log('Quit requested');
});

// Key combinations
element.key('C-c', () => {  // Ctrl+C
  console.log('Interrupt');
});

element.key('S-up', () => {  // Shift+Up
  console.log('Shift+Up');
});

// Remove key binding
element.unkey('enter', callback);

// One-time key binding
element.onceKey('space', () => {
  console.log('This runs once');
});
```

### Global Keys

```typescript
// Screen-level keys
ui.onKey('f1', () => {
  showHelp();
});

ui.onKey(['escape', 'q'], () => {
  if (confirmQuit()) {
    ui.destroy();
  }
});

// Remove key handler
ui.removeKey('f1', callback);
```

## Advanced Techniques

### Focus Navigation

```typescript
// Focus specific element
ui.focus(element);

// Tab through elements
ui.focusNext();    // Focus next focusable element
ui.focusPrevious(); // Focus previous

// Focus stack
const screen = ui.getScreen();
screen.focusPush(element);  // Push to focus stack
screen.focusPop();          // Pop from focus stack
```

### Dynamic Content

```typescript
// Update content
box.setContent('New content');

// Append content
box.pushLine('New line');
box.insertLine(5, ['Line 1', 'Line 2']);

// Modify lines
box.setLine(3, 'Replace line 3');
box.deleteLine(5);

// Scroll
box.scroll(5);      // Scroll down 5 lines
box.scroll(-3);     // Scroll up 3 lines
box.scrollTo(10);   // Scroll to line 10
```

### Layout Updates

```typescript
// Reposition
element.top = 10;
element.left = 20;

// Resize
element.width = 50;
element.height = 20;

// Show/hide
element.show();
element.hide();
element.toggle();

// Bring to front
element.setFront();
element.setBack();
```

### Custom Rendering

```typescript
// Override render method
box.on('prerender', function() {
  // Custom pre-render logic
  this.setContent(generateDynamicContent());
});

box.on('render', function() {
  // Custom post-render logic
});
```

## Best Practices

### 1. Always Clean Up

```typescript
// Destroy elements when done
element.destroy();

// Destroy entire UI
ui.destroy();
```

### 2. Use IDs for Lookups

```typescript
const box = ui.createBox({
  id: 'main-box',
  // ...
});

// Later...
const box = ui.getElement('main-box');
```

### 3. Render After Changes

```typescript
// Make changes
box.setContent('New content');
list.addItem('New item');

// Then render
ui.render();
```

### 4. Use Helpers for Common Patterns

```typescript
// Instead of manually creating dialogs
const helpers = new UIHelpers(ui);
await helpers.showAlert({ title: 'Info', message: 'Done!' });
```

### 5. Handle Errors

```typescript
try {
  const value = await helpers.showInput({
    title: 'Enter Value',
    label: 'Value:',
  });

  if (value === null) {
    // User cancelled
    return;
  }

  processValue(value);
} catch (err) {
  console.error('Input error:', err);
}
```

## Complete Example: File Browser

```typescript
import { UIEngine, UIHelpers, Door } from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

const door = new Door({
  name: 'File Browser',
  version: '1.0.0',
});

door.onConnect(async (user) => {
  // Create UI
  const ui = new UIEngine({ width: 80, height: 24 });
  const helpers = new UIHelpers(ui);

  // Title bar
  helpers.createTitleBar('File Browser', 'Navigate and select files');

  // Status bar
  const statusBar = helpers.createStatusBar({ position: 'bottom' });
  statusBar.setContent(' Use arrows to navigate | Enter to select | Q to quit ');

  // File list
  let currentDir = '/home/user';
  const fileList = ui.createList({
    top: 3,
    left: 2,
    width: 76,
    height: 19,
    border: { type: 'line' },
    label: ` ${currentDir} `,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      border: { fg: 'cyan' },
    },
  });

  // Load directory
  const loadDir = (dir: string) => {
    const files = fs.readdirSync(dir);
    const items = ['..', ...files];
    fileList.setItems(items);
    fileList.setLabel(` ${dir} `);
    ui.render();
  };

  loadDir(currentDir);

  // Handle selection
  fileList.on('select', (item, index) => {
    const selected = item.content;

    if (selected === '..') {
      currentDir = path.dirname(currentDir);
      loadDir(currentDir);
    } else {
      const fullPath = path.join(currentDir, selected);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        currentDir = fullPath;
        loadDir(currentDir);
      } else {
        door.sendAnsi(`\x1b[2J\x1b[H\nSelected file: ${fullPath}\n`, user.id);
        setTimeout(() => door.disconnect(user.id), 2000);
      }
    }
  });

  // Handle quit
  ui.onKey(['q', 'escape'], () => {
    ui.destroy();
    door.disconnect(user.id);
  });

  // Focus list
  fileList.focus();
  ui.render();

  // Send initial output to user
  // Note: In production, integrate with door.sendAnsi() properly
});

door.start();
```

## Tips for BBS Doors

### 1. Terminal Compatibility

- Most BBS terminals support 80x24
- Use standard ANSI colors (16 colors)
- Test with different terminal types
- Avoid Unicode unless `fullUnicode: true`

### 2. Performance

- Enable `smartCSR` and `fastCSR` for efficiency
- Call `render()` after multiple changes, not each change
- Use `useBCE` for faster background color fills

### 3. User Experience

- Always provide keyboard navigation
- Show help/instructions in status bar
- Use consistent color schemes
- Provide visual feedback for actions
- Handle Escape/Q for exit

### 4. Error Handling

- Validate user input
- Handle file/network errors gracefully
- Show error messages in dialogs
- Provide ways to recover from errors

### 5. Integration with Door SDK

```typescript
door.onInput((user, key) => {
  // Forward input to UI engine
  ui.getScreen().emit('keypress', key.key, key);
});

// After rendering, send output to user
ui.render();
const output = getScreenOutput(ui);
door.sendAnsi(output, user.id);
```

## Troubleshooting

### Widget Not Showing

- Ensure parent is specified correctly
- Check z-index with `setFront()` / `setBack()`
- Verify dimensions fit within parent
- Call `render()` after creation

### Input Not Working

- Ensure `keys: true` is set
- Check if element has focus
- Verify `enableKeys: true` in UIEngine options
- Check for conflicting key handlers

### Layout Issues

- Use `autoPadding: true` for automatic border handling
- Check position/size calculations
- Use `shrink` for auto-sizing
- Test with different terminal sizes

### Performance Problems

- Enable all optimizations (`smartCSR`, `fastCSR`, `useBCE`)
- Batch renders (don't call `render()` in tight loops)
- Limit scrollback in logs/lists
- Destroy unused elements

## Resources

- [Neo-Blessed GitHub](https://github.com/embarklabs/neo-blessed)
- [Blessed Documentation](https://github.com/chjj/blessed)
- SDK Examples: `/sdk/doors/`
- Ask in BBS Dev Community

## Summary

The UIEngine and neo-blessed integration provides professional-grade UI capabilities for BBS doors. Use it to create:

- Interactive menus and forms
- File browsers and editors
- Games with rich UIs
- Administration interfaces
- Any door requiring advanced terminal UI

Start with the helpers for common patterns, then dive into the full widget API for custom interfaces. Happy coding!
