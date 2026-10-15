# Element Class Method Catalog - Complete Reference

**Source**: neo-blessed Element + Node classes
**Date**: 2025-12-12

This document catalogs ALL public methods/properties in neo-blessed Element class, grouped by category.

---

## 1. Position Properties (30+ properties)

### Absolute Coordinates (screen-relative)
```typescript
// Getters
aleft: number     // Absolute left (screen coords)
atop: number      // Absolute top (screen coords)
aright: number    // Absolute right (distance from screen right edge)
abottom: number   // Absolute bottom (distance from screen bottom edge)

// Setters
aleft = val       // Set absolute left
atop = val        // Set absolute top
aright = val      // Set absolute right
abottom = val     // Set absolute bottom
```

### Relative Coordinates (parent-relative)
```typescript
// Getters
rleft: number     // Relative to parent left
rtop: number      // Relative to parent top
rright: number    // Relative to parent right
rbottom: number   // Relative to parent bottom

// Setters
rleft = val       // Set relative left
rtop = val        // Set relative top
rright = val      // Set relative right
rbottom = val     // Set relative bottom
```

### Dimensions
```typescript
// Getters
width: number     // Element width
height: number    // Element height

// Setters
width = val       // Set width (number, %, 'half', 'shrink')
height = val      // Set height (number, %, 'half', 'shrink')
```

### Convenience Aliases
```typescript
// Getters (alias to relative coords)
left: number      // = rleft
top: number       // = rtop
right: number     // = rright
bottom: number    // = rbottom

// Setters
left = val        // = rleft = val
top = val         // = rtop = val
right = val       // = rright = val
bottom = val      // = rbottom = val
```

### Inner Dimensions (accounting for border/padding)
```typescript
ileft: number     // Inner left offset (border + padding.left)
itop: number      // Inner top offset (border + padding.top)
iright: number    // Inner right offset (border + padding.right)
ibottom: number   // Inner bottom offset (border + padding.bottom)
iwidth: number    // Inner width (total horizontal border + padding)
iheight: number   // Inner height (total vertical border + padding)
tpadding: number  // Total padding (left + top + right + bottom)
```

### Position Helpers (internal)
```typescript
_getPos(): Position
  // Get cached lpos with calculated absolute coords
  // Returns: { aleft, atop, aright, abottom, width, height }

_getWidth(get: boolean): number
  // Calculate width from position options
  // Handles: %, 'half', expressions like '50%+2'

_getHeight(get: boolean): number
  // Calculate height from position options

_getLeft(get: boolean): number
  // Calculate left position
  // Handles: %, 'center', expressions

_getTop(get: boolean): number
  // Calculate top position

_getRight(get: boolean): number
  // Calculate right position

_getBottom(get: boolean): number
  // Calculate bottom position

_getCoords(get?: boolean, noscroll?: boolean): Position
  // Calculate full position coordinates
  // Returns: { xi, xl, yi, yl, base, noleft, noright, notop, nobot }
```

**Usage Examples**:
```typescript
box.width = 20;              // Set width to 20 columns
box.width = '50%';           // Set width to 50% of parent
box.width = 'half';          // Same as '50%'
box.width = '100%-4';        // Expression: parent width minus 4

box.left = 'center';         // Center horizontally
box.top = '10%';             // 10% from top

box.aleft = 5;               // Absolute screen position
box.rleft = 2;               // Relative to parent
```

---

## 2. Content Methods

### Basic Content
```typescript
setContent(content: string, noClear?: boolean, noTags?: boolean): void
  // Set element content
  // noClear: Don't clear position cache
  // noTags: Don't parse tags

getContent(): string
  // Get parsed content (with ANSI codes)

setText(content: string, noClear?: boolean): void
  // Set content, stripping existing ANSI codes

getText(): string
  // Get content without ANSI codes
```

### Line Operations
```typescript
insertLine(i: number, line: string | string[]): void
  // Insert line(s) at index i

deleteLine(i: number, n?: number): void
  // Delete n lines starting at index i

setLine(i: number, line: string): void
  // Set line at index i

getLine(i: number): string
  // Get line at index i

clearLine(i: number): void
  // Clear line at index i

getLines(): string[]
  // Get all lines
```

### Stack Operations
```typescript
pushLine(line: string): void
  // Add line to end

popLine(n?: number): void
  // Remove n lines from end

unshiftLine(line: string): void
  // Add line to beginning

shiftLine(n?: number): void
  // Remove n lines from beginning
```

