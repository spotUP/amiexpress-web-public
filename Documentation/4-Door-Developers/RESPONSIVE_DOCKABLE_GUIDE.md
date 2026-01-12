# Responsive & Dockable UI Guide

## Overview

AmiExpress SDK v2.0 includes a comprehensive responsive layout system and dockable panel system that automatically makes your doors adapt to different terminal sizes and provides desktop-like window management.

All neo-blessed components are now **responsive and dockable by default** at the SDK level. `createBox()` returns a `DockablePanel` with a border label (no title bar) unless you opt into the title bar.

## Features

### Responsive Layout System
- **Automatic terminal resize detection** - Doors adapt when terminal size changes
- **Percentage-based layouts** - Use `'50%'` instead of fixed widths
- **Constraint-based positioning** - Set min/max dimensions
- **Breakpoints** - Different layouts for small/medium/large terminals
- **Flex & Grid layouts** - Modern layout engines

### Dockable Panel System
- **Drag and drop** - Move panels by dragging the top border (or title bar when enabled)
- **Edge docking** - Snap to top, bottom, left, right, or center
- **Floating panels** - Free-form positioning
- **Minimize/maximize** - Collapse panels to title bar
- **8-way resize handles** - Resize from all 4 corners and 4 edges
- **Visual hover states** - Arrows appear when hovering over resizable edges
- **Keyboard shortcuts** - Alt+number to activate panels

## Quick Start

### 1. Basic Responsive Screen

All screens are responsive by default:

```typescript
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const screen = new Screen({
  title: 'My Door',
  output: (data) => ctx.output.write(data),
  responsive: true,  // Default: true
});

// ResponsiveLayoutManager is automatically available
screen.responsiveLayout.onResize((width, height) => {
  console.log(`Terminal resized to ${width}x${height}`);
});
```

### 2. Percentage-Based Layouts

Use percentages for automatic resizing:

```typescript
import { box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const leftPanel = box({
  parent: screen,
  left: 0,
  top: 0,
  width: '30%',     // 30% of screen width
  height: '100%',   // Full height
  border: { type: 'line' },
});

const rightPanel = box({
  parent: screen,
  left: '30%',
  top: 0,
  width: '70%',     // 70% of screen width
  height: '100%',
  border: { type: 'line' },
});
```

### 3. Layout Constraints

Add min/max constraints to prevent panels from getting too small or large:

```typescript
import { box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const sidebar = box({
  parent: screen,
  left: 0,
  width: '20%',
  height: '100%',
});

// Register constraints
screen.responsiveLayout.registerElement(sidebar, {
  minWidth: 15,   // Never smaller than 15 cols
  maxWidth: 30,   // Never larger than 30 cols
  minHeight: 10,
});
```

### 4. Dockable Panels

Use DockablePanel for movable, resizable windows:

```typescript
import { DockablePanel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const panel = new DockablePanel({
  parent: screen,
  title: 'File Browser',
  left: 5,
  top: 2,
  width: 40,
  height: 20,
  dockPosition: 'float',      // Start floating
  showMinimizeButton: true,   // Show minimize button
  showCloseButton: true,      // Show close button
  resizable: true,            // Allow resizing
  draggable: true,            // Allow dragging
  minWidth: 20,
  minHeight: 10,
  border: { type: 'line', fg: 'cyan' },
});

// If you want a border-label panel without a title bar:
const infoPanel = new DockablePanel({
  parent: screen,
  label: ' Info ',
  useTitleBar: false,
  width: '40%',
  height: '100%-3',
});

// Listen to panel events
panel.on('dock', (position) => {
  console.log(`Panel docked to ${position}`);
});

panel.on('minimize', () => {
  console.log('Panel minimized');
});

panel.on('close', () => {
  console.log('Panel closed');
});
```

## Advanced Features

### Flex Layout

Arrange children in rows or columns:

