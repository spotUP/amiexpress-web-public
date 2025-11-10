# Neo-Blessed Quick Start Guide

## What is Neo-Blessed?

Neo-blessed is a powerful terminal UI library that brings ncurses-like capabilities to Node.js. The SDK integrates neo-blessed through the `UIEngine`, making it easy to create professional, interactive terminal interfaces for your BBS doors.

## Why Use Neo-Blessed for BBS Doors?

### Traditional Approach (ANSI codes)
```typescript
door.sendAnsi('\x1b[2J\x1b[H'); // Clear screen
door.sendAnsi('\x1b[10;20H');   // Move cursor
door.sendAnsi('Enter name: ');
// Manual input handling, no widgets, lots of ANSI code management
```

### Neo-Blessed Approach
```typescript
const ui = new UIEngine({ width: 80, height: 24 });
const helpers = new UIHelpers(ui);

const name = await helpers.showInput({
  title: 'Enter Name',
  label: 'Name:',
});
// Automatic rendering, event handling, focus management!
```

## 5-Minute Tutorial

### Step 1: Import UIEngine

```typescript
import { Door, UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';
```

### Step 2: Create UI Instance

```typescript
door.onConnect(async (user) => {
  const ui = new UIEngine({
    width: 80,
    height: 24,
    smartCSR: true,
    enableMouse: true,
    enableKeys: true,
  });

  const helpers = new UIHelpers(ui);
});
```

### Step 3: Create Widgets

```typescript
// Title bar
helpers.createTitleBar('My Awesome Door', 'v1.0.0');

// Menu
const menu = helpers.createMenu({
  top: 4,
  left: 'center',
  width: 40,
  height: 15,
  title: 'Main Menu',
}, [
  { label: 'Option 1', key: '1', action: () => doOption1() },
  { label: 'Option 2', key: '2', action: () => doOption2() },
  { label: 'Quit', key: 'q', action: () => quit() },
]);

// Status bar
const status = helpers.createStatusBar({ position: 'bottom' });
status.setContent(' Arrow keys to navigate | Enter to select | Q to quit ');

ui.render();
```

### Step 4: Handle Input

```typescript
// Global quit handler
ui.onKey(['q', 'escape'], () => {
  ui.destroy();
  door.disconnect(user.id);
});
```

## Common Patterns

### Alert Dialog

```typescript
await helpers.showAlert({
  title: 'Welcome',
  message: `Hello, ${user.name}!\n\nWelcome to my door.`,
});
```

### Confirm Dialog

```typescript
const confirmed = await helpers.showConfirm({
  title: 'Confirm Delete',
  message: 'Are you sure you want to delete this item?',
});

if (confirmed) {
  deleteItem();
}
```

### Input Dialog

```typescript
const email = await helpers.showInput({
  title: 'Email',
  label: 'Enter your email:',
  defaultValue: user.email,
});
```

### List Selection

```typescript
const selection = await helpers.showListSelection({
  title: 'Choose Character',
  items: ['Warrior', 'Mage', 'Rogue', 'Cleric'],
});

console.log('Selected index:', selection);
```

### Progress Bar

```typescript
const { bar, label } = helpers.createProgressIndicator({
  top: 10,
  left: 10,
  width: 50,
  label: 'Loading...',
});

for (let i = 0; i <= 100; i += 10) {
  bar.setProgress(i);
  ui.render();
  await sleep(100);
}
```

### Data Table

```typescript
const table = helpers.createDataTable({
  top: 4,
  left: 4,
  width: 60,
  height: 15,
  title: 'High Scores',
  data: [
    ['Rank', 'Name', 'Score'],
    ['1', 'Alice', '15000'],
    ['2', 'Bob', '12500'],
    ['3', 'Carol', '10000'],
  ],
});
```

### Scrollable Text Viewer

```typescript
const viewer = helpers.createTextViewer({
  top: 3,
  left: 2,
  width: 76,
  height: 19,
  title: 'Help',
  content: longHelpText,
});

viewer.key(['escape'], () => {
  showMainMenu();
});

viewer.focus();
ui.render();
```

### Interactive Form

```typescript
const form = ui.createForm({
  top: 5,
  left: 10,
  width: 60,
  height: 15,
  border: { type: 'line' },
  label: ' User Info ',
  keys: true,
});

const nameInput = ui.createTextbox({
  parent: form,
  top: 2,
  left: 2,
  width: 40,
  height: 3,
  label: 'Name:',
  border: { type: 'line' },
  name: 'name',
});

const emailInput = ui.createTextbox({
  parent: form,
  top: 6,
  left: 2,
  width: 40,
  height: 3,
  label: 'Email:',
  border: { type: 'line' },
  name: 'email',
});

const submitBtn = ui.createButton({
  parent: form,
  bottom: 2,
  left: 'center',
  width: 12,
  height: 3,
  content: 'Submit',
  border: { type: 'line' },
});

submitBtn.on('press', () => {
  console.log('Name:', nameInput.getValue());
  console.log('Email:', emailInput.getValue());
});

nameInput.focus();
ui.render();
```

## Widget Cheat Sheet

| Widget | Purpose | Use When |
|--------|---------|----------|
| `createBox` | Container/panel | Grouping elements, panels |
| `createText` | Static text | Labels, instructions |
| `createLine` | Divider | Separating sections |
| `createList` | Scrollable list | Menus, file browsers |
| `createForm` | Input container | Forms with multiple inputs |
| `createTextbox` | Single-line input | Name, email, search |
| `createTextarea` | Multi-line input | Messages, comments |
| `createButton` | Clickable button | Actions, submit buttons |
| `createCheckbox` | Boolean option | Settings, preferences |
| `createTable` | Data grid | High scores, logs |
| `createProgressBar` | Progress indicator | Downloads, processing |
| `createLog` | Scrolling output | System logs, chat |

