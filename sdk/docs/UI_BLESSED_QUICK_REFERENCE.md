# Neo-Blessed UI Quick Reference

Fast lookup for Neo-Blessed APIs. Full terminal UI library for BBS doors.

## Import

```typescript
import blessed from '@amiexpress/sdk/engines/ui/blessed';

// Or import specific widgets
import { Screen, Box, List, Form, Button } from '@amiexpress/sdk/engines/ui/blessed';
```

## Screen Setup

```typescript
// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'My Door',
  output: (data) => door.write(data)  // BBS output callback
});

// Render (call after changes)
screen.render();

// Handle resize
screen.on('resize', () => screen.render());

// Destroy screen
screen.destroy();
```

## Core Widgets

### Box (Container)

```typescript
const box = blessed.box({
  parent: screen,
  top: 0, left: 0,
  width: '50%', height: '50%',
  content: 'Hello World',
  tags: true,                    // Enable color tags
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'blue',
    border: { fg: 'cyan' }
  }
});
```

### Text

```typescript
const text = blessed.text({
  parent: screen,
  top: 1, left: 1,
  content: '{bold}Title{/bold}',
  tags: true,
  style: { fg: 'yellow' }
});
```

### List

```typescript
const list = blessed.list({
  parent: screen,
  top: 'center', left: 'center',
  width: '50%', height: '50%',
  tags: true,
  items: ['Option 1', 'Option 2', 'Option 3'],
  keys: true,                    // Keyboard navigation
  mouse: true,                   // Mouse support
  border: { type: 'line' },
  style: {
    selected: { fg: 'black', bg: 'cyan' },
    item: { fg: 'white' }
  }
});

list.on('select', (item, index) => {
  console.log('Selected:', index);
});
```

### Form

```typescript
const form = blessed.form({
  parent: screen,
  top: 2, left: 2,
  width: '80%', height: '80%',
  keys: true
});

form.on('submit', (data) => {
  console.log('Form data:', data);
});

form.submit();  // Trigger submit
```

### Textbox / Input

```typescript
const input = blessed.textbox({
  parent: form,
  name: 'username',
  top: 2, left: 2,
  width: 30, height: 3,
  inputOnFocus: true,
  border: { type: 'line' },
  style: { focus: { border: { fg: 'cyan' } } }
});

input.focus();
input.getValue();  // Get current value
input.setValue('default');
```

### Textarea

```typescript
const textarea = blessed.textarea({
  parent: form,
  name: 'message',
  top: 5, left: 2,
  width: 50, height: 10,
  inputOnFocus: true,
  border: { type: 'line' }
});
```

### Button

```typescript
const button = blessed.button({
  parent: screen,
  top: 10, left: 2,
  width: 12, height: 3,
  content: ' Submit ',
  align: 'center',
  border: { type: 'line' },
  style: {
    fg: 'white', bg: 'blue',
    focus: { bg: 'cyan' }
  }
});

button.on('press', () => {
  form.submit();
});
```

## More Widgets

### Progress Bar

```typescript
const progress = blessed.progressbar({
  parent: screen,
  top: 'center', left: 'center',
  width: '80%', height: 3,
  border: { type: 'line' },
  filled: 50,                    // 0-100
  style: { bar: { bg: 'green' } }
});

progress.setProgress(75);
progress.progress(10);  // Add 10%
```

### Log

```typescript
const log = blessed.log({
  parent: screen,
  top: 0, left: 0,
  width: '100%', height: '100%',
  tags: true,
  scrollable: true,
  scrollbar: { ch: ' ', style: { bg: 'cyan' } }
});

log.log('Message 1');
log.log('{red-fg}Error{/red-fg}');
```

### Table

```typescript
const table = blessed.table({
  parent: screen,
  top: 'center', left: 'center',
  width: '80%', height: '50%',
  border: { type: 'line' },
  data: [
    ['Name', 'Score', 'Level'],
    ['Player1', '1000', '5'],
    ['Player2', '800', '4']
  ]
});

table.setData([...newData]);
```