```typescript
import { box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const container = box({ parent: screen, width: '100%', height: '100%' });

const button1 = box({ parent: container, width: 10, height: 3 });
const button2 = box({ parent: container, width: 10, height: 3 });
const button3 = box({ parent: container, width: 10, height: 3 });

// Arrange in a row with gaps
screen.responsiveLayout.createFlexLayout(container, [button1, button2, button3], {
  direction: 'row',
  gap: 2,
  padding: 1,
  wrap: true,  // Wrap to next row if needed
});
```

### Grid Layout

Arrange children in a grid:

```typescript
const grid = box({ parent: screen, width: '100%', height: '100%' });

const cells: Element[] = [];
for (let i = 0; i < 12; i++) {
  cells.push(box({ parent: grid, border: { type: 'line' } }));
}

// 4 columns, auto rows
screen.responsiveLayout.createGridLayout(grid, cells, {
  columns: 4,
  gap: 1,
  padding: 1,
});
```

### Breakpoints

Different layouts for different terminal sizes:

```typescript
const screen = new Screen({
  title: 'Responsive Door',
  responsive: true,
  breakpoints: {
    small: 80,    // < 80 cols
    medium: 120,  // < 120 cols
    large: 160,   // >= 160 cols
  },
});

screen.responsiveLayout.onResize((width, height) => {
  const breakpoint = screen.responsiveLayout.getBreakpoint();

  if (breakpoint === 'small') {
    // Single column layout
    sidebar.hide();
    mainPanel.options.width = '100%';
  } else if (breakpoint === 'medium') {
    // Two column layout
    sidebar.show();
    sidebar.options.width = '25%';
    mainPanel.options.width = '75%';
  } else {
    // Three column layout
    sidebar.show();
    sidebar.options.width = '20%';
    mainPanel.options.width = '60%';
    rightPanel.show();
    rightPanel.options.width = '20%';
  }

  screen.render();
});
```

### Panel State Persistence

Save and restore panel positions:

```typescript
// Save panel state
const state = panel.getState();
localStorage.setItem('panelState', JSON.stringify(state));

// Restore panel state
const savedState = JSON.parse(localStorage.getItem('panelState'));
panel.setState(savedState);
```

### Dock Positions

Available dock positions:

- `'top'` - Docked to top edge (30% height)
- `'bottom'` - Docked to bottom edge (30% height)
- `'left'` - Docked to left edge (30% width)
- `'right'` - Docked to right edge (30% width)
- `'center'` - Centered (50% width/height)
- `'float'` - Free-form positioning

```typescript
// Programmatically dock panel
panel.setDockPosition('left');

// Get current position
const position = panel.getDockPosition();  // 'left', 'right', etc.
```

### Minimize/Maximize

```typescript
// Minimize panel to title bar
panel.minimize();

// Restore panel
panel.maximize();

// Toggle
panel.toggleMinimize();

// Check state
if (panel.isMinimized()) {
  console.log('Panel is minimized');
}
```

### 8-Way Resize Handles

Dockable panels have resize handles on all edges and corners:

**Corners:**
- **NW (┌)** - Top-left corner - resize width and height from top-left
- **NE (┐)** - Top-right corner - resize width and height from top-right
- **SW (└)** - Bottom-left corner - resize width and height from bottom-left
- **SE (┘)** - Bottom-right corner - resize width and height from bottom-right

**Edges:**
- **N** - Top edge - resize height from top
- **S** - Bottom edge - resize height from bottom
- **W** - Left edge - resize width from left
- **E** - Right edge - resize width from right

**Visual Feedback:**
- **Default state:** Corner characters (┌ ┐ └ ┘) and invisible edge handles
- **Hover state:** Directional arrows appear (↖ ↗ ↙ ↘ ↑ ↓ ← →)
- **Hover colors:** Handle changes to yellow foreground on blue background

```typescript
const panel = new DockablePanel({
  title: 'Resizable Panel',
  resizable: true,  // Enable resize handles
  minWidth: 20,     // Prevent resizing too small
  minHeight: 10,
  maxWidth: 60,     // Prevent resizing too large
  maxHeight: 30,
});

// Listen to resize events
panel.on('resize-start', () => {
  console.log('Started resizing');
});

panel.on('resize', ({ width, height, x, y }) => {
  console.log(`Resized to ${width}x${height} at (${x}, ${y})`);
});

panel.on('resize-end', () => {
  console.log('Finished resizing');
});
```

