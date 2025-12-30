# Neo-Blessed Keyboard Navigation Guide

Complete keyboard navigation is built into the SDK at the core level. All neo-blessed doors automatically get desktop OS-quality keyboard navigation without any extra configuration.

## Table of Contents

1. [Automatic Features](#automatic-features)
2. [Tab Navigation](#tab-navigation)
3. [Focus Indicators](#focus-indicators)
4. [Visual States](#visual-states)
5. [Disabled State](#disabled-state)
6. [TabIndex for Custom Tab Order](#tabindex-for-custom-tab-order)
7. [Focus Methods](#focus-methods)
8. [Modal Focus Trapping](#modal-focus-trapping)
9. [Multi-Panel Layouts](#multi-panel-layouts)
10. [Global Keyboard Shortcuts](#global-keyboard-shortcuts)
11. [Examples](#examples)

---

## Automatic Features

These features work automatically on all neo-blessed widgets:

### Tab/Shift+Tab Navigation
- **Tab** - Focus next focusable element
- **Shift+Tab** - Focus previous focusable element
- Automatically skips hidden, destroyed, and disabled elements
- Wraps around (last element to first on Tab)

### Visual Focus Indicators
- Focused elements show a cyan bold border by default
- Can be customized per-widget with `style.focus`
- Always visible so users know where they are

### Hover Effects
- Elements with `style.hover` automatically show hover effects on mouse-over
- Hover state is automatically applied and removed

---

## Default Focusability by Widget Type

As of SDK 2.0, interactive widgets are **focusable by default**. You no longer need to manually set `focusable: true` for these widget types:

### Always Focusable (SDK Enforced)

These widgets are ALWAYS focusable, keyboard-enabled, and mouse-enabled:

- **Button** (`createButton`) - Can receive focus via Tab, activated with Enter/Space
- **List** (`createList`) - Can receive focus via Tab, navigate with arrow keys/vi keys
- **Textarea** (`createTextarea`) - Can receive focus via Tab, input fields need keyboard access
- **Table** (`createTable`) - Can receive focus via Tab, navigate cells with arrow keys

The SDK helpers force these properties AFTER the spread operator, so you cannot override them:

```typescript
// These are ALL enforced by the SDK:
focusable: true,   // Element can receive keyboard focus
keys: true,        // Element responds to keyboard input
mouse: true,       // Element responds to mouse events
```

### Conditionally Focusable

These widgets are NOT focusable by default, but can be made focusable when needed:

- **Box** (`createBox`) - Static container by default, but can be made focusable for clickable panels
- **Text** (`createText`) - Static label by default, not interactive
- **Log** (`createLog`) - Scrollable output by default, but you may want to make it focusable

To make these focusable, explicitly set the property:

```typescript
const clickablePanel = createBox({
  parent: screen,
  focusable: true,  // Now receives focus when tabbing
  border: { type: 'line' },
  content: 'Click me!',
});
```

### Why This Design?

**Interactive widgets = focusable by default**
- Buttons, lists, inputs, tables are ALWAYS interactive
- User expects Tab to navigate through all interactive elements
- No manual configuration needed

**Container widgets = not focusable by default**
- Boxes, text labels are usually just layout/display
- Making every box focusable would clutter Tab navigation
- Explicitly opt-in when you need a focusable container

---

## Tab Navigation

Tab navigation works out of the box for all focusable elements.

### Making Elements Focusable

```typescript
import { createBox, createButton, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Buttons are focusable by default
const button = createButton({
  parent: screen,
  content: 'Click Me',
  focusable: true,  // Default for buttons
});

// Lists are focusable by default
const list = createList({
  parent: screen,
  items: ['Item 1', 'Item 2', 'Item 3'],
  focusable: true,  // Default for lists
});

// Make any box focusable
const customBox = createBox({
  parent: screen,
  focusable: true,  // Now receives focus on Tab
  border: { type: 'line' },
  content: 'I can be focused!',
});
```

### Tab Order

Elements are focused in document order (depth-first tree traversal) by default. You can customize this with `tabIndex`.

---

## Focus Indicators

Focused elements automatically get a cyan bold border. You can customize this:

### Default Focus Indicator

```typescript
const box = createBox({
  parent: screen,
  focusable: true,
  border: { type: 'line' },
  // Automatically gets cyan bold border when focused
});
```

### Custom Focus Indicator

```typescript
const box = createBox({
  parent: screen,
  focusable: true,
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'blue' },  // Normal border
    focus: {
      border: { fg: 'yellow', bold: true },  // Custom focus border
      fg: 'yellow',  // Text also changes when focused
    },
  },
});
```

---

## Visual States

All widgets support multiple visual states:

### Supported States

- **Normal** - Default appearance
- **Hover** - Mouse is over the element
- **Focus** - Element has keyboard focus
- **Active** - Element is being interacted with (button press)
- **Disabled** - Element is disabled (grayed out, not interactive)

### Hover State

```typescript
const button = createButton({
  parent: screen,
  content: 'Hover Me',
  style: {
    fg: 'white',
    bg: 'blue',
    hover: {
      bg: 'cyan',  // Lighter background on hover
    },
  },
});
```

### Combined States

States can be combined. Focus style takes priority over hover:

```typescript
const box = createBox({
  parent: screen,
  focusable: true,
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'blue' },
    hover: {
      border: { fg: 'cyan' },  // Cyan border on hover
    },
    focus: {
      border: { fg: 'yellow', bold: true },  // Yellow bold border when focused
    },
  },
});
// When both hovered AND focused: focus style wins (yellow bold)
```

---

## Disabled State

Disabled elements are grayed out and non-interactive.

### Disabling Elements

```typescript
import { createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Disabled at creation
const button = createButton({
  parent: screen,
  content: 'Disabled Button',
  disabled: true,  // Grayed out, not focusable or clickable
});

// Disable programmatically
const activeButton = createButton({
  parent: screen,
  content: 'Active Button',
});

// Disable later
activeButton.disable();

// Re-enable
activeButton.enable();
```

### Disabled Behavior

When disabled, elements:
- Cannot receive focus (skipped in Tab navigation)
- Cannot be clicked
- Show gray border and text (default)
- Can be customized with `style.disabled`

### Custom Disabled Style

```typescript
const button = createButton({
  parent: screen,
  content: 'Button',
  style: {
    fg: 'white',
    bg: 'blue',
    disabled: {
      fg: 'gray',  // Custom disabled colors
      bg: 'black',
      border: { fg: 'gray' },
    },
  },
});
```

---

## TabIndex for Custom Tab Order

Control the order elements receive focus when pressing Tab.

### TabIndex Values

- **0 or undefined** - Natural document order (default)
- **1+** - Explicit order (lower numbers first)
- **-1** - Not reachable via Tab (but can still be focused programmatically)

### Example

```typescript
import { createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Tab order: button3 -> button1 -> button2 (ignores document order)
const button1 = createButton({
  parent: screen,
  content: 'Second',
  tabIndex: 2,  // Second in tab order
});

const button2 = createButton({
  parent: screen,
  content: 'Third',
  tabIndex: 0,  // Natural order (after explicit tabIndex elements)
});

const button3 = createButton({
  parent: screen,
  content: 'First',
  tabIndex: 1,  // First in tab order
});

// Not reachable via Tab
const hiddenButton = createButton({
  parent: screen,
  content: 'Hidden from Tab',
  tabIndex: -1,  // Skip in Tab navigation
});
```

### Making Elements Tabbable

```typescript
const box = createBox({
  parent: screen,
  focusable: true,
  tabbable: false,  // Can focus programmatically but NOT via Tab
});
```

---

## Focus Methods

Programmatically control focus:

### Element Methods

```typescript
// Focus an element
button.focus();

// Remove focus
button.blur();

// Check if focused
if (button.focused) {
  console.log('Button has focus');
}

// Disable/enable
button.disable();
button.enable();

// Check if disabled
if (button.disabled) {
  console.log('Button is disabled');
}
```

### Screen Methods

```typescript
// Focus next element (same as Tab key)
screen.focusNext();

// Focus previous element (same as Shift+Tab)
screen.focusPrevious();

// Get currently focused element
const focused = screen.getFocused();

// Focus by offset
screen.focusOffset(2);  // Focus element 2 positions ahead
screen.focusOffset(-1);  // Focus element 1 position back

// Save and restore focus (useful for modals)
screen.saveFocus();
// ... do something that changes focus ...
screen.restoreFocus();

// Trap focus in a container (for modals)
screen.trapFocus(modalElement);  // Tab only cycles within modal
screen.releaseFocusTrap();  // Release trap and restore previous focus
```

---

## Modal Focus Trapping

Modal dialogs automatically trap focus so Tab/Shift+Tab only cycles through elements within the modal.

### Automatic Focus Trapping

Overlay and Message widgets automatically trap focus when shown:

```typescript
import { createOverlay, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const overlay = createOverlay({
  parent: screen,
  opacity: 0.5,
});

const modalBox = createBox({
  parent: overlay,
  top: 'center',
  left: 'center',
  width: 40,
  height: 10,
  border: { type: 'line' },
  label: ' Modal Dialog ',
});

const button1 = createButton({
  parent: modalBox,
  top: 2,
  left: 2,
  content: 'OK',
});

const button2 = createButton({
  parent: modalBox,
  top: 2,
  left: 15,
  content: 'Cancel',
});

// Show overlay - focus is automatically trapped
overlay.show();
// Now Tab only cycles between button1 and button2
// Escape closes the overlay and restores previous focus
```

### Manual Focus Trapping

For custom modals, use `screen.trapFocus()`:

```typescript
const customModal = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 15,
  border: { type: 'line' },
  hidden: true,
});

// Add buttons/fields to modal...

// When showing modal
customModal.show();
screen.trapFocus(customModal);  // Trap focus inside modal

// When hiding modal
customModal.hide();
screen.releaseFocusTrap();  // Restore previous focus
```

### Focus Trapping Features

- **Tab/Shift+Tab** - Cycles only within trapped container
- **Escape** - Overlay widgets hide on Escape by default
- **Auto-restore** - Previous focus is automatically restored when trap is released
- **Nested modals** - Focus traps can be nested (last trap wins)

---

## Multi-Panel Layouts

Panel widgets enable desktop-like multi-panel layouts with keyboard switching.

### Creating Panels

```typescript
import { createPanel, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const leftPanel = createPanel({
  parent: screen,
  left: 0,
  top: 0,
  width: '50%',
  height: '100%',
  title: 'Files',
  panelIndex: 1,  // Alt+1 to activate
  border: { type: 'line' },
});

const fileList = createList({
  parent: leftPanel,
  items: ['file1.txt', 'file2.txt', 'file3.txt'],
});

const rightPanel = createPanel({
  parent: screen,
  left: '50%',
  top: 0,
  width: '50%',
  height: '100%',
  title: 'Preview',
  panelIndex: 2,  // Alt+2 to activate
  border: { type: 'line' },
});

const previewBox = createBox({
  parent: rightPanel,
  content: 'File preview will appear here',
});

screen.render();
```

### Panel Features

- **Visual indication** - Active panel (with focused child) shows bright cyan border
- **Alt+1, Alt+2, etc.** - Quick switch to numbered panels
- **Tab navigation** - Tab moves between panels naturally
- **Focus tracking** - Panels automatically detect when they contain focus

### Panel Methods

```typescript
// Activate a panel (focus first element)
leftPanel.activate();

// Check if panel is active
if (leftPanel.isActive()) {
  console.log('Left panel is active');
}

// Listen for panel activation
leftPanel.on('activate', () => {
  console.log('Left panel activated');
});

leftPanel.on('deactivate', () => {
  console.log('Left panel deactivated');
});
```

---

## Global Keyboard Shortcuts

Register application-wide keyboard shortcuts using the KeyBindings system.

### Basic Usage

```typescript
import { createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

// Register a global shortcut
screen.keyBindings.register({
  keys: ['C-s'],  // Ctrl+S
  description: 'Save document',
  action: () => {
    saveDocument();
    showMessage('Document saved!');
  },
});

// Register multiple key combinations for the same action
screen.keyBindings.register({
  keys: ['C-q', 'M-q'],  // Ctrl+Q or Alt+Q
  description: 'Quit application',
  action: () => {
    confirmQuit();
  },
});
```

### Context-Aware Shortcuts

Different shortcuts based on which widget has focus:

```typescript
// Ctrl+C copies in textbox, but closes app elsewhere
screen.keyBindings.register({
  keys: ['C-c'],
  description: 'Copy text',
  action: () => copyText(),
  context: 'textbox',  // Only active when textbox is focused
});

screen.keyBindings.register({
  keys: ['C-c'],
  description: 'Close application',
  action: () => closeApp(),
  // No context = global (active everywhere except textbox)
});

// List-specific shortcuts
screen.keyBindings.register({
  keys: ['C-a'],
  description: 'Select all items',
  action: () => selectAllItems(),
  context: 'list',
});
```

### Key Notation

| Notation | Meaning | Example |
|----------|---------|---------|
| `C-` | Ctrl modifier | `C-s` = Ctrl+S |
| `M-` | Alt/Meta modifier | `M-f` = Alt+F |
| `S-` | Shift modifier | `S-tab` = Shift+Tab |
| Letter | Single key | `q` = Q key |
| Name | Special key | `escape`, `enter`, `tab` |

Examples:
- `C-s` - Ctrl+S
- `M-x` - Alt+X
- `C-S-p` - Ctrl+Shift+P
- `C-M-d` - Ctrl+Alt+D

### Managing Shortcuts

```typescript
// Unregister a shortcut
const saveAction = {
  keys: ['C-s'],
  description: 'Save',
  action: () => save(),
};
screen.keyBindings.register(saveAction);
screen.keyBindings.unregister(saveAction);

// Get all registered shortcuts
const all = screen.keyBindings.getAllShortcuts();
for (const shortcut of all) {
  console.log(`${shortcut.keys.join(', ')}: ${shortcut.description}`);
}

// Get context-specific shortcuts
const listShortcuts = screen.keyBindings.getContextShortcuts('list');

// Clear all shortcuts
screen.keyBindings.clear();
```

### Common Shortcut Patterns

```typescript
// Save/Load
screen.keyBindings.register({
  keys: ['C-s'],
  description: 'Save',
  action: () => save(),
});

screen.keyBindings.register({
  keys: ['C-o'],
  description: 'Open',
  action: () => open(),
});

// Navigation
screen.keyBindings.register({
  keys: ['M-left'],
  description: 'Go back',
  action: () => navigateBack(),
});

screen.keyBindings.register({
  keys: ['M-right'],
  description: 'Go forward',
  action: () => navigateForward(),
});

// Search
screen.keyBindings.register({
  keys: ['C-f', '/'],  // Ctrl+F or / key
  description: 'Search',
  action: () => openSearch(),
});

// Help
screen.keyBindings.register({
  keys: ['f1', '?'],
  description: 'Show help',
  action: () => showHelp(),
});
```

### Formatting Key Combinations

Display shortcuts to users in a readable format:

```typescript
import { KeyBindings } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const formatted = KeyBindings.formatKeyCombo('C-S-p');
console.log(formatted);  // "Ctrl+Shift+P"

const formatted2 = KeyBindings.formatKeyCombo('M-f');
console.log(formatted2);  // "Alt+F"
```

---

## Examples

### Simple Tab Navigation

```typescript
import { createScreen, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

// Create three buttons - Tab cycles between them
createButton({
  parent: screen,
  top: 2,
  left: 2,
  content: 'Button 1',
});

createButton({
  parent: screen,
  top: 6,
  left: 2,
  content: 'Button 2',
});

createButton({
  parent: screen,
  top: 10,
  left: 2,
  content: 'Button 3',
});

// Tab through buttons: Button 1 -> Button 2 -> Button 3 -> Button 1 ...
screen.render();
```

### Custom Tab Order with TabIndex

```typescript
import { createScreen, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

// Tab order: Save -> Cancel -> Reset (not document order)
createButton({
  parent: screen,
  top: 2,
  left: 2,
  content: 'Cancel',
  tabIndex: 2,  // Second
});

createButton({
  parent: screen,
  top: 6,
  left: 2,
  content: 'Reset',
  tabIndex: 0,  // Third (natural order)
});

createButton({
  parent: screen,
  top: 10,
  left: 2,
  content: 'Save',
  tabIndex: 1,  // First
});

screen.render();
```

### Focus Indicators and Hover

```typescript
import { createScreen, createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

const panel = createBox({
  parent: screen,
  top: 2,
  left: 2,
  width: 40,
  height: 10,
  border: { type: 'line' },
  focusable: true,
  content: 'Tab to focus me!\nHover with mouse!',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'blue' },
    hover: {
      border: { fg: 'cyan' },  // Cyan on hover
    },
    focus: {
      border: { fg: 'yellow', bold: true },  // Yellow bold when focused
      fg: 'yellow',
    },
  },
});

screen.render();
```

### Disabled Buttons

```typescript
import { createScreen, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

const enableButton = createButton({
  parent: screen,
  top: 2,
  left: 2,
  content: 'Enable',
});

const disableButton = createButton({
  parent: screen,
  top: 6,
  left: 2,
  content: 'Disable',
});

const targetButton = createButton({
  parent: screen,
  top: 10,
  left: 2,
  content: 'Target Button',
});

enableButton.on('press', () => {
  targetButton.enable();
  screen.render();
});

disableButton.on('press', () => {
  targetButton.disable();
  screen.render();
});

// Target button starts disabled
targetButton.disable();

screen.render();
```

### Modal Focus Trapping

```typescript
import { createScreen, createBox, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const screen = createScreen(bbs);

// Main window
const mainWindow = createBox({
  parent: screen,
  top: 1,
  left: 1,
  width: 40,
  height: 10,
  border: { type: 'line' },
  content: 'Main Window',
});

const openModalButton = createButton({
  parent: mainWindow,
  top: 2,
  left: 2,
  content: 'Open Modal',
});

// Modal (hidden initially)
const modal = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 30,
  height: 8,
  border: { type: 'line' },
  label: ' Modal ',
  hidden: true,
  shadow: true,
});

const closeModalButton = createButton({
  parent: modal,
  top: 2,
  left: 2,
  content: 'Close',
});

openModalButton.on('press', () => {
  screen.saveFocus();  // Save current focus
  modal.show();
  modal.setFront();
  closeModalButton.focus();  // Focus first element in modal
  screen.render();
});

closeModalButton.on('press', () => {
  modal.hide();
  screen.restoreFocus();  // Restore focus to previous element
  screen.render();
});

screen.render();
```

---

## Best Practices

1. **Always make interactive elements focusable** - Buttons, lists, inputs should be `focusable: true`
2. **Provide clear focus indicators** - Users should always know where they are
3. **Use tabIndex sparingly** - Natural order is usually best, only override when necessary
4. **Test with keyboard only** - Try navigating your door without a mouse
5. **Disable unavailable actions** - Use `.disable()` instead of hiding elements when appropriate
6. **Save/restore focus for modals** - Prevents users from losing their place

---

## Keyboard Navigation Reference

### Global Keys

| Key | Action |
|-----|--------|
| **Tab** | Focus next element |
| **Shift+Tab** | Focus previous element |
| **Escape** | Close modals, cancel operations |

### Widget-Specific Keys

#### List Widget

| Key | Action |
|-----|--------|
| **Up/Down Arrows** | Move selection up/down |
| **Home** | Jump to first item |
| **End** | Jump to last item |
| **Page Up** | Jump up by 10 items |
| **Page Down** | Jump down by 10 items |
| **Enter** | Select/activate current item |
| **Space** | Select/activate current item |
| **Any Letter/Number** | Type-to-search: jump to first item starting with that character |
| **k/j** (vi mode) | Up/Down navigation |
| **g/G** (vi mode) | First/last item |

#### Button Widget

| Key | Action |
|-----|--------|
| **Enter** | Activate button |
| **Space** | Activate button |

#### ScrollableBox Widget

| Key | Action |
|-----|--------|
| **Up/Down Arrows** | Scroll up/down one line |
| **Page Up** | Scroll up one page |
| **Page Down** | Scroll down one page |
| **Space** | Scroll down one page |
| **Home** | Scroll to top |
| **End** | Scroll to bottom |
| **k/j** (vi mode) | Up/Down scrolling |
| **Ctrl+B/F** (vi mode) | Page up/down |
| **g/G** (vi mode) | Top/bottom |

#### Form Widget

| Key | Action |
|-----|--------|
| **Tab** | Focus next field |
| **Shift+Tab** | Focus previous field |
| **Enter** | Submit form |
| **Escape** | Cancel/clear form |

---

## Compatibility

Keyboard navigation works on:
- All BBS terminals (keyboard-first interfaces)
- AmiExpress web terminal
- Any terminal with keyboard input support

No configuration needed - it just works!
