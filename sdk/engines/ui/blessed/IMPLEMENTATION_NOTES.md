# AmiExpress Blessed Implementation

## Overview

This is a **complete, from-scratch TypeScript implementation** of the blessed terminal UI library, optimized for the AmiExpress BBS project.

**Key Facts:**
- **107 TypeScript source files**
- **6,916+ lines of core code**
- **34 widgets implemented**
- **15+ blessed-contrib widgets ported**
- **100% owned and controlled by AmiExpress team**

## Architecture

### Not a Wrapper

This is **NOT** a wrapper around neo-blessed or blessed. It is a complete reimplementation in TypeScript from the ground up.

### Design Goals

1. **BBS-optimized** - Built specifically for BBS terminal constraints (80x24)
2. **Browser-compatible** - Works in Node.js and browser environments
3. **TypeScript-first** - Full type safety, no `@types/*` packages needed
4. **Class-based API** - Modern OOP design (vs factory functions)
5. **Modular** - Clean separation of core, widgets, and contrib

### Core Components

```
sdk/engines/ui/blessed/
├── core/                  # Core engine (6,916 lines)
│   ├── screen.ts         # Root container & rendering
│   ├── element.ts        # Base widget class (2,075 lines)
│   ├── program.ts        # Terminal control
│   ├── events.ts         # Event system
│   ├── colors.ts         # ANSI color handling
│   └── types.ts          # TypeScript types
├── widgets/              # 34 standard widgets
│   ├── box.ts
│   ├── list.ts
│   ├── button.ts
│   ├── form.ts
│   └── ... (30 more)
└── contrib/              # Advanced widgets (charts, graphs)
    ├── widgets/          # 15+ contrib widgets
    │   ├── line.ts      # Line charts
    │   ├── bar.ts       # Bar charts
    │   ├── donut.ts     # Donut charts
    │   ├── gauge.ts     # Gauges
    │   └── ... (11 more)
    └── layouts/
        ├── grid.ts      # Grid layout
        └── carousel.ts  # Carousel
```

## Features

### Standard Widgets (34)

**Layout:**
- Box, Layout, ScrollableBox, ScrollableText, Viewport

**Input:**
- Textbox, Input, Textarea, PassBox, FileBox, FileManager

**Selection:**
- List, ListTable, Checkbox, RadioButton, RadioSet, Form

**Display:**
- Text, BigText, Table, Log, ProgressBar, ANSIImage, Image, Video

**Interactive:**
- Button, Listbar, Canvas

**Dialog:**
- Message, Question, Prompt, Loading, Overlay

**Structural:**
- Line, Terminal, IFrame

### Contrib Widgets (15+)

**Charts:**
- Line, Bar, StackedBar, Sparkline

**Gauges:**
- Gauge, GaugeList, LCD

**Data:**
- Tree, Table

**Display:**
- Donut, Log, Map, Picture, Markdown

**Layouts:**
- Grid, Carousel

**Utilities:**
- Canvas (Braille/Character-based)

## BBS-Specific Optimizations

### Terminal Constraints

**Width:** Always 80 columns (classic BBS standard)
**Height:** User-configurable (20-25 rows, default 23)

See: `BBS_TERMINAL_CONSTRAINTS.md`

### ANSI Output

- Direct ANSI escape sequence generation
- Optimized for telnet/SSH streaming
- Minimal overhead for server-side rendering

### Tag Parsing

Built-in support for blessed-style tags:
```typescript
{red-fg}Red Text{/red-fg}
{blue-bg}Blue Background{/blue-bg}
{bold}Bold{/bold}
```

**Helper utilities** auto-enable tag parsing (see `sdk/utils/blessed-helpers.ts`)

## vs Neo-Blessed

| Feature | AmiExpress Blessed | Neo-Blessed |
|---------|-------------------|-------------|
| **Language** | TypeScript | JavaScript |
| **API Style** | Classes | Factory functions |
| **Ownership** | You control it | External dependency |
| **Maintenance** | In-house | Fragmented forks |
| **BBS-optimized** | Yes (80x24, ANSI) | Generic terminal |
| **Browser support** | Custom implementation | Limited |
| **Type safety** | Native | Via @types/blessed |
| **Lines of code** | 6,916 (core) | N/A (external) |

## vs Unblessed

| Feature | AmiExpress Blessed | Unblessed |
|---------|-------------------|-----------|
| **Status** | Production-ready | Alpha (1.0.0-alpha.23) |
| **API** | Classes (`new Box()`) | Factories (`box()`) |
| **Ownership** | You control it | External (vdeantoni) |
| **Browser** | Custom solution | Native xterm.js |
| **Breaking changes** | No | Yes (doors would break) |
| **Migration effort** | None needed | Major refactor required |
| **Type safety** | Native TypeScript | Native TypeScript |
| **Maintenance** | In-house | External team |

**Decision:** Keep AmiExpress implementation. Unblessed is available as optional dependency for future experimentation.

## Dependencies

**Removed** (2025-12-22):
- ❌ `neo-blessed` - Not used (have our own implementation)
- ❌ `blessed-contrib` - Not used (ported to TypeScript)
- ❌ `@types/blessed` - Not needed (native TypeScript)

**Added** (2025-12-22):
- ✅ `@unblessed/blessed` (v1.0.0-alpha.23) - Optional, for future comparison
- ✅ `@unblessed/node` - Optional
- ✅ `@unblessed/browser` - Optional
- ✅ `@unblessed/core` - Optional

**Kept:**
- `drawille` - Used by contrib canvas widgets

## Usage

### Standard Import (Recommended)

```typescript
import { Screen, Box, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const screen = new Screen({ title: 'My Door' });
const box = new Box({ parent: screen, content: 'Hello!' });
screen.render();
```

### With Helpers (Auto-enables tag parsing)

```typescript
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

const box = createBox({
  content: '{red-fg}Automatic tags{/red-fg}'
  // tags: true is automatic!
});
```

### Contrib Widgets

```typescript
import { Grid, Line, Bar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

const grid = new Grid({ rows: 12, cols: 12, screen });
const chart = new Line({
  showLegend: true,
  data: [{ title: 'Series 1', x: ['a', 'b', 'c'], y: [1, 2, 3] }]
});
```

## Testing

All widgets are tested via:
- Example doors: `sdk/doors/neo-blessed-showcase/`
- LiveChat door: `sdk/doors/livechat/`
- Manual testing in BBS environment

## Documentation

- **API Guide**: `NEO_BLESSED_GUIDE.md`
- **Complete Reference**: `BLESSED_PORT_COMPLETE.md`
- **BBS Constraints**: `BBS_TERMINAL_CONSTRAINTS.md`
- **Screen API**: `SCREEN_QUICK_REFERENCE.md`

## Future Considerations

**Unblessed Integration (Optional):**

If browser support becomes critical, unblessed packages are available:
- `@unblessed/browser` provides native xterm.js integration
- Would require API migration (classes → factories)
- Doors would need updates
- Consider only if upstream maintenance becomes an issue

**Current Recommendation:** Stick with AmiExpress implementation unless browser features justify the migration cost.

## Maintenance

**Owner:** AmiExpress Team
**Status:** Production-ready
**Version:** 2.0.0
**Last Updated:** December 2024

## License

MIT - Same as original blessed/neo-blessed