## Complete Example

Here's a complete example of a multi-panel application:

```typescript
import { Screen, DockablePanel, box, list } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

function createApp(ctx: DoorContext) {
  // Create responsive screen
  const screen = new Screen({
    title: 'File Manager',
    output: (data) => ctx.output.write(data),
    responsive: true,
  });

  // Left panel: File browser
  const browserPanel = new DockablePanel({
    parent: screen,
    title: 'Files',
    left: 0,
    top: 0,
    width: '30%',
    height: '100%',
    dockPosition: 'left',
    showMinimizeButton: true,
    minWidth: 20,
    border: { type: 'line', fg: 'cyan' },
  });

  const fileList = list({
    parent: browserPanel,
    top: 1,  // Below title bar
    left: 0,
    width: '100%',
    height: '100%-1',
    items: ['file1.txt', 'file2.txt', 'folder/'],
    keys: true,
    vi: true,
  });

  // Center panel: Editor
  const editorPanel = new DockablePanel({
    parent: screen,
    title: 'Editor',
    left: '30%',
    top: 0,
    width: '50%',
    height: '100%',
    dockPosition: 'center',
    showMinimizeButton: true,
    showCloseButton: false,
    minWidth: 40,
    border: { type: 'line', fg: 'green' },
  });

  const editor = box({
    parent: editorPanel,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-1',
    content: 'Type here...',
  });

  // Right panel: Properties
  const propsPanel = new DockablePanel({
    parent: screen,
    title: 'Properties',
    left: '80%',
    top: 0,
    width: '20%',
    height: '100%',
    dockPosition: 'right',
    showMinimizeButton: true,
    minWidth: 15,
    border: { type: 'line', fg: 'yellow' },
  });

  // Responsive behavior
  screen.responsiveLayout.onResize((width, height) => {
    const breakpoint = screen.responsiveLayout.getBreakpoint();

    if (breakpoint === 'small') {
      // Small screens: hide properties panel
      propsPanel.hide();
      editorPanel.options.width = '70%';
    } else {
      // Medium/large screens: show all panels
      propsPanel.show();
      editorPanel.options.width = '50%';
    }

    screen.render();
  });

  // Keyboard shortcuts
  screen.key(['q', 'Q', 'escape'], () => {
    screen.destroy();
    ctx.close();
  });

  screen.render();
}
```

## Best Practices

### 1. Use Percentages for Main Layout

```typescript
// Good: Responsive
const sidebar = box({ width: '25%', height: '100%' });

// Bad: Fixed size
const sidebar = box({ width: 20, height: 24 });
```

### 2. Always Set Constraints on Dockable Panels

```typescript
// Good: Prevents panels from becoming unusably small
const panel = new DockablePanel({
  minWidth: 20,
  minHeight: 10,
  maxWidth: 60,
  // ...
});

// Bad: No constraints
const panel = new DockablePanel({ /* ... */ });
```

### 3. Handle Breakpoints for Better UX

```typescript
// Good: Adapt layout to terminal size
screen.responsiveLayout.onResize((width, height) => {
  if (screen.responsiveLayout.getBreakpoint() === 'small') {
    complexPanel.hide();
  }
});

// Bad: Ignore terminal size
```

### 4. Provide Visual Feedback

```typescript
// Good: Show dock/minimize state
panel.on('dock', (position) => {
  statusBar.setContent(`Panel docked to ${position}`);
});

panel.on('minimize', () => {
  statusBar.setContent('Panel minimized');
});
```

### 5. Save Panel State

```typescript
// Good: Remember user's layout preferences
panel.on('drag-end', () => {
  savePanelState(panel.getState());
});

// On startup
const savedState = loadPanelState();
if (savedState) {
  panel.setState(savedState);
}
```

