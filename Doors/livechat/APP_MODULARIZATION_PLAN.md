# app.ts Modularization Plan

**Status**: CRITICAL - Spec Violation
**Current Size**: 90,026 characters
**Spec Maximum**: 2,000 characters per file
**Violation**: 45x over limit
**Target**: Split into 45+ focused modules

---

## Problem Statement

The `app.ts` file currently violates the v2.0 specification which requires:
> **Maximum file size**: 2,000 characters per file

**Current State**:
- Single monolithic file: 90,026 characters
- Contains: UI creation, event handlers, state management, commands, helpers
- Estimated module count needed: **45 modules**

**Consequences of Not Fixing**:
- ❌ Spec non-compliance (CRITICAL blocker for v2.0 release)
- ❌ Difficult to maintain and debug
- ❌ Hard for contributors to understand
- ❌ Merge conflicts likely
- ❌ Testing individual components difficult

---

## Modularization Strategy

### Principles

1. **Separation of Concerns**: Each module has one clear responsibility
2. **Minimal Dependencies**: Reduce coupling between modules
3. **Testability**: Each module can be tested independently
4. **Progressive Refactor**: Split incrementally, test continuously
5. **No Breaking Changes**: Maintain exact same functionality

### Module Organization

```
doors/livechat/
├── app.ts (NEW - 100-200 chars, main entry point only)
├── ui/
│   ├── screen.ts              # Screen creation and configuration
│   ├── menu-bar.ts            # Top menu bar
│   ├── status-bar.ts          # Bottom status bar
│   ├── input-box.ts           # Chat input textbox
│   ├── chat-log.ts            # Main chat area
│   ├── sidebar-tabs.ts        # Sidebar tab switcher
│   ├── channel-list.ts        # Channel list widget
│   ├── user-list.ts           # User list widget
│   ├── typing-preview.ts      # Typing indicators (EXISTING)
│   ├── emoji-picker.ts        # Emoji picker dialog (EXISTING)
│   ├── command-autocomplete.ts # Command suggestions dropdown
│   ├── context-menus.ts       # Right-click context menus
│   ├── focus-manager.ts       # Focus border styling
│   └── layout-manager.ts      # Screen layout calculations
├── overlays/
│   ├── help-screen.ts         # Help overlay
│   ├── settings-overlay.ts    # Settings dialog
│   ├── profile-overlay.ts     # User profile dialog
│   ├── modal-overlay.ts       # Semi-transparent modal backdrop
│   ├── message-dialog.ts      # Simple message popups
│   └── confirm-dialog.ts      # Yes/No confirmation dialogs
├── features/
│   ├── drawing-canvas.ts      # Drawing/whiteboard feature
│   ├── file-sharing.ts        # File browser feature
│   ├── input-history.ts       # Message history (up/down arrows)
│   ├── message-editing.ts     # Edit message functionality
│   └── scroll-handler.ts      # Scroll wheel support
├── handlers/
│   ├── socket/
│   │   ├── message.ts         # chat:message handler (EXISTING)
│   │   ├── keystroke.ts       # chat:keystroke handler (EXISTING)
│   │   ├── typing.ts          # Typing indicator handler
│   │   ├── presence.ts        # User presence handler
│   │   ├── reactions.ts       # Reaction handler
│   │   ├── channels.ts        # Channel events handler
│   │   └── dm.ts              # Direct message handler
│   ├── input-submit.ts        # Input box submit handler
│   ├── mouse-events.ts        # Global mouse handling
│   └── keyboard-shortcuts.ts  # Global keyboard shortcuts
├── state/
│   ├── app-state.ts           # AppState interface (EXISTING as core/state.ts)
│   └── ui-state.ts            # UI-specific state (sidebar, modals, etc.)
├── initialization/
│   ├── commands.ts            # Command registration
│   ├── socket-setup.ts        # Socket.IO initialization
│   ├── ui-setup.ts            # UI component creation
│   └── event-binding.ts       # Event listener setup
├── utils/
│   ├── helpers.ts             # Helper functions
│   ├── formatters.ts          # Message formatting (EXISTING as core/formatter.ts)
│   ├── validation.ts          # Input validation
│   └── cleanup.ts             # Cleanup on exit
└── types/
    └── ui.types.ts            # UI-specific TypeScript interfaces
```

