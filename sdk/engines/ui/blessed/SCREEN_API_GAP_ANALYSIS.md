# Screen Class API Gap Analysis

**Date:** 2025-12-12
**Source:** neo-blessed v2.5.0 (node_modules/neo-blessed/lib/widgets/screen.js)
**Current:** /sdk/engines/ui/blessed/core/screen.ts (540 lines)
**Total neo-blessed Screen methods:** 75

## Summary

Our Screen implementation has **21 methods** implemented.
Neo-blessed Screen has **75 methods** total.
**Gap: 54 methods missing** (72% incomplete)

---

## Category 1: CRITICAL - Core Rendering & Buffer Management

### Already Implemented ✓
- `render()` - Main render loop (line 154)
- `clearRegion()` - Clear screen region (line 124)
- `fillRegion()` - Fill region with character (line 136)
- `draw()` - Diff and draw to terminal (line 365)
- `flush()` - Flush output buffer (line 101)

### Missing - HIGH PRIORITY
1. **`alloc(dirty?: boolean)`** - Allocate/initialize screen buffers
   - Creates `lines[][]` and `olines[][]` arrays (current/old screen state)
   - Format: `lines[y][x] = [attr, char]` where attr is packed 27-bit value
   - Called on resize and initialization
   - Neo-blessed line: 691-712

2. **`realloc()`** - Reallocate buffers (marks all dirty)
   - Simple wrapper: `return this.alloc(true)`
   - Neo-blessed line: 714-716

3. **`blankLine(ch?: string, dirty?: boolean)`** - Create blank line array
   - Returns: `Array<[attr, char]>` with `.dirty` property
   - Used by insert/delete line operations
   - Neo-blessed line: 760-767

4. **`_diff()`** - ALREADY IMPLEMENTED but incomplete
   - Current implementation at line 334 is simplified
   - Neo-blessed version (line 1053-1397) includes:
     - Attribute packing/unpacking (27-bit format)
     - ACS character set handling
     - BCE (back_color_erase) optimization
     - Double-width Unicode character handling
     - Cursor save/restore
   - **Priority:** ENHANCE existing implementation

---

## Category 2: CRITICAL - Line Manipulation (Scrolling)

All missing - required for scrollable widgets:

5. **`insertLine(n, y, top, bottom)`** - Insert lines with CSR
   - Uses terminal CSR (change scroll region) for optimization
   - Modifies both `lines` and `olines` arrays
   - Neo-blessed line: 769-789

6. **`deleteLine(n, y, top, bottom)`** - Delete lines with CSR
   - Companion to insertLine
   - Neo-blessed line: 791-811

7. **`insertLineNC(n, y, top, bottom)`** - Insert lines (ncurses method)
   - Alternative implementation without IL capability
   - Neo-blessed line: 816-833

8. **`deleteLineNC(n, y, top, bottom)`** - Delete lines (ncurses method)
   - Alternative implementation without DL capability
   - Neo-blessed line: 838-855

9. **`insertTop(top, bottom)`** - Insert line at scroll region top
   - Wrapper: `return this.insertLine(1, top, top, bottom)`
   - Neo-blessed line: 861-863

10. **`insertBottom(top, bottom)`** - Insert line at scroll region bottom
    - Wrapper: `return this.deleteLine(1, top, top, bottom)`
    - Neo-blessed line: 857-859

11. **`deleteTop(top, bottom)`** - Delete top line
    - Wrapper: `return this.deleteLine(1, top, top, bottom)`
    - Neo-blessed line: 869-872

12. **`deleteBottom(top, bottom)`** - Delete bottom line
    - Wrapper: `return this.clearRegion(0, this.width, bottom, bottom)`
    - Neo-blessed line: 865-867

13. **`cleanSides(el: Element)`** - Check if element has clean sides for CSR
    - Returns boolean - can we use CSR optimization?
    - Checks if element edges touch screen edges
    - Neo-blessed line: 883-962

---

## Category 3: CRITICAL - Focus Management

### Already Implemented ✓
- `focusPush(element)` - Push to focus stack (line 373)
- `focusPop()` - Pop from focus stack (line 378)
- `saveFocus()` - Save current focus (line 390)
- `restoreFocus()` - Restore saved focus (line 395)
- `rewindFocus()` - Clear focus stack (line 402)

### Missing - HIGH PRIORITY
14. **`focusNext()`** - Focus next element in keyable list
    - Wrapper: `return this.focusOffset(1)`
    - Neo-blessed line: 1609-1611

15. **`focusPrev()` / `focusPrevious()`** - Focus previous element
    - Wrapper: `return this.focusOffset(-1)`
    - Neo-blessed line: 1604-1607