## Migration Guide

### Before (Fixed Layout)

```typescript
const box1 = box({
  left: 0,
  top: 0,
  width: 20,
  height: 10,
});
```

### After (Responsive Layout)

```typescript
const box1 = box({
  left: 0,
  top: 0,
  width: '25%',    // Use percentage
  height: '100%',
});

// Add constraints
screen.responsiveLayout.registerElement(box1, {
  minWidth: 15,
  maxWidth: 30,
});
```

### Before (Static Panel)

```typescript
const panel = new Panel({
  left: 5,
  top: 2,
  width: 40,
  height: 20,
});
```

### After (Dockable Panel)

```typescript
const panel = new DockablePanel({
  left: 5,
  top: 2,
  width: 40,
  height: 20,
  showMinimizeButton: true,  // Add minimize
  resizable: true,            // Add resize
  draggable: true,            // Add drag
  minWidth: 20,               // Constraints
  minHeight: 10,
});
```

## API Reference

### ResponsiveLayoutManager

```typescript
class ResponsiveLayoutManager {
  // Register element with constraints
  registerElement(element: Element, constraints: LayoutConstraints): void;

  // Unregister element
  unregisterElement(element: Element): void;

  // Listen to resize events
  onResize(handler: (width: number, height: number) => void): () => void;

  // Get current breakpoint
  getBreakpoint(): 'small' | 'medium' | 'large';

  // Create flex layout
  createFlexLayout(parent: Element, children: Element[], options: FlexLayoutOptions): void;

  // Create grid layout
  createGridLayout(parent: Element, children: Element[], options: GridLayoutOptions): void;

  // Cleanup
  destroy(): void;
}
```

### DockablePanel

```typescript
class DockablePanel extends Panel {
  // Set dock position
  setDockPosition(position: DockPosition): void;

  // Get dock position
  getDockPosition(): DockPosition;

  // Minimize/maximize
  minimize(): void;
  maximize(): void;
  toggleMinimize(): void;
  isMinimized(): boolean;

  // State management
  getState(): PanelState;
  setState(state: Partial<PanelState>): void;

  // Bring to front (z-index)
  bringToFront(): void;

  // Events
  on('dock', (position: DockPosition) => void);
  on('minimize', () => void);
  on('maximize', () => void);
  on('close', () => void);
  on('drag-start', () => void);
  on('drag', ({ x, y }) => void);
  on('drag-end', () => void);
  on('resize-start', () => void);
  on('resize', ({ width, height }) => void);
  on('resize-end', () => void);
}
```

## Troubleshooting

### Panel Not Dragging

- Ensure `draggable: true` is set
- If you want the title bar, set `title` and leave `useTitleBar` as true.
- For border labels only, set `useTitleBar: false` and use `label`.
- Verify mouse events are enabled on screen

### Resize Not Working

- Ensure `resizable: true` is set
- Check that panel is floating (not docked)
- Verify resize handles are visible on all edges and corners
- Hover over edges to see resize cursors (arrows)

### Layout Not Responsive

- Ensure `responsive: true` on screen (default)
- Use percentages instead of fixed sizes
- Register elements with ResponsiveLayoutManager

### Panels Overlapping

- Use `bringToFront()` to adjust z-order
- Consider docking panels to edges
- Use different starting positions

## Advanced Tips & Best Practices

### DockablePanel Initial Positioning

When using `dockPosition: 'float'`, the panel may override initial position values. Always explicitly set position after creation:

```typescript
const panel = new DockablePanel({
  parent: screen,
  left: 20,
  top: 5,
  width: 60,
  height: 20,
  dockPosition: 'float',
  // ... other options
});

### Fixed Panels (No Drag/Resize/Dock)

Use `fixed: true` for playfields or any UI that must not move:

```typescript
const playfield = new DockablePanel({
  parent: screen,
  top: 1,
  left: 0,
  width: 22,
  height: 22,
  fixed: true
});
```

// IMPORTANT: Explicitly set position after creation
(panel as any).position.left = 20;
(panel as any).position.top = 5;
```