### Visible Region Operations
```typescript
insertTop(line: string): void
  // Insert at top of visible region

insertBottom(line: string): void
  // Insert at bottom of visible region

deleteTop(n?: number): void
  // Delete from top of visible region

deleteBottom(n?: number): void
  // Delete from bottom of visible region

setBaseLine(i: number, line: string): void
  // Set line relative to childBase (visible start)

getBaseLine(i: number): string
  // Get line relative to childBase

clearBaseLine(i: number): void
  // Clear line relative to childBase
```

### Content Utilities
```typescript
getScreenLines(): string[]
  // Get only visible lines

strWidth(text: string): number
  // Calculate visual width (handles ANSI, unicode)
```

### Content Parsing (internal)
```typescript
parseContent(noTags?: boolean): boolean
  // Parse content with wrapping, tags, unicode
  // Returns: true if content changed

_parseTags(text: string): string
  // Convert {red-fg}text{/red-fg} to ANSI codes

_parseAttr(lines: string[]): number[]
  // Build attribute array for each line

_wrapContent(content: string, width: number): string[]
  // Word wrap content with alignment
  // Sets rtof, ftor, fake, real, mwidth

_align(line: string, width: number, align?: string): string
  // Align line (left/center/right)
```

**Usage Examples**:
```typescript
box.setContent('Hello {red-fg}World{/red-fg}');
box.insertLine(0, 'First line');
box.pushLine('Last line');

log.deleteTop();        // Delete oldest line
log.insertBottom('New log entry');

const width = box.strWidth('Hello 世界');  // Handles unicode
```

---

## 3. Rendering Methods

### Main Rendering
```typescript
render(): Position | void
  // Main render method
  // - Calls parseContent()
  // - Draws borders
  // - Draws content with attributes
  // - Draws scrollbar
  // - Draws shadow
  // - Renders children
  // Returns: Position coords or undefined

_render: typeof render
  // Alias to original render method

clearPos(get?: boolean, override?: boolean): void
  // Clear element's screen region
```

### Shrink Calculations (internal)
```typescript
_getShrinkBox(xi, xl, yi, yl, get): Position
  // Calculate dimensions based on children

_getShrinkContent(xi, xl, yi, yl): Position
  // Calculate dimensions based on content

_getShrink(xi, xl, yi, yl, get): Position
  // Unified shrink calculation (box or content)
```

**Rendering Flow**:
```
1. parseContent()         - Parse tags, wrap text
2. _getCoords()          - Calculate position
3. Draw background       - Fill with bg color
4. Draw content          - With ANSI attributes
5. Draw border           - If border enabled
6. Draw scrollbar        - If scrollable
7. Draw shadow           - If shadow enabled
8. Render children       - Recursively
```

---

## 4. Styling & Attributes

```typescript
sattr(style: Style, fg?: string, bg?: string): number
  // Convert style object to attribute code
  // Handles: bold, underline, blink, inverse, invisible
  // Returns: Packed integer attribute code

// Style properties used:
interface Style {
  fg?: string | number;          // Foreground color
  bg?: string | number;          // Background color
  bold?: boolean | Function;     // Bold text
  underline?: boolean | Function;// Underline
  blink?: boolean | Function;    // Blink
  inverse?: boolean | Function;  // Inverse colors
  invisible?: boolean | Function;// Invisible text
  transparent?: boolean;         // Transparent background
  border?: Style;                // Border style
  scrollbar?: Style;             // Scrollbar style
  track?: Style;                 // Scrollbar track style
  label?: Style;                 // Label style
  hover?: Style;                 // Hover effects
  focus?: Style;                 // Focus effects
}
```

**Attribute Code Format** (packed 32-bit integer):
```
Bit layout:
  0-8:   bg color (0-511)
  9-17:  fg color (0-511)
  18:    bold flag
  19:    underline flag
  20:    blink flag
  21:    inverse flag
  22:    invisible flag
```

**Usage**:
```typescript
const attr = element.sattr(element.style);
const attr = element.sattr({ fg: 'red', bold: true });
```

---

## 5. Visibility & Focus

```typescript
show(): void
  // Show element

hide(): void
  // Hide element (also blurs)

toggle(): void
  // Toggle visibility

focus(): void
  // Focus element (sets screen.focused = this)

blur(): void
  // Blur element

// Getters
visible: boolean
  // Check if element is visible (traverses parent chain)

focused: boolean
  // Check if element is focused (screen.focused === this)

_detached: boolean
  // Check if detached from screen (internal)
```

