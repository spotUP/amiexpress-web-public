# Blessed Door Panel Fixes Summary

**Date:** 2026-01-21
**Session:** Comprehensive panel audit and fixes
**Status:** P0 and P1 fixes completed

---

## Overview

This document summarizes all fixes applied to blessed doors to resolve panel sizing, positioning, and layout issues identified in the comprehensive audit (see `BLESSED_DOOR_PANEL_AUDIT.md`).

**Key Changes:**
- Removed inappropriate DockablePanel usage from standard BBS doors
- Changed `dockBorders: true` to `false` for fixed panel layouts
- Added `fixed: true` to static panels and modal dialogs
- Replaced direct `blessed.screen()` calls with SDK `createScreen()` helper
- Updated custom helpers to default to `fixed: true`

---

## Priority Levels

- **P0 (Critical):** Doors with major architectural issues requiring immediate fixes
- **P1 (High):** Documentation and minor panel layout issues
- **P2 (Medium):** Game doors and SDK improvements (not addressed in this session)

---

## P0 Fixes (Critical)

### 1. bbs-dashboard - Remove DockablePanel, Use Fixed Boxes

**Issues Found:**
- Used full `DockablePanel` with draggable/resizable/minimize features
- Inappropriate for BBS dashboard (static layout expected)
- Used direct `blessed.Screen()` instead of SDK helper
- Responsive handler accessed `.options` property (not available on Box)

**Files Modified:**
- `Doors/bbs-dashboard/index.ts`

**Changes Applied:**

#### Imports Changed
```typescript
// BEFORE:
import { Screen, DockablePanel, Box, Text } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// AFTER:
import { createScreen, createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Text } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
```

#### Panel Types Changed
```typescript
// BEFORE:
private systemPanel!: DockablePanel;
private statsPanel!: DockablePanel;
private nodesPanel!: DockablePanel;

// AFTER:
private systemPanel!: any;  // Box widget
private statsPanel!: any;   // Box widget
private nodesPanel!: any;   // Box widget
```

#### Screen Creation Changed
```typescript
// BEFORE:
this.screen = new Screen({
  smartCSR: true,
  dockBorders: true,
  title: 'BBS SysOp Dashboard',
  output: (data: string) => this.ctx.output.write(data),
});

// AFTER:
this.screen = createScreen(this.ctx.bbs, {
  smartCSR: false,   // Prevent layout corruption
  dockBorders: false, // Not needed for fixed panels
  title: 'BBS SysOp Dashboard',
  responsive: true,
});
```

#### Panel Creation Changed (Example - System Panel)
```typescript
// BEFORE:
this.systemPanel = new DockablePanel({
  parent: this.screen,
  title: ' SYSTEM RESOURCES ',
  left: 0,
  top: 0,
  width: '50%',
  height: '50%',
  dockPosition: 'float',
  showMinimizeButton: true,
  resizable: true,
  draggable: true,
  minWidth: 30,
  minHeight: 10,
  border: { type: 'line', fg: 'yellow' },
});

// AFTER:
this.systemPanel = createBox({
  parent: this.screen,
  label: ' SYSTEM RESOURCES ',
  left: 0,
  top: 0,
  width: '50%',
  height: '50%',
  fixed: true,  // Static panel for BBS
  border: { type: 'line' },
  style: { border: { fg: 'yellow' } },
});
```

#### Resize Handler Fixed
```typescript
// BEFORE: Used panel.options (not available on Box)
this.systemPanel.options.width = '100%';

// AFTER: Use panel properties directly
this.systemPanel.width = '100%';
```

**Build Status:** SUCCESS

---

### 2. doors-menu - Replace blessed.screen() with createScreen()

**Issues Found:**
- Used `blessed.screen()` directly instead of SDK helper
- Missing `fixed: true` on static panels
- Had `dockBorders: true` (unnecessary)
- Missing explicit screen type annotation

**Files Modified:**
- `Doors/doors-menu/app.ts`

**Changes Applied:**

#### Imports Changed
```typescript
// BEFORE:
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// AFTER:
import { createScreen, createBox, createList, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

#### Screen Creation Changed
```typescript
// BEFORE:
let screen: ReturnType<typeof blessed.screen>;
screen = blessed.screen({
  smartCSR: true,
  dockBorders: true,
  fullUnicode: true,
  title: 'Door Games & Utilities',
  output: (data: string) => bbs.write(data),
});

