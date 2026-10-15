# Blessed Door Panel Layout Audit

**Date:** January 21, 2026
**Status:** 🔴 CRITICAL - Multiple Doors Have Layout Issues
**Scope:** All TypeScript doors using neo-blessed UI

---

## Executive Summary

**Problem:** Blessed doors have inconsistent initial state - panel sizes and positions are not optimal, leading to:
- Overlapping panels
- Panels positioned off-screen
- Inconsistent use of dockable features
- Hard-coded sizes that don't adapt to screen dimensions
- Missing `fixed: true` allowing accidental dragging in BBS environments

**Root Cause:** Lack of standardized panel layout guidelines and inconsistent use of SDK helpers.

---

## Doors Audited

### Blessed UI Doors (Non-Games):
1. ✅ **whip** - Demo scene project management (FIXED)
2. 🔴 **grandmaster** - Tetris game with menu system
3. 🔴 **doors-menu** - Door selection interface
4. 🔴 **neo-blessed-showcase** - Widget showcase
5. 🔴 **bbs-dashboard** - SysOp dashboard
6. 🔴 **ansi-editor** - ANSI art editor
7. 🔴 **livechat** - Multi-user chat
8. 🔴 **rip-browser** - RIP graphics browser

### Blessed Game Doors (Lower Priority):
- arkanoid, bubble-bobble, donkey-kong, fire-emblem-v2, font-test, frogger, galaga, header-dropdown-demo, joust, pengo, pipe-dream, puzzle-bobble, scrollwars, super-qix, zoo-keeper

---

## Critical Issues Found

### Issue #1: Missing `fixed: true` on Static Panels

**Severity:** HIGH
**Affected:** Most doors except WHIP

**Problem:**
SDK's `createBox()` returns `DockablePanel` by default with dragging/resizing enabled. BBS doors should have static layouts.

**Example - grandmaster/ui/menu.ts:91:**
```typescript
const menuPanel = createDockable({
  parent: this.screen,
  top: 9,
  left: leftMargin,
  width: 24,
  height: 12,
  border: { type: 'line' },
  label: ' SELECT MODE ',
  // ❌ NO fixed: true - panel can be dragged!
});
```

**Impact:**
- Users can accidentally drag panels with mouse
- Panels can be moved off-screen
- Confusing for BBS users expecting static layout
- Wasted resources on unused docking features

**Fix:**
```typescript
const menuPanel = createDockable({
  fixed: true,  // ← ADD THIS
  // ... rest of options
});
```

---

### Issue #2: Inconsistent Screen Creation

**Severity:** MEDIUM
**Affected:** doors-menu, bbs-dashboard, neo-blessed-showcase

**Problem:**
Some doors use `blessed.screen()` directly instead of SDK's `createScreen()` helper.

**Example - doors-menu/app.ts:197:**
```typescript
screen = blessed.screen({
  smartCSR: true,
  dockBorders: true,
  fullUnicode: true,
  title: 'Door Games & Utilities',
  output: (data: string) => bbs.write(data),
});
```

**SDK Helper - grandmaster/app.ts:**
```typescript
const screen = createScreen(this.session.bbs, {
  dockBorders: true,
  title: 'GRANDMASTER v1.1.0',
  smartCSR: false,
  fastCSR: false,
  focusKeys: false,
});
```

**Why This Matters:**
- `createScreen()` handles BBS compatibility (Amiga conversion, resize events, cursor style)
- Provides consistent default styling (fg: 'white', bg: 'black')
- Auto-enables mouse support
- Integrates with BBS session properly

**Fix:** Always use `createScreen(bbs, options)` from SDK

---

### Issue #3: Inappropriate Use of DockablePanel Features

**Severity:** HIGH
**Affected:** bbs-dashboard

**Problem:**
BBS Dashboard uses full DockablePanel with `draggable: true`, `resizable: true`, `showMinimizeButton: true`.

**Example - bbs-dashboard/index.ts:100:**
```typescript
this.systemPanel = new DockablePanel({
  parent: this.screen,
  title: ' SYSTEM RESOURCES ',
  left: 0,
  top: 0,
  width: '50%',
  height: '50%',
  dockPosition: 'float',      // ❌ Floating panel in BBS door
  showMinimizeButton: true,   // ❌ Minimize button inappropriate
  resizable: true,            // ❌ Resizable in terminal
  draggable: true,            // ❌ Draggable in BBS
  minWidth: 30,
  minHeight: 10,
});
```