### ListTable (Selectable Table)

```typescript
const listTable = blessed.listtable({
  parent: screen,
  top: 0, left: 0,
  width: '100%', height: '100%',
  keys: true,
  mouse: true,
  data: tableData,
  style: {
    header: { fg: 'cyan', bold: true },
    cell: { selected: { bg: 'blue' } }
  }
});

listTable.on('select', (item, index) => { });
```

### Checkbox

```typescript
const checkbox = blessed.checkbox({
  parent: form,
  top: 5, left: 2,
  text: 'Enable feature',
  checked: false
});

checkbox.on('check', () => { });
checkbox.on('uncheck', () => { });
checkbox.toggle();
```

### RadioSet / RadioButton

```typescript
const radioset = blessed.radioset({
  parent: form,
  top: 2, left: 2,
  width: 20, height: 6
});

blessed.radiobutton({ parent: radioset, top: 0, text: 'Option A' });
blessed.radiobutton({ parent: radioset, top: 1, text: 'Option B' });
blessed.radiobutton({ parent: radioset, top: 2, text: 'Option C' });
```

### Listbar (Menu Bar)

```typescript
const menubar = blessed.listbar({
  parent: screen,
  top: 0, left: 0,
  width: '100%', height: 1,
  items: {
    'File': () => showFileMenu(),
    'Edit': () => showEditMenu(),
    'Help': () => showHelp()
  },
  style: { selected: { bg: 'blue' } }
});
```

## Integrated Contrib Widgets

The `blessed-contrib` library is now integrated directly into Neo-Blessed.

### Grid Layout

```typescript
const grid = new blessed.Grid({ rows: 12, cols: 12, screen: screen });

const box = grid.set(0, 0, 6, 6, blessed.box, {
  content: 'Top Left'
});
```

### Line Chart

```typescript
const line = blessed.linechart({
  parent: screen,
  width: 80, height: 20,
  label: ' Stats '
});

line.setData([{
  title: 'Data',
  x: ['A', 'B', 'C'],
  y: [10, 20, 15]
}]);
```

### Donut Chart

```typescript
const donut = blessed.donut({
  parent: screen,
  radius: 8,
  arcWidth: 3
});

donut.setData([
  { percent: 87, label: 'CPU', color: 'magenta' }
]);

```

### Tree View

```typescript
const tree = blessed.tree({
  parent: screen,
  template: { lines: true }
});

tree.setData({
  name: 'Root',
  children: {
    'Leaf 1': {},
    'Leaf 2': { children: { 'Sub-leaf': {} } }
  }
});
```

## Dialog Widgets

### Message

```typescript
const msg = blessed.message({
  parent: screen,
  top: 'center', left: 'center',
  width: '50%', height: 'shrink',
  border: { type: 'line' }
});

msg.display('Operation complete!', 3);  // 3 second timeout
```

### Question (Yes/No)

```typescript
const question = blessed.question({
  parent: screen,
  top: 'center', left: 'center',
  width: '50%', height: 'shrink',
  border: { type: 'line' }
});

question.ask('Are you sure?', (err, confirmed) => {
  if (confirmed) { /* yes */ }
});
```

### Prompt (Text Input)

```typescript
const prompt = blessed.prompt({
  parent: screen,
  top: 'center', left: 'center',
  width: '50%', height: 'shrink',
  border: { type: 'line' }
});

prompt.input('Enter name:', '', (err, value) => {
  console.log('Name:', value);
});
```

### Loading

```typescript
const loading = blessed.loading({
  parent: screen,
  top: 'center', left: 'center',
  width: 'shrink', height: 'shrink',
  border: { type: 'line' }
});

loading.load('Loading...');
// ... async operation
loading.stop();
```

## Positioning

