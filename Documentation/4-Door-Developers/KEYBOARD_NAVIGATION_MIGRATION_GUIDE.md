# Keyboard Navigation Migration Guide

## Overview

This guide helps you migrate existing TypeScript doors to use the new desktop OS-quality keyboard navigation system. The system provides Tab/Shift+Tab navigation, visual focus states, panel management, and global keyboard shortcuts.

## What's New

### Phase 1: Core Focus Management
- **tabIndex property**: Control tab order of focusable widgets
- **Tab/Shift+Tab**: Automatic focus cycling through widgets
- **Visual focus indicators**: Customizable focus styles

### Phase 2: Visual States
- **hover state**: Mouse-over styling
- **focus state**: Keyboard focus styling
- **disabled state**: Prevent interaction and show disabled styling
- **Custom styles**: Per-widget state customization

### Phase 3: Component Keyboard Navigation
- **List**: Arrow keys, Page Up/Down, Home/End, type-to-search
- **Button**: Space/Enter activation
- **ScrollableBox/ScrollableText**: Arrow keys, Page Up/Down scrolling
- **Form**: Tab between inputs, validation

### Phase 4: Layout & Panel Navigation
- **Modal focus trapping**: Tab constrained within dialogs
- **Panel widget**: Multi-panel layouts with Alt+number shortcuts
- **F6 panel cycling**: Switch between panels

### Phase 5: Advanced Features
- **KeyBindings**: Global keyboard shortcuts (Ctrl+S, etc.)
- **Context-aware shortcuts**: Different actions per widget type
- **Shortcut discovery**: Help dialogs and command palettes

## Migration Steps

### Step 1: Add tabIndex to Focusable Widgets

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

### Step 2: Add Visual Focus States

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

### Step 3: Add Keyboard Shortcuts

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

### Step 4: Add Modal Focus Trapping

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

### Step 5: Use Panel Layouts

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

## Common Patterns

### Pattern 1: Form with Validation

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

### Pattern 2: List with Type-to-Search

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

### Pattern 3: Multi-Panel Application

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

### Pattern 4: Context-Aware Shortcuts

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

### Pattern 5: Help Dialog with Shortcuts

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

## Key Notation Reference

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

## Testing Checklist

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

## Best Practices

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

## Troubleshooting

### Tab Navigation Not Working
- Check that widgets have `keys: true` or parent has `keys: true`
- Verify `tabIndex` is set on focusable widgets
- Ensure `focusable: true` is set (or implied by widget type)

### Focus Styles Not Showing
- Check that `style.focus` is defined
- Verify widget is actually receiving focus (use `screen.focused`)
- Ensure colors are visible against background

### Shortcuts Not Firing
- Verify shortcut is registered on `screen.keyBindings`
- Check key notation (C-s not Ctrl+S)
- Ensure screen has keyboard event handling enabled

### Panel Shortcuts Not Working
- Verify `panelIndex` is set (1-9)
- Check that Panel widget is used, not Box
- Ensure screen has Panel's keyboard handlers registered

## Complete Example

See `~/Code/amiexpress-web/sdk/doors/keyboard-nav-example/` for a complete working example demonstrating all keyboard navigation features.

## Further Reading

- [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) - Complete API reference
- [NEO_BLESSED_COLOR_GUIDE.md](./NEO_BLESSED_COLOR_GUIDE.md) - Color styling guide
- [GAME_MODE_AND_MOUSE.md](./GAME_MODE_AND_MOUSE.md) - Mouse handling guide