**Why This Is Wrong:**
- BBS terminals are 80x24 character grid - no window management
- Minimize/maximize buttons don't make sense in terminal context
- Dragging/resizing creates unpredictable layouts
- Features designed for desktop apps, not BBS doors

**Fix:**
```typescript
const systemPanel = createBox({
  parent: this.screen,
  label: ' SYSTEM RESOURCES ',
  left: 0,
  top: 0,
  width: '50%',
  height: '50%',
  fixed: true,  // Static panel
  border: { type: 'line' },
  style: { border: { fg: 'yellow' } },
});
```

---

### Issue #4: Hard-Coded Panel Sizes

**Severity:** MEDIUM
**Affected:** grandmaster, whip, multiple doors

**Problem:**
Panels use hard-coded widths/heights instead of percentages or screen-relative sizing.

**Example - grandmaster/ui/menu.ts:94:**
```typescript
const menuPanel = createDockable({
  width: 24,   // ❌ Fixed 24 columns
  height: 12,  // ❌ Fixed 12 rows
  // ...
});
```

**Why This Is Wrong:**
- Doesn't adapt to different screen sizes
- Breaks on responsive/wide terminals
- Wasted space on larger screens
- Panels may overlap on smaller screens

**Fix:**
```typescript
const menuPanel = createBox({
  width: '30%',      // ✅ Percentage of screen width
  height: '50%',     // ✅ Percentage of screen height
  // OR
  width: screen.width - 10,   // ✅ Screen-relative
  height: screen.height - 6,  // ✅ Screen-relative
});
```

---

### Issue #5: Missing Bottom Constraints

**Severity:** MEDIUM
**Affected:** Most doors

**Problem:**
Panels use `height: X` without considering footer space, causing overlap.

**Example - neo-blessed-showcase/app.ts:**
```typescript
const menuBox = blessed.box({
  top: 1,
  left: 0,
  width: 26,
  bottom: 1,  // ✅ GOOD - reserves space for footer
});

const demoBox = blessed.box({
  top: 1,
  left: 26,
  right: 0,
  bottom: 1,  // ✅ GOOD - reserves space for footer
});
```

**Bad Example:**
```typescript
const panel = createBox({
  top: 2,
  left: 0,
  width: '100%',
  height: screen.height - 2,  // ❌ BAD - no footer space
});
```

**Fix:**
```typescript
const panel = createBox({
  top: 2,
  left: 0,
  width: '100%',
  bottom: 1,  // ✅ Reserves 1 row for footer
  // OR
  height: screen.height - 3,  // ✅ Top (1) + footer (1) + margin (1)
});
```

---

### Issue #6: Overlapping Header/Footer

**Severity:** LOW-MEDIUM
**Affected:** Various doors

**Problem:**
Header/footer panels not given enough height or positioned incorrectly.

**Good Example - whip/ui/main-menu.ts:**
```typescript
const header = createBox({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: 3,      // ✅ Enough for title + subtitle
  fixed: true,
});

const footer = createBox({
  parent: screen,
  bottom: 0,      // ✅ Anchored to bottom
  left: 0,
  width: '100%',
  height: 1,
  fixed: true,
});
```

**Bad Example:**
```typescript
const header = createBox({
  top: 0,
  height: 1,  // ❌ Too small for multi-line content
});

const footer = createBox({
  top: screen.height - 1,  // ❌ Use bottom: 0 instead
  height: 1,
});
```

---

### Issue #7: Percentage Sizes Without Auto-Resize

**Severity:** LOW
**Affected:** Various doors

**Problem:**
Panels use percentage widths/heights but don't update on screen resize.

**SDK Helper Already Handles This:**
The SDK's `setupAutoResize()` in `blessed-helpers.ts:94` automatically handles resize for percentage dimensions.

**But:** Only works if using `createBox()`, `createTextbox()`, etc. - not if creating widgets with `blessed.*` directly.

**Fix:** Use SDK helpers (`createBox`, `createList`, `createTextbox`) instead of `blessed.box()` directly.

---

## Recommended Panel Layout Pattern

### Standard BBS Door Layout (80x24)

