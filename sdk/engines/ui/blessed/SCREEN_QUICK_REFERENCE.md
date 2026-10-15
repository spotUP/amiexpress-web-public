# Screen Class - Quick Reference

## Current Status
- **Implemented:** 21/75 methods (28%)
- **Missing:** 54 methods (72%)
- **File:** `/sdk/engines/ui/blessed/core/screen.ts` (540 lines)
- **Source:** neo-blessed v2.5.0 Screen class (2298 lines)

## Critical Missing Methods (Must Implement First)

### Buffer Management
```typescript
alloc(dirty?: boolean): void              // Initialize screen buffers
realloc(): void                            // Reinitialize (marks dirty)
blankLine(ch?: string, dirty?: boolean): Array<[number, string]>  // Create blank line
```

### Line Manipulation (Scrolling)
```typescript
insertLine(n, y, top, bottom): void       // Insert n lines at y
deleteLine(n, y, top, bottom): void       // Delete n lines at y
insertLineNC(n, y, top, bottom): void     // ncurses-style insert
deleteLineNC(n, y, top, bottom): void     // ncurses-style delete
insertTop(top, bottom): void              // Insert at scroll top
insertBottom(top, bottom): void           // Insert at scroll bottom
deleteTop(top, bottom): void              // Delete from scroll top
deleteBottom(top, bottom): void           // Delete from scroll bottom
cleanSides(el: Element): boolean          // Can use CSR optimization?
```

### Focus Enhancement
```typescript
focusNext(): void                         // Focus next keyable element
focusPrev(): void                         // Focus previous keyable element
focusOffset(offset: number): void         // Focus at offset
_focus(el, old): void                     // Internal focus handler (auto-scroll)
```

### Lifecycle
```typescript
enter(): void                             // Enter alternate buffer
leave(): void                             // Leave alternate buffer
postEnter(): void                         // Post-initialization
setTerminal(terminal: string): void       // Change terminal type
```

### Color/Attribute System
```typescript
attrCode(code, cur, def): number          // Parse SGR to 27-bit attr
codeAttr(code: number): string            // Convert attr to SGR
_reduceColor(color: number): number       // Reduce to palette
```

## Current Buffer Format vs Required

### Current (WRONG)
```typescript
buffer: string[][]                        // buffer[y][x] = 'A'
lastBuffer: string[][]                    // lastBuffer[y][x] = 'A'
```

### Required (neo-blessed format)
```typescript
lines: Array<Array<[number, string]>>     // lines[y][x] = [0x1ff9ff, 'A']
olines: Array<Array<[number, string]>>    // olines[y][x] = [0x1ff9ff, 'A']
```

Where:
- First element: **27-bit packed attribute** (bg | fg << 9 | flags << 18)
- Second element: **character string**

## Attribute Bit Packing

```
[26-18] Flags (9 bits)
  18: Bold (1)
  19: Underline (2)
  20: Blink (4)
  21: Inverse (8)
  22: Invisible (16)

[17-9] Foreground color (9 bits, 0-511)
  0x1ff = default

[8-0] Background color (9 bits, 0-511)
  0x1ff = default
```

Default: `0x1ff9ff` = `((0 << 18) | (0x1ff << 9)) | 0x1ff`

## Property Getters/Setters Needed

```typescript
get cols(): number              // => this.program.cols
get rows(): number              // => this.program.rows
get width(): number             // => this.program.cols
get height(): number            // => this.program.rows
get terminal(): string          // => this.program.terminal
set terminal(t: string)         // => this.setTerminal(t)
get title(): string             // => this.program.title
set title(t: string)            // => this.program.title = t
get focused(): Element | null   // => this._focused
set focused(el: Element | null) // => this.focusPush(el)
```

## Implementation Phases

### Phase 1: Core (CRITICAL - 2-3 days)
1. Change buffer format to `[attr, char][][]`
2. Implement `alloc()`, `realloc()`, `blankLine()`
3. Enhance `_diff()` with attribute handling
4. Add `enter()`, `leave()`

### Phase 2: Scrolling (CRITICAL - 2-3 days)
5. Implement all 9 line manipulation methods
6. Add CSR (scroll region) support via Program

### Phase 3: Focus (HIGH - 1-2 days)
7. Add `focusNext()`, `focusPrev()`, `focusOffset()`
8. Add `_focus()` with auto-scroll
9. Add focused getter/setter

### Phase 4: Input (MEDIUM - 2-3 days)
10. Add `_listenKeys()`, `_listenMouse()`, `_initHover()`
11. Add keyable/clickable array tracking

### Phase 5: Colors (MEDIUM - 1-2 days)
12. Add `attrCode()`, `codeAttr()`
13. Add `_reduceColor()`
14. Enhance colors module

## Testing Checklist

- [x] Buffer format matches neo-blessed (`[attr, char][][]`)
- [x] Static text rendering works
- [x] Colored text renders correctly
- [x] Scrollable boxes work (fixed 2024-12-30: dirty region marking)
- [x] Element dragging works (fixed 2024-12-30: full screen dirty on render)
- [ ] Line insert/delete works
- [x] Tab navigation (focusNext/Prev)
- [x] Mouse clicks work
- [x] Hover events work
- [x] Resize handling works (fixed 2024-12-30: cache invalidation)
- [ ] All neo-blessed examples run

## Dependencies to Add

```typescript
// unicode.ts
export function charWidth(ch: string): number;

// colors.ts
export function reduce(color: number, palette: number): number;
export function convert(color: string | number): number;
export const ncolors: Record<number, number>;

// helpers.ts
export function hsort(elements: Element[]): Element[];  // Z-index sort
```

## Key Files

- **Source:** `/sdk/node_modules/neo-blessed/lib/widgets/screen.js`
- **Impl:** `/sdk/engines/ui/blessed/core/screen.ts`
- **Program:** `/sdk/engines/ui/blessed/core/program.ts`
- **Colors:** `/sdk/engines/ui/blessed/core/colors.ts`
- **Analysis:** `/sdk/engines/ui/blessed/SCREEN_API_GAP_ANALYSIS.md`
