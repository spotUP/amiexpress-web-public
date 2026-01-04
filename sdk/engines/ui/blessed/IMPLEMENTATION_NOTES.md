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
├── widgets/              # 50+ standard and extended widgets
│   ├── box.ts
│   ├── list.ts
│   ├── button.ts
│   ├── form.ts
│   ├── line-chart.ts     # Line charts (formerly contrib)
│   ├── bar.ts            # Bar charts (formerly contrib)
│   └── ... (45 more)
├── layouts/              # Grid and Carousel layouts
│   ├── grid.ts
│   └── carousel.ts
└── utils/                # Utility functions
    └── contrib-utils/    # Math/Chart helpers (formerly contrib)
```

## Features

### Standard Widgets (50+)

**Layout:**
- Box, Layout, ScrollableBox, ScrollableText, Viewport, Grid, Carousel

**Input:**
- Textbox, Input, Textarea, PassBox, FileBox, FileManager

**Selection:**
- List, ListTable, Checkbox, RadioButton, RadioSet, Form

**Display:**
- Text, BigText, Table, Log, ProgressBar, ANSIImage, Image, Video, LCD Digital Display

**Interactive:**
- Button, Listbar, Canvas, ContextMenu, DockablePanel, Panel

**Charts & Gauges:**
- LineChart, Bar, StackedBar, Sparkline, Donut, Gauge, GaugeList, Map, Picture

**Structural:**
- LineBase, Terminal, IFrame

### Standard Import (Recommended)

```typescript
import { Screen, Box, List, Grid, LineChart } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const screen = new Screen({ title: 'My Door' });
const grid = new Grid({ rows: 12, cols: 12, screen });
const chart = new LineChart({
  parent: screen,
  showLegend: true,
  data: [{ title: 'Series 1', x: ['a', 'b', 'c'], y: [1, 2, 3] }]
});
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

## Changelog

### 2024-12-30: Rendering & Coordinate Cache Fixes

**Screen Rendering (`screen.ts`):**
- Fixed dirty region handling - now marks entire screen as dirty at start of each render
- This ensures that when elements move (drag, resize), both old and new positions are updated
- Added `_markDirty()` calls in `_renderContent`, `_renderBorder`, and `_renderShadow`
- Fixes: scrolling content not updating, dragged panels leaving content behind

**Coordinate Cache:**
- When modifying `element.position.*` properties directly (not via setters), the coordinate cache must be invalidated manually
- Pattern: After setting `element.position.width = value`, call `element._coordsCacheValid = false`
- For elements with children, recursively invalidate all descendants:
  ```typescript
  function invalidateCache(element: any) {
    element._coordsCacheValid = false;
    if (element.children) {
      for (const child of element.children) {
        invalidateCache(child);
      }
    }
  }
  ```

**Affected Use Cases:**
- Showing hidden overlays/dialogs with updated dimensions
- Resizing elements during terminal resize events
- Toggling sidebar visibility (F2)
- Any runtime position/size changes via direct property assignment

**DockablePanel (`dockable-panel.ts`):**
- Already calls `invalidateChildrenCache()` during drag/resize operations
- No changes needed, but the screen-level dirty region fix was required for proper rendering

## Maintenance

**Owner:** AmiExpress Team
**Status:** Production-ready
**Version:** 2.0.0
**Last Updated:** December 2024

## License

MIT - Same as original blessed/neo-blessed