```
┌────────────────────────────────────────────────────────┐ Row 0
│ HEADER / TITLE BAR                                     │ Height: 1-3
├────────────────────────────────────────────────────────┤
│                                                        │
│                                                        │
│                                                        │
│           MAIN CONTENT AREA                            │ Rows 2-22
│           (Lists, Panels, Forms, etc.)                 │ Height: screen.height - header - footer - margins
│                                                        │
│                                                        │
│                                                        │
├────────────────────────────────────────────────────────┤
│ FOOTER / STATUS BAR / INSTRUCTIONS                     │ Row 23
└────────────────────────────────────────────────────────┘ Height: 1

Recommended Dimensions:
- Header: top: 0, height: 1-3
- Content: top: header.height, bottom: 1 (or height: screen.height - header - footer)
- Footer: bottom: 0, height: 1
```

### Code Template:

```typescript
import {
  createScreen,
  createBox,
  createList,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export async function runDoor(session: DoorSession) {
  // 1. Create screen using SDK helper
  const screen = createScreen(session.bbs, {
    title: 'My BBS Door',
    smartCSR: false,  // Prevent layout corruption
    fastCSR: false,   // Force full redraws
  });

  // 2. Create input manager
  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,  // Set true for games
    enableGrabKeys: false,  // Set true for global key capture
    enableMouse: true,
  });

  // 3. Enable input
  inputManager.enable();

  // 4. Create header (fixed)
  const header = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 2,
    fixed: true,  // ← IMPORTANT: Prevent dragging
    content: '{center}{bold}MY BBS DOOR{/bold}{/center}\n{center}v1.0{/center}',
    style: { fg: 'white', bg: 'blue' }
  });

  // 5. Create main content (fixed)
  const contentBox = createBox({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    bottom: 1,  // ← Reserve space for footer
    fixed: true,  // ← IMPORTANT: Prevent dragging
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } }
  });

  // 6. Create footer (fixed)
  const footer = createBox({
    parent: screen,
    bottom: 0,  // ← Anchor to bottom
    left: 0,
    width: '100%',
    height: 1,
    fixed: true,  // ← IMPORTANT: Prevent dragging
    content: '{center}[Q] Quit  |  [H] Help{/center}',
    style: { fg: 'gray', bg: 'black' }
  });

  // 7. Render initial screen
  screen.render();

  // 8. Wait for exit
  await new Promise<void>((resolve) => {
    screen.key(['q', 'Q', 'escape'], () => {
      inputManager.disable();  // ← CRITICAL: Clean up input
      screen.destroy();
      resolve();
    });
  });
}
```

---

## Door-by-Door Findings

### ✅ WHIP (Demo Scene Project Management)
**Status:** FIXED
**Issues:** None - all panels have `fixed: true`
**Recommendation:** Use as reference implementation

### 🔴 grandmaster (Tetris Game)
**Status:** NEEDS FIXES
**Issues:**
1. Uses custom `createDockable()` helper without `fixed: true`
2. Hard-coded panel sizes (width: 24, height: 12)
3. Sets `dockBorders: true` on screen (should be false for BBS)

**Files to Fix:**
- `ui/menu.ts` - All panels need `fixed: true`
- `ui/game-screen.ts` - Check panel sizes
- `ui/settings-screen.ts` - Check panel layout
- `ui/lobby-screen.ts` - Check panel layout

### 🔴 doors-menu (Door Selection)
**Status:** NEEDS FIXES
**Issues:**
1. Uses `blessed.screen()` instead of `createScreen()`
2. Missing `fixed: true` on panels
3. Sets `dockBorders: true` (should be false)

**Files to Fix:**
- `app.ts:197` - Replace `blessed.screen()` with `createScreen()`
- `app.ts:220-289` - Add `fixed: true` to all createBox/createList calls

### 🔴 neo-blessed-showcase (Widget Demo)
**Status:** NEEDS REVIEW
**Issues:**
1. Uses `blessed.box()` directly instead of `createBox()`
2. Missing `fixed: true` on some panels
3. Purpose is showcase, so dockable features may be intentional

**Recommendation:** Add comments explaining when dockable is appropriate vs when to use `fixed: true`

