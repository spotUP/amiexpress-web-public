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

---

## Merged from Keyboard Navigation Migration Guide

### Overview

This guide helps you migrate existing TypeScript doors to use the new desktop OS-quality keyboard navigation system. The system provides Tab/Shift+Tab navigation, visual focus states, panel management, and global keyboard shortcuts.


### What's New

#### Phase 1: Core Focus Management
- **tabIndex property**: Control tab order of focusable widgets
- **Tab/Shift+Tab**: Automatic focus cycling through widgets
- **Visual focus indicators**: Customizable focus styles

#### Phase 2: Visual States
- **hover state**: Mouse-over styling
- **focus state**: Keyboard focus styling
- **disabled state**: Prevent interaction and show disabled styling
- **Custom styles**: Per-widget state customization

#### Phase 3: Component Keyboard Navigation
- **List**: Arrow keys, Page Up/Down, Home/End, type-to-search
- **Button**: Space/Enter activation
- **ScrollableBox/ScrollableText**: Arrow keys, Page Up/Down scrolling
- **Form**: Tab between inputs, validation

#### Phase 4: Layout & Panel Navigation
- **Modal focus trapping**: Tab constrained within dialogs
- **Panel widget**: Multi-panel layouts with Alt+number shortcuts
- **F6 panel cycling**: Switch between panels

#### Phase 5: Advanced Features
- **KeyBindings**: Global keyboard shortcuts (Ctrl+S, etc.)
- **Context-aware shortcuts**: Different actions per widget type
- **Shortcut discovery**: Help dialogs and command palettes


### Migration Steps

#### Step 1: Add tabIndex to Focusable Widgets

**Before:**
```typescript
const nameInput = blessed.textbox({
  parent: form,
  top: 2,
  left: 2,
  height: 1,
  width: 40,
});

const emailInput = blessed.textbox({
  parent: form,
  top: 4,
  left: 2,
  height: 1,
  width: 40,
});
```

**After:**
```typescript
const nameInput = blessed.textbox({
  parent: form,
  top: 2,
  left: 2,
  height: 1,
  width: 40,
  tabIndex: 0,  // Tab order
});

const emailInput = blessed.textbox({
  parent: form,
  top: 4,
  left: 2,
  height: 1,
  width: 40,
  tabIndex: 1,  // Tab order
});
```

**Result**: Users can now Tab between inputs in order.

#### Step 2: Add Visual Focus States

**Before:**
```typescript
const button = blessed.button({
  parent: screen,
  content: 'Save',
  style: {
    fg: 'white',
    bg: 'blue',
  },
});
```

**After:**
```typescript
const button = blessed.button({
  parent: screen,
  content: 'Save',
  tabIndex: 2,
  style: {
    fg: 'white',
    bg: 'blue',
    hover: {
      bg: 'cyan',  // Mouse hover
    },
    focus: {
      bg: 'green',  // Keyboard focus
      border: { fg: 'yellow' },
    },
  },
});
```

**Result**: Clear visual feedback for hover and focus states.

#### Step 3: Add Keyboard Shortcuts

**Before:**
```typescript
// No global shortcuts
```

**After:**
```typescript
// Register Ctrl+S to save
screen.keyBindings.register({
  keys: ['C-s'],
  description: 'Save document',
  action: () => {
    saveDocument();
    showMessage('Document saved!');
  },
});

// Register Ctrl+Q to quit
screen.keyBindings.register({
  keys: ['C-q'],
  description: 'Quit application',
  action: () => {
    confirmQuit();
  },
});
```

**Result**: Desktop OS-style keyboard shortcuts.

#### Step 4: Add Modal Focus Trapping

**Before:**
```typescript
const dialog = blessed.overlay({
  parent: screen,
  content: 'Are you sure?',
});
dialog.show();
```

**After:**
```typescript
const dialog = blessed.overlay({
  parent: screen,
  content: 'Are you sure?',
  trapFocus: true,  // Constrain Tab within dialog
});

const yesButton = blessed.button({
  parent: dialog,
  content: 'Yes',
  tabIndex: 0,
});

const noButton = blessed.button({
  parent: dialog,
  content: 'No',
  tabIndex: 1,
});

dialog.show();
yesButton.focus();  // Start with Yes focused
```

**Result**: Tab navigation stays within modal.

