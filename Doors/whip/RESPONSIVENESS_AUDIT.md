# WHIP Door - Responsiveness Audit & Performance Analysis

## Date: January 21, 2026

---

## Executive Summary

**Status:** 🔴 CRITICAL - Multiple severe responsiveness issues identified

**Impact:** Poor user experience with noticeable lag, sluggish navigation, and input delays

**Root Causes:** 7 major performance bottlenecks identified across UI layer

---

## Critical Issues Found

### 1. ❌ **Synchronous Delays on Every Screen** (CRITICAL)

**Severity:** HIGH
**Impact:** 200ms delay on every screen transition
**Occurrences:** 7 files

**Problem:** Every UI component adds artificial 200ms delay after screen clear.

**Code Pattern:**
```typescript
screen.clearRegion(0, screen.width, 0, screen.height);
screen.alloc();
screen.render();
await new Promise(r => setTimeout(r, 200));  // ← 200ms BLOCKING DELAY
```

**Locations:**
- `ui/main-menu.ts:18-23`
- `ui/kanban-board.ts:32-35`
- `ui/project-list.ts:26-29`
- `ui/task-editor.ts` (via showTaskEditor)
- `ui/party-timeline.ts:17-20`
- `ui/leaderboard.ts:14-17`
- `ui/achievements.ts:33-36`
- `app.ts:56-59`

**Cumulative Impact:**
- Main menu → Kanban: 400ms delay (2× 200ms)
- Kanban → Edit task → Back: 600ms delay (3× 200ms)
- Average user session: ~2-3 seconds wasted on artificial delays

**Why This Is Wrong:**
- Blessed doesn't need synchronous delays after render
- This pattern was likely cargo-culted from another codebase
- Screen clearing is instantaneous - no need to wait
- Creates perception of sluggishness

---

### 2. ❌ **Excessive screen.render() Calls** (CRITICAL)

**Severity:** HIGH
**Impact:** 40+ render calls across codebase, many unnecessary
**Occurrences:** Every UI file

**Problem:** Every minor UI update triggers full screen re-render.

**Examples:**

**Kanban Board:**
```typescript
const updateLists = async () => {
  tasks = await dataManager.getTasksForProject(project.id);

  for (let i = 0; i < COLUMNS.length; i++) {
    columnLists[i].setItems(...);  // Blessed batches these
  }

  for (let i = 0; i < COLUMNS.length; i++) {
    columnBoxes[i].style.border.fg = ...;  // Blessed batches these
  }

  columnLists[currentColumn].focus();
  screen.render();  // ← ONLY render call needed
};

// But then every key press:
case 'left':
  currentColumn = Math.max(0, currentColumn - 1);
  await updateLists();  // ← Calls screen.render()
  break;

case 'right':
  currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
  await updateLists();  // ← Calls screen.render() again
  break;
```

**Impact:**
- Left/right arrow: ~10 renders per second if held
- Each render: Full blessed widget tree traversal
- Unnecessary CPU usage
- Input lag accumulation

**Blessed Batching:**
Blessed automatically batches widget updates. We only need ONE `screen.render()` at the end of all changes, but we're calling it dozens of times.

---

### 3. ❌ **Async Wrapper Overhead** (HIGH)

**Severity:** MEDIUM-HIGH
**Impact:** Every keypress creates new async context
**Occurrences:** All keyHandlers

**Problem:** Wrapping synchronous operations in async IIFE adds overhead.

**Pattern:**
```typescript
const keyHandler = (ch: any, key: any) => {
  (async () => {  // ← Unnecessary async wrapper for most keys
    const columnTasks = tasks.filter(t => t.status === COLUMNS[currentColumn]);

    switch (key.name) {
      case 'left':
        currentColumn = Math.max(0, currentColumn - 1);
        await updateLists();  // ← Only THIS needs async
        break;

      case 'right':  // This could be synchronous
        currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
        await updateLists();
        break;
    }
  })();
};
```

**Why This Is Slow:**
- Creates new Promise/microtask for every key
- Adds event loop overhead
- Delays execution by at least 1 tick
- Compounds with rapid key presses

