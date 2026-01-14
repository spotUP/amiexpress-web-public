# Grandmaster Screen Cleanup Fix - 2026-01-13

## Problem

When launching GMASTER (Grandmaster Tetris), user could see livechat door content in the background, even though livechat wasn't run in the current session.

## Root Cause

Blessed screen buffers from previous doors/sessions were not being cleared when a new door starts. The screen object retains its buffer contents until explicitly cleared.

## Solution

Added screen clearing at the start of the `run()` method:

```typescript
async run(initialMode?: string): Promise<void> {
  // Clear any previous door's screen artifacts
  // This prevents ghosting when switching between doors
  this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
  this.screen.alloc();
  this.screen.render();

  // ... rest of initialization
}
```

**What this does:**
1. `clearRegion()` - Clears the entire screen buffer region
2. `alloc()` - Reallocates clean screen buffers
3. `render()` - Renders the clean screen to terminal

## Why This Happened

The user saw livechat content even though they didn't run livechat because:
- Screen buffers can persist across sessions (backend restart with same terminal)
- Previous door didn't properly clean up its screen on exit
- New door (gmaster) didn't clear screen on startup
- Result: Old screen content "ghosts" behind new door

## Best Practice

**All TypeScript doors should clear the screen on startup** to prevent this issue:

```typescript
async run(): Promise<void> {
  // Always clear screen first
  this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
  this.screen.alloc();
  this.screen.render();

  // Then proceed with door logic
  // ...
}
```

This should become a standard pattern in door initialization.

## Files Changed

- `Doors/grandmaster/app.ts` - Added screen clear on startup

## Testing

After restarting backend:
1. Launch GMASTER
2. Verify clean screen (no ghosting from other doors)
3. Exit GMASTER, run another door, then run GMASTER again
4. Verify no ghosting

## Status

- [X] Root cause identified
- [X] Fix implemented
- [X] Door rebuilt
- [ ] Testing (user to verify)

## Related

This is a general issue that could affect any TypeScript door. Consider adding this pattern to:
- SDK door template
- `createScreen()` helper (automatic clearing)
- Door development documentation