// AFTER:
let screen: ReturnType<typeof createScreen>;
screen = createScreen(bbs, {
  smartCSR: false,    // Prevent layout corruption
  dockBorders: false, // Not needed for fixed panels
  title: 'Door Games & Utilities',
});
```

#### Panels Updated with fixed: true
```typescript
// Added to header, breadcrumb, filterDisplay:
const header = createBox({ fixed: true, ... });
const breadcrumb = createBox({ fixed: true, ... });
const filterDisplay = createBox({ fixed: true, ... });
```

**Build Status:** SUCCESS

---

### 3. grandmaster - Default to fixed: true in Helper

**Issues Found:**
- Custom `createDockable()` helper set draggable/resizable defaults
- Inappropriate for BBS game menus/lobbies
- Had `dockBorders: true` in screen creation

**Files Modified:**
- `Doors/grandmaster/ui/dockable.ts`
- `Doors/grandmaster/app.ts`

**Changes Applied:**

#### Helper Modified (ui/dockable.ts)
```typescript
// BEFORE:
export function createDockable(options: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    fitContent: false,
    allowAutoDock: true,
    resizable: true,
    draggable: true,
    dockPosition: 'float',
    ...options,
  });
}

// AFTER:
export function createDockable(options: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    fitContent: false,
    fixed: true,  // Static panels for BBS environment
    // Removed: allowAutoDock, resizable, draggable, dockPosition
    ...options,  // User can override fixed if needed
  });
}
```

#### Screen Creation Changed (app.ts)
```typescript
// BEFORE:
const screen = createScreen(this.session.bbs, {
  dockBorders: true,
  title: 'GRANDMASTER v1.1.0',
  // ...
});

// AFTER:
const screen = createScreen(this.session.bbs, {
  dockBorders: false, // Not needed for fixed panels
  title: 'GRANDMASTER v1.1.0',
  // ...
});
```

**Build Status:** SUCCESS

---

## P1 Fixes (High Priority)

### 4. neo-blessed-showcase - Add Documentation

**Issues Found:**
- Showcase demonstrates both fixed and dockable features
- Missing educational comments on when to use each approach
- Developers might copy dockable patterns inappropriately

**Files Modified:**
- `Doors/neo-blessed-showcase/app.ts`

**Changes Applied:**

#### Added Comprehensive Documentation Before DockablePanel Demo
```typescript
/**
 * IMPORTANT: DockablePanel Decision Matrix for BBS Doors
 *
 * Most BBS doors should use FIXED PANELS (fixed: true) because:
 * - BBS terminals are typically 80x24 character grids
 * - Users expect static, predictable layouts
 * - Dragging/resizing doesn't make sense in terminal environments
 * - Traditional BBS UX is menu-driven, not window-managed
 *
 * USE fixed: true FOR:
 * - Standard BBS doors (95% of cases)
 * - Static menu layouts
 * - Game interfaces
 * - Data displays (dashboards, stats, file browsers)
 * - Forms and input screens
 * - Any door targeting 80x24 terminals
 *
 * Example:
 *   const header = createBox({
 *     parent: screen,
 *     top: 0, height: 3, width: '100%',
 *     fixed: true,  // Static header - doesn't move
 *   });
 *
 * USE DockablePanel (draggable/resizable) ONLY FOR:
 * - Modern BBS interfaces with advanced UX (e.g., livechat with floating panels)
 * - Desktop-like experiences on large terminals (>80x24)
 * - Administrative tools where window management is useful
 * - Explicitly requested modern features
 *
 * Example:
 *   const chatWindow = new DockablePanel({
 *     parent: screen,
 *     dockPosition: 'float',
 *     draggable: true,
 *     resizable: true,
 *     minWidth: 40, minHeight: 10,
 *   });
 *
 * EXCEPTIONS:
 * - livechat door: Uses dockable features for modern chat UX
 * - ansi-editor: May use dockable toolbars for desktop-like editing
 *
 * The demo below shows dockable features for EDUCATION ONLY.
 * Most developers should use fixed: true instead.
 */