## Helper Functions Cheat Sheet

| Helper | Purpose |
|--------|---------|
| `createMenu` | Vertical menu with shortcuts |
| `createMenuBar` | Horizontal menu bar |
| `showAlert` | Alert dialog |
| `showConfirm` | Yes/No dialog |
| `showInput` | Input dialog |
| `showListSelection` | Selection dialog |
| `createStatusBar` | Status bar (top/bottom) |
| `createTitleBar` | Title/header bar |
| `createPanel` | Bordered panel with title |
| `createProgressIndicator` | Progress bar with label |
| `createTextViewer` | Scrollable text display |
| `createDataTable` | Formatted data table |

## Styling Tips

### Colors
Use standard ANSI colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, and bright variants (`brightred`, `brightgreen`, etc.)

### Borders
```typescript
border: { type: 'line' }   // Single-line box
border: { type: 'double' } // Double-line box (not widely supported)
border: { type: 'bg' }     // Background-based border
```

### Content Markup
```typescript
content: '{bold}Bold{/bold} {red-fg}Red{/red-fg} {center}Centered{/center}',
tags: true,  // Must enable tag parsing
```

### Focus Styling
```typescript
style: {
  fg: 'white',
  bg: 'black',
  focus: {
    fg: 'black',
    bg: 'cyan',
    border: { fg: 'green' },
  },
}
```

## Event Handling

### Keyboard
```typescript
element.key('enter', () => { /* ... */ });
element.key(['escape', 'q'], () => { /* ... */ });
element.key('C-c', () => { /* Ctrl+C */ });

// Remove handler
element.unkey('enter', handler);
```

### Mouse
```typescript
element.on('click', () => { /* ... */ });
element.on('mouseover', () => { /* ... */ });
element.on('wheelup', () => { /* ... */ });
```

### List Events
```typescript
list.on('select', (item, index) => {
  console.log(`Selected: ${item.content} at ${index}`);
});
```

### Form Events
```typescript
form.on('submit', (data) => {
  console.log('Form data:', data);
});

textbox.on('submit', () => {
  const value = textbox.getValue();
  // Process input
});

textbox.on('cancel', () => {
  // User cancelled
});
```

## Best Practices

### 1. Always Clean Up
```typescript
ui.onKey(['q', 'escape'], () => {
  ui.destroy();  // Clean up resources!
  door.disconnect(user.id);
});
```

### 2. Render After Changes
```typescript
box.setContent('New content');
list.addItem('New item');
ui.render();  // Don't forget this!
```

### 3. Use Helpers for Common Patterns
Instead of manually creating dialogs, use helper methods:
```typescript
await helpers.showAlert({ title: 'Done!', message: 'Operation complete.' });
```

### 4. Focus Management
```typescript
// Focus the first input
nameInput.focus();

// Tab navigation
ui.focusNext();
ui.focusPrevious();
```

### 5. Handle Errors Gracefully
```typescript
try {
  const result = await helpers.showInput({ /* ... */ });
  if (result === null) {
    // User cancelled
    return;
  }
  processResult(result);
} catch (err) {
  await helpers.showAlert({
    title: 'Error',
    message: `An error occurred: ${err.message}`,
  });
}
```

## Examples

The SDK includes three comprehensive examples:

1. **neo-blessed-demo** - Full UI showcase
   - Forms, lists, tables
   - Dialogs and prompts
   - Progress bars
   - Text viewers

2. **drawille-cube** - 3D graphics demo
   - Rotating cube using braille graphics
   - Real-time animation
   - Interactive controls

3. **2048-game** - Complete game implementation
   - Full game logic
   - Colorful tiles
   - Score tracking
   - Undo functionality

To run examples:
```bash
cd sdk/examples/neo-blessed-demo
npm install
npm start
```

## Troubleshooting

### Widget Not Showing
- Check parent is set correctly
- Verify dimensions fit within parent
- Call `ui.render()` after creation
- Use `element.setFront()` to bring to front

### Input Not Working
- Set `keys: true` on widget
- Ensure widget has focus: `element.focus()`
- Check for conflicting key handlers

### Layout Issues
- Use `autoPadding: true` in UIEngine options
- Check position/size calculations
- Test with different terminal sizes

### Performance Problems
- Enable all optimizations: `smartCSR`, `fastCSR`, `useBCE`
- Don't call `render()` in tight loops
- Destroy unused elements

## Next Steps

- Read the full [Neo-Blessed UI Engine Documentation](./NEO_BLESSED_UI.md)
- Study the example doors in `sdk/examples/`
- Experiment with different widgets and layouts
- Build your own awesome BBS door!

## Quick Reference Card

```typescript
// Setup
const ui = new UIEngine({ width: 80, height: 24 });
const helpers = new UIHelpers(ui);

// Widgets
ui.createBox({ top, left, width, height, content, border, style })
ui.createText({ top, left, content })
ui.createList({ items, style: { selected: { bg: 'blue' } } })
ui.createForm({ keys: true })
ui.createTextbox({ label, value, secret })
ui.createButton({ content })

// Helpers
helpers.createMenu({ title }, items)
helpers.showAlert({ title, message })
helpers.showConfirm({ title, message })
helpers.showInput({ title, label })
helpers.createTitleBar(title, subtitle)
helpers.createStatusBar({ position: 'bottom' })

// Events
element.key('enter', () => { })
element.on('click', () => { })
list.on('select', (item, index) => { })

// Rendering
ui.render()
ui.destroy()
```

Happy UI building! 🚀
