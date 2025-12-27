# Neo-Blessed Color System Guide

## Good News: Colors Now Work By Default!

As of Dec 2024, neo-blessed has been refactored so colors work automatically:
- **All `blessed.*()` factory functions now default to `tags: true`**
- **`setLine()` and `insertLine()` now parse tags correctly**
- You no longer need to use helpers - `blessed.box()` works fine

Neo-blessed doors will only have **broken colors** if you:
1. Use raw ANSI codes like `\x1b[31m` or `\x1b[38;5;196m` (use blessed tags instead)
2. Explicitly set `tags: false` on an element (don't do this)

---

## The Three Color Mistakes (And How They're Now Prevented)

### Mistake 1: Using Raw ANSI Codes

**WRONG - Raw ANSI codes get stripped/mangled:**
```typescript
// DON'T DO THIS - 256-color codes are NOT SUPPORTED
function colorAnsi(color: number): string {
  return `\x1b[38;5;${color}m`;
}
const content = `${colorAnsi(196)}Hello\x1b[0m`;
box.setContent(content);  // Colors lost!
```

**PREVENTION:** The helpers now detect 256-color codes and log a warning:
```
[neo-blessed] 256-color ANSI codes detected in createBox. Neo-blessed only supports 16 colors. Use blessed tags like {red-fg} instead.
```

**CORRECT - Use blessed tags or style properties:**
```typescript
// Option 1: Blessed tags in content
box.setContent('{red-fg}Hello{/}');

// Option 2: Style properties
const box = createBox({
  style: { fg: 'red', bg: 'black' },
  content: 'Hello'
});

// Option 3: colorize helper
import { colorize } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
box.setContent(colorize('Hello', 'red'));
```

### Mistake 2: Setting `tags: false`

**WRONG:**
```typescript
const box = createBox({
  tags: false,  // DISABLES tag parsing!
  content: '{red-fg}Hello{/}'  // Shows literal text: {red-fg}Hello{/}
});
```

**PREVENTION:** The helpers now IGNORE `tags: false` and log a warning:
```
[neo-blessed] tags: false is not allowed in createBox. Tags are required for color support. Ignoring tags: false.
```

**CORRECT:** Don't set tags at all - it's forced to true:
```typescript
const box = createBox({
  content: '{red-fg}Hello{/}'  // Rendered as red text
});
```

### Mistake 3: Using blessed.* Directly

**WRONG:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
const box = blessed.box({ content: '{red-fg}Hi{/}' });  // tags not enabled!
```

**PREVENTION:** None - you must use the helpers. ALWAYS import from blessed-helpers:

**CORRECT:**
```typescript
import { createBox, createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
const box = createBox({ content: '{red-fg}Hi{/}' });  // tags auto-enabled
```

---

## Supported Colors (Only 16!)

Neo-blessed supports ONLY these 16 named colors:

| Foreground Tag | Background Tag | Style Name |
|---------------|----------------|------------|
| `{black-fg}` | `{black-bg}` | 'black' |
| `{red-fg}` | `{red-bg}` | 'red' |
| `{green-fg}` | `{green-bg}` | 'green' |
| `{yellow-fg}` | `{yellow-bg}` | 'yellow' |
| `{blue-fg}` | `{blue-bg}` | 'blue' |
| `{magenta-fg}` | `{magenta-bg}` | 'magenta' |
| `{cyan-fg}` | `{cyan-bg}` | 'cyan' |
| `{white-fg}` | `{white-bg}` | 'white' |
| `{gray-fg}` | - | 'gray' |

**Style tags:** `{bold}`, `{underline}`, `{blink}`, `{inverse}`

**Reset:** `{/}` closes all tags, or `{/red-fg}` for specific close

---

## Dynamic Colors (For Chat, User Lists, etc.)

If you need multiple user colors, cycle through the 8 standard colors:

```typescript
const USER_COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'] as const;
type UserColor = typeof USER_COLORS[number];

function getUserColor(userIndex: number): UserColor {
  return USER_COLORS[userIndex % USER_COLORS.length];
}

function formatUserMessage(username: string, message: string, colorIndex: number): string {
  const color = getUserColor(colorIndex);
  return `{${color}-fg}${username}{/}: ${message}`;
}
```

---

## Complete Working Example

```typescript
import { createScreen, createBox, createList, colorize } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Create screen with BBS output
const screen = createScreen({
  output: (data) => bbs.write(data)
});

// Panel with style colors
const panel = createBox({
  parent: screen,
  top: 0,
  left: 0,
  width: '50%',
  height: '100%',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' }
  },
  border: { type: 'line' },
  label: ' My Panel ',
});

// Content with tag colors
panel.setContent(
  '{yellow-fg}{bold}Welcome!{/bold}{/yellow-fg}\n\n' +
  '{gray-fg}Press any key to continue...{/gray-fg}'
);

// Using colorize helper
const errorBox = createBox({
  parent: screen,
  content: colorize('Error: Something went wrong', 'red'),
});

screen.render();
```

---

## Troubleshooting Checklist

If colors aren't working, check these IN ORDER:

1. [ ] Are you importing from `@amiexpress/bbs-door-sdk/utils/blessed-helpers`?
2. [ ] Are you using `createBox()`, `createScreen()`, etc. (NOT `blessed.box()`)?
3. [ ] Check console for `[neo-blessed]` warnings about tags or ANSI codes
4. [ ] Are you using blessed tags `{red-fg}` (NOT raw ANSI `\x1b[31m`)?
5. [ ] Are you using the 16 standard colors (NOT 256-color codes)?
6. [ ] Did you rebuild the door? `cd sdk/doors/{name} && npm run build`

---

## See Also

- `sdk/utils/blessed-helpers.ts` - Helper functions (source code)
- `sdk/doors/grandmaster/` - Working color example
- `sdk/docs/NEO_BLESSED_GUIDE.md` - Full neo-blessed documentation
- `CLAUDE.md` Rule #4 - Quick reference