---

## Module Breakdown (45+ Modules)

### Category 1: UI Components (15 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `ui/screen.ts` | ~50 | Create blessed screen | `createScreen()` |
| `ui/menu-bar.ts` | ~80 | Top menu bar | `createMenuBar(screen)` |
| `ui/status-bar.ts` | ~60 | Bottom status bar | `createStatusBar(screen)` |
| `ui/input-box.ts` | ~50 | Chat input textbox | `createInputBox(screen)` |
| `ui/chat-log.ts` | ~100 | Main chat log | `createChatLog(screen)` |
| `ui/sidebar-tabs.ts` | ~80 | Sidebar tab switcher | `createSidebarTabs(screen)` |
| `ui/channel-list.ts` | ~150 | Channel list widget | `createChannelList(screen)` |
| `ui/user-list.ts` | ~150 | User list widget | `createUserList(screen)` |
| `ui/command-autocomplete.ts` | ~200 | Command dropdown | `createCommandAutocomplete(screen)` |
| `ui/context-menus.ts` | ~200 | Context menus | `setupContextMenus(screen)` |
| `ui/focus-manager.ts` | ~50 | Focus styling | `updateFocusBorders()` |
| `ui/layout-manager.ts` | ~100 | Layout calculations | `updateLayout()` |
| `ui/typing-preview.ts` | EXISTING | Typing indicators | Already modular |
| `ui/emoji-picker.ts` | EXISTING | Emoji picker | Already modular |
| `ui/scroll-handler.ts` | ~50 | Scroll wheel | `setupScrollHandlers()` |

**Total**: ~1,370 lines

### Category 2: Overlays (6 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `overlays/help-screen.ts` | ~250 | Help overlay | `createHelpScreen(screen)` |
| `overlays/settings-overlay.ts` | ~300 | Settings dialog | `createSettingsOverlay(screen)` |
| `overlays/profile-overlay.ts` | ~200 | User profile | `createProfileOverlay(screen)` |
| `overlays/modal-overlay.ts` | ~50 | Modal backdrop | `createModalOverlay(screen)` |
| `overlays/message-dialog.ts` | ~100 | Message popup | `showMessageDialog(text)` |
| `overlays/confirm-dialog.ts` | ~100 | Confirmation | `showConfirmDialog(text)` |

**Total**: ~1,000 lines

### Category 3: Features (5 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `features/drawing-canvas.ts` | ~250 | Drawing feature | `createDrawingCanvas()` |
| `features/file-sharing.ts` | ~200 | File browser | `createFileBrowser()` |
| `features/input-history.ts` | ~150 | Message history | `setupInputHistory()` |
| `features/message-editing.ts` | ~100 | Edit messages | `setupMessageEditing()` |
| `features/reactions.ts` | ~100 | Reactions UI | `setupReactionHandlers()` |

**Total**: ~800 lines

### Category 4: Socket Handlers (8 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `handlers/socket/message.ts` | EXISTING | Message handler | Already modular |
| `handlers/socket/keystroke.ts` | EXISTING | Keystroke handler | Already modular |
| `handlers/socket/typing.ts` | ~50 | Typing events | `setupTypingHandlers()` |
| `handlers/socket/presence.ts` | ~80 | Presence events | `setupPresenceHandlers()` |
| `handlers/socket/reactions.ts` | ~60 | Reaction events | `setupReactionHandlers()` |
| `handlers/socket/channels.ts` | ~100 | Channel events | `setupChannelHandlers()` |
| `handlers/socket/dm.ts` | ~60 | DM events | `setupDMHandlers()` |
| `handlers/socket/events.ts` | ~80 | BBS events | `setupBBSEventHandlers()` |

**Total**: ~430 lines (excluding existing)

