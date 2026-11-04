# Element Class 1:1 Parity Analysis with neo-blessed

**Date**: 2025-12-12
**Current Implementation**: `~/Code/AmiExpress/amiexpress-web/sdk/engines/ui/blessed/core/element.ts` (539 lines)
**Reference**: neo-blessed Element class (2570 lines) + Node class (282 lines)

## Summary

Our Element class has **~40% coverage** of neo-blessed's functionality. We have the core foundation but are missing **60+ methods** needed for full widget compatibility.

---

## ✅ Already Implemented (What We Have)

### Position Calculation
- ✅ `_getCoords()` - Position calculation with parent/screen context
- ✅ `calcPos()` - Parse position values (%, center, negative)
- ✅ `getPadding()` - Padding calculation
- ✅ `hasBorder()` - Border detection

### Content Management
- ✅ `setContent()` / `getContent()`
- ✅ `setText()` / `getText()`
- ✅ `insertLine()` / `deleteLine()`
- ✅ `getLine()` / `setLine()` / `clearLine()`
- ✅ `getLines()`
- ✅ `pushLine()` / `unshiftLine()`
- ✅ `insertTop()` / `insertBottom()`

### Element Tree
- ✅ `append()` / `prepend()` / `insert()`
- ✅ `insertBefore()` / `insertAfter()`
- ✅ `remove()` / `detach()`
- ✅ `_propagateScreen()`

### Focus & Visibility
- ✅ `focus()` / `blur()`
- ✅ `show()` / `hide()` / `toggle()`

### Z-Order
- ✅ `setFront()` / `setBack()`

### Scrolling (Basic)
- ✅ `scroll()` / `scrollTo()` / `setScroll()` / `getScroll()`
- ✅ `getScrollHeight()` / `getScrollPerc()` / `setScrollPerc()`
- ✅ `resetScroll()`

### Lifecycle
- ✅ `destroy()` / `free()`
- ✅ `render()` (stub)

---

## ❌ Missing Methods (Critical Gaps)

### 1. **Position Properties** (HIGH PRIORITY - widgets depend on these)

#### Getters (Read Position)
- ❌ `width` / `height` (getters) - Currently only internal methods
- ❌ `aleft` / `atop` / `aright` / `abottom` - Absolute screen coordinates
- ❌ `rleft` / `rtop` / `rright` / `rbottom` - Relative to parent
- ❌ `left` / `top` / `right` / `bottom` - Aliases to relative coords
- ❌ `ileft` / `itop` / `iright` / `ibottom` - Inner padding offsets
- ❌ `iwidth` / `iheight` - Inner dimensions (minus border/padding)
- ❌ `tpadding` - Total padding

**Why Critical**: Widgets like Box, List, Button constantly read these to position children and calculate bounds.

#### Setters (Move/Resize Elements)
- ❌ `width = val` / `height = val` (setters)
- ❌ `aleft = val` / `atop = val` / `aright = val` / `abottom = val`
- ❌ `rleft = val` / `rtop = val` / `rright = val` / `rbottom = val`
- ❌ `left = val` / `top = val` / `right = val` / `bottom = val`

**Why Critical**: Widgets need to programmatically move/resize themselves. Example: `button.width = 20` or `box.left = 5`.

#### Position Helpers
- ❌ `_getWidth(get)` / `_getHeight(get)` - Calculate dimensions
- ❌ `_getLeft(get)` / `_getTop(get)` / `_getRight(get)` / `_getBottom(get)`
- ❌ `_getPos()` - Get cached lpos with calculated absolute coords

**Implementation**: ~400 lines of position getter/setter logic in neo-blessed.

---

### 2. **Content Parsing & Rendering** (HIGH PRIORITY)

- ❌ `parseContent(noTags)` - Parse content with tag support, wrapping, unicode
- ❌ `_parseTags(text)` - Convert `{red-fg}` to ANSI codes
- ❌ `_parseAttr(lines)` - Build attribute array for each line
- ❌ `_wrapContent(content, width)` - Word wrapping with alignment
- ❌ `_align(line, width, align)` - Align line (left/center/right)