16. **`focusOffset(offset: number)`** - Focus element at offset
    - Searches `keyable[]` array for visible, non-detached elements
    - Handles wraparound
    - Neo-blessed line: 1576-1602

17. **`_focus(el, old)`** - Internal focus handler
    - Auto-scrolls scrollable ancestors to show focused element
    - Calls `scrollTo()` on parent scrollable
    - Neo-blessed line: 1660-1690

18. **Getters/Setters for `focused` property** - PARTIALLY IMPLEMENTED
    - Getter at line 1692: returns `this.focused`
    - Setter at line 1696: calls `this.focusPush(el)`
    - Current implementation uses `_focused` field but no getter/setter

---

## Category 4: IMPORTANT - Input Handling

### Already Implemented ✓
- `key(keys, handler)` - Register key handler (line 412)
- `onceKey(keys, handler)` - One-time key handler (line 423)
- `unkey(keys, handler)` - Unregister key handler (line 431)

### Missing - MEDIUM PRIORITY
19. **`enableInput()`** - Enable all input (keys + mouse)
    - Calls `enableKeys()` and `enableMouse()`
    - Neo-blessed line: 612-615

20. **`enableKeys()`** - Enable keyboard input
    - Wrapper: `return this._listenKeys()`
    - Neo-blessed line: 608-610

21. **`enableMouse(el?)`** - Enable mouse input
    - Wrapper: `return this._listenMouse(el)`
    - Neo-blessed line: 561-563

22. **`_listenKeys(el?)`** - Internal key listener setup
    - Sets up program.on('keypress') handler
    - Populates `keyable[]` array
    - Handles Tab, S-Tab for focus navigation
    - Neo-blessed line: 565-606

23. **`_listenMouse(el?)`** - Internal mouse listener setup
    - Sets up program.on('mouse') handler
    - Populates `clickable[]` array
    - Handles click/hover/scroll events
    - Enables hover tracking with `_initHover()`
    - Neo-blessed line: 456-559

24. **`_initHover()`** - Initialize hover tracking
    - Tracks `screen.hover` element
    - Emits mouseover/mouseout events
    - Neo-blessed line: 617-673

---

## Category 5: IMPORTANT - Terminal/Lifecycle

### Already Implemented ✓
- `destroy()` - Cleanup screen (line 519)
- `setTitle(title)` - Set terminal title (line 467)
- `flush()` - Flush output (line 101)

### Missing - MEDIUM PRIORITY
25. **`enter()`** - Enter alternate screen buffer
    - Calls `program.alternateBuffer()`
    - Sets up keypad, cursor, scroll region
    - Calls `alloc()`
    - Neo-blessed line: 279-306

26. **`leave()`** - Leave alternate screen buffer
    - Calls `program.normalBuffer()`
    - Restores keypad, cursor, scroll region
    - Neo-blessed line: 308-332

27. **`postEnter()`** - Post-initialization setup
    - Creates debug log widget (if `options.debug`)
    - Sets up warning display (if `options.warnings`)
    - Neo-blessed line: 334-407

28. **`setTerminal(terminal: string)`** - Change terminal type
    - Leaves/re-enters alternate buffer
    - Reinitializes tput with new terminal
    - Neo-blessed line: 265-277

29. **Getters/Setters for `terminal` property**
    - Getter: `return this.program.terminal`
    - Setter: calls `setTerminal(terminal)`
    - Neo-blessed line: 256-263

30. **Getters/Setters for `title` property**
    - Getter: `return this.program.title`
    - Setter: `this.program.title = title`
    - Neo-blessed line: 248-254

---

## Category 6: IMPORTANT - Color/Attribute Conversion

### Already Implemented ✓
- `_colorToCode()` - Basic color name to code (line 494)

### Missing - MEDIUM PRIORITY
31. **`attrCode(code, cur, def)`** - Convert SGR string to attribute
    - Parses `\x1b[...m` sequences
    - Returns packed 27-bit attribute value
    - Format: `(flags << 18) | (fg << 9) | bg`
    - Neo-blessed line: 1404-1509

32. **`codeAttr(code)`** - Convert attribute to SGR string
    - Inverse of attrCode
    - Unpacks 27-bit value to `\x1b[...m`
    - Handles: bold, underline, blink, inverse, invisible, 256-color
    - Neo-blessed line: 1510-1574

33. **`_reduceColor(color)`** - Reduce color to terminal palette
    - Maps 256 colors down to terminal's color count
    - Wrapper: `return colors.reduce(color, this.tput.colors)`
    - Neo-blessed line: 1399-1401

---

## Category 7: USEFUL - Cursor Management