### Category 5: Input Handlers (3 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `handlers/input-submit.ts` | ~200 | Submit handler | `setupInputSubmit()` |
| `handlers/mouse-events.ts` | ~150 | Mouse handling | `setupMouseHandlers()` |
| `handlers/keyboard-shortcuts.ts` | ~200 | Keyboard shortcuts | `setupKeyboardShortcuts()` |

**Total**: ~550 lines

### Category 6: State Management (2 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `state/app-state.ts` | EXISTING | App state | Already in core/state.ts |
| `state/ui-state.ts` | ~100 | UI state | `UIState` interface |

**Total**: ~100 lines

### Category 7: Initialization (4 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `initialization/commands.ts` | ~100 | Command registration | `registerAllCommands()` |
| `initialization/socket-setup.ts` | ~50 | Socket.IO setup | `initializeSocket()` |
| `initialization/ui-setup.ts` | ~200 | UI creation | `createAllUI()` |
| `initialization/event-binding.ts` | ~100 | Event binding | `bindAllEvents()` |

**Total**: ~450 lines

### Category 8: Utilities (4 modules)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `utils/helpers.ts` | ~200 | Helper functions | Various |
| `utils/formatters.ts` | EXISTING | Formatting | Already in core/formatter.ts |
| `utils/validation.ts` | ~50 | Input validation | `validateInput()` |
| `utils/cleanup.ts` | ~50 | Cleanup logic | `cleanup()` |

**Total**: ~300 lines

### Category 9: Main Entry (1 module)

| Module | Lines | Responsibility | Exports |
|--------|-------|----------------|---------|
| `app.ts` | ~150 | Main entry point | `runLiveChat()` |

**Total**: ~150 lines

---

## New app.ts Structure

```typescript
/**
 * LiveChat v3.2 - Main Entry Point
 * Coordinates UI, handlers, and services
 */

import { createScreen } from './ui/screen';
import { createAllUI } from './initialization/ui-setup';
import { registerAllCommands } from './initialization/commands';
import { initializeSocket } from './initialization/socket-setup';
import { bindAllEvents } from './initialization/event-binding';
import { cleanup } from './utils/cleanup';
import type { BBSSession } from '../../core/Door';

export async function runLiveChat(session: BBSSession) {
  // 1. Create screen
  const screen = createScreen();

  // 2. Initialize state
  const state = createInitialState();
  const registry = createCommandRegistry();

  // 3. Create all UI components
  const ui = await createAllUI(screen, session);

  // 4. Initialize Socket.IO
  const socket = initializeSocket(session, state, ui);

  // 5. Register commands
  registerAllCommands(registry, state, ui, socket);

  // 6. Bind all event handlers
  bindAllEvents(screen, ui, state, socket, registry);

  // 7. Setup cleanup
  process.on('exit', () => cleanup(screen, socket));

  // 8. Render and focus
  screen.render();
  ui.inputBox.focus();

  return { screen, state, ui, socket };
}

// Export for Door framework
export default runLiveChat;
```

**Character count**: ~150 lines × 40 chars/line = ~6,000 chars (still over limit!)
**Solution**: Further split initialization into separate files

---

## Refactoring Order (Progressive Strategy)

### Phase 1: Extract UI Components (Week 1)
1. Create `ui/` directory structure
2. Extract screen creation
3. Extract menu bar
4. Extract status bar
5. Extract input box
6. Extract chat log
7. Extract sidebars
8. **Test**: Verify UI renders correctly

### Phase 2: Extract Overlays (Week 1)
9. Extract help screen
10. Extract settings overlay
11. Extract profile overlay
12. Extract dialog helpers
13. **Test**: Verify all overlays work

### Phase 3: Extract Features (Week 2)
14. Extract drawing canvas
15. Extract file sharing
16. Extract input history
17. Extract message editing
18. **Test**: Verify all features functional

### Phase 4: Extract Handlers (Week 2)
19. Extract socket handlers
20. Extract input handlers
21. Extract mouse handlers
22. Extract keyboard shortcuts
23. **Test**: Verify all interactions work

