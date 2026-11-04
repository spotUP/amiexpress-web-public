# Element Class Implementation Checklist

**Goal**: Achieve 1:1 parity with neo-blessed Element class
**Current**: 539 lines, ~32% complete
**Target**: ~1700 lines, 100% complete

---

## Phase 1: Core Rendering (CRITICAL) 🔴

### 1.1 Position Properties (Week 1, Day 1-2)
- [ ] Add getter properties (computed from position options)
  - [ ] `width` getter
  - [ ] `height` getter
  - [ ] `aleft` getter (absolute left)
  - [ ] `atop` getter (absolute top)
  - [ ] `aright` getter (absolute right)
  - [ ] `abottom` getter (absolute bottom)
  - [ ] `rleft` getter (relative left)
  - [ ] `rtop` getter (relative top)
  - [ ] `rright` getter (relative right)
  - [ ] `rbottom` getter (relative bottom)
  - [ ] `left` getter (alias to rleft)
  - [ ] `top` getter (alias to rtop)
  - [ ] `right` getter (alias to rright)
  - [ ] `bottom` getter (alias to rbottom)

- [ ] Add inner dimension getters
  - [ ] `ileft` getter (border + padding.left)
  - [ ] `itop` getter (border + padding.top)
  - [ ] `iright` getter (border + padding.right)
  - [ ] `ibottom` getter (border + padding.bottom)
  - [ ] `iwidth` getter (total horizontal border + padding)
  - [ ] `iheight` getter (total vertical border + padding)
  - [ ] `tpadding` getter (total padding all sides)

- [ ] Add setter properties
  - [ ] `width` setter (handles number, %, 'half', 'shrink', expressions)
  - [ ] `height` setter
  - [ ] `aleft` setter
  - [ ] `atop` setter
  - [ ] `aright` setter
  - [ ] `abottom` setter
  - [ ] `rleft` setter
  - [ ] `rtop` setter
  - [ ] `rright` setter
  - [ ] `rbottom` setter
  - [ ] `left` setter (alias)
  - [ ] `top` setter (alias)
  - [ ] `right` setter (alias)
  - [ ] `bottom` setter (alias)

- [ ] Add position helper methods
  - [ ] `_getPos()` - Get cached lpos with calculated coords
  - [ ] `_getWidth(get)` - Calculate width from options
  - [ ] `_getHeight(get)` - Calculate height from options
  - [ ] `_getLeft(get)` - Calculate left position
  - [ ] `_getTop(get)` - Calculate top position
  - [ ] `_getRight(get)` - Calculate right position
  - [ ] `_getBottom(get)` - Calculate bottom position

**Lines**: ~400
**Files**: `element.ts`

---

### 1.2 Styling & Attributes (Week 1, Day 3)
- [ ] Implement `sattr(style, fg?, bg?)` method
  - [ ] Handle bold/underline/blink/inverse/invisible flags
  - [ ] Convert color names to codes
  - [ ] Pack into 32-bit attribute code
  - [ ] Support function-based style properties