### Already Implemented ✓
- `showCursor()` - Show cursor (line 476)
- `hideCursor()` - Hide cursor (line 483)

### Missing - LOW PRIORITY
34. **`cursorShape(shape, blink)`** - Set cursor shape
    - Shapes: 'block', 'line', 'underline'
    - Supports artificial cursor rendering
    - Neo-blessed line: 1975-2015

35. **`cursorColor(color)`** - Set cursor color
    - Converts color name to code
    - Supports artificial cursor
    - Neo-blessed line: 2017-2028

36. **`cursorReset()` / `resetCursor()`** - Reset cursor to defaults
    - Resets shape, blink, color, artificial flag
    - Neo-blessed line: 2030-2055

37. **`_cursorAttr(cursor, dattr)`** - Calculate cursor attribute
    - Returns `{ ch, attr }` for artificial cursor
    - Handles different cursor shapes/colors
    - Neo-blessed line: 2057-2108

---

## Category 8: USEFUL - External Process Management

All missing - useful but not critical:

38. **`spawn(file, args, options)`** - Spawn child process
    - Leaves alternate buffer
    - Runs process with inherited stdio
    - Re-enters alternate buffer on exit
    - Neo-blessed line: 1739-1800

39. **`exec(file, args, options, callback)`** - Execute command
    - Wrapper around `spawn()` with callback
    - Returns exit code success boolean
    - Neo-blessed line: 1802-1816

40. **`readEditor(options, callback)`** - Open text editor
    - Creates temp file, spawns editor
    - Returns edited content
    - Neo-blessed line: 1818-1866

41. **`sigtstp(callback)`** - Handle SIGTSTP (Ctrl+Z)
    - Suspends process, restores on resume
    - Calls `alloc()` and `render()` on resume
    - Neo-blessed line: 1961-1969

---

## Category 9: USEFUL - Clipboard & Effects

All missing - useful but not critical:

42. **`copyToClipboard(text)`** - Copy text to clipboard
    - Wrapper: `return this.program.copyToClipboard(text)`
    - Uses OSC 52 escape sequence
    - Neo-blessed line: 1971-1973

43. **`screenshot(xi, xl, yi, yl)`** - Capture screen region as text
    - Returns string with ANSI codes
    - Can capture full screen or region
    - Neo-blessed line: 2110-2198

44. **`setEffects(el, fel, over, out, effects, temp)`** - Apply visual effects
    - Shadow, hover, focus effects
    - Modifies element style attributes
    - Neo-blessed line: 1908-1959

---

## Category 10: USEFUL - Image Display

45. **`displayImage(file, callback)`** - Display image in terminal
    - Uses w3m to render images
    - Spawns external process
    - Neo-blessed line: 1868-1906

---

## Category 11: INTERNAL - Utility/Debug

46. **`log(...args)`** - Log to program debug log
    - Wrapper: `return this.program.log.apply(this.program, arguments)`
    - Neo-blessed line: 445-447

47. **`debug(...args)`** - Debug logging
    - Logs to debugLog widget if enabled
    - Falls back to program.debug
    - Neo-blessed line: 449-454

48. **`type` property** - Type identifier
    - Static property: `Screen.prototype.type = 'screen'`
    - Neo-blessed line: 246

49. **Getters for `cols`, `rows`, `width`, `height`**
    - All delegate to `this.program` properties
    - Neo-blessed lines: 675-688

50. **`_dockBorders()`** - Optimize border rendering
    - Merges adjacent borders between elements
    - Called when `dockBorders` option is true
    - Neo-blessed line: 963-998

51. **`_getAngle(ch, attr)`** - Get border corner character
    - Returns appropriate box-drawing character
    - Handles different border styles
    - Neo-blessed line: 1000-1051

52. **`_getPos()`** - Get current cursor position
    - Internal helper for cursor tracking
    - Neo-blessed line: 2201-2298

53. **`_destroy()`** - Original Node destroy method
    - Saved before Screen.destroy override
    - Neo-blessed line: 409

54. **`removeKey()`** - Alias for `unkey()`
    - Neo-blessed line: 1735

---

## Implementation Priority

### Phase 1: Core Rendering (CRITICAL)
1. `alloc()` - Required for screen initialization
2. `realloc()` - Required for resize handling
3. `blankLine()` - Required by line operations
4. Enhance `_diff()` - Improve attribute handling
5. `enter()` / `leave()` - Proper alternate buffer handling

### Phase 2: Scrolling Support (CRITICAL for widgets)
6. `insertLine()` / `deleteLine()` - Core scrolling
7. `insertLineNC()` / `deleteLineNC()` - Fallback scrolling
8. `insertTop/Bottom()` / `deleteTop/Bottom()` - Helper methods
9. `cleanSides()` - Scrolling optimization