### 🔴 bbs-dashboard (SysOp Dashboard)
**Status:** CRITICAL - NEEDS MAJOR REFACTOR
**Issues:**
1. Uses `new DockablePanel()` directly with all features enabled
2. `draggable: true`, `resizable: true`, `showMinimizeButton: true` - inappropriate for BBS
3. Uses `dockPosition: 'float'` - no floating in terminal

**Files to Fix:**
- `index.ts:100-161` - Replace all DockablePanel with createBox + fixed: true
- Remove minimize buttons, resize handles, dragging

**Severity:** HIGH - This door demonstrates anti-patterns that other developers might copy

---

## SDK Improvements Needed

### 1. createBox() Should Default to fixed: true

**Current Behavior:**
```typescript
export function createBox(options?: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    ...options,  // User can override
  });
}
```

**Proposed:**
```typescript
export function createBox(options?: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    fixed: true,  // ← Default to fixed for BBS compatibility
    ...options,   // User can override with fixed: false
  });
}
```

**Benefits:**
- BBS doors get static panels by default (99% of use cases)
- Desktop-style doors can opt-in with `fixed: false`
- Prevents accidental dragging in BBS environment

**Migration:** SDK v2.1 with deprecation notice

### 2. Add createStaticBox() Helper

**Alternative to changing defaults:**
```typescript
/**
 * Create a static box (non-dockable, non-draggable)
 * Recommended for BBS doors
 */
export function createStaticBox(options?: ElementOptions): Box {
  return createBox({
    fixed: true,
    ...options,
  });
}
```

### 3. Add Panel Layout Validators

**Development-mode warnings:**
```typescript
function validatePanelLayout(panel: Box, screen: Screen): void {
  // Warn if panel extends beyond screen bounds
  if (panel.top + panel.height > screen.height) {
    console.warn(`[Panel Layout] Panel extends beyond screen height`);
  }

  // Warn if missing fixed: true in BBS context
  if (!panel.options.fixed && session.connectionType !== 'web') {
    console.warn(`[Panel Layout] Consider adding fixed: true for BBS compatibility`);
  }
}
```

---

## Testing Checklist

For each door:

### ✅ Layout Tests:
- [ ] Header visible and not overlapped
- [ ] Main content area fills available space
- [ ] Footer visible at bottom
- [ ] No panels extend beyond screen bounds
- [ ] Panels don't overlap each other

### ✅ Responsiveness Tests:
- [ ] Layout adapts to 80x24 (standard)
- [ ] Layout adapts to 132x37 (wide mode)
- [ ] Resize events update panel positions
- [ ] Percentage sizes recalculate correctly

### ✅ Docking Tests:
- [ ] Panels have `fixed: true` (unless intentionally dockable)
- [ ] Panels cannot be dragged with mouse
- [ ] No resize handles visible
- [ ] No minimize/maximize buttons (unless desktop-style door)

### ✅ Input Tests:
- [ ] Keyboard navigation works
- [ ] Mouse clicks work
- [ ] Exit door → BBS input works immediately
- [ ] No input state leakage

---

## Priority Fixes

### P0 - Critical (Fix Immediately):
1. **bbs-dashboard** - Remove DockablePanel features, use createBox + fixed: true
2. **doors-menu** - Replace blessed.screen() with createScreen(), add fixed: true
3. **grandmaster** - Add fixed: true to all menu/lobby panels

### P1 - High (Fix Soon):
4. **neo-blessed-showcase** - Add comments/examples for when to use fixed: true
5. **ansi-editor** - Audit panel layout and sizes
6. **livechat** - Check panel overlap and positioning

### P2 - Medium (Fix When Time Permits):
7. All game doors - Add fixed: true to menu screens
8. SDK - Add createStaticBox() helper
9. SDK - Consider createBox() default change for v2.1

---

## Conclusion

**Status:** 🔴 CRITICAL ISSUES FOUND

Most blessed doors have layout and docking issues stemming from:
1. Inconsistent use of SDK helpers
2. Missing `fixed: true` on static panels
3. Inappropriate use of DockablePanel features in BBS context
4. Hard-coded sizes instead of responsive layouts

**Recommended Action:** Fix P0 doors immediately, then systematically address P1/P2.

**Long-term:** Update SDK to make `fixed: true` the default for `createBox()` in v2.1.

---

**Audit Date:** January 21, 2026
**Auditor:** Claude Code
**Next Review:** After P0 fixes applied
