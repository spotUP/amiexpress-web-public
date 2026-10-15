# Element Class - Quick Reference Card

**One-page guide to Element implementation gaps**

---

## 📊 At a Glance

```
Current:   539 lines | 33 methods  | 32% complete
Target:  ~2200 lines | 104 methods | 100% complete
Gap:     ~1700 lines | 71 methods  | 68% remaining
```

---

## ✅ What Works Now

```typescript
// Content
setContent(), getContent(), setText(), getText()
insertLine(), deleteLine(), getLine(), setLine()
pushLine(), unshiftLine()

// Tree
append(), prepend(), insert(), remove(), detach()
setFront(), setBack()

// Visibility
show(), hide(), toggle(), focus(), blur()

// Scrolling
scroll(), scrollTo(), setScroll(), getScroll()
getScrollHeight(), getScrollPerc()

// Lifecycle
render(), destroy(), free()
```

---

## ❌ Top 10 Missing (by priority)

### 1. Position Properties (🔴 CRITICAL)
```typescript
// MISSING: All getters/setters
width, height               // Dimensions
aleft, atop, aright, abottom  // Absolute coords
rleft, rtop, rright, rbottom  // Relative coords
ileft, itop, iwidth, iheight  // Inner dimensions
```

### 2. Content Parsing (🔴 CRITICAL)
```typescript
// MISSING
parseContent()      // Main parsing
_parseTags()       // {red-fg} → ANSI
_wrapContent()     // Word wrap
_align()           // Alignment
```

### 3. Styling (🔴 CRITICAL)
```typescript
// MISSING
sattr(style, fg, bg)  // Style → attribute code
```

### 4. Full Rendering (🔴 CRITICAL)
```typescript
// MISSING: 500 lines in render()
- Border drawing (line, bg types)
- Content with attributes
- Scrollbar rendering
- Shadow effects
- Clipping & overflow
```

### 5. Shrink Methods (🟡 HIGH)
```typescript
// MISSING
_getShrinkBox()      // Auto-size to children
_getShrinkContent()  // Auto-size to content
_getShrink()         // Unified shrink
```

### 6. Mouse/Keyboard (🟡 HIGH)
```typescript
// MISSING
enableMouse(), enableKeys(), enableInput()
enableDrag(), disableDrag()
key(), onceKey(), unkey()
```

### 7. Screen Events (🟡 HIGH)
```typescript
// MISSING
onScreenEvent()
onceScreenEvent()
removeScreenEvent()
```

### 8. Node Methods (🟢 MEDIUM)
```typescript
// MISSING
forDescendants(), forAncestors()
emitDescendants(), emitAncestors()
hasDescendant(), hasAncestor()
get(), set()  // Data storage
```

### 9. Advanced Content (🟢 MEDIUM)
```typescript
// MISSING
getBaseLine(), setBaseLine()
deleteTop(), deleteBottom()
getScreenLines(), strWidth()
```

### 10. Labels & Hover (🔵 LOW)
```typescript
// MISSING
setLabel(), removeLabel()
setHover(), removeHover()
```

---

## 🎯 6-Week Roadmap

```
Week 1: Position Properties + Styling
        → Getters/setters, sattr()

Week 2: Content Parsing + Basic Rendering
        → Tags, wrapping, minimal render()

Week 3: Full Rendering
        → Borders, scrollbar, shadow

Week 4: Shrink + Mouse
        → Auto-sizing, dragging

Week 5: Events + Node Methods
        → Screen events, traversal

Week 6: Advanced Content + Polish
        → Labels, hover, utilities
```

---

## 📐 Position Property Quick Ref

```typescript
// ABSOLUTE (screen coordinates)
aleft   = 10        // 10 from screen left
atop    = 5         // 5 from screen top
aright  = 10        // 10 from screen right edge
abottom = 5         // 5 from screen bottom edge

// RELATIVE (parent coordinates)
rleft   = 2         // 2 from parent left
rtop    = 1         // 1 from parent top

// DIMENSIONS
width   = 20        // 20 columns
width   = '50%'     // 50% of parent
width   = 'half'    // Same as '50%'
width   = '100%-4'  // Expression: parent - 4
width   = 'shrink'  // Auto-size to content

// INNER (accounting for border/padding)
ileft   // border + padding.left
iwidth  // total horizontal border+padding
```

---

## 🎨 Content Parsing Examples

```typescript
// Tag Parsing
'{red-fg}Error{/red-fg}'      → '\x1b[31mError\x1b[39m'
'{bold}Important{/bold}'      → '\x1b[1mImportant\x1b[22m'
'{center}Title{/center}'      → Centered text

// Alignment
'{left}Left'                  → Left-aligned
'{center}Center{/center}'     → Centered
'{right}Right{/right}'        → Right-aligned

// Word Wrapping
"Very long text..."           → Wrapped at width boundary
                                (preserves ANSI codes)
```