### Phase 3: Focus Enhancement (HIGH)
10. `focusNext()` / `focusPrev()` - Tab navigation
11. `focusOffset()` - Offset navigation
12. `_focus()` - Auto-scroll on focus
13. Focused getter/setter - Property access

### Phase 4: Input (MEDIUM)
14. `_listenKeys()` - Keyboard setup
15. `_listenMouse()` - Mouse setup
16. `_initHover()` - Hover tracking
17. `enableInput()` / `enableKeys()` / `enableMouse()` - Public API

### Phase 5: Color System (MEDIUM)
18. `attrCode()` - Parse ANSI to attributes
19. `codeAttr()` - Generate ANSI from attributes
20. `_reduceColor()` - Color palette reduction

### Phase 6: Nice-to-Have (LOW)
21. Cursor methods (shape, color, reset)
22. Process spawning (spawn, exec, readEditor)
23. Clipboard support
24. Screenshot capability
25. Image display
26. Debug/logging helpers

---

## Attribute Format Reference

Neo-blessed uses a **packed 27-bit attribute format**:

```
Bits 0-8   (9 bits): Background color (0-511, 0x1ff = default)
Bits 9-17  (9 bits): Foreground color (0-511, 0x1ff = default)
Bits 18-26 (9 bits): Flags
  Bit 18 (1):  Bold
  Bit 19 (2):  Underline
  Bit 20 (4):  Blink
  Bit 21 (8):  Inverse
  Bit 22 (16): Invisible
```

Default attribute: `this.dattr = ((0 << 18) | (0x1ff << 9)) | 0x1ff`

---

## Dependencies

Our implementation currently uses:
- `Program` class - ✓ IMPLEMENTED (core/program.ts)
- `Element` class - ✓ IMPLEMENTED (core/element.ts)
- `colors` module - ✓ IMPLEMENTED (core/colors.ts)
- `cursor` utilities - ✓ IMPLEMENTED (core/colors.ts)

Missing dependencies:
- `tput` (terminfo) - Program has basic tput support
- `unicode` module - Need for character width detection
- `helpers.hsort()` - For sorting clickable elements by z-index
- `colors.reduce()` - For palette reduction
- `colors.convert()` - For color name conversion

---

## Testing Strategy

1. **Phase 1 Test:** Create minimal screen, render static content
2. **Phase 2 Test:** Create scrollable box, test line insertion/deletion
3. **Phase 3 Test:** Create multiple focusable elements, test Tab navigation
4. **Phase 4 Test:** Test mouse clicks, hover, keyboard input
5. **Phase 5 Test:** Test colored text, backgrounds, attributes
6. **Integration Test:** Run existing neo-blessed examples (bbs-dashboard, etc.)

---

## Compatibility Notes

- Our `buffer[][]` uses `string` cells instead of `[attr, char]` tuples
  - **MUST CHANGE** to match neo-blessed format for compatibility
- Our `_diff()` is simplified - neo-blessed version much more sophisticated
- We use `_focused: Element | null` - neo-blessed uses `focused` directly with getter/setter
- Our key handlers are `Map<string, handler[]>` - neo-blessed delegates to Program

---

## Files to Create/Modify

1. **Modify:** `/sdk/engines/ui/blessed/core/screen.ts`
   - Change buffer format from `string[][]` to `[number, string][][]`
   - Add 54 missing methods
   - Add property getters/setters

2. **Create:** `/sdk/engines/ui/blessed/core/unicode.ts`
   - Character width detection
   - Double-width character handling

3. **Enhance:** `/sdk/engines/ui/blessed/core/colors.ts`
   - Add `reduce()` function
   - Add `convert()` function
   - Add `ncolors` mapping

4. **Create:** `/sdk/engines/ui/blessed/core/helpers.ts`
   - `hsort()` - Z-index sorting
   - Other utility functions

5. **Test:** `/sdk/engines/ui/blessed/core/__tests__/screen.test.ts`
   - Unit tests for all new methods
   - Integration tests with real widgets

---

## Estimated Effort

- **Phase 1 (Core):** 2-3 days
- **Phase 2 (Scrolling):** 2-3 days
- **Phase 3 (Focus):** 1-2 days
- **Phase 4 (Input):** 2-3 days
- **Phase 5 (Color):** 1-2 days
- **Phase 6 (Nice-to-Have):** 3-4 days
- **Testing/Debug:** 2-3 days

**Total: 13-20 days for 100% parity**

**Minimum viable (Phases 1-3): 5-8 days**
