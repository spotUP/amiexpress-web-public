# Grandmaster Input Fix - 2026-01-13

## Problem

Grandmaster (GMASTER) door was not accepting keyboard input. Players could see the game but could not control it.

## Root Cause

The door was using a **manual PassThrough stream-based input setup** instead of the standard SDK `setupInputHandler` helper function.

### What Was Wrong

```typescript
// WRONG: Manual PassThrough approach
private inputStream: PassThrough;

this.inputStream = new PassThrough();

const screen = createScreen({
  input: this.inputStream,
  output: (data: string) => this.session.bbs.write(data),
});

this.session.bbsSession.doorInputHandler = (data: any) => {
  if (!this.screen.destroyed) {
    const chunk = (typeof data === 'string' || data instanceof Buffer)
      ? data
      : JSON.stringify(data);
    this.inputStream.write(chunk);
  }
};
```

**Problem**: This approach bypassed the proper blessed screen input handling mechanism.

### What Was Needed

Blessed screens need input to be emitted to `screen.program` as 'data' events, not written to a custom stream. The SDK's `setupInputHandler` does this correctly:

```typescript
// From sdk/utils/blessed-helpers.ts
session.bbsSession.doorInputHandler = (data: string) => {
  // Pass input to blessed screen's program
  if (screen.program) {
    screen.program.emit('data', data);  // <-- The correct way
  }
};
```

## Solution

Replaced the manual input setup with the SDK's `setupInputHandler` helper:

```typescript
// CORRECT: Use SDK helper
const screen = createScreen(this.session.bbs, {
  dockBorders: true,
  title: 'GRANDMASTER',
  fullUnicode: false,
  smartCSR: false,
  fastCSR: false,
  focusKeys: false,
});

if (this.session.bbsSession) {
  this.session.bbsSession.inDoorManager = true;
  setupInputHandler(this.session, screen, {
    debug: false,
    debugName: 'GRANDMASTER'
  });
}
```

## Changes Made

1. **Removed** PassThrough stream import
2. **Removed** inputStream property from GrandmasterApp class
3. **Changed** createScreen to pass `this.session.bbs` as first argument
4. **Replaced** manual doorInputHandler setup with `setupInputHandler` call
5. **Added** `removeInputHandler` to imports (for future cleanup if needed)

## Files Changed

- `Doors/grandmaster/app.ts` - Fixed input handling

## Testing Required

1. Start the BBS and launch GMASTER
2. Verify keyboard input works:
   - Arrow keys (left/right) move piece
   - Up arrow / X / Z rotate piece
   - Down arrow soft drop
   - Space hard drop
   - C hold piece
3. Test all game modes (Master, Versus, Sprint)
4. Verify mouse input still works if applicable

## Reference

This pattern is used correctly in:
- `Doors/neo-blessed-showcase/app.ts` (line 134)
- `sdk/utils/blessed-helpers.ts` (setupInputHandler function, line 949-991)

## Lesson Learned

**ALWAYS use SDK helper functions** for input setup in TypeScript doors. The `setupInputHandler` function handles the complex blessed screen input wiring correctly. Manual approaches with PassThrough streams or custom input handlers are likely to fail because they bypass blessed's internal input event system.

## Status

- [X] Root cause identified
- [X] Fix implemented
- [X] Door rebuilt successfully
- [ ] Testing in BBS (user to verify)
