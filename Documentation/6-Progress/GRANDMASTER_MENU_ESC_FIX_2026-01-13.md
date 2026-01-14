# Grandmaster Menu ESC Key Lockup Fix - 2026-01-13

## Problem

Pressing ESC in the gmaster main menu causes the game to lock up completely. The menu becomes unresponsive and the user cannot exit or navigate.

## Root Cause

**File**: `Doors/grandmaster/ui/menu.ts` line 210-223

The `MenuScreen.show()` method returns a Promise that only resolves when a menu item is selected:

```typescript
async show(): Promise<MenuSelection> {
  return new Promise((resolve) => {
    // ... setup menu ...

    menu.on('select', (_item: any, index: number) => {
      // Clean up and resolve
      resolve(selection);
    });

    // Handle quit key
    menu.key(['q', 'Q'], () => {
      menu.emit('select', null, 12);  // Trigger quit
    });

    // Handle F1 key
    menu.key(['f1'], () => {
      menu.emit('select', null, 11);  // Trigger manual
    });

    // ❌ NO ESC KEY HANDLER!
  });
}
```

**What happens when ESC is pressed:**
1. Blessed list widget closes or loses focus
2. No key handler catches the ESC event
3. Promise never resolves
4. Code in `app.ts:294` hangs forever: `const selection = await menuScreen.show();`
5. Game appears locked up

## Solution

Added ESC key handler that treats ESC the same as 'Q' (quit):

```typescript
// Handle ESC key - same as quit
menu.key(['escape'], () => {
  menu.emit('select', null, 12);  // Trigger quit selection (index 12)
});
```

**Why this works:**
- Pressing ESC now emits a 'select' event with index 12 (the quit option)
- Promise resolves with 'quit' selection
- App properly handles quit: `case 'quit': await this.quit(); return;` (app.ts:330-332)
- User can exit cleanly

**Also updated instructions** to show ESC is supported:
```typescript
content: 'Arrow Keys: Navigate  |  Enter: Select  |  ESC/Q: Quit',
```

## Why ESC = Quit Makes Sense

**Standard UX patterns:**
- ESC in main menu = Exit application (games, desktop apps)
- Consistent with other modals where ESC closes without action
- Users expect ESC to "go back" or "exit" from top-level screens

**Alternatives considered:**
1. ❌ Do nothing - Bad UX, ignoring ESC is confusing
2. ❌ Return to previous screen - There is no previous screen, menu is top-level
3. ✅ Quit application - Standard behavior for main menu ESC

## Files Changed

- `Doors/grandmaster/ui/menu.ts` - Added ESC key handler (line 215-218), updated instructions (line 170)

## Testing Required

**RESTART BACKEND FIRST** to load new door bundle:
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

Then test:
1. Launch GMASTER
2. Wait for main menu to appear
3. Press ESC - should cleanly exit to BBS (not lock up)
4. Verify 'Q' still works to quit
5. Verify Enter still selects menu items
6. Verify arrow keys still navigate

## Status

- [X] Root cause identified (missing ESC handler)
- [X] Fix implemented (ESC = quit)
- [X] Instructions updated
- [X] Build successful
- [ ] Testing (user to verify ESC exits cleanly)