function showDockableLayoutDemo() { ... }
```

#### Enhanced Fixed Position Example
```typescript
// Fixed position overlay (stays in place when parent scrolls)
// BBS BEST PRACTICE: Use fixed: true for ALL panels in standard BBS doors
// This prevents dragging/resizing behavior inappropriate for terminal UIs
// See showDockableLayoutDemo() below for detailed guidance on fixed vs dockable
const fixedOverlay = blessed.box({
  parent: scrollContainer,
  top: 2, left: 2, width: 20, height: 4,
  label: ' FIXED ',
  border: { type: 'line' },
  fixed: true,  // BBS STANDARD: Prevents drag/resize, keeps layout predictable
  style: { fg: 'black', bg: 'yellow', border: { fg: 'red' } },
  content: ' Stays put\n even when\n parent scrolls!',
});
```

**Build Status:** SUCCESS

---

### 5. ansi-editor - Fix Modal Dialogs and dockBorders

**Issues Found:**
- Modal dialogs (file browser, confirmations, etc.) missing `fixed: true`
- Had `dockBorders: true` in screen creation
- All modal overlays could be dragged (inappropriate for standard dialogs)

**Files Modified:**
- `Doors/ansi-editor/index.ts`

**Changes Applied:**

#### Screen Creation Changed
```typescript
// BEFORE:
this.screen = createScreen((this.ctx as any).bbs, {
  dockBorders: true,
  title: 'ANSI Art Editor',
  responsive: true,
});

