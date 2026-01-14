# Grandmaster Input Cleanup Fix - 2026-01-13

## Problem

User reported: "i can't type in the bbs when i exit gmaster"

After exiting GMASTER, the BBS terminal was unresponsive - no keyboard input worked.

## Root Cause

**File**: `Doors/grandmaster/app.ts`

### Setup (line 171)
```typescript
// Enable global keyboard capture for proper input handling
(screen.program as any).grabKeys = true;
```

### Quit method (line 2105-2126) - MISSING CLEANUP
```typescript
private async quit(): Promise<void> {
  if (this.session.bbs?.disableGameMode) {
    this.session.bbs.disableGameMode();
  }

  // ... network cleanup ...

  if (this.session.bbsSession) {
    this.session.bbsSession.inDoorManager = false;
    delete this.session.bbsSession.doorInputHandler;
  }

  // ❌ grabKeys NEVER DISABLED!
  this.screen.destroy();
}
```

**What `grabKeys` does:**
- Enables raw keyboard capture mode in blessed
- All keyboard events go directly to the screen, bypassing normal terminal input
- Must be explicitly disabled before exit or terminal remains in raw mode
- BBS can't receive input because terminal is still in raw capture mode

**Why this happened:**
We added `grabKeys = true` to fix the input issues (Session 2), but forgot to disable it on exit.

## Solution

Added proper cleanup in `quit()` method:

```typescript
private async quit(): Promise<void> {
  // Disable game mode before exiting
  if (this.session.bbs?.disableGameMode) {
    this.session.bbs.disableGameMode();
    console.log('[GRANDMASTER] Game mode disabled');
  }

  // Disable global keyboard capture (restore normal terminal input)
  if (this.screen?.program) {
    (this.screen.program as any).grabKeys = false;
    console.log('[GRANDMASTER] grabKeys disabled');
  }

  // Disable mouse events
  if (this.screen?.program) {
    this.screen.program.disableMouse();
  }

  // Disconnect from network to prevent socket leaks
  if (this.network) {
    this.network.disconnect();
    console.log('[GRANDMASTER] Network disconnected');
  }

  // Clean up input handler
  if (this.session.bbsSession) {
    this.session.bbsSession.inDoorManager = false;
    delete this.session.bbsSession.doorInputHandler;
  }

  // Destroy screen (this will cleanup blessed state)
  this.screen.destroy();
}
```

**Changes:**
1. Set `grabKeys = false` to restore normal terminal input
2. Call `disableMouse()` to cleanup mouse event handlers
3. Added console.log for debugging
4. Added null checks for safety

**Order matters:**
1. Disable game mode (BBS-level)
2. Disable grabKeys (blessed-level)
3. Disable mouse (blessed-level)
4. Cleanup network
5. Cleanup input handler
6. Destroy screen

This ensures the terminal is fully restored to normal state before returning to BBS.

## Testing Required

**RESTART BACKEND FIRST:**
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

Then test:
1. Launch GMASTER
2. Navigate to main menu
3. Press ESC or Q to quit
4. **Verify you can type in BBS** - commands, chat, etc. should all work
5. Run GMASTER again - should work normally
6. Quit again - verify input still works

## Related Issues

This is a **critical** bug that affects ALL neo-blessed doors using grabKeys:
- If any door enables `grabKeys`, it MUST disable it on exit
- Otherwise BBS input breaks for all subsequent activity
- This should be documented in SDK best practices

## Files Changed

- `Doors/grandmaster/app.ts` - Added grabKeys/mouse cleanup in quit() method (lines 2112-2121)

## Status

- [X] Root cause identified (grabKeys not disabled)
- [X] Fix implemented (disable grabKeys + mouse on quit)
- [X] Build successful
- [ ] Testing (user to verify BBS input works after exit)

## Lessons Learned

**Door cleanup checklist:**
1. ✅ Disable game mode
2. ✅ Disable grabKeys
3. ✅ Disable mouse events
4. ✅ Disconnect network
5. ✅ Remove input handlers
6. ✅ Destroy screen

**General principle:** Any feature you enable on startup MUST be disabled on exit. Raw input modes are particularly critical - failing to restore them breaks the entire terminal.
