# Keyboard Navigation Enhancement Plan

**Goal:** Desktop OS-quality keyboard navigation for all neo-blessed components.

**Status:** PLANNING
**Priority:** CRITICAL (BBS are keyboard-first interfaces)
**Estimated Timeline:** 6 phases, ~2-3 weeks

---

## Overview

Transform neo-blessed into a fully keyboard-navigable UI framework with:
- **Tab/Shift+Tab** navigation between all interactive elements
- **Visual focus indicators** (borders, colors, highlights)
- **Hover/active/focused states** for all components
- **Arrow key navigation** within components
- **Keyboard shortcuts** for common actions
- **Focus trapping** in modals/dialogs
- **Focus memory** (restore focus after modal closes)
- **Screen reader hints** for accessibility

---

## Phase 1: Core Focus Management System

**Goal:** Robust focus chain with Tab/Shift+Tab navigation

### Tasks

- [ ] **1.1: Focus Chain Manager**
  - Create `FocusManager` class in `sdk/engines/ui/blessed/core/focus.ts`
  - Track all focusable elements in document order
  - Handle Tab (next) and Shift+Tab (previous)
  - Support focus groups (panels, containers)
  - Emit `focus-changed` events

- [ ] **1.2: Enhanced Element Focus**
  - Add `tabIndex` property to Element (like HTML)
  - Add `focusable`, `tabbable` properties (tabbable = can Tab to it)
  - Implement `focus()`, `blur()`, `isFocused()` methods (already exist, enhance)
  - Add `nextFocusable()`, `previousFocusable()` helpers

- [ ] **1.3: Screen-Level Focus Management**
  - Add `screen.focusNext()` and `screen.focusPrevious()` methods
  - Global Tab/Shift+Tab handlers in Screen class
  - Track current focused element
  - Handle focus lost (element destroyed/hidden)

- [ ] **1.4: Focus Indicators (Basic)**
  - Add default focus border style (cyan/bright)
  - Add `focusStyle` option to all widgets
  - Show/hide focus indicator on focus/blur
  - Test on Box, List, Button, Textbox

**Deliverable:** Tab navigation works between all focusable elements with basic visual indication.

---

## Phase 2: Visual States System

**Goal:** Consistent visual feedback for all interactive states

### Tasks

- [ ] **2.1: State Style System**
  - Define state types: `normal`, `hover`, `focused`, `active`, `disabled`
  - Add `stateStyles` property to Element options
  - Implement state style inheritance (focused + hover, etc.)
  - Add `setState(state)` and `getState()` methods

- [ ] **2.2: Hover State**
  - Track mouse position for hover state
  - Add `hoverStyle` to all widgets
  - Emit `hover`, `unhover` events
  - Visual feedback on hover (lighter border, bg change)

- [ ] **2.3: Active State**
  - Add `activeStyle` for elements being interacted with
  - Button press state (darker/inverted)
  - List item selection highlight
  - Checkbox/Radio active state

- [ ] **2.4: Disabled State**
  - Add `disabled` property to all interactive widgets
  - Grayed-out visual style
  - Skip in tab navigation
  - Show cursor-not-allowed hint
  - Block interaction events

- [ ] **2.5: Widget-Specific States**
  - **Button**: normal, hover, focused, pressed, disabled
  - **List**: normal, hover (item), focused, selected, disabled
  - **Textbox**: normal, focused, disabled, readonly
  - **Checkbox**: unchecked, checked, hover, focused, disabled
  - **Form**: field focused, field error, field valid

**Deliverable:** All components have consistent visual states with smooth transitions.

---

## Phase 3: Component Keyboard Navigation

**Goal:** Perfect keyboard control for every widget

### Tasks

- [ ] **3.1: List Navigation**
  - Up/Down arrows (already exists, verify)
  - Home/End (first/last item)
  - Page Up/Page Down (jump 10 items)
  - Type-to-search (type letter, jump to item starting with it)
  - Space to select (multi-select lists)
  - Enter to activate/open

- [ ] **3.2: Form Navigation**
  - Tab between form fields
  - Enter submits form (if not in textarea)
  - Escape clears/resets field
  - Label association (click label focuses field)
  - Field validation visual feedback

- [ ] **3.3: Button Activation**
  - Space and Enter activate button
  - Visual pressed state
  - Handle rapid key repeat
  - Prevent double-activation

- [ ] **3.4: Menu Navigation**
  - Arrow keys navigate menu items
  - Enter selects item
  - Escape closes menu
  - Letter keys jump to item (type-ahead)
  - Submenu navigation (Right arrow opens, Left closes)