- [ ] Color conversion utilities
  - [ ] Port `colors.convert()` from neo-blessed
  - [ ] Support color names (red, blue, etc.)
  - [ ] Support color numbers (0-255)
  - [ ] Support hex colors (#rrggbb)

**Lines**: ~150
**Files**: `element.ts`, `colors.ts`

---

### 1.3 Content Parsing (Week 1, Day 4-5)
- [ ] Implement `parseContent(noTags?)` method
  - [ ] Control char filtering
  - [ ] Tab expansion
  - [ ] Unicode handling (surrogate pairs, combining chars)
  - [ ] Tag parsing integration
  - [ ] Line wrapping integration
  - [ ] Attribute parsing integration
  - [ ] Cache content lines (_clines)

- [ ] Implement `_parseTags(text)` method
  - [ ] Support `{red-fg}`, `{blue-bg}`, etc.
  - [ ] Support `{bold}`, `{underline}`, etc.
  - [ ] Support `{/}` to reset
  - [ ] Support `{escape}...{/escape}` for literal text
  - [ ] Support `{open}` → `{`, `{close}` → `}`
  - [ ] Track style state stack (fg, bg, flags)

- [ ] Implement `_wrapContent(content, width)` method
  - [ ] Word wrapping algorithm
  - [ ] Preserve ANSI codes across wraps
  - [ ] Handle alignment tags (`{left}`, `{center}`, `{right}`)
  - [ ] Build rtof/ftor mappings (real↔fake line indices)
  - [ ] Calculate mwidth (max line width)
  - [ ] Handle unicode width correctly

- [ ] Implement `_parseAttr(lines)` method
  - [ ] Parse ANSI codes in each line
  - [ ] Build attribute array (one per line)
  - [ ] Track attribute state across lines

- [ ] Implement `_align(line, width, align?)` method
  - [ ] Left alignment (default)
  - [ ] Center alignment
  - [ ] Right alignment
  - [ ] Support `{|}` split marker for justified text

**Lines**: ~400
**Files**: `element.ts`

---

### 1.4 Basic Rendering (Week 2, Day 1-2)
- [ ] Implement minimal `render()` method
  - [ ] Call `parseContent()`
  - [ ] Get coordinates via `_getCoords(true)`
  - [ ] Validate dimensions (skip if 0 width/height)
  - [ ] Fill background (if not transparent)
  - [ ] Render content lines with attributes
  - [ ] Handle ANSI code parsing during render
  - [ ] Handle newlines and wrapping
  - [ ] Handle unicode (combining chars, surrogates)
  - [ ] Mark lines as dirty
  - [ ] Render children recursively
  - [ ] Store lpos (last position)
  - [ ] Emit 'render' event

- [ ] Update `clearPos(get?, override?)` method
  - [ ] Get coordinates
  - [ ] Call screen.clearRegion()
  - [ ] Handle detached elements

**Lines**: ~200
**Files**: `element.ts`

**Test**: Box widget should display with content

---

## Phase 2: Full Rendering (HIGH) 🟡

### 2.1 Border Rendering (Week 2, Day 3)
- [ ] Add border drawing to `render()`
  - [ ] Line border type (Unicode box chars)
  - [ ] BG border type (background chars)
  - [ ] Respect border.left/top/right/bottom flags
  - [ ] Handle border corner intersections
  - [ ] Apply border style/colors
  - [ ] Track border stops for optimization

- [ ] Border options support
  - [ ] `border: 'line'` (default line border)
  - [ ] `border: 'bg'` (background border)
  - [ ] `border: { type, ch, fg, bg, left, top, right, bottom }`

**Lines**: ~150
**Files**: `element.ts`

**Test**: Bordered boxes should display correctly

---

### 2.2 Scrollbar Rendering (Week 2, Day 4)
- [ ] Add scrollbar drawing to `render()`
  - [ ] Calculate scrollbar position
  - [ ] Draw track (if enabled)
  - [ ] Draw scrollbar thumb
  - [ ] Handle `alwaysScroll` option
  - [ ] Handle `ignoreBorder` option
  - [ ] Apply scrollbar style/colors

- [ ] Scrollbar options support
  - [ ] `scrollbar: { ch, style, track, ignoreBorder }`
  - [ ] `track: { ch, style }`

**Lines**: ~50
**Files**: `element.ts`

**Test**: Scrollable boxes show scrollbar indicator

---

### 2.3 Shadow & Effects (Week 2, Day 5)
- [ ] Add shadow drawing to `render()`
  - [ ] Draw right shadow
  - [ ] Draw bottom shadow
  - [ ] Blend shadow with existing content

- [ ] Add padding support to `render()`
  - [ ] Apply padding to content area
  - [ ] Fill padding region with background

- [ ] Add vertical alignment support
  - [ ] `valign: 'top'` (default)
  - [ ] `valign: 'middle'`
  - [ ] `valign: 'bottom'`

**Lines**: ~100
**Files**: `element.ts`

**Test**: Shadows and centered content work

---

## Phase 3: Shrink & Auto-sizing (MEDIUM) 🟢

### 3.1 Shrink Methods (Week 3, Day 1-2)
- [ ] Implement `_getShrinkBox(xi, xl, yi, yl, get)`
  - [ ] Calculate dimensions from children
  - [ ] Find min/max child bounds
  - [ ] Handle empty children case

- [ ] Implement `_getShrinkContent(xi, xl, yi, yl)`
  - [ ] Calculate dimensions from content
  - [ ] Use mwidth from _wrapContent
  - [ ] Use line count for height

- [ ] Implement `_getShrink(xi, xl, yi, yl, get)`
  - [ ] Choose shrinkBox or shrinkContent
  - [ ] Integrate into _getCoords()
  - [ ] Handle shrink option

- [ ] Add shrink support to position calculation
  - [ ] Update `_getCoords()` to use shrink methods
  - [ ] Handle `width: 'shrink'` / `height: 'shrink'`
  - [ ] Handle `shrink: true` option

**Lines**: ~200
**Files**: `element.ts`

**Test**: Auto-sizing boxes fit content

---

## Phase 4: Interactivity (MEDIUM) 🟢

### 4.1 Mouse Support (Week 3, Day 3)
- [ ] Implement `enableMouse()` method
  - [ ] Call screen._listenMouse(this)

- [ ] Implement `enableKeys()` method
  - [ ] Call screen._listenKeys(this)

- [ ] Implement `enableInput()` method
  - [ ] Call both enableMouse() and enableKeys()

**Lines**: ~20
**Files**: `element.ts`

---

### 4.2 Dragging (Week 3, Day 4)
- [ ] Implement `enableDrag(verify?)` method
  - [ ] Add mousedown handler
  - [ ] Add screen mouse handler
  - [ ] Track drag state (_drag)
  - [ ] Update position during drag
  - [ ] Call setFront() on drag start
  - [ ] Handle verify callback

- [ ] Implement `disableDrag()` method
  - [ ] Remove event handlers
  - [ ] Clear drag state

- [ ] Add `draggable` getter/setter
  - [ ] Getter returns _draggable flag
  - [ ] Setter calls enableDrag/disableDrag

**Lines**: ~100
**Files**: `element.ts`

**Test**: Elements can be dragged with mouse

---

### 4.3 Key Bindings (Week 3, Day 5)
- [ ] Implement `key(...)` method
  - [ ] Delegate to screen.program.key()

- [ ] Implement `onceKey(...)` method
  - [ ] Delegate to screen.program.onceKey()

- [ ] Implement `unkey(...)` / `removeKey(...)` methods
  - [ ] Delegate to screen.program.unkey()

**Lines**: ~20
**Files**: `element.ts`

**Test**: Key bindings work on focused elements

---

### 4.4 Screen Events (Week 4, Day 1)
- [ ] Implement `onScreenEvent(type, handler)` method
  - [ ] Track listener in _slisteners array
  - [ ] Call screen.on(type, handler)

- [ ] Implement `onceScreenEvent(type, handler)` method
  - [ ] Track listener
  - [ ] Call screen.once()
  - [ ] Remove from _slisteners on fire

- [ ] Implement `removeScreenEvent(type, handler)` method
  - [ ] Find listener in _slisteners
  - [ ] Remove from array
  - [ ] Call screen.removeListener()

- [ ] Update `free()` method
  - [ ] Cleanup all _slisteners
  - [ ] Call screen.removeListener() for each

**Lines**: ~50
**Files**: `element.ts`

**Test**: Screen event handlers work and cleanup properly

---

## Phase 5: Node Methods (MEDIUM) 🟢

### 5.1 Hierarchy Traversal (Week 4, Day 2)
- [ ] Implement `forDescendants(iter, includeSelf?)`
  - [ ] Depth-first traversal
  - [ ] Call iter(element) for each descendant
  - [ ] Optionally include self

- [ ] Implement `forAncestors(iter, includeSelf?)`
  - [ ] Walk up parent chain
  - [ ] Call iter(element) for each ancestor
  - [ ] Optionally include self

- [ ] Implement `collectDescendants(includeSelf?)`
  - [ ] Use forDescendants() to build array
  - [ ] Return array of all descendants

- [ ] Implement `collectAncestors(includeSelf?)`
  - [ ] Use forAncestors() to build array
  - [ ] Return array of all ancestors

**Lines**: ~60
**Files**: `element.ts`

---

### 5.2 Event Propagation (Week 4, Day 3)
- [ ] Implement `emitDescendants(event, ...args)`
  - [ ] Use forDescendants()
  - [ ] Emit event to each descendant
  - [ ] Optionally call iter() after emit

- [ ] Implement `emitAncestors(event, ...args)`
  - [ ] Use forAncestors()
  - [ ] Emit event to each ancestor
  - [ ] Optionally call iter() after emit

**Lines**: ~40
**Files**: `element.ts`

---

### 5.3 Relationship Checks (Week 4, Day 4)
- [ ] Implement `hasDescendant(target)` method
  - [ ] Recursively check children
  - [ ] Return true if found

- [ ] Implement `hasAncestor(target)` method
  - [ ] Walk up parent chain
  - [ ] Return true if found

**Lines**: ~30
**Files**: `element.ts`

---

### 5.4 Data Storage (Week 4, Day 5)
- [ ] Implement `get(name, defaultValue?)` method
  - [ ] Return this.data[name] or defaultValue

- [ ] Implement `set(name, value)` method
  - [ ] Set this.data[name] = value

- [ ] Add data storage properties
  - [ ] `data: Record<string, any>`
  - [ ] `$: Record<string, any>` (alias)
  - [ ] `_: Record<string, any>` (alias)

**Lines**: ~20
**Files**: `element.ts`

---

## Phase 6: Advanced Content (MEDIUM) 🟢

### 6.1 Base Line Operations (Week 5, Day 1)
- [ ] Implement `setBaseLine(i, line)` method
  - [ ] Convert i to absolute line index (childBase + i)
  - [ ] Call setLine()

- [ ] Implement `getBaseLine(i)` method
  - [ ] Convert i to absolute line index
  - [ ] Call getLine()

- [ ] Implement `clearBaseLine(i)` method
  - [ ] Convert i to absolute line index
  - [ ] Call clearLine()

**Lines**: ~20
**Files**: `element.ts`

---

### 6.2 Visible Region Operations (Week 5, Day 2)
- [ ] Implement `deleteTop(n?)` method
  - [ ] Calculate fake line index from childBase
  - [ ] Call deleteLine()

- [ ] Implement `deleteBottom(n?)` method
  - [ ] Calculate fake line index from visible bottom
  - [ ] Call deleteLine()

- [ ] Implement `shiftLine(n?)` method
  - [ ] Remove n lines from beginning
  - [ ] Update content

- [ ] Implement `popLine(n?)` method
  - [ ] Remove n lines from end
  - [ ] Update content

**Lines**: ~60
**Files**: `element.ts`

---

### 6.3 Content Utilities (Week 5, Day 3)
- [ ] Implement `getScreenLines()` method
  - [ ] Return only visible lines (based on childBase, height)

- [ ] Implement `strWidth(text)` method
  - [ ] Strip ANSI codes
  - [ ] Calculate visual width
  - [ ] Handle unicode correctly

**Lines**: ~40
**Files**: `element.ts`

---

## Phase 7: Labels & Hover (LOW) 🔵

### 7.1 Labels (Week 5, Day 4)
- [ ] Implement `setLabel(options)` method
  - [ ] Create Box child element
  - [ ] Position on border
  - [ ] Handle side option ('left' | 'right')
  - [ ] Handle scroll events (reposition on scroll)
  - [ ] Handle resize events

- [ ] Implement `removeLabel()` method
  - [ ] Remove event listeners
  - [ ] Detach label element
  - [ ] Cleanup references

**Lines**: ~80
**Files**: `element.ts`

---

### 7.2 Hover Text (Week 5, Day 5)
- [ ] Implement `setHover(options)` method
  - [ ] Store hover options
  - [ ] Enable mouse
  - [ ] Initialize screen hover system

- [ ] Implement `removeHover()` method
  - [ ] Clear hover options
  - [ ] Detach hover text if showing
  - [ ] Trigger screen render

**Lines**: ~20
**Files**: `element.ts`

---

## Phase 8: Utilities & Polish (LOW) 🔵

### 8.1 Screenshot (Week 6, Day 1)
- [ ] Implement `screenshot(xi?, xl?, yi?, yl?)` method
  - [ ] Capture screen buffer region
  - [ ] Convert to string representation
  - [ ] Return text snapshot

**Lines**: ~50
**Files**: `element.ts`

---

### 8.2 Z-Index Control (Week 6, Day 2)
- [ ] Implement `setIndex(index)` method
  - [ ] Handle negative indices (count from end)
  - [ ] Clamp to valid range
  - [ ] Remove from current position
  - [ ] Insert at new position

**Lines**: ~20
**Files**: `element.ts`

---

### 8.3 Property Getters (Week 6, Day 3)
- [ ] Implement `visible` getter
  - [ ] Check detached state
  - [ ] Check hidden flag
  - [ ] Traverse parent chain
  - [ ] Return true only if all visible

- [ ] Implement `_detached` getter
  - [ ] Traverse up to screen
  - [ ] Return true if no screen found

- [ ] Implement `focused` getter
  - [ ] Return screen.focused === this

**Lines**: ~30
**Files**: `element.ts`

---

## Testing Checklist

### Unit Tests
- [ ] Position calculation tests
  - [ ] Width/height parsing (%, 'half', expressions)
  - [ ] Absolute coordinate calculation
  - [ ] Relative coordinate calculation
  - [ ] Inner dimensions

- [ ] Content parsing tests
  - [ ] Tag parsing (`{red-fg}`, etc.)
  - [ ] Word wrapping
  - [ ] Alignment
  - [ ] Unicode handling

- [ ] Rendering tests
  - [ ] Basic content rendering
  - [ ] Border rendering
  - [ ] Scrollbar rendering
  - [ ] Shadow rendering

- [ ] Tree tests
  - [ ] Append/prepend/insert
  - [ ] Remove/detach
  - [ ] Z-order
  - [ ] Traversal methods

- [ ] Event tests
  - [ ] Screen events
  - [ ] Mouse events
  - [ ] Key bindings
  - [ ] Event cleanup

---

### Integration Tests
- [ ] Box widget displays correctly
- [ ] Text widget wraps content
- [ ] List widget scrolls
- [ ] Button widget responds to clicks
- [ ] Textarea widget handles input
- [ ] Form widget manages focus

---

### Visual Tests
- [ ] Compare output with neo-blessed examples
- [ ] Test with real door code
- [ ] Verify borders, scrollbars, shadows
- [ ] Check color/styling accuracy

---

## Progress Tracking

**Current Status**: 33/104 methods (32% complete)

### Week 1: Core Rendering (CRITICAL)
- [ ] Position Properties (Day 1-2)
- [ ] Styling & Attributes (Day 3)
- [ ] Content Parsing (Day 4-5)

### Week 2: Full Rendering (HIGH)
- [ ] Basic Rendering (Day 1-2)
- [ ] Border Rendering (Day 3)
- [ ] Scrollbar Rendering (Day 4)
- [ ] Shadow & Effects (Day 5)

### Week 3: Shrink & Interactivity (MEDIUM)
- [ ] Shrink Methods (Day 1-2)
- [ ] Mouse Support (Day 3)
- [ ] Dragging (Day 4)
- [ ] Key Bindings (Day 5)

### Week 4: Events & Node Methods (MEDIUM)
- [ ] Screen Events (Day 1)
- [ ] Hierarchy Traversal (Day 2)
- [ ] Event Propagation (Day 3)
- [ ] Relationship Checks (Day 4)
- [ ] Data Storage (Day 5)

### Week 5: Advanced Content & Labels (MEDIUM-LOW)
- [ ] Base Line Operations (Day 1)
- [ ] Visible Region Operations (Day 2)
- [ ] Content Utilities (Day 3)
- [ ] Labels (Day 4)
- [ ] Hover Text (Day 5)

### Week 6: Polish (LOW)
- [ ] Screenshot (Day 1)
- [ ] Z-Index Control (Day 2)
- [ ] Property Getters (Day 3)
- [ ] Testing & Validation (Day 4-5)

---

## Definition of Done

- [ ] All 104 methods implemented
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Visual parity with neo-blessed examples
- [ ] Documentation complete
- [ ] Performance benchmarks acceptable
- [ ] No known bugs

---

**Estimated Total**: ~1700 lines, 6 weeks
**Current**: 539 lines, ~32% complete
**Remaining**: ~1200 lines, ~68% to go

**Last Updated**: 2025-12-12