// AFTER:
this.screen = createScreen((this.ctx as any).bbs, {
  dockBorders: false,  // Not needed for fixed panels
  title: 'ANSI Art Editor',
  responsive: true,
});
```

#### All Modal Dialogs Fixed (5 total)

**BBS Directory Browser:**
```typescript
const dirList = new List({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**BBS File Browser:**
```typescript
const fileList = new List({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**User File Browser:**
```typescript
const fileList = new List({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**Filename Prompt Dialog:**
```typescript
const dialog = new Box({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**Confirmation Dialog:**
```typescript
const dialog = new Box({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**Message Box:**
```typescript
const msgBox = new Box({
  fixed: true,  // Static modal dialog
  // ... other options
});
```

**Build Status:** SUCCESS

---

### 6. livechat - Positioning Audit (Keep Dockable)

**Issues Found:**
- User explicitly requested livechat remain dockable: "livechat should be responsible and dockable though"
- Audit verified no positioning issues

**Files Modified:**
- None (audit only)

**Findings:**

#### Fixed UI Elements (Correctly Positioned)
```typescript
// Menu bar - CORRECT
const bar = createBox({
  parent: screen,
  top: 0,
  width: '100%',
  height: MENU_HEIGHT,
  fixed: true,  // Already correct
  style: { fg: 'white', bg: 'blue' },
});

// Status bar - CORRECT
const bar = new StatusBar({
  parent: screen,
  position: 'bottom',  // Auto-positioned
  fg: 'white',
  bg: 'blue',
});

// Input box - CORRECT
const inputBox = createTextarea({
  parent: screen,
  bottom: STATUS_HEIGHT,
  left: 0,
  width: screenWidth - EMOJI_BUTTON_WIDTH,
  height: INPUT_HEIGHT,
  // No fixed needed - input box shouldn't be draggable anyway
});
```

#### Dockable Panels (Intentionally Dockable)
```typescript
// Main chat panel - CORRECT (dockable by design)
const chatPanel = new DockablePanel({
  parent: screen,
  dockPosition: 'float',
  showMinimizeButton: true,
  resizable: true,
  draggable: true,
  minWidth: 40,
  minHeight: 10,
  persistenceKey: 'chat-main',
  topConstraint: MENU_HEIGHT,
  bottomConstraint: STATUS_HEIGHT + INPUT_HEIGHT,
});

// Modal overlays (threads, pins, search) - CORRECT
// These are dockable by design for advanced UX
const overlay = createBox({
  top: 'center',
  left: 'center',
  width: '80%',
  height: '70%',
  // No fixed: true - intentionally dockable
});
```

**Conclusion:** No changes needed. Livechat correctly maintains dockable features as requested.

---

## Summary Statistics

### Doors Fixed
- **P0 (Critical):** 3 doors fixed
  - bbs-dashboard
  - doors-menu
  - grandmaster
- **P1 (High):** 3 doors addressed
  - neo-blessed-showcase (documentation added)
  - ansi-editor (6 modal dialogs fixed)
  - livechat (audit confirmed correct)

### Changes by Type
- **DockablePanel → createBox:** 3 panels (bbs-dashboard)
- **blessed.screen() → createScreen():** 2 doors (bbs-dashboard, doors-menu)
- **dockBorders: true → false:** 4 doors (all P0 + ansi-editor)
- **Added fixed: true:** 15 panels total
  - bbs-dashboard: 3 main panels
  - doors-menu: 3 UI panels
  - ansi-editor: 6 modal dialogs
  - grandmaster: All via helper default change
- **Documentation added:** 1 comprehensive guide (neo-blessed-showcase)

### Build Status
All fixed doors built successfully:
- bbs-dashboard: SUCCESS
- doors-menu: SUCCESS
- grandmaster: SUCCESS
- neo-blessed-showcase: SUCCESS
- ansi-editor: SUCCESS

---

## Best Practices Established

### 1. Screen Creation
```typescript
// ALWAYS use SDK helper, not blessed.screen() directly
const screen = createScreen(bbs, {
  smartCSR: false,    // Prevent layout corruption
  dockBorders: false, // Not needed for fixed panels
  title: 'My Door',
  responsive: true,
});
```

### 2. Static Panels (95% of BBS doors)
```typescript
// Use createBox() with fixed: true
const panel = createBox({
  parent: screen,
  top: 0,
  width: '100%',
  height: 3,
  fixed: true,  // Prevents drag/resize
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
});
```

### 3. Modal Dialogs
```typescript
// Always fixed: true for standard modal dialogs
const dialog = new Box({
  parent: screen,
  top: 'center',
  left: 'center',
  width: 50,
  height: 10,
  fixed: true,  // Static modal
  border: { type: 'line', fg: 'yellow' },
});
```

### 4. When to Use DockablePanel
Only use dockable features when:
- Building modern/advanced UI (like livechat)
- Desktop-like experience on large terminals
- User explicitly requested draggable panels
- Administrative tools needing window management

### 5. Panel Sizing
```typescript
// Use percentages and constraints instead of hard-coded heights
const content = createBox({
  top: 3,      // Offset from header
  bottom: 3,   // Reserve space for footer
  width: '100%',
  fixed: true,
});
```

---

## Remaining Work (P2 - Not Addressed)

### Game Doors
All game doors should have `fixed: true` added to menu/lobby screens:
- arkanoid
- bubble-bobble
- donkey-kong
- fire-emblem-v2
- frogger
- galaga
- joust
- pengo
- pipe-dream
- puzzle-bobble
- scrollwars
- super-qix
- zoo-keeper

### SDK Improvements
1. Add `createStaticBox()` helper for explicit static panels
2. Consider changing `createBox()` default to `fixed: true` in v2.1
3. Add TypeScript lint rule to warn on DockablePanel usage outside exceptions

---

## Testing Checklist

For each fixed door:
- [X] Build succeeds without errors
- [X] TypeScript compilation clean
- [ ] Manual testing: Door loads correctly
- [ ] Manual testing: Panels don't overlap
- [ ] Manual testing: Keyboard navigation works
- [ ] Manual testing: Mouse clicks work
- [ ] Manual testing: BBS input works after exit (DoorInputManager cleanup)
- [ ] Manual testing: Run door 5+ times to verify input stability

---

## References

- **Audit Document:** `Documentation/4-Door-Developers/BLESSED_DOOR_PANEL_AUDIT.md`
- **SDK Helpers:** `sdk/utils/blessed-helpers.ts`
- **DoorInputManager Guide:** `Documentation/4-Door-Developers/DOOR_INPUT_MANAGER_GUIDE.md`
- **Neo-Blessed Color Guide:** `Documentation/4-Door-Developers/NEO_BLESSED_COLOR_GUIDE.md`

---

## Conclusion

All P0 (critical) and P1 (high priority) blessed door panel issues have been resolved. The doors now follow BBS best practices:
- Static layouts by default (fixed: true)
- Proper screen creation with SDK helpers
- Consistent modal dialog behavior
- Clear documentation on when to use dockable features

The remaining P2 tasks (game doors, SDK improvements) can be addressed in future sessions.
