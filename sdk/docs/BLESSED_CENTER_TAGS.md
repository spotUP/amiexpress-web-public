# Neo-Blessed Tag Reference

**Last Updated**: 2025-12-25

## ✅ {center} Tags NOW SUPPORTED!

**IMPORTANT**: We've extended neo-blessed to support `{center}` tags natively!

```typescript
// ✅ THIS NOW WORKS!
createBox({
  content: '{center}My Centered Text{/center}'
})
```

The SDK automatically converts `{center}...{/center}` to properly centered text based on the element's width.

---

## All Supported Tags ✅

Neo-blessed supports these tags in content strings:

### Color Tags (Foreground)
- `{red-fg}`, `{blue-fg}`, `{green-fg}`, `{yellow-fg}`
- `{magenta-fg}`, `{cyan-fg}`, `{white-fg}`, `{black-fg}`, `{gray-fg}`

### Color Tags (Background)
- `{red-bg}`, `{blue-bg}`, `{green-bg}`, `{yellow-bg}`
- `{magenta-bg}`, `{cyan-bg}`, `{white-bg}`, `{black-bg}`

### Style Tags
- `{bold}` - Bold text
- `{underline}` - Underlined text
- `{blink}` - Blinking text
- `{inverse}` - Inverted colors

### Close Tags
- `{/}` - Close all tags
- `{/red-fg}` - Close specific foreground color
- `{/bold}` - Close specific style

### Alignment Tags (CUSTOM EXTENSION)
- `{center}` - **NOW WORKS!** Centers text within element width
- `{/center}` - Closes center tag

---

## Using {center} Tags

### Single Line
```typescript
const box = createBox({
  width: 40,
  content: '{center}Centered!{/center}'
});
```

### Multiple Lines
```typescript
const box = createBox({
  width: 40,
  content: '{center}Line 1\nLine 2\nLine 3{/center}'
});
// Each line is centered individually
```

### Mixed with Other Tags
```typescript
const box = createBox({
  content: '{center}{red-fg}{bold}ERROR{/bold}{/red-fg}{/center}'
});
// Color/style tags work inside {center}
```

---

## Alternative: align Property

You can still use the `align` property if you prefer:

```typescript
// Both approaches work:
const box1 = createBox({
  align: 'center',
  content: 'Centered text'
});

const box2 = createBox({
  content: '{center}Centered text{/center}'
});
```

---

## Migration Note

If you previously avoided `{center}` tags because they didn't work, **you can now use them**! The SDK handles the centering automatically.

### The Old Problem (FIXED)

Previously, tags like `{center}` would appear as literal text:

```typescript
// ❌ WRONG - Shows "{center}My Text{/center}" literally
createBox({
  content: '{center}My Text{/center}'
})
```

## The Solution

Use the `align` property instead:

```typescript
// ✅ CORRECT - Properly centered text
createBox({
  align: 'center',
  content: 'My Text'
})
```

## Complete Examples

### Single Line Centering

```typescript
const box = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 40,
  height: 5,
  border: { type: 'line' },
  align: 'center',           // Horizontal centering
  content: 'Centered Text'
});
```

### Multi-Line Centering

```typescript
const box = createBox({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 40,
  height: 10,
  border: { type: 'line' },
  align: 'center',           // Horizontal centering
  valign: 'middle',          // Vertical centering
  content: 'Line 1\nLine 2\nLine 3'
});
```

### Centering with Color Tags

```typescript
// Color tags work fine with align
const box = createBox({
  align: 'center',
  content: '{red-fg}ERROR{/red-fg}\n\n{gray-fg}Press any key{/gray-fg}'
});
```

## Supported Properties

### Horizontal Alignment (`align`)
- `'left'` - Left aligned (default)
- `'center'` - Centered
- `'right'` - Right aligned

### Vertical Alignment (`valign`)
- `'top'` - Top aligned (default)
- `'middle'` - Vertically centered
- `'bottom'` - Bottom aligned

## Migration Guide

If you have code using `{center}` tags:

### Before (BROKEN)
```typescript
const box = createBox({
  content: '{center}Title{/center}\n\n{center}Subtitle{/center}'
});
```

### After (CORRECT)
```typescript
const box = createBox({
  align: 'center',
  content: 'Title\n\nSubtitle'
});
```

## Why {center} Tags Don't Work

1. **Not a Standard Blessed Tag**: Blessed only recognizes color/style tags like `{red-fg}`, `{bold}`, etc.
2. **No Built-in Parser**: There's no code in blessed to interpret `{center}` as a centering command
3. **Alignment is Property-Based**: Blessed handles alignment via element properties, not content tags

## Detection Script

To find all `{center}` tags in your code:

```bash
grep -r "{center}" . --include="*.ts" --include="*.tsx"
```

## Reference

See `sdk/utils/blessed-helpers.ts` for complete documentation and examples.