**Better Pattern:**
```typescript
const keyHandler = (ch: any, key: any) => {
  switch (key.name) {
    case 'left':
    case 'right':
      // Synchronous state update
      currentColumn = key.name === 'left'
        ? Math.max(0, currentColumn - 1)
        : Math.min(COLUMNS.length - 1, currentColumn + 1);

      // Single async update at end
      updateLists();  // Don't await in handler
      break;

    case 'enter':
      // Only wrap async operations
      (async () => {
        await editTask(...);
        await updateLists();
      })();
      break;
  }
};
```

---

### 4. ❌ **No Debouncing for Rapid Input** (HIGH)

**Severity:** HIGH
**Impact:** Rapid key presses trigger overlapping async operations
**Occurrences:** All interactive UI components

**Problem:** User holds arrow key → triggers 10-20 async operations per second.

**Current Behavior:**
```
User presses LEFT 5 times rapidly:
T=0ms:   Key 1 → updateLists() starts (load from disk)
T=50ms:  Key 2 → updateLists() starts (load from disk)
T=100ms: Key 3 → updateLists() starts (load from disk)
T=150ms: Key 4 → updateLists() starts (load from disk)
T=200ms: Key 5 → updateLists() starts (load from disk)

Result: 5 overlapping disk I/O operations, rendering chaos
```

**What Should Happen:**
```
User presses LEFT 5 times rapidly:
T=0ms:   Key 1 → currentColumn -= 1
T=50ms:  Key 2 → currentColumn -= 1
T=100ms: Key 3 → currentColumn -= 1
T=150ms: Key 4 → currentColumn -= 1
T=200ms: Key 5 → currentColumn -= 1
T=250ms: Debounce timeout → updateLists() ONCE

Result: 1 disk I/O operation, smooth rendering
```

**Implementation Needed:**
- Debounce navigation updates (50-100ms)
- Cancel pending operations on new input
- Batch state changes before render

---

### 5. ❌ **Full Data Reload on Every Update** (HIGH)

**Severity:** HIGH
**Impact:** Disk I/O on every navigation action
**Occurrences:** All data-driven UI

**Problem:** No caching - every UI update re-reads from disk.

**Example (Kanban Board):**
```typescript
const updateLists = async () => {
  tasks = await dataManager.getTasksForProject(project.id);  // ← DISK READ

  // ... update UI with tasks
};

// User navigates left/right 10 times:
// = 10 disk reads of the same data
```

**DataManager has no cache:**
```typescript
// In data-manager.ts:
async getTasksForProject(projectId: string): Promise<Task[]> {
  const allTasks = await this.loadTasks();  // ← Reads from disk EVERY TIME
  return allTasks.filter(task => task.projectId === projectId);
}

async loadTasks(): Promise<Task[]> {
  return (await this.storage.load<Task[]>('tasks')) ?? [];  // ← fs.readFile
}
```

**Impact:**
- 10-50ms disk I/O per navigation
- Compounds with render overhead
- Wears SSD unnecessarily
- Terrible on slow disks/network storage

**Solution:**
- Cache data in memory
- Invalidate only when data changes
- Background refresh for multi-user scenarios

---

### 6. ❌ **No Progressive Loading** (MEDIUM)

**Severity:** MEDIUM
**Impact:** Long initial load times for large datasets
**Occurrences:** List views (achievements, leaderboard, party timeline)

**Problem:** Load entire dataset before showing UI.

**Example (Achievements):**
```typescript
export async function showAchievements(...) {
  // Clear screen and wait
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();
  screen.render();
  await new Promise(r => setTimeout(r, 200));  // ← User sees blank screen

  const achievements = await dataManager.loadAchievements();  // ← Blocks
  const allAchievements = Object.values(achievements);  // ← Blocks

  // Build entire content string
  let contentText = '';
  for (const achievement of unlocked) {  // ← Blocks
    contentText += ...;
  }
  for (const achievement of locked) {  // ← Blocks
    contentText += ...;
  }

  content.setContent(contentText);
  screen.render();  // ← Finally shows UI
}
```

**Better Pattern:**
```typescript
// Show skeleton UI immediately
screen.render();

// Load data in background
const achievements = await dataManager.loadAchievements();

// Update incrementally
updateUI(achievements);
```

---

### 7. ❌ **Nested Modal Event Handlers** (MEDIUM)