**Why Critical**: Without these, text won't wrap, tags won't work, and rendering breaks.

**Current Gap**: We have basic `setContent()` but no tag parsing or wrapping.

---

### 3. **Advanced Content Methods** (MEDIUM PRIORITY)

- ❌ `setBaseLine(i, line)` / `getBaseLine(i)` / `clearBaseLine(i)` - Work with visible lines
- ❌ `deleteTop(n)` / `deleteBottom(n)` - Delete from visible region
- ❌ `shiftLine(n)` / `popLine(n)` - Array-like operations
- ❌ `getScreenLines()` - Get only visible lines
- ❌ `strWidth(text)` - Calculate visual width (handles ANSI, unicode)

**Why Needed**: Scrollable widgets like List, Log need these for efficient updates.

---

### 4. **Rendering Engine** (HIGH PRIORITY)

- ❌ `render()` - Full implementation (currently stub)
  - Border drawing (line, bg types)
  - Content rendering with attributes
  - Scrollbar rendering
  - Shadow rendering
  - Child rendering
  - Dirty region tracking
- ❌ `_render` - Alias to original render
- ❌ `clearPos(get, override)` - Clear element region on screen

**Why Critical**: This is the core rendering loop. Without it, nothing displays.

**Size**: ~500 lines in neo-blessed.

---

### 5. **Shrink/Auto-sizing** (MEDIUM PRIORITY)

- ❌ `_getShrinkBox(xi, xl, yi, yl, get)` - Calculate shrink dimensions from children
- ❌ `_getShrinkContent(xi, xl, yi, yl)` - Calculate shrink from content
- ❌ `_getShrink(xi, xl, yi, yl, get)` - Unified shrink logic

**Why Needed**: Widgets with `shrink: true` option need this to auto-size to content.

**Size**: ~150 lines.

---

### 6. **Styling & Attributes** (HIGH PRIORITY)

- ❌ `sattr(style, fg, bg)` - Build attribute code from style object
  - Handles bold, underline, blink, inverse, invisible
  - Color conversion
  - Style inheritance

**Why Critical**: Every widget uses this to convert style options to attribute codes for rendering.

**Current Gap**: We have basic style types but no attribute code generation.

---

### 7. **Event Handling** (MEDIUM PRIORITY)

- ❌ `onScreenEvent(type, handler)` - Register screen event listener
- ❌ `onceScreenEvent(type, handler)` - One-time screen event
- ❌ `removeScreenEvent(type, handler)` - Remove screen listener
- ❌ `free()` - Cleanup screen event listeners (partial implementation)

**Why Needed**: Widgets need to listen to screen-level events (keyboard, mouse).

---

### 8. **Mouse & Keyboard** (MEDIUM PRIORITY)

- ❌ `enableMouse()` - Register for mouse events
- ❌ `enableKeys()` - Register for keyboard events
- ❌ `enableInput()` - Enable both mouse and keys
- ❌ `enableDrag(verify)` - Enable draggable behavior
- ❌ `disableDrag()` - Disable dragging
- ❌ `draggable` (getter/setter) - Property for drag state
- ❌ `key(...)` / `onceKey(...)` / `unkey(...)` / `removeKey(...)` - Key binding helpers

**Why Needed**: Interactive widgets (Button, Textbox, List) need these.

**Size**: ~100 lines for drag, ~20 lines for key helpers.

---

### 9. **Labels & Hover Text** (LOW PRIORITY)

- ❌ `setLabel(options)` - Add label to element (e.g., border title)
- ❌ `removeLabel()` - Remove label
- ❌ `setHover(options)` - Set hover text
- ❌ `removeHover()` - Remove hover

**Why Needed**: Box widget borders with titles, tooltips.

**Size**: ~100 lines.

---

### 10. **Z-Index & Stacking** (LOW PRIORITY)