#### Step 5: Use Panel Layouts

**Before:**
```typescript
const leftBox = blessed.box({
  parent: screen,
  left: 0,
  width: '50%',
  height: '100%',
});

const rightBox = blessed.box({
  parent: screen,
  left: '50%',
  width: '50%',
  height: '100%',
});
```

**After:**
```typescript
const leftPanel = blessed.panel({
  parent: screen,
  left: 0,
  width: '50%',
  height: '100%',
  panelIndex: 1,  // Alt+1 to activate
  title: 'Files',
});

const rightPanel = blessed.panel({
  parent: screen,
  left: '50%',
  width: '50%',
  height: '100%',
  panelIndex: 2,  // Alt+2 to activate
  title: 'Editor',
});

// Add focusable widgets to each panel
const fileList = blessed.list({
  parent: leftPanel,
  tabIndex: 0,
  // ...
});

const editor = blessed.textarea({
  parent: rightPanel,
  tabIndex: 0,
  // ...
});
```

**Result**: Users can press Alt+1/Alt+2 or F6 to switch panels.


### Common Patterns

#### Pattern 1: Form with Validation

```typescript
const form = blessed.form({
  parent: screen,
  keys: true,
});

const nameInput = blessed.textbox({
  parent: form,
  label: 'Name:',
  tabIndex: 0,
});

const emailInput = blessed.textbox({
  parent: form,
  label: 'Email:',
  tabIndex: 1,
});

const submitButton = blessed.button({
  parent: form,
  content: 'Submit',
  tabIndex: 2,
});

submitButton.on('press', () => {
  if (!nameInput.getValue()) {
    showError('Name is required');
    nameInput.focus();
    return;
  }
  if (!emailInput.getValue()) {
    showError('Email is required');
    emailInput.focus();
    return;
  }
  submitForm();
});
```

#### Pattern 2: List with Type-to-Search

```typescript
const fileList = blessed.list({
  parent: screen,
  tabIndex: 0,
  items: ['file1.txt', 'file2.txt', 'folder/file3.txt'],
  keys: true,
  vi: true,  // Enable arrow keys
});

// Type-to-search is automatic - just type letters
// Press Enter to select
fileList.on('select', (item) => {
  openFile(item.getText());
});
```

#### Pattern 3: Multi-Panel Application

```typescript
// Left panel: File browser
const browserPanel = blessed.panel({
  parent: screen,
  left: 0,
  width: '30%',
  height: '100%',
  panelIndex: 1,
  title: 'Files',
});

const fileList = blessed.list({
  parent: browserPanel,
  tabIndex: 0,
  items: getFiles(),
});

// Center panel: Editor
const editorPanel = blessed.panel({
  parent: screen,
  left: '30%',
  width: '50%',
  height: '100%',
  panelIndex: 2,
  title: 'Editor',
});

const editor = blessed.textarea({
  parent: editorPanel,
  tabIndex: 0,
});

// Right panel: Properties
const propsPanel = blessed.panel({
  parent: screen,
  left: '80%',
  width: '20%',
  height: '100%',
  panelIndex: 3,
  title: 'Properties',
});

// Register F6 to cycle panels (automatic)
// Register Alt+1, Alt+2, Alt+3 to jump to panels (automatic)
```

#### Pattern 4: Context-Aware Shortcuts

```typescript
// Ctrl+C means different things in different contexts

// In list: Copy selected item
screen.keyBindings.register({
  keys: ['C-c'],
  description: 'Copy item',
  context: 'list',
  action: () => {
    const item = fileList.getSelected();
    clipboard.copy(item);
  },
});

// In textbox: Copy selected text
screen.keyBindings.register({
  keys: ['C-c'],
  description: 'Copy text',
  context: 'textbox',
  action: () => {
    const text = editor.getSelectedText();
    clipboard.copy(text);
  },
});
```

#### Pattern 5: Help Dialog with Shortcuts

