# Neo-Blessed Color System Guide

## Colors Work By Default

As of Jan 2025, neo-blessed defaults to `tags: true` on ALL elements. Colors work automatically.

```typescript
import { Box, Text, Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Tags work automatically - no configuration needed
const box = new Box({
  parent: screen,
  content: '{red-fg}Hello{/} {cyan-fg}World{/}',
});

// Style colors also work
const text = new Text({
  parent: screen,
  style: { fg: 'yellow', bg: 'blue' },
  content: '{green-fg}Colored text{/}',
});
```

**Colors will ONLY break if you:**
1. Use raw ANSI codes like `\x1b[31m` or `\x1b[38;5;196m` (use blessed tags instead)
2. Explicitly set `tags: false` on an element (don't do this)

---

## The Two Color Mistakes

### Mistake 1: Using Raw ANSI Codes

**WRONG - Raw ANSI codes, especially 256-color, get mangled:**
```typescript
// DON'T DO THIS - 256-color codes are NOT SUPPORTED
function colorAnsi(color: number): string {
  return `\x1b[38;5;${color}m`;
}
const content = `${colorAnsi(196)}Hello\x1b[0m`;
box.setContent(content);  // Colors lost!
```

**CORRECT - Use blessed tags:**
```typescript
// Use blessed tags in content
box.setContent('{red-fg}Hello{/}');

// Or use style properties
const box = new Box({
  style: { fg: 'red', bg: 'black' },
  content: 'Hello'
});
```

### Mistake 2: Setting `tags: false`

**WRONG:**
```typescript
const box = new Box({
  tags: false,  // DISABLES tag parsing!
  content: '{red-fg}Hello{/}'  // Shows literal text: {red-fg}Hello{/}
});
```

**CORRECT:** Don't override tags - it defaults to true:
```typescript
const box = new Box({
  content: '{red-fg}Hello{/}'  // Rendered as red text
});
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
import { Screen, Box, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Create screen with BBS output
const screen = new Screen({
  output: (data) => bbs.write(data)
});

// Panel with style colors - tags: true is the default
const panel = new Box({
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
  border: 'line',
  label: ' {cyan-fg}My Panel{/} ',  // Tags work in labels too
});

// Content with tag colors
panel.setContent(
  '{yellow-fg}{bold}Welcome!{/}\n\n' +
  '{gray-fg}Press any key to continue...{/}'
);

screen.render();
```

---

## Troubleshooting Checklist

If colors aren't working, check these IN ORDER:

1. [ ] Are you using blessed tags `{red-fg}` (NOT raw ANSI `\x1b[31m`)?
2. [ ] Are you using the 16 standard colors (NOT 256-color codes)?
3. [ ] Did you accidentally set `tags: false`?
4. [ ] Did you rebuild the door? `cd Doors/{name} && npm run build`
5. [ ] Did you rebuild the SDK? `cd sdk && npm run build`

---

## See Also

- `sdk/engines/ui/blessed/core/element.ts` - Element base class (tags default)
- `sdk/doors/grandmaster/` - Working color example
- `Documentation/4-Door-Developers/NEO_BLESSED_BEST_PRACTICES.md` - Full guide
- `CLAUDE.md` Rule #6 - Quick reference