- ❌ `setIndex(index)` - Set exact z-index in parent's children array

**Why Needed**: Advanced stacking control.

---

### 11. **Node Base Class Methods** (MEDIUM PRIORITY)

Our Element should inherit these from Node:

- ❌ `forDescendants(iter, s)` - Iterate over all descendants
- ❌ `forAncestors(iter, s)` - Iterate up parent chain
- ❌ `collectDescendants(s)` - Collect all descendants into array
- ❌ `collectAncestors(s)` - Collect all ancestors into array
- ❌ `emitDescendants(event, ...)` - Emit event to all descendants
- ❌ `emitAncestors(event, ...)` - Emit event up parent chain
- ❌ `hasDescendant(target)` - Check if element is descendant
- ❌ `hasAncestor(target)` - Check if element is ancestor
- ❌ `get(name, defaultValue)` - Get data property
- ❌ `set(name, value)` - Set data property

**Why Needed**: Widget hierarchy traversal, event bubbling, data storage.

**Size**: ~100 lines.

---

### 12. **Utility Methods** (LOW PRIORITY)

- ❌ `screenshot(xi, xl, yi, yl)` - Capture element region as text
- ❌ `visible` (getter) - Check if element is visible (traverses parent chain)
- ❌ `_detached` (getter) - Check if detached from screen
- ❌ `focused` (getter) - Check if element is focused (currently we have boolean property)

**Why Needed**: Debugging, state checks.

---

## 📊 Priority Breakdown

### **CRITICAL (Must Have for Basic Widgets)**
1. ✅ Position Properties (getters/setters) - 30+ properties
2. ✅ `sattr()` - Style to attribute conversion
3. ✅ `render()` - Full rendering implementation
4. ✅ Content parsing (`parseContent`, `_parseTags`, `_wrapContent`)

**Estimated Lines**: ~900 lines

---

### **HIGH (Needed for Most Widgets)**
1. ✅ Position helpers (`_getWidth`, `_getLeft`, etc.)
2. ✅ `clearPos()` - Clear screen region
3. ✅ Event handling (`onScreenEvent`, etc.)

**Estimated Lines**: ~250 lines

---

### **MEDIUM (Needed for Advanced Widgets)**
1. ✅ Shrink methods (`_getShrink*`)
2. ✅ Advanced content methods (`getBaseLine`, `deleteTop`, etc.)
3. ✅ Node base class methods (iteration, traversal)
4. ✅ Mouse & keyboard helpers

**Estimated Lines**: ~400 lines

---

### **LOW (Nice to Have)**
1. ✅ Labels & hover
2. ✅ `screenshot()`
3. ✅ `setIndex()`

**Estimated Lines**: ~150 lines

---

## 🎯 Recommended Implementation Order

### Phase 1: Core Rendering (Week 1)
1. **Position Properties** - Add all getters/setters for width, height, coordinates
2. **`sattr()`** - Style to attribute code conversion
3. **Content Parsing** - `parseContent()`, `_parseTags()`, `_wrapContent()`, `_align()`
4. **Basic Render** - Implement minimal `render()` without borders/scrollbar

**Outcome**: Text widgets (Box, Text) work with positioning and styling.

---

### Phase 2: Full Rendering (Week 2)
1. **Border Rendering** - Add border drawing (line, bg types)
2. **Scrollbar Rendering** - Add scrollbar support
3. **`clearPos()`** - Screen region clearing
4. **Shadow Rendering** - Add shadow effect

**Outcome**: Bordered boxes, scrollable content works.

---

### Phase 3: Shrink & Auto-sizing (Week 3)
1. **`_getShrink*` methods** - Auto-sizing logic
2. **Position helpers** - `_getWidth()`, `_getLeft()`, etc.

**Outcome**: Widgets can auto-size to content.

---

### Phase 4: Interactivity (Week 4)
1. **Mouse/Keyboard** - `enableMouse()`, `enableKeys()`, key bindings
2. **Dragging** - `enableDrag()`, `disableDrag()`
3. **Event Handling** - `onScreenEvent()`, etc.