**Visibility Logic**:
```typescript
// Element is visible if:
// - Not detached from screen
// - Not hidden
// - All parents are visible
```

---

## 6. Element Tree Methods

### Basic Operations
```typescript
append(element: Element): void
  // Append child to end

prepend(element: Element): void
  // Prepend child to beginning

insert(element: Element, i: number): void
  // Insert child at index i

remove(element: Element): void
  // Remove child

detach(): void
  // Detach from parent

insertBefore(element: Element, other: Element): void
  // Insert before other child

insertAfter(element: Element, other: Element): void
  // Insert after other child
```

### Z-Order
```typescript
setFront(): void
  // Move to front (end of children array)

setBack(): void
  // Move to back (start of children array)

setIndex(index: number): void
  // Set exact z-index position
  // Negative indices count from end
```

### Traversal (from Node)
```typescript
forDescendants(iter: (el: Element) => void, includeSelf?: boolean): void
  // Iterate over all descendants depth-first

forAncestors(iter: (el: Element) => void, includeSelf?: boolean): void
  // Iterate up parent chain

collectDescendants(includeSelf?: boolean): Element[]
  // Collect all descendants into array

collectAncestors(includeSelf?: boolean): Element[]
  // Collect all ancestors into array

emitDescendants(event: string, ...args: any[]): void
  // Emit event to all descendants

emitAncestors(event: string, ...args: any[]): void
  // Emit event up parent chain

hasDescendant(target: Element): boolean
  // Check if target is a descendant

hasAncestor(target: Element): boolean
  // Check if target is an ancestor
```

**Usage Examples**:
```typescript
// Find all visible descendants
element.forDescendants(el => {
  if (el.visible) console.log(el.name);
});

// Emit event to all children
element.emitDescendants('resize');

// Check parent chain
if (element.hasAncestor(screen)) { ... }
```

---

## 7. Event Handling

### Screen Events
```typescript
onScreenEvent(type: string, handler: Function): void
  // Register screen-level event listener

onceScreenEvent(type: string, handler: Function): void
  // One-time screen event listener

removeScreenEvent(type: string, handler: Function): void
  // Remove screen event listener

free(): void
  // Cleanup all screen event listeners
```

### Input Events
```typescript
key(name: string, handler: Function): void
  // Bind key press (delegates to screen.program)

onceKey(name: string, handler: Function): void
  // One-time key binding

unkey(name: string, handler: Function): void
removeKey(name: string, handler: Function): void
  // Remove key binding
```

**Common Screen Events**:
```typescript
- 'mouse'      // Any mouse event
- 'click'      // Mouse click
- 'mouseover'  // Mouse enter
- 'mouseout'   // Mouse leave
- 'mousedown'  // Mouse button down
- 'mouseup'    // Mouse button up
- 'mousemove'  // Mouse moved
- 'mousewheel' // Mouse wheel
- 'wheeldown'  // Wheel scrolled down
- 'wheelup'    // Wheel scrolled up
- 'keypress'   // Any key press
- 'key X'      // Specific key
```

**Usage**:
```typescript
element.onScreenEvent('mouse', (data) => {
  console.log(data.x, data.y, data.action);
});

element.key('enter', () => {
  console.log('Enter pressed');
});
```

---

## 8. Mouse & Keyboard

### Enable/Disable
```typescript
enableMouse(): void
  // Register for mouse events

enableKeys(): void
  // Register for keyboard events

enableInput(): void
  // Enable both mouse and keys
```

### Dragging
```typescript
enableDrag(verify?: (data: MouseEvent) => boolean): boolean
  // Enable draggable behavior
  // verify: Optional validation callback
  // Returns: true if enabled

disableDrag(): boolean
  // Disable dragging
  // Returns: false if disabled

// Getter/Setter
draggable: boolean
  // Get/set draggable state
```

**Drag Behavior**:
- Mousedown starts drag
- Mousemove updates position
- Mouseup/other actions end drag
- Calls `setFront()` on drag start
- Updates `rleft`, `rtop` during drag

**Usage**:
```typescript
box.draggable = true;

// With validation
box.enableDrag((data) => {
  return data.shift; // Only drag if shift key held
});
```

---

## 9. Labels & Hover

### Labels
```typescript
setLabel(options: string | { text: string, side?: 'left' | 'right' }): void
  // Add label to element (typically on border)

removeLabel(): void
  // Remove label
```

**Label Behavior**:
- Creates a Box child element
- Positioned on top border
- Scrolls with element if scrollable
- Uses `style.label` for styling