| Value | Meaning |
|-------|---------|
| `0`, `10`, `-5` | Absolute position (- from end) |
| `'50%'` | Percentage of parent |
| `'center'` | Centered in parent |
| `'shrink'` | Fit content |
| `'100%-10'` | Calculated position |

## Color Tags

```typescript
// Enable with: tags: true
const content = `
{bold}Bold text{/bold}
{underline}Underlined{/underline}
{red-fg}Red foreground{/red-fg}
{blue-bg}Blue background{/blue-bg}
{#ff0000-fg}Hex color{/#ff0000-fg}
`;
```

### Available Colors

| Color | Tag |
|-------|-----|
| Black | `{black-fg}` |
| Red | `{red-fg}` |
| Green | `{green-fg}` |
| Yellow | `{yellow-fg}` |
| Blue | `{blue-fg}` |
| Magenta | `{magenta-fg}` |
| Cyan | `{cyan-fg}` |
| White | `{white-fg}` |
| Gray | `{gray-fg}` |

Bright: `{light-red-fg}`, `{bright-green-fg}`, etc.

## Border Types

```typescript
border: { type: 'line' }    // Single line
border: { type: 'bg' }      // Background color
border: 'line'              // Shorthand
```

## Keyboard Handling

```typescript
// Screen-level
screen.key(['escape', 'q'], () => process.exit(0));
screen.key(['C-c'], () => process.exit(0));  // Ctrl+C

// Widget-level
list.key('enter', () => {
  const selected = list.selected;
});
```

### Key Names

| Key | Name |
|-----|------|
| Enter | `'enter'`, `'return'` |
| Escape | `'escape'` |
| Tab | `'tab'` |
| Space | `'space'` |
| Backspace | `'backspace'` |
| Delete | `'delete'` |
| Arrows | `'up'`, `'down'`, `'left'`, `'right'` |
| Ctrl+key | `'C-a'`, `'C-c'`, etc. |
| Function | `'f1'` - `'f12'` |

## Focus Management

```typescript
screen.focusNext();
screen.focusPrevious();
widget.focus();

widget.on('focus', () => { });
widget.on('blur', () => { });
```

## Scrolling

```typescript
const scrollBox = blessed.scrollablebox({
  parent: screen,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'cyan' }
  }
});

scrollBox.scroll(10);    // Scroll down 10 lines
scrollBox.scrollTo(0);   // Scroll to top
```

## Common Events

| Event | Description |
|-------|-------------|
| `'select'` | List item selected |
| `'press'` | Button pressed |
| `'submit'` | Form submitted |
| `'cancel'` | Form cancelled |
| `'focus'` | Widget focused |
| `'blur'` | Widget unfocused |
| `'keypress'` | Key pressed |
| `'click'` | Mouse click |
| `'check'` | Checkbox checked |
| `'uncheck'` | Checkbox unchecked |

## Example: Menu Application

```typescript
import blessed from '@amiexpress/sdk/engines/ui/blessed';

const screen = blessed.screen({
  smartCSR: true,
  title: 'BBS Door'
});

// Header
blessed.box({
  parent: screen,
  top: 0, left: 0,
  width: '100%', height: 3,
  content: '{center}{bold}Welcome to My Door{/bold}{/center}',
  tags: true,
  style: { fg: 'white', bg: 'blue' }
});

// Menu
const menu = blessed.list({
  parent: screen,
  top: 'center', left: 'center',
  width: 30, height: 10,
  items: ['Play Game', 'High Scores', 'Settings', 'Exit'],
  keys: true,
  mouse: true,
  border: { type: 'line' },
  style: {
    selected: { fg: 'black', bg: 'cyan' }
  }
});

menu.on('select', (item, index) => {
  switch (index) {
    case 0: startGame(); break;
    case 1: showScores(); break;
    case 2: showSettings(); break;
    case 3: screen.destroy(); break;
  }
});

screen.key('q', () => screen.destroy());

menu.focus();
screen.render();
```

## Cleanup

```typescript
screen.destroy();  // Clean up and exit
```