This ensures the panel appears at the correct coordinates even when floating.

### Element Z-Index and Rendering Order

Use `setIndex()` to control which elements render on top:

```typescript
// Create an emoji button that should appear above other elements
const emojiButton = createButton({
  parent: screen,
  bottom: 1,
  right: 0,
  width: 5,
  height: 1,
  content: ':)',
  // ... other options
});

// Ensure button renders above panels
emojiButton.setIndex(100);
```

Higher z-index values render on top. Use:
- `0-10`: Background elements
- `10-50`: Main panels
- `50-100`: Floating overlays
- `100+`: Top-level UI elements (buttons, badges)

### Overlay ESC Key Handling

Overlays with `closable: true` need explicit handling to work reliably:

```typescript
const overlay = blessed.box({
  parent: screen,
  top: 'center',
  left: 'center',
  width: '80%',
  height: '80%',
  closable: true,  // Adds [X] button
  keys: true,
  // ... other options
});

// IMPORTANT: close event doesn't auto-hide - you must do it manually
overlay.on('close', () => {
  overlay.hide();
  inputBox.focus();
  screen.render();
});

// CRITICAL: Add explicit ESC handler for when child elements are focused
overlay.key(['escape'], () => {
  overlay.hide();
  inputBox.focus();
  screen.render();
});
```

**Why both handlers?**
- `on('close')` - Triggered by [X] button click
- `key(['escape'])` - Works when child elements (buttons, lists) are focused

Without the explicit escape handler, ESC will only remove focus but won't close the overlay.

### Responsive Layout with Dynamic Elements

When adding UI elements that affect layout (like emoji buttons), update responsive handlers:

```typescript
// Constants for spacing
export const INPUT_HEIGHT = 3;
export const EMOJI_BUTTON_WIDTH = 6;

export function createInputBox(screen: Screen) {
  const screenWidth = (screen as any).width || 80;

  const inputBox = createTextarea({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: 0,
    width: screenWidth - EMOJI_BUTTON_WIDTH,  // Leave space for button
    height: INPUT_HEIGHT,
    // ... other options
  });

  const emojiButton = createButton({
    parent: screen,
    bottom: STATUS_HEIGHT + 1,
    right: 0,  // Flush with right edge
    width: EMOJI_BUTTON_WIDTH - 1,
    height: 1,
    content: ' :) ',
    // ... other options
  });

  return { inputBox, emojiButton };
}

// In responsive resize handler
screen.responsiveLayout.onResize((width, height) => {
  // Update input box width to account for emoji button
  inputBox.position.width = width - EMOJI_BUTTON_WIDTH;

  // Other full-width elements still use full width
  statusBar.position.width = width;
  menuBar.position.width = width;

  screen.render();
});
```

**Key points:**
- Export spacing constants for reuse
- Account for button space in input width
- Update widths in responsive handler
- Return objects when creating multi-element components

### Sidebar Toggle Pattern

When implementing sidebar show/hide, update BOTH position and width:

```typescript
function toggleSidebar(visible: boolean) {
  const leftOffset = visible ? SIDEBAR_WIDTH : 0;
  const screenWidth = (screen as any).width || 80;
  const availableWidth = screenWidth - leftOffset;

  // Update main panel position AND width
  chatPanel.position.left = leftOffset;
  chatPanel.position.width = availableWidth;

  // Update child elements inside panel
  if (chatLog) {
    chatLog.position.width = availableWidth - 2;  // -2 for borders
  }

  // Update other full-width elements
  if (typingBar) {
    typingBar.position.left = leftOffset;
    typingBar.position.width = availableWidth;
  }

  // Show/hide sidebar elements
  if (visible) {
    sidebarTabs.show();
    channelList.show();
  } else {
    sidebarTabs.hide();
    channelList.hide();
  }

  screen.render();
}
```

**Common mistake:** Only updating `left` without updating `width` causes panels to not fill the space.

### Ghost Text / Inline Autocomplete