### Hover Text
```typescript
setHover(options: string | { text: string }): void
  // Set hover tooltip text

removeHover(): void
  // Remove hover text
```

**Usage**:
```typescript
box.setLabel('Title');
box.setLabel({ text: 'Settings', side: 'right' });

box.setHover('Click to open');
```

---

## 10. Scrolling

### Basic Scrolling
```typescript
scroll(offset: number): void
  // Scroll by offset (positive = down, negative = up)

scrollTo(index: number): void
  // Scroll to specific line index

setScroll(index: number): void
  // Set scroll position (clamped to valid range)

getScroll(): number
  // Get current scroll position (childBase)

resetScroll(): void
  // Scroll to top (childBase = 0)
```

### Scroll Info
```typescript
getScrollHeight(): number
  // Get maximum scroll offset (total lines - visible lines)

getScrollPerc(): number
  // Get scroll position as percentage (0-100)

setScrollPerc(perc: number): void
  // Set scroll position by percentage
```

**Internal Scroll State**:
```typescript
childBase: number    // Current scroll position (line index)
childOffset: number  // Fine-grained scroll offset (not used in basic impl)
```

**Usage**:
```typescript
list.scroll(1);           // Scroll down 1 line
list.scrollTo(10);        // Jump to line 10
list.setScrollPerc(50);   // Jump to middle

if (list.getScrollPerc() > 90) {
  // Near bottom
}
```

---

## 11. Lifecycle & Cleanup

```typescript
destroy(): void
  // Destroy element and all descendants
  // - Detaches from parent
  // - Calls free() on self and descendants
  // - Emits 'destroy' event

free(): void
  // Cleanup resources
  // - Remove screen event listeners
  // - Called by destroy()

// State
destroyed: boolean
  // Flag set after destroy() called
```

**Usage**:
```typescript
element.destroy();  // Cleanup everything

// Check before operations
if (!element.destroyed) {
  element.render();
}
```

---

## 12. Data Storage (from Node)

```typescript
get(name: string, defaultValue?: any): any
  // Get data property

set(name: string, value: any): any
  // Set data property

// Storage
data: Record<string, any>
$: Record<string, any>     // Alias
_: Record<string, any>     // Alias
```

**Usage**:
```typescript
element.set('user', { id: 123, name: 'Alice' });
const user = element.get('user');
const role = element.get('role', 'guest');  // With default
```

---

## 13. Utilities

```typescript
screenshot(xi?: number, xl?: number, yi?: number, yl?: number): string
  // Capture element region as text
  // Returns: String representation of rendered content
```

**Usage**:
```typescript
const image = element.screenshot();
console.log(image);  // Visual snapshot
```

---

## 14. Options & State Properties

### Element Options (constructor)
```typescript
interface ElementOptions {
  // Position
  left?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;

  // Content
  content?: string;
  tags?: boolean;        // Parse {tag} syntax
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;        // Word wrap (default: true)

  // Styling
  style?: Style;
  fg?: string;
  bg?: string;
  bold?: boolean;
  underline?: boolean;
  blink?: boolean;
  inverse?: boolean;
  invisible?: boolean;
  transparent?: boolean;
  ch?: string;           // Default character (default: ' ')

  // Border
  border?: 'line' | 'bg' | Border;

  // Padding
  padding?: number | Padding;

  // Behavior
  hidden?: boolean;
  focusable?: boolean;
  clickable?: boolean;
  keyable?: boolean;
  scrollable?: boolean;
  draggable?: boolean;
  shrink?: boolean;      // Auto-size to content

  // Advanced
  noOverflow?: boolean;  // Clip to parent bounds
  dockBorders?: boolean; // Merge borders with siblings
  shadow?: boolean;      // Draw shadow
  scrollbar?: Scrollbar;
  track?: Track;
  label?: string | Label;
  hoverText?: string;

  // Tree
  parent?: Element;
  screen?: Screen;
  children?: Element[];

  // Effects
  hoverEffects?: Style;
  focusEffects?: Style;

  // Other
  name?: string;
  fixed?: boolean;
}
```

### State Properties
```typescript
// Position cache
position: Position;
lpos?: Position;       // Last rendered position

// Content
content: string;
_clines: ParsedContent;  // Parsed content lines
_pcontent: string;       // Processed content

// State flags
visible: boolean;
hidden: boolean;
focused: boolean;
destroyed: boolean;
detached: boolean;

// Tree
parent: Element | null;
screen: Screen | null;
children: Element[];

// Scrolling
childBase: number;
childOffset: number;

// Unique ID
uid: number;

// Options
options: ElementOptions;

// Data storage
data: Record<string, any>;
$: Record<string, any>;
_: Record<string, any>;
```

