# Card-Lobby Browser Create Button Fix

## Issue

Create button in browser mode was not working - neither mouse clicks nor 'c' keyboard shortcut.

## Root Cause Analysis

**Conflicting Key Handlers**: Two 'c' key handlers were registered on the same screen:

1. **Card-lobby door handler** (lines 304-311 in index.ts):
   ```typescript
   this.screen.key(['c'], () => {
     if (this.modalActive) return;
     if (this.viewMode === 'table') {
       this.triggerCall();
     } else if (this.viewMode === 'lobby') {
       this.runAction(() => this.createTableFlow());
     }
   });
   ```

2. **MultiplayerLobby browser handler** (line 1101 in multiplayer-lobby.ts):
   ```typescript
   this.parent.key(['c'], () => void this.browserCreateTable());
   ```

### Why It Failed

- `viewMode` had only two states: `'lobby'` and `'table'`
- Browser mode started with `viewMode === 'lobby'`
- When user pressed 'c', BOTH handlers fired
- Door's handler ran `createTableFlow()` in wrong context (browser mode active)
- Browser widget's handler also tried to fire but was blocked by door's handler

## Solution

**Added third viewMode state: `'browser'`**

### Changes Made

1. **Extended viewMode type** (line 178):
   ```typescript
   private viewMode: 'lobby' | 'table' | 'browser' = 'lobby';
   ```

2. **Set browser mode in showBrowser()** (line 507):
   ```typescript
   private async showBrowser(): Promise<void> {
     // Set viewMode to browser to prevent key conflicts
     this.viewMode = 'browser';
     // ...
   }
   ```

3. **Updated key handler guards** to exclude browser mode:
   - 'c' handler (line 305): `if (this.modalActive || this.viewMode === 'browser') return;`
   - 'r' handler (line 314): `if (this.modalActive || this.viewMode === 'browser') return;`
   - 'j' handler (line 323): Allow in both 'lobby' and 'browser' modes
   - 'o' handler (line 328): Allow in both 'lobby' and 'browser' modes

### How It Works Now

1. Browser starts with `viewMode = 'browser'`
2. Door's 'c' handler exits early due to `viewMode === 'browser'` guard
3. Only browser widget's 'c' handler fires
4. Browser widget emits `'browser:create-table'` event
5. Door's event handler shows game/stakes dialogs
6. Create flow completes successfully

## Testing Checklist

- [x] Build succeeds with no errors
- [ ] Press 'c' in browser - create dialog appears
- [ ] Click create button - create dialog appears
- [ ] Press 'j' in browser - join works
- [ ] Press 'r' in browser - refresh works
- [ ] Exit door - BBS input still works
- [ ] Transition to table - table keys work ('c' = call, 'r' = raise)

## Files Modified

- `Doors/card-lobby/index.ts`:
  - Extended `viewMode` type to include `'browser'`
  - Set `viewMode = 'browser'` at start of `showBrowser()`
  - Added `viewMode === 'browser'` guards to 'c' and 'r' key handlers
  - Updated 'j' and 'o' handlers to allow browser mode

## Related Issues

This fix also resolves potential conflicts with:
- 'r' key (refresh in browser vs raise at table)
- Any future keyboard shortcuts added to browser mode

## Design Pattern

This demonstrates the importance of **explicit state management** in multi-mode UIs:

- ❌ **WRONG**: Implicit state (no browser viewMode, rely on widget presence)
- ✅ **CORRECT**: Explicit state (`viewMode = 'browser'`) with proper guards

Benefits:
- Clear intent in code
- Easy to debug
- Prevents subtle timing bugs
- Makes state transitions explicit

## Commit

Fixed in commit: [to be filled]

## Author

Fixed by Claude Code (Sonnet 4.5) - 2026-01-22