- [ ] **3.5: Table Navigation**
  - Arrow keys move between cells
  - Tab moves to next cell (like spreadsheet)
  - Home/End (start/end of row)
  - Ctrl+Home/End (start/end of table)
  - Enter edits cell (if editable)

- [ ] **3.6: ScrollableBox Navigation**
  - Arrow keys scroll content
  - Page Up/Down (full page)
  - Home/End (top/bottom)
  - Mouse wheel (already works)

**Deliverable:** Every component has comprehensive keyboard control.

---

## Phase 4: Layout & Panel Navigation

**Goal:** Navigate between panels and sections like desktop apps

### Tasks

- [ ] **4.1: Focus Groups**
  - Create `FocusGroup` class (container for related elements)
  - Tab within group, Shift+Tab exits group
  - Arrow keys navigate within group (for toolbars, button groups)
  - Ctrl+Tab switches between groups

- [ ] **4.2: Panel System**
  - Create `Panel` widget (Box with focus group)
  - Visual indication of active panel (bright border)
  - Alt+1, Alt+2, etc. to switch panels (like Windows)
  - F6 cycles through panels (like Eclipse/VS Code)

- [ ] **4.3: Modal Focus Trapping**
  - When modal opens, trap focus inside it
  - Tab cycles within modal only
  - Escape closes modal
  - Focus returns to trigger element on close

- [ ] **4.4: Focus Stack**
  - Track focus history (stack of focused elements)
  - Restore focus when element removed
  - Return to previous focus on modal close
  - Handle nested modals

- [ ] **4.5: Layout Regions**
  - Define semantic regions: header, sidebar, main, footer
  - Ctrl+Shift+H (header), M (main), S (sidebar), F (footer)
  - Skip regions (like "Skip to main content")

**Deliverable:** Complex multi-panel layouts are fully keyboard navigable.

---

## Phase 5: Advanced Keyboard Features

**Goal:** Power-user keyboard features

### Tasks

- [ ] **5.1: Global Keyboard Shortcuts**
  - Create `KeyBindings` class
  - Register global shortcuts (Ctrl+S, Ctrl+Q, etc.)
  - Handle conflicts (local vs global)
  - Allow customization
  - Visual shortcut hints in UI

- [ ] **5.2: Command Palette**
  - Ctrl+Shift+P opens command palette
  - Fuzzy search all available actions
  - Keyboard-only interaction
  - Show keyboard shortcuts in results
  - Recent commands list

- [ ] **5.3: Context-Aware Shortcuts**
  - Different shortcuts based on focused element
  - Ctrl+C in textarea = copy, elsewhere = close
  - Show available shortcuts in status bar
  - F1 shows help/shortcuts for current element

- [ ] **5.4: Vim-Style Navigation (Optional)**
  - Add `vi: true` option to elements
  - hjkl for navigation
  - / for search
  - : for commands
  - Consistent with blessed's existing vi mode

- [ ] **5.5: Accessibility Hints**
  - Add `aria-label` equivalent for screen readers
  - Announce focus changes
  - Announce state changes (checked, selected, etc.)
  - Role descriptions (button, list, dialog, etc.)

**Deliverable:** Power users can navigate entire application without mouse.

---

## Phase 6: Testing, Polish & Documentation

**Goal:** Production-ready keyboard navigation

### Tasks

- [ ] **6.1: Component Testing**
  - Test every widget for keyboard navigation
  - Test all combinations (focused+hover, disabled, etc.)
  - Test edge cases (empty lists, single items, etc.)
  - Test focus restoration
  - Test nested modals

- [ ] **6.2: Integration Testing**
  - Test complex layouts (multi-panel apps)
  - Test all example doors
  - Test livechat (complex real-world example)
  - Test forms with validation
  - Test nested focus groups

- [ ] **6.3: Visual Consistency**
  - Audit all focus indicators
  - Ensure consistent colors/styles
  - Test on different color schemes
  - Ensure high contrast for visibility
  - Test on real BBS terminals

- [ ] **6.4: Performance Optimization**
  - Optimize focus chain updates
  - Debounce hover state changes
  - Lazy-load focus groups
  - Profile keyboard event handling

- [ ] **6.5: Documentation**
  - Update KEYBOARD_NAVIGATION.md guide
  - Add examples to blessed-helpers
  - Document keyboard shortcuts in each widget
  - Create interactive keyboard navigation demo door
  - Update existing doors to use new features

- [ ] **6.6: Migration Guide**
  - Update existing doors for new focus system
  - Backward compatibility layer
  - Deprecation warnings for old patterns
  - Automated migration script

**Deliverable:** Polished, tested, documented keyboard navigation system.

---

## Implementation Notes

### Focus Indicator Styles