**Severity:** MEDIUM
**Impact:** Multiple event handlers active simultaneously
**Occurrences:** Task editor, project editor, confirm dialogs

**Problem:** Parent screen's keyHandler remains active when modal opens.

**Flow:**
```
1. Kanban board: screen.on('keypress', kanbanHandler)
2. User presses 'n' → Opens task editor
3. Task editor: screen.on('keypress', editorHandler)
4. Now BOTH handlers are active!
5. User types in textbox → both handlers fire
6. Cleanup removes editorHandler
7. kanbanHandler still listening
```

**Current "Fix":**
We call `screen.off('keypress', handler)` in cleanup, but there's a window where both are active.

**Better Pattern:**
- Suspend parent handler when modal opens
- Resume parent handler when modal closes
- Or use modal.key() instead of screen.on()

---

## Performance Metrics (Estimated)

### Current Performance:
- **Screen transition:** 400-600ms (2-3× 200ms delays)
- **Key press response:** 50-150ms (async wrapper + render)
- **Navigation (arrow keys):** 100-200ms (data load + render)
- **Rapid navigation (10 keys):** 1-2 seconds (overlapping operations)
- **Modal open:** 200-300ms (delay + render)
- **Data operation:** 10-50ms (disk I/O, no cache)

### Target Performance:
- **Screen transition:** 50-100ms (remove delays)
- **Key press response:** <16ms (instant, 60fps)
- **Navigation (arrow keys):** <32ms (cached data + debounce)
- **Rapid navigation (10 keys):** <100ms (debounced, single update)
- **Modal open:** 50-100ms (remove delays)
- **Data operation:** <1ms (memory cache)

### Improvement Goals:
- **75-85% reduction** in perceived latency
- **90% reduction** in disk I/O operations
- **60fps** consistent responsiveness (16.67ms per frame)

---

## Architecture Issues

### Data Layer (DataManager):
- ❌ No caching
- ❌ No batch operations
- ❌ Synchronous disk I/O in async wrappers
- ❌ No data change notifications

### UI Layer (Screens):
- ❌ Artificial delays everywhere
- ❌ Excessive render calls
- ❌ No render batching/throttling
- ❌ Async overhead on synchronous operations
- ❌ No progressive loading
- ❌ No debouncing

### Event Handling:
- ❌ Multiple handlers active simultaneously
- ❌ No event delegation
- ❌ Async wrappers on every key press
- ❌ No input queue management

---

## Recommended Fixes (Priority Order)

### P0 - Critical (Immediate):
1. **Remove all 200ms delays** - Single biggest win
2. **Add DataManager cache** - Eliminate disk I/O on navigation
3. **Reduce screen.render() calls** - Only render when needed
4. **Debounce navigation** - Prevent overlapping operations

### P1 - High (Next):
5. **Remove unnecessary async wrappers** - Reduce event loop overhead
6. **Implement render throttling** - Max 60fps (16.67ms)
7. **Add progressive loading** - Show UI immediately, load data incrementally

### P2 - Medium (Future):
8. **Optimize event handlers** - Proper modal suspension
9. **Add render batching** - Collect multiple updates, render once
10. **Profile and optimize hotspots** - Use Chrome DevTools

---

## Testing Strategy

### Before Fixes:
1. Measure screen transition times
2. Measure key press latency
3. Profile rapid navigation (hold arrow key)
4. Check disk I/O operations per action

### After Each Fix:
1. Re-measure metrics
2. Verify no regressions
3. User testing for perceived performance

### Target Metrics:
- Screen transitions: <100ms
- Key press response: <16ms (60fps)
- Navigation: <32ms
- Zero disk I/O on cached operations

---

## Next Steps

1. Create optimized DataManager with cache
2. Remove all synchronous delays
3. Implement debouncing helpers
4. Reduce screen.render() calls
5. Add performance monitoring
6. User testing and iteration

---

## See Also

- [UI_PANEL_FIXES_APPLIED.md](./UI_PANEL_FIXES_APPLIED.md) - UI layout fixes
- [UX_IMPROVEMENTS_IMPLEMENTED.md](./UX_IMPROVEMENTS_IMPLEMENTED.md) - UX improvements
- [AUDIT_EVENT_EMISSION.md](./AUDIT_EVENT_EMISSION.md) - Event system audit