---

## 15. Type Definitions

### Position
```typescript
interface Position {
  xi: number;      // Left coordinate (inclusive)
  xl: number;      // Right coordinate (exclusive)
  yi: number;      // Top coordinate (inclusive)
  yl: number;      // Bottom coordinate (exclusive)

  // Optional
  base?: number;   // Scroll base line
  noleft?: boolean;   // Skip left border
  noright?: boolean;  // Skip right border
  notop?: boolean;    // Skip top border
  nobot?: boolean;    // Skip bottom border
  renders?: number;   // Render count

  // Calculated (via _getPos)
  aleft?: number;
  atop?: number;
  aright?: number;
  abottom?: number;
  width?: number;
  height?: number;
}
```

### Padding
```typescript
interface Padding {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
```

### Border
```typescript
interface Border {
  type?: 'line' | 'bg';
  ch?: string;
  fg?: string;
  bg?: string;
  left?: boolean;
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
}
```

### Parsed Content
```typescript
interface ParsedContent extends Array<string> {
  width: number;        // Width used for wrapping
  content: string;      // Original content
  attr: number[];       // Attribute codes per line
  ci: number[];         // Character index offsets
  rtof: number[];       // Real to fake line mapping
  ftor: number[][];     // Fake to real line mapping
  fake: string[];       // Fake (original) lines
  real: string[];       // Real (wrapped) lines
  mwidth: number;       // Maximum line width
}
```

---

## Quick Reference: Most Used Methods

### Positioning
```typescript
width, height, left, top, right, bottom  // Get/set dimensions
aleft, atop, aright, abottom             // Absolute coords
rleft, rtop, rright, rbottom             // Relative coords
```

### Content
```typescript
setContent(text)    // Set content
getContent()        // Get content
insertLine(i, line) // Insert line
deleteLine(i)       // Delete line
pushLine(line)      // Append line
```

### Tree
```typescript
append(child)       // Add child
remove(child)       // Remove child
detach()           // Remove from parent
setFront()         // Bring to front
```

### State
```typescript
show() / hide()     // Toggle visibility
focus() / blur()    // Focus control
render()           // Render to screen
destroy()          // Cleanup
```

### Scrolling
```typescript
scroll(offset)      // Scroll up/down
scrollTo(index)     // Jump to line
getScrollPerc()     // Get scroll %
```

---

## Implementation Status

✅ = Implemented
❌ = Missing
⚠️ = Partial

| Category | Status | Count |
|----------|--------|-------|
| Position Properties | ❌ | 0/30 |
| Position Helpers | ⚠️ | 1/8 |
| Content Basic | ✅ | 8/8 |
| Content Advanced | ❌ | 0/8 |
| Rendering | ⚠️ | 1/4 |
| Styling | ❌ | 0/1 |
| Visibility | ✅ | 6/6 |
| Tree Basic | ✅ | 7/7 |
| Tree Advanced | ❌ | 0/10 |
| Events | ❌ | 0/7 |
| Mouse/Keys | ❌ | 0/8 |
| Labels/Hover | ❌ | 0/4 |
| Scrolling | ✅ | 8/8 |
| Lifecycle | ✅ | 2/2 |
| Data Storage | ❌ | 0/2 |
| Utilities | ❌ | 0/1 |

**Total**: 33/104 methods = **32% complete**

---

## Priority Legend

🔴 **CRITICAL** - Required for basic widgets (Box, Text)
🟡 **HIGH** - Required for most widgets (List, Button)
🟢 **MEDIUM** - Required for advanced widgets (Textarea, Table)
🔵 **LOW** - Nice to have features

---

## Next Steps

1. ✅ Implement position properties (🔴 CRITICAL)
2. ✅ Implement `sattr()` (🔴 CRITICAL)
3. ✅ Implement content parsing (🔴 CRITICAL)
4. ✅ Implement full `render()` (🔴 CRITICAL)
5. ✅ Add position helpers (🟡 HIGH)
6. ✅ Add event handling (🟡 HIGH)
7. ✅ Add mouse/keyboard (🟢 MEDIUM)
8. ✅ Add Node methods (🟢 MEDIUM)
9. ✅ Add labels/hover (🔵 LOW)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-12