```typescript
// Default focus styles (can be overridden)
const DEFAULT_FOCUS_STYLE = {
  border: { fg: 'cyan', bold: true },
  bg: 'black',
  fg: 'white',
};

const DEFAULT_HOVER_STYLE = {
  border: { fg: 'blue' },
  bg: 'black',
};

const DEFAULT_ACTIVE_STYLE = {
  border: { fg: 'yellow', bold: true },
  bg: 'blue',
  fg: 'white',
};

const DEFAULT_DISABLED_STYLE = {
  border: { fg: 'gray' },
  bg: 'black',
  fg: 'gray',
};
```

### Tab Order Algorithm

1. Collect all `tabbable: true` elements in tree order
2. Sort by `tabIndex` (0 = default, -1 = not tabbable, 1+ = explicit order)
3. Within same tabIndex, use DOM order (depth-first traversal)
4. Skip `hidden: true` and `disabled: true` elements
5. Wrap around (last element -> first element on Tab)

### Focus Group Behavior

```typescript
// Normal Tab behavior
Tab -> next element in focus chain

// Within FocusGroup
Tab -> next element in group
Shift+Tab -> previous element in group
Escape -> exit group (focus parent)
Ctrl+Tab -> next group (skip all elements in current group)
```

### Modal Focus Trapping

```typescript
// When modal opens
1. Save current focus (returnFocus = document.activeElement)
2. Set modal.focusTrap = true
3. Focus first focusable element in modal
4. Intercept Tab/Shift+Tab to cycle within modal only

// When modal closes
1. Restore focus to returnFocus
2. Remove modal from DOM
3. Resume normal focus chain
```

---

## File Structure

```
sdk/engines/ui/blessed/
├── core/
│   ├── focus.ts              # NEW: FocusManager, FocusGroup
│   ├── keyboard.ts            # NEW: KeyBindings, shortcuts
│   ├── states.ts              # NEW: Visual state management
│   ├── element.ts             # MODIFY: Add focus/state support
│   └── screen.ts              # MODIFY: Add global focus management
│
├── widgets/
│   ├── panel.ts               # NEW: Focus-aware panel
│   ├── commandpalette.ts      # NEW: Ctrl+Shift+P command palette
│   ├── list.ts                # MODIFY: Enhanced keyboard nav
│   ├── button.ts              # MODIFY: Add state styles
│   ├── textbox.ts             # MODIFY: Add state styles
│   └── ...                    # MODIFY: All widgets get state support
│
└── utils/
    └── keyboard-helpers.ts    # NEW: Helper functions for shortcuts

Documentation/4-Door-Developers/
├── KEYBOARD_NAVIGATION.md     # NEW: Complete guide
└── KEYBOARD_SHORTCUTS.md      # NEW: Default shortcuts reference
```

---

## Success Criteria

- [ ] Can navigate entire application using only keyboard
- [ ] Visual focus indicator always visible
- [ ] Tab order is logical and predictable
- [ ] Modal focus trapping works correctly
- [ ] All interactive elements respond to Enter/Space
- [ ] Arrow keys work consistently across components
- [ ] Focus is restored after modals/overlays close
- [ ] Disabled elements are skipped in tab order
- [ ] Works on real BBS terminals (not just web)
- [ ] Passes accessibility audit
- [ ] Zero keyboard navigation bugs in testing

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 | 3-4 days | None |
| Phase 2 | 4-5 days | Phase 1 |
| Phase 3 | 5-6 days | Phase 1, 2 |
| Phase 4 | 3-4 days | Phase 1, 2 |
| Phase 5 | 4-5 days | Phase 1-4 |
| Phase 6 | 5-6 days | Phase 1-5 |
| **Total** | **~20-25 days** | |

**Can be parallelized:** Phases 2 and 3 can partially overlap.

---

## Quick Wins (Do First)

These provide immediate value:

1. **Tab/Shift+Tab navigation** (Phase 1.3)
2. **Focus border indicators** (Phase 1.4)
3. **List keyboard improvements** (Phase 3.1)
4. **Modal focus trapping** (Phase 4.3)
5. **Button Space/Enter** (Phase 3.3)

---

## Breaking Changes

- Focus system may change element z-index behavior
- Tab key may conflict with existing custom handlers
- Some doors may need updates for focus indicators

**Mitigation:** Provide compatibility flag `legacyFocus: true` for old behavior.

---

## Next Steps

1. **Review this plan** - Approve phases and priorities
2. **Phase 1 implementation** - Start with core focus management
3. **Test in livechat** - Complex real-world door for testing
4. **Iterate based on feedback** - Adjust plan as needed
5. **Roll out to all doors** - Update existing doors progressively