Implement Claude-style inline completion with split coloring:

```typescript
// Create ghost text overlay
const ghostText = createBox({
  parent: screen,
  bottom: INPUT_HEIGHT + STATUS_HEIGHT - 1,
  left: 10,  // Dynamically positioned based on cursor
  width: 70,
  height: 1,
  tags: true,
  content: '',
  style: { fg: 'gray', bg: 'black' },
});
ghostText.hide();

let currentGhostCompletion = '';

function showCommandSuggestions(input: string) {
  const searchTerm = input.slice(1).toLowerCase();  // Remove '/'

  // Filter and find top match
  const topMatch = filteredCommands[0];

  if (topMatch && topMatch.name.toLowerCase().startsWith(searchTerm)) {
    const typedPortion = searchTerm;
    const remainingPortion = topMatch.name.slice(searchTerm.length);

    // Store full completion
    currentGhostCompletion = topMatch.name;

    // Position after typed characters
    ghostText.position.left = 1 + typedPortion.length;

    // Show typed in white, remaining in gray
    ghostText.setContent(
      `{white-fg}${typedPortion}{/white-fg}{gray-fg}${remainingPortion}{/gray-fg}`
    );
    ghostText.show();
  } else {
    ghostText.hide();
    currentGhostCompletion = '';
  }

  screen.render();
}

// Accept completion with Tab or Enter
inputBox.on('keypress', (ch, key) => {
  if ((key.name === 'tab' || key.name === 'enter') && currentGhostCompletion) {
    inputBox.setValue(`/${currentGhostCompletion} `);
    ghostText.hide();
    currentGhostCompletion = '';
    screen.render();
  }
});
```

**Key points:**
- Use blessed tags for split coloring: `{white-fg}typed{/}{gray-fg}remaining{/}`
- Position dynamically based on cursor location
- Store full completion for easy acceptance
- Hide on no match or after acceptance

### Blessed Positioning Gotchas

**Right-edge positioning:**
```typescript
// Flush with right edge
element.position.right = 0;  // NOT 1!

// With 1-column padding
element.position.right = 1;
```

**Bottom-edge positioning:**
```typescript
// Bottom of screen
element.position.bottom = 0;

// Above status bar (height 1)
element.position.bottom = 1;

// Above input box (height 3) and status bar (height 1)
element.position.bottom = 4;
```

**Width calculations:**
```typescript
// For element inside panel with borders
const elementWidth = panelWidth - 2;  // -2 for left + right borders
const elementHeight = panelHeight - 2;  // -2 for title + bottom border
```

### Function Return Type Changes

When refactoring functions to return objects instead of single values:

```typescript
// Before
export function createInputBox(screen: Screen): Textarea {
  return inputBox;
}

// After
export function createInputBox(screen: Screen): { inputBox: Textarea; emojiButton: any } {
  return { inputBox, emojiButton };
}
```

**Update ALL call sites:**
```typescript
// Before
const inputBox = createInputBox(screen);

// After
const { inputBox, emojiButton } = createInputBox(screen);
```

Missed call sites will cause `undefined` errors when trying to access properties.

### Performance Optimization

**Batch renders when updating multiple elements:**
```typescript
// BAD: Renders after each change
element1.position.width = newWidth;
screen.render();
element2.position.width = newWidth;
screen.render();
element3.position.width = newWidth;
screen.render();

// GOOD: Single render after all changes
element1.position.width = newWidth;
element2.position.width = newWidth;
element3.position.width = newWidth;
screen.render();
```

**Use position properties, not options:**
```typescript
// BAD: Options only read at construction
element.options.width = newWidth;

// GOOD: Position properties update immediately
element.position.width = newWidth;
```

## Further Reading

- [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) - Keyboard shortcuts for panels
- [NEO_BLESSED_COLOR_GUIDE.md](./NEO_BLESSED_COLOR_GUIDE.md) - Styling panels
- [GAME_MODE_AND_MOUSE.md](./GAME_MODE_AND_MOUSE.md) - Mouse interaction
