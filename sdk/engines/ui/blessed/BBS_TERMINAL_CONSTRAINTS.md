# BBS Terminal Constraints

## Overview

The blessed/neo-blessed system must respect classic BBS terminal dimensions for compatibility with vintage BBS software and user expectations.

## Terminal Dimensions

### Width Constraint
- **Always 80 columns** (fixed)
- This is the classic BBS standard dating back to the 1980s
- No exceptions - all content must wrap or truncate at 80 columns

### Height Constraint
- **User-configurable** via `linesPerScreen` setting
- **Default**: 23 content lines + 2 lines for prompts = 25 total rows
- **Range**: 20-25 rows (configurable by user in line test)
- **Structure**:
  - Content area: User's `linesPerScreen` setting (typically 23)
  - Prompt area: 2 lines reserved for command prompts/status

## Implementation

### Screen Initialization

```typescript
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Get user's configured screen height from context
const userLines = context.user.linesPerScreen || 23;

// Create screen with BBS constraints
const screen = new Screen({
  height: userLines + 2,  // +2 for prompts
  // width is always 80, set automatically
});
```

### Dynamic Dimension Updates

```typescript
// Update dimensions based on user settings
screen.setDimensions(context.user.linesPerScreen);

// Get current dimensions
const { width, height } = screen.getDimensions();
console.log(`Terminal: ${width}x${height}`); // "Terminal: 80x25"
```

## Content Rendering

### Line Wrapping
- Lines exceeding 80 columns are automatically truncated
- ANSI codes are accounted for in length calculations
- No line should visually exceed 80 columns

### Vertical Overflow
- Content exceeding user's `linesPerScreen` should scroll
- Use scrollable widgets (List, Log, etc.) for long content
- Reserve bottom 2 lines for prompts/navigation

## Best Practices

### 1. Always Check Dimensions
```typescript
const { width, height } = screen.getDimensions();
const contentHeight = height - 2; // Reserve 2 lines for prompts
```

### 2. Design for 80 Columns
```typescript
// Good: Fits in 80 columns
const menu = [
  '┌────────────────────────────────────────────────────────────────────────────┐',
  '│ Main Menu                                                                  │',
  '└────────────────────────────────────────────────────────────────────────────┘'
];

// Bad: Exceeds 80 columns (will be truncated)
const menu = [
  '┌──────────────────────────────────────────────────────────────────────────────────┐'
];
```

### 3. Test with Different Heights
```typescript
// Test with minimum height (20 lines + 2 prompts = 22 total)
screen.setDimensions(20);

// Test with default height (23 lines + 2 prompts = 25 total)
screen.setDimensions(23);

// Test with maximum height (25 lines + 2 prompts = 27 total - capped at 25)
screen.setDimensions(25);
```

### 4. Use Scrollable Widgets
```typescript
import { List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const list = new List({
  top: 0,
  left: 0,
  width: '100%',
  height: contentHeight,
  scrollable: true,  // Enable scrolling for long lists
  keys: true,
  vi: true
});
```

## Technical Details

### Constraint Enforcement

1. **Width**: Enforced in `Screen._renderContent()`
   - Lines truncated at 80 characters: `line.substring(0, 80)`
   - Alignment respects 80-column limit: `bbsMaxX = Math.min(maxX, 80)`

2. **Height**: Enforced in `Screen` constructor
   - Maximum height capped: `Math.min(options.height || 24, 25)`
   - Buffers allocated for exact dimensions

3. **Buffer Management**
   - Buffer format: `[y][x] = [attr, char]`
   - Dimensions: `height` rows × `80` columns (width always 80)

### User Configuration

User's `linesPerScreen` setting is stored in:
- Database: `users.linesperscreen` column (integer, default 23)
- Context: `context.user.linesPerScreen` (number, optional)
- Range: 20-23 (default 23)

## Layout and Positioning

### Use `right: 0` Instead of Percentage Widths

When positioning elements, percentage-based widths like `width: '100%-2'` can cause elements to overflow their parent container. This is because the percentage is sometimes calculated relative to the screen rather than the parent.

**Solution**: Use `right: 0` to make elements extend to the parent's right edge:

```typescript
// PROBLEMATIC - may overflow dialog boundaries
const input = new Textbox({
  parent: dialog,
  left: 0,
  width: '100%-2',  // May miscalculate parent width!
});

// CORRECT - respects parent boundaries
const input = new Textbox({
  parent: dialog,
  left: 0,
  right: 0,  // Extends exactly to parent's content edge
});
```

### Side-by-Side Layouts

For two elements side by side:

```typescript
// Left element - use width
const leftBox = new Box({
  parent: container,
  left: 0,
  width: '50%-2',  // Leave gap for right element
});

// Right element - use right: 0
const rightBox = new Box({
  parent: container,
  left: '50%-1',
  right: 0,  // Extends to container edge
});
```

### Nested Dialogs and Overlays

Dialog widgets (Prompt, Question, Message) automatically center themselves. Child elements inside dialogs should use `left: 0` and `right: 0` rather than percentage widths to stay within the dialog boundaries.

### ASCII Characters Only

For maximum terminal compatibility, avoid Unicode characters:

| Widget | Selected | Unselected |
|--------|----------|------------|
| Checkbox | `[X]` | `[ ]` |
| RadioButton | `(O)` | `( )` |

Box drawing uses standard ASCII line-drawing characters that render correctly on all terminals.

## Common Issues

### Issue: Lines Wrapping Incorrectly
**Cause**: Content exceeds 80 columns
**Solution**: Truncate or wrap text at 80 characters:
```typescript
function wrapText(text: string, width: number = 80): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    lines.push(text.substring(start, start + width));
    start += width;
  }
  return lines;
}
```

### Issue: Content Cut Off at Bottom
**Cause**: Not accounting for 2-line prompt area
**Solution**: Use `height - 2` for content area:
```typescript
const contentHeight = screen.getDimensions().height - 2;
```

### Issue: User Reports Clipped Display
**Cause**: User has non-standard `linesPerScreen` setting
**Solution**: Always use `context.user.linesPerScreen`:
```typescript
screen.setDimensions(context.user.linesPerScreen);
```

### Issue: Element Overflows Parent Container
**Cause**: Using percentage width like `width: '100%-2'` in nested elements
**Solution**: Use `right: 0` instead:
```typescript
// Before (overflows)
new Textbox({ parent: dialog, width: '100%-2' });

// After (correct)
new Textbox({ parent: dialog, left: 0, right: 0 });
```

### Issue: Side-by-Side Elements Overlap
**Cause**: Both elements use percentage widths that don't account for borders
**Solution**: Use `right: 0` on the rightmost element:
```typescript
// Left: fixed or percentage width
new Box({ left: 0, width: '50%-2' });

// Right: extends to edge
new Box({ left: '50%-1', right: 0 });
```

## References

- Original BBS standard: VT100/VT220 terminals (80x24)
- AmiExpress express.e: Lines 3029, 8497, 28540 (screen handling)
- User configuration: `web/backend/src/database/types.ts` line 47
