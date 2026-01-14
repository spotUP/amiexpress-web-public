# Grandmaster Focus and Key Handling Issues - 2026-01-13

## Problems Identified

### 1. Space bar not working at logo screen
**Symptom**: Cannot press space to skip the attract screen logo

**Root Cause**: The attract screen uses `this.screen.once('keypress', titleHandler)` but the screen might not have focus or `grabKeys` enabled to capture keyboard input globally.

### 2. Menu keyboard navigation only works after a game
**Symptom**: Arrow keys don't work in main menu initially, but work after playing a game

**Root Cause**: The menu list widget calls `menu.focus()` but blessed might need the screen to have `grabKeys` enabled, or there's a focus transfer issue from the attract screen.

### 3. Help modal ESC closes entire door
**Symptom**: Pressing ESC to close the help manual exits the entire door

**Root Cause**: **Key event bubbling**. The grandmaster app has MANY screen-level escape handlers:
```typescript
this.screen.key(['escape'], () => resolve(-1));
this.screen.key(['escape'], () => resolve(3));  // Back
this.screen.key(['escape'], lobbyEscapeHandler);
// ... and more
```

When the DocModal closes on ESC:
1. Modal's close handler fires correctly
2. **But the ESC key bubbles up to screen**
3. One of the screen-level escape handlers also fires
4. That handler resolves/exits unexpectedly

## Solutions

### Fix 1: Enable grabKeys for proper keyboard capture

The screen needs `grabKeys: true` to capture keyboard input globally. Add this to `createScreen()` options:

```typescript
const screen = createScreen(this.session.bbs, {
  dockBorders: true,
  title: 'GRANDMASTER',
  fullUnicode: false,
  smartCSR: false,
  fastCSR: false,
  focusKeys: false,
  grabKeys: true,  // <-- ADD THIS
});
```

### Fix 2: Use widget-specific key handlers instead of screen-level

**Current (WRONG):**
```typescript
this.screen.key(['escape'], () => resolve(-1));
```

**Fixed (CORRECT):**
```typescript
modeSelectBox.key(['escape'], () => resolve(-1));
```

This prevents ESC from bubbling when handled by a specific widget.

### Fix 3: Clean up screen-level key handlers

The app registers many screen-level escape handlers but doesn't always clean them up. These accumulate and can trigger unexpectedly.

**Pattern to follow:**
```typescript
const onEscape = () => { /* handler */ };
this.screen.key(['escape'], onEscape);

// Later, ALWAYS clean up:
this.screen.unkey(['escape'], onEscape);
```

### Fix 4: Modal focus restoration

When showing the manual, ensure focus returns to the menu after modal closes:

```typescript
private async showManual(): Promise<void> {
  return new Promise((resolve) => {
    const modal = showManual(this.screen, () => {
      modal.hide();
      modal.destroy();
      // Re-render and potentially re-focus menu
      this.screen.render();
      resolve();
    });
  });
}
```

## Recommended Approach

Since the app has many screens and modals, the best approach is:

1. **Enable grabKeys on screen** - ensures all keyboard input is captured
2. **Use widget.key() instead of screen.key()** where possible - prevents bubbling
3. **Track modal state** - add a flag `this.modalOpen` and check it in screen handlers:
   ```typescript
   this.screen.key(['escape'], () => {
     if (this.modalOpen) return;  // Don't handle if modal is open
     // ... handle escape
   });
   ```

## Quick Fix (Minimal Changes)

Add this helper method to GrandmasterApp:

```typescript
private isModalOpen(): boolean {
  // Check if any modal/dialog is currently displayed
  // DocModal, dialogs, etc. set a flag when displayed
  return this.screen.children.some((child: any) =>
    child.type === 'docmodal' ||
    child.type === 'question' ||
    child.type === 'message'
  );
}
```

Then wrap all screen-level escape handlers:
```typescript
this.screen.key(['escape'], () => {
  if (this.isModalOpen()) return;
  // ... existing handler
});
```

## Testing Required

After fixes:
1. Launch GMASTER
2. Press SPACE at logo screen - should skip to menu
3. Navigate menu with arrow keys immediately - should work
4. Press F1 for manual
5. Press ESC in manual - should close modal only, not exit door
6. Navigate menu after manual closes - should still work

## Files to Modify

- `Doors/grandmaster/app.ts` - Add grabKeys, fix escape handlers
- Test all modal interactions for proper focus management

## Status

- [X] Issues identified
- [X] Root causes documented
- [ ] grabKeys fix implemented
- [ ] Escape handler bubbling fixed
- [ ] Testing completed