**Outcome**: Interactive widgets (Button, Textbox) work.

---

### Phase 5: Node Methods & Polish (Week 5)
1. **Node Base Class** - Iteration, traversal, data storage
2. **Advanced Content** - `getBaseLine()`, `deleteTop()`, etc.
3. **Labels & Hover** - `setLabel()`, `setHover()`
4. **Utilities** - `screenshot()`, visibility checks

**Outcome**: Full neo-blessed compatibility.

---

## 📈 Current vs. Target State

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| **Position** | Basic coords | 30+ properties | 28 missing |
| **Content** | Basic set/get | Full parsing | 8 methods missing |
| **Rendering** | Stub | Full engine | ~500 lines missing |
| **Styling** | Types only | Attribute gen | `sattr()` missing |
| **Events** | Basic | Screen events | 4 methods missing |
| **Mouse/Keys** | None | Full support | 10 methods missing |
| **Node Methods** | None | Full traversal | 10 methods missing |
| **Shrink** | None | Auto-sizing | 3 methods missing |
| **Labels** | None | Full support | 4 methods missing |

**Total Methods**: 19 implemented / 80+ needed = **~24% coverage**

---

## 🚧 Known Complexity Areas

### 1. **Rendering Engine** (Highest Complexity)
- Coordinate clipping and overflow handling
- ANSI code tracking across lines
- Unicode handling (surrogate pairs, combining chars)
- Dirty region optimization
- Border intersection logic
- Child rendering coordination

**Strategy**: Start minimal (no borders/scrollbar), add features incrementally.

---

### 2. **Position Calculation** (Medium Complexity)
- Percentage values (`50%`, `half`)
- Expressions (`50%+2`, `100%-10`)
- Auto-padding logic
- Shrink-to-fit calculations
- Center alignment (`left: 'center'`)

**Strategy**: Implement getters first (read-only), then setters.

---

### 3. **Content Wrapping** (Medium Complexity)
- Word wrapping with ANSI preservation
- Unicode width calculation
- Alignment tags (`{center}`, `{right}`)
- Tag parsing (`{red-fg}Hello{/red-fg}`)

**Strategy**: Use neo-blessed's regex patterns verbatim.

---

### 4. **Attribute Codes** (Low-Medium Complexity)
- Style object to packed integer
- Color name to code conversion
- Bold/underline/blink flags
- Attribute blending (transparency)

**Strategy**: Port neo-blessed's `colors.convert()` and bit-packing logic.

---

## 💡 Implementation Tips

### Reuse Existing Code
- neo-blessed's position logic is well-tested - port it directly
- Tag parsing regexes can be copied verbatim
- Border drawing logic is straightforward - adapt to our architecture

### Start Simple
- Implement render without borders first
- Add position getters before setters
- Basic tag parsing before full feature set

### Test Incrementally
- Create test widgets after each phase
- Use real-world door code to validate
- Compare output with neo-blessed examples

---

## 📝 Next Steps

1. **Review this document** - Confirm priorities match door development needs
2. **Phase 1 Implementation** - Start with position properties and basic rendering
3. **Create test suite** - Widget-specific tests for each feature
4. **Iterate** - Add features based on widget requirements

---

## 🔗 References

- **neo-blessed Element**: `/Doors/bbslinkwall/node_modules/@amiexpress/bbs-door-sdk/node_modules/neo-blessed/lib/widgets/element.js` (2570 lines)
- **neo-blessed Node**: `/Doors/bbslinkwall/node_modules/@amiexpress/bbs-door-sdk/node_modules/neo-blessed/lib/widgets/node.js` (282 lines)
- **Our Element**: `~/Code/AmiExpress/amiexpress-web/sdk/engines/ui/blessed/core/element.ts` (539 lines)

---

**Total Gap**: ~1700 lines of missing functionality across 60+ methods.

**Estimated Effort**: 5 weeks @ 350 lines/week (with testing and debugging).
