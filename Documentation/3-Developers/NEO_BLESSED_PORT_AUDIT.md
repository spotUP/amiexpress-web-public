# Neo-Blessed Port Audit

## Status: In Progress

This document tracks the systematic audit of our neo-blessed port against the original neo-blessed source.

## ✅ Completed (1:1 Match)

### colors.ts ← lib/colors.js
- **Status**: EXACT 1:1 port
- **Details**:
  - Exact `!== null` and `!== undefined` checks (not loose `!= null`)
  - Exact colorNames (lowercase: lightblue, brightblack, etc.)
  - Exact hexToRGB (checks length 4 with #)
  - Exact blend(), mixColors(), match(), convert(), reduce()
  - Exact vcolors, ccolors, ncolors initialization
  - Preserved commented-out code from original
- **Verified**: 2024-12-24

### widget-shadow-demo ← test/widget-shadow.js
- **Status**: EXACT 1:1 port
- **Details**:
  - Exact initialization sequence (content 'Foo' then setContent(lorem))
  - Uses `draggable: true` option
  - Direct property assignment for arrow keys (`over.left -= 2`)
  - Exact quit handler
- **Verified**: 2024-12-24

## ⚠️ Architectural Differences Found

### Element Rendering: element.ts vs lib/widgets/element.js

**Neo-blessed approach (lib/widgets/element.js)**:
```javascript
Element.prototype.render = function() {
  // Line 1837-2346 (509 lines)
  // ALL rendering logic in ONE function:
  // - Get coordinates
  // - Handle padding/valign (transparency fill)
  // - Draw content loop with transparency support
  // - Draw scrollbar
  // - Draw border
  // - Draw shadow
  // - Render children
  // Directly manipulates screen.lines buffer
};
```

**Our approach (element.ts + screen.ts)**:
```typescript
// element.ts
Element.render(): void {
  // Line 1470-1473 (stub only)
  this.emit('render');
}

// screen.ts
Screen._renderElement(element: Element): void {
  // Calls sub-methods:
  _renderShadow(pos);    // Line 517-542
  _renderContent(element, pos);  // Line 544-649
  _renderBorder(element, pos);   // Line 713-end
}
```

**Implications**:
- ❌ **Different architecture**: Logic split across multiple methods vs single method
- ❌ **Different location**: screen.ts vs element.js
- ✅ **Same API**: Element.render() exists (even if stub)
- ❓ **Same behavior**: Need to verify visual output matches

### Questions to Answer:
1. Does our split architecture produce identical visual output?
2. Should we refactor to match neo-blessed's structure exactly?
3. Are there behavior differences due to the split?

## 🔍 In Progress

### screen.ts vs lib/widgets/screen.js
- **Status**: CRITICAL BUGS FOUND AND FIXED
- **Priority**: High
- **Bugs Fixed**:
  1. ❌ **Transparency blending** - Called `blend()` with 3 args instead of 2
     - Wrong: `blend(baseAttr, existingAttr, 0.5)`
     - Correct: `blend(baseAttr, existingAttr)` (default alpha is 0.5)
     - Lines affected: 588, 643 in screen.ts
  2. ❌ **Buffer initialization** - Used black (0x000) instead of default attr (0x3ffff)
     - Wrong: `this.buffer[y][x] = [0x000, ' ']`
     - Correct: `this.buffer[y][x] = [dattr, ' ']` where dattr = 0x3ffff
     - Line affected: 462 in screen.ts
- **Key differences**:
  - Neo-blessed: Calls `element.render()` which does ALL rendering in one function
  - Our port: `element.render()` is stub, actual rendering in `screen._renderElement()`
  - Both should produce same visual output after bug fixes

### program.ts vs lib/program.js
- **Status**: Not yet audited
- **Priority**: Medium
- **Key areas**:
  - Terminal I/O
  - ANSI sequence generation
  - Mouse protocol
  - Screen size detection

## 📋 Not Yet Audited

### Core Files
- [ ] widget.ts ← lib/widget.js
- [ ] blessed.ts ← lib/blessed.js
- [ ] helpers.ts ← lib/helpers.js
- [ ] keys.ts ← lib/keys.js
- [ ] unicode.ts ← lib/unicode.js

### Widgets
- [ ] box.ts ← lib/widgets/box.js
- [ ] list.ts ← lib/widgets/list.js
- [ ] textarea.ts ← lib/widgets/textarea.js
- [ ] button.ts ← lib/widgets/button.js
- [ ] And ~30 more widgets...

## 🎯 Audit Criteria

For each file to be considered "1:1":
1. ✅ Same public API (methods, properties, events)
2. ✅ Same behavior (visual output, user interaction)
3. ⚠️ Implementation may differ IF behavior matches
4. ✅ Preserve original algorithms (colors, layout, etc.)
5. ✅ Match original edge cases and quirks

## 📝 Notes

- **Drop-in replacement goal**: Code using neo-blessed should work with our port without changes
- **TypeScript conversion**: Type annotations added, but logic must match
- **BBS constraints**: Some additions for BBS environment (80 col limit, etc.) are acceptable
- **Architecture**: If behavior matches, implementation can differ - BUT user wants 1:1 matching

## Next Steps

1. ✅ Complete colors.ts audit
2. ✅ Complete widget-shadow-demo audit
3. ✅ Complete element.ts architectural analysis
4. ✅ Fix screen.ts critical bugs (transparency blending, buffer init)
5. 🔄 **URGENT**: Build SDK and test SHADOWDEMO to verify fixes work
6. ⏳ Audit program.ts terminal I/O
7. ⏳ Decide: Refactor to match architecture OR keep if behavior matches

## Critical Bugs Fixed (2024-12-24)

### Issue: Transparency Not Working
**Root Cause**: Called `blend(attr1, attr2, 0.5)` with 3 arguments
**Fix**: Call `blend(attr1, attr2)` with 2 arguments (function defaults to 0.5 alpha)
**Impact**: Red box should now appear MAGENTA when blending with lightblue background

### Issue: Black Background Instead of Lightblue
**Root Cause 1**: Buffer cleared with 0x000 (black) instead of 0x3ffff (default/transparent)
**Fix 1**: Use correct dattr value matching neo-blessed screen.js line 86

**Root Cause 2**: attrToAnsi() only handled colors 0-7, not extended colors 8-255
**Fix 2**: Rewrote attrToAnsi() as EXACT 1:1 port of neo-blessed screen.js codeAttr() (lines 1508-1572)
- Colors 0-7: Standard ANSI (30-37 fg, 40-47 bg)
- Colors 8-15: Bright ANSI (90-97 fg, 100-107 bg)
- Colors 16-255: 256-color mode (38;5;N fg, 48;5;N bg)
- lightblue (12): Now outputs `\x1b[104m` correctly

**Impact**: Background element colors should now render correctly