---

## 🖌️ Styling Examples

```typescript
// sattr() usage
const attr = sattr({
  fg: 'red',
  bg: 'blue',
  bold: true,
  underline: true
});

// Packed attribute format (32-bit):
// [invisible][inverse][blink][underline][bold][fg 9bits][bg 9bits]
```

---

## 🔍 Method Categories

**Position** (34 methods)
- Getters: width, height, aleft, atop, etc.
- Setters: All of the above
- Helpers: _getWidth, _getLeft, etc.

**Content** (16 methods)
- Basic: setContent, getContent, setText, getText
- Lines: insertLine, deleteLine, getLine, setLine
- Stack: pushLine, popLine, unshiftLine, shiftLine
- Visible: insertTop, deleteTop, getBaseLine
- Parse: parseContent, _parseTags, _wrapContent

**Rendering** (5 methods)
- render(), clearPos()
- _getShrink*, _align()

**Styling** (1 method)
- sattr()

**Tree** (17 methods)
- Basic: append, prepend, insert, remove
- Z-order: setFront, setBack, setIndex
- Traversal: forDescendants, forAncestors
- Checks: hasDescendant, hasAncestor
- Events: emitDescendants, emitAncestors

**Events** (7 methods)
- Screen: onScreenEvent, onceScreenEvent, removeScreenEvent
- Keys: key, onceKey, unkey

**Mouse** (6 methods)
- enableMouse, enableKeys, enableInput
- enableDrag, disableDrag, draggable

**Visibility** (6 methods)
- show, hide, toggle
- focus, blur, visible (getter)

**Scrolling** (8 methods)
- scroll, scrollTo, setScroll, getScroll
- getScrollHeight, getScrollPerc, setScrollPerc, resetScroll

**Labels** (4 methods)
- setLabel, removeLabel
- setHover, removeHover

**Lifecycle** (3 methods)
- render, destroy, free

**Data** (2 methods)
- get, set

**Utilities** (1 method)
- screenshot

---

## 🚀 Critical Path to First Widget

**Minimum for Box widget to work:**

1. ✅ Position getters (width, height, left, top)
2. ✅ sattr() for styling
3. ✅ Basic parseContent() (no tags yet)
4. ✅ Minimal render() (content only, no borders)

**Lines**: ~600
**Time**: 1 week
**Result**: Plain box displays text

---

## 🧪 Test Checklist

```typescript
// Position
☐ Width/height parsing (%, 'half', expressions)
☐ Absolute coords calculated correctly
☐ Relative coords calculated correctly

// Content
☐ Tag parsing works ({red-fg}, {bold}, etc.)
☐ Word wrapping preserves ANSI
☐ Alignment works (left, center, right)

// Rendering
☐ Content displays with correct colors
☐ Borders draw correctly (line, bg)
☐ Scrollbar shows when needed
☐ Shadow renders

// Interactivity
☐ Mouse clicks work
☐ Dragging works
☐ Key bindings work
☐ Focus management works
```

---

## 📚 Reference Files

**Implementation Plans**:
- `SDK_ELEMENT_PARITY_ANALYSIS.md` - Detailed analysis
- `SDK_ELEMENT_METHOD_CATALOG.md` - Complete method reference
- `SDK_ELEMENT_IMPLEMENTATION_CHECKLIST.md` - Task breakdown
- `SDK_ELEMENT_ANALYSIS_SUMMARY.md` - Executive summary

**Source Code**:
- Our Element: `sdk/engines/ui/blessed/core/element.ts` (539 lines)
- neo-blessed Element: `node_modules/neo-blessed/lib/widgets/element.js` (2570 lines)
- neo-blessed Node: `node_modules/neo-blessed/lib/widgets/node.js` (282 lines)

---

## 💡 Pro Tips

1. **Port, don't rewrite** - neo-blessed code is battle-tested
2. **Test incrementally** - Add widget tests after each feature
3. **Start simple** - Minimal render first, add features later
4. **Use real doors** - Validate with actual door code
5. **Compare output** - Visual diff with neo-blessed examples

---

## ⚡ Quick Wins

**Week 1 Low-Hanging Fruit**:
- Position getters (read-only first)
- Basic tag parsing (just colors)
- Simple word wrap (no unicode yet)
- Minimal render (no borders/scrollbar)

**Result**: Box widget displays colored text ✨

---

**Version**: 1.0
**Last Updated**: 2025-12-12
**Next**: Start Phase 1 - Position Properties