### Phase 5: Extract Initialization (Week 3)
24. Create initialization modules
25. Update main app.ts
26. **Test**: Full integration testing

### Phase 6: Testing & Cleanup (Week 3)
27. Fix any regressions
28. Optimize imports
29. Update documentation
30. Final verification

---

## Testing Strategy

### Per-Module Tests
```typescript
// ui/screen.spec.ts
describe('createScreen', () => {
  it('should create blessed screen with correct config', () => {
    const screen = createScreen();
    expect(screen).toBeDefined();
    expect(screen.title).toBe('LiveChat v3.2');
  });
});
```

### Integration Tests
```typescript
// app.integration.spec.ts
describe('LiveChat Integration', () => {
  it('should initialize all components', async () => {
    const session = mockBBSSession();
    const result = await runLiveChat(session);
    expect(result.screen).toBeDefined();
    expect(result.ui.inputBox).toBeDefined();
    expect(result.socket.connected).toBe(true);
  });
});
```

### Regression Tests
- All existing features must work
- No visual changes
- Same keyboard shortcuts
- Same performance

---

## Migration Checklist

**Before Starting**:
- [ ] Commit current working state
- [ ] Create feature branch: `refactor/modularize-app-ts`
- [ ] Document current functionality
- [ ] Create comprehensive test suite

**During Refactoring**:
- [ ] Extract one module at a time
- [ ] Test after each extraction
- [ ] Update imports
- [ ] Verify no regressions

**After Completion**:
- [ ] All modules < 2,000 characters
- [ ] All tests passing
- [ ] No functionality changes
- [ ] Documentation updated
- [ ] Code review

---

## Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Planning** | Architecture design | 4 hours (DONE) |
| **Phase 1** | Extract UI components (15 modules) | 2 days |
| **Phase 2** | Extract overlays (6 modules) | 1 day |
| **Phase 3** | Extract features (5 modules) | 1 day |
| **Phase 4** | Extract handlers (11 modules) | 1.5 days |
| **Phase 5** | Extract initialization (4 modules) | 0.5 days |
| **Phase 6** | Testing & cleanup | 1 day |
| **Total** | **45+ modules** | **7-8 days** |

**With testing and documentation**: **2-3 weeks**

---

## Risks & Mitigation

### Risk 1: Breaking Functionality
**Mitigation**:
- Extract incrementally
- Test continuously
- Keep git history clean for easy rollback

### Risk 2: Import Cycles
**Mitigation**:
- Use dependency injection
- Avoid circular dependencies
- Create clear module hierarchy

### Risk 3: Performance Regression
**Mitigation**:
- Profile before and after
- Optimize hot paths
- Bundle strategically

### Risk 4: Merge Conflicts
**Mitigation**:
- Communicate with team
- Feature branch strategy
- Small, focused PRs

---

## Success Criteria

1. ✅ **All files < 2,000 characters**
2. ✅ **Zero functionality changes**
3. ✅ **All tests passing**
4. ✅ **No performance regression**
5. ✅ **Clean module boundaries**
6. ✅ **Documentation updated**
7. ✅ **v2.0 spec compliant**

---

## Alternative Approach: Partial Modularization

If full modularization is too time-consuming, consider:

1. **Extract Large Sections First** (reduce violation by 50%):
   - Extract overlays (settings, help, profile) → 3 files
   - Extract features (drawing, file sharing) → 2 files
   - Extract handlers (socket, input) → 3 files
   - **Result**: 8 files × ~10,000 chars each (still over, but better)

2. **Then Further Split** (reach compliance):
   - Split each 10,000 char file into 5× 2,000 char files
   - **Result**: 40 files × ~2,000 chars each (compliant!)

This staged approach allows shipping v2.0 sooner while maintaining forward progress.

---

**Status**: Plan Complete - Ready for Implementation
**Blocker**: CRITICAL (v2.0 release requirement)
**Estimated Effort**: 2-3 weeks full-time
**Recommended Approach**: Progressive refactor with continuous testing