```typescript
function showHelp() {
  const shortcuts = screen.keyBindings.getAllShortcuts();
  const helpText = shortcuts.map(s => {
    const keys = s.keys.map(k => blessed.KeyBindings.formatKeyCombo(k)).join(', ');
    return `${keys.padEnd(20)} ${s.description}`;
  }).join('\n');

  const helpDialog = blessed.overlay({
    parent: screen,
    content: `Available Shortcuts:\n\n${helpText}`,
    trapFocus: true,
  });

  const closeButton = blessed.button({
    parent: helpDialog,
    content: 'Close',
    tabIndex: 0,
  });

  closeButton.on('press', () => {
    helpDialog.destroy();
    screen.render();
  });

  helpDialog.show();
  closeButton.focus();
  screen.render();
}

// Register Ctrl+H or F1 to show help
screen.keyBindings.register({
  keys: ['C-h', 'f1'],
  description: 'Show help',
  action: showHelp,
});
```


### Key Notation Reference

| Notation | Key Combination | Display Format |
|----------|----------------|----------------|
| `C-s` | Ctrl+S | Ctrl+S |
| `M-x` | Alt+X | Alt+X |
| `S-f1` | Shift+F1 | Shift+F1 |
| `C-S-s` | Ctrl+Shift+S | Ctrl+Shift+S |
| `f1` | F1 | F1 |
| `escape` | Escape | Escape |
| `enter` | Enter | Enter |
| `space` | Space | Space |


### Testing Checklist

After migration, test these scenarios:

- [ ] Tab moves focus forward through widgets
- [ ] Shift+Tab moves focus backward through widgets
- [ ] Arrow keys navigate lists
- [ ] Page Up/Down scrolls scrollable boxes
- [ ] Space/Enter activates buttons
- [ ] Type-to-search works in lists
- [ ] Modal dialogs trap Tab navigation
- [ ] Alt+number activates correct panel
- [ ] F6 cycles through panels
- [ ] Global shortcuts (Ctrl+S, etc.) work
- [ ] Context shortcuts work in correct widgets
- [ ] Visual focus states are visible
- [ ] Hover states work with mouse
- [ ] Disabled widgets cannot be focused


### Troubleshooting

#### Tab Navigation Not Working
- Check that widgets have `keys: true` or parent has `keys: true`
- Verify `tabIndex` is set on focusable widgets
- Ensure `focusable: true` is set (or implied by widget type)

#### Focus Styles Not Showing
- Check that `style.focus` is defined
- Verify widget is actually receiving focus (use `screen.focused`)
- Ensure colors are visible against background

#### Shortcuts Not Firing
- Verify shortcut is registered on `screen.keyBindings`
- Check key notation (C-s not Ctrl+S)
- Ensure screen has keyboard event handling enabled

#### Panel Shortcuts Not Working
- Verify `panelIndex` is set (1-9)
- Check that Panel widget is used, not Box
- Ensure screen has Panel's keyboard handlers registered


### Complete Example

See `~/Code/AmiExpress/amiexpress-web/sdk/doors/keyboard-nav-example/` for a complete working example demonstrating all keyboard navigation features.


### Further Reading

- [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) - Complete API reference
- [NEO_BLESSED_COLOR_GUIDE.md](./NEO_BLESSED_COLOR_GUIDE.md) - Color styling guide
- [MOUSE_INTEGRATION.md](MOUSE_INTEGRATION.md) - Mouse handling guide

### Best Practices (from KEYBOARD_NAVIGATION_MIGRATION_GUIDE)

### 1. Consistent Tab Order
Always set tabIndex in visual order (top-to-bottom, left-to-right):
```typescript
const input1 = blessed.textbox({ tabIndex: 0 });
const input2 = blessed.textbox({ tabIndex: 1 });
const button = blessed.button({ tabIndex: 2 });
```

### 2. Clear Focus Indicators
Always provide visible focus styles:
```typescript
style: {
  focus: {
    border: { fg: 'yellow' },
    bg: 'blue',
  },
}
```

### 3. Logical Shortcut Keys
Use familiar shortcuts when possible:
- `C-s`: Save
- `C-q`: Quit
- `C-f`: Find/Search
- `C-h` or `f1`: Help
- `C-n`: New
- `C-o`: Open

### 4. Document Shortcuts
Always register shortcuts with clear descriptions:
```typescript
screen.keyBindings.register({
  keys: ['C-s'],
  description: 'Save current document',  // Clear description
  action: save,
});
```

### 5. Restore Focus After Dialogs
When closing dialogs, restore focus to previous element:
```typescript
const previousFocus = screen.focused;
dialog.show();
dialog.on('hide', () => {
  if (previousFocus) {
    previousFocus.focus();
  }
});
```
