# 2048 Door runDoor Fix (2025-11-13)

## Summary
- The TypeScript 2048 SDK example (`sdk/doors/2048-game`) failed under the new TypeScript door loader because it did not provide the required `runDoor()` export. The BBS runtime therefore aborted execution with "No runDoor() export found".
- Added a proper `runDoor()` wrapper that adapts the existing neo-blessed UI to the socket-based BBS runtime using in-memory streams.

## Implementation Notes
- Swapped the SDK `Door` auto-start for a `runDoor()` export that:
  - Creates PassThrough streams that bridge Socket.IO I/O into the `UIEngine`.
  - Reuses the existing `Game2048` logic and rendering code without changes to gameplay.
  - Cleans up listeners and UI state when the player quits or disconnects.
- Status bar now falls back to `user.username` when `user.name` is not defined to match BBS session objects.

### Files
1. `sdk/doors/2048-game/index.ts`
   - Added PassThrough wiring, exported `runDoor`, and removed the unused `Door` wrapper.

## Testing
- `cd sdk/doors/2048-game && npm run build`
  - TypeScript compile succeeds with the new entry point.
- Did not run an end-to-end BBS session in this environment; once deployed, launch `/2048` from the BBS menu to confirm the loader no longer reports the missing `runDoor()` export.
