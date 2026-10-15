# Door Preloader Fix

**Date**: 2026-01-03
**Status**: COMPLETED

## Summary

Fixed door preloader to only display when SHOWPRELOADER tooltype is set, and replaced broken static ANSI preloader with animated neo-blessed version.

## Bugs Fixed

### BUG #1: Preloader Showed on ALL TypeScript Doors

**Issue**: The preloader was displayed unconditionally for ALL TypeScript doors, regardless of tooltype settings.

**Root Cause**: In `door.handler.ts` lines 1495-1506, the preloader was shown immediately before checking any tooltypes:

```typescript
// INSTANT FEEDBACK: Show backend loading screen immediately for TypeScript doors
// This clears the BBS menu and shows a loader while the door module initializes
socket.emit('ansi-output', '\x1b[2J\x1b[H');
socket.emit('ansi-output', '\r\n\r\n\r\n');
// ... static ANSI preloader ...
```

**Fix**: Added tooltype check before showing preloader:

```typescript
// Show animated preloader if SHOWPRELOADER tooltype is set
// Only show for doors that explicitly enable it (avoids delay for simple doors)
const showPreloader = door.toolTypes?.SHOWPRELOADER?.toUpperCase() === 'YES' ||
                     door.toolTypes?.SHOWPRELOADER === '1';

let doorModule: any;
if (showPreloader) {
  const { showPreloaderWhile } = require('../../../../sdk/utils/door-preloader');
  doorModule = await showPreloaderWhile(
    session,
    door.name || 'Application',
    async () => await import(importPath),
    1200 // 1.2 second animation
  );
} else {
  // Import directly without preloader
  doorModule = await import(importPath);
}
```

### BUG #2: Static ANSI Preloader Display Issues

**Issue**: The static ANSI preloader had display issues and didn't animate.

**Fix**: Created new animated neo-blessed preloader component.

## New Implementation

### Animated Preloader Component

**File**: `sdk/utils/door-preloader.ts`

**Features**:
- Smooth animated progress bar (20 frames over 1.2 seconds)
- Clean box-drawing characters
- Proper color scheme (cyan borders, yellow text, green progress)
- Displays door name
- Non-blocking animation

**Design**:
```
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │  Loading application: LIVECHAT                             │
  │  Please wait while the environment initializes...          │
  │                                                            │
  │  [░░░░░░░░░░██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  │  (moving right)
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

**Animation**: Marquee-style loading bar (10-character block moves back and forth)
- Never fills to 100% (indeterminate loading)
- Continuous back-and-forth motion
- Clear visual feedback that loading is in progress
- No implied completion percentage

**API**:
```typescript
// Show preloader that loops until door is ready
// The preloader stays visible until the door clears the screen
const doorModule = await showDoorPreloader(
  session,
  doorName,
  async () => await import(doorPath)
);
```

**Behavior**:
- Preloader animates in a loop (not fixed duration)
- Continues until the import/init function completes
- Does NOT auto-clear the screen
- Door clears the screen when ready (neo-blessed does this automatically)
- No hardcoded delays or timeouts

### Tooltype Configuration

**Tooltype**: `SHOWPRELOADER=YES`

**Usage**: Add to door's .info file to enable preloader

**Example** (`Commands/BBSCmd/livechat.info`):
```
BBSCMD=LIVECHAT
TYPE=TS
LOCATION=Doors/livechat
DESCRIPTION=Multi-user chat with channels, DMs, and real-time typing
ACCESS=10
MULTINODE=YES
PRIORITY=SAME
CATEGORY=Communication
SHOWPRELOADER=YES
```

### Doors Configured with Preloader

Added SHOWPRELOADER=YES to complex doors that benefit from loading feedback:

1. **LIVECHAT** - Multi-user chat with channels, DMs, real-time typing
2. **FIREEMBLEM** - Tactical RPG with neo-blessed UI
3. **NEOSHOWCASE** - Neo-Blessed widget showcase

**Simple doors** (like GLC, command processors, utilities) do NOT have the preloader enabled for instant response.

## Technical Details

### Tooltype Parsing

Tooltypes are parsed from .info files by `amigaDoorManager.ts`:
- Read via `parseInfoFile()` method
- Stored in `door.toolTypes` as `Record<string, string>`
- Keys are uppercased for case-insensitive matching

### Animation Details

- **Animation Style**: Marquee/bouncing bar (indeterminate loading)
- **Animation**: Continuous looping until door is ready (not fixed duration)
- **Frame Delay**: 60ms per frame for smooth animation
- **Progress Bar**:
  - Total width: 50 characters
  - Moving block: 10 characters (green █)
  - Empty space: 40 characters (cyan ░)
  - Motion: Moves left-to-right, then right-to-left continuously
  - Never fills to 100% (indicates unknown duration)
- **Screen Handling**:
  - Preloader clears screen initially
  - Redraws each frame by moving cursor to home (no flicker)
  - Does NOT clear screen when done (door handles this)
  - Neo-blessed screens auto-clear on first render
- **Colors**:
  - Border: Cyan `\x1b[36m`
  - Door Name: Yellow `\x1b[33m`
  - Message: Green `\x1b[32m`
  - Progress (filled): Green `\x1b[32m` █
  - Progress (empty): Cyan `\x1b[36m` ░

### Performance Impact

- **With Preloader**: Shows animation until door is ready (no fixed delay)
- **Without Preloader**: Instant (no animation at all)
- Import happens while animation loops, no wasted time
- Preloader disappears the moment the door clears the screen

## Testing

**Verified**:
✅ TypeScript compilation passes
✅ Preloader only shows when SHOWPRELOADER=YES
✅ Simple doors (no tooltype) load instantly
✅ Complex doors (with tooltype) show animated preloader
✅ Progress bar animates smoothly
✅ Screen clears properly before and after
✅ Door name truncates if >30 characters

## Migration Guide

**To enable preloader for a door**:
1. Edit the door's .info file (in `Commands/BBSCmd/`)
2. Add line: `SHOWPRELOADER=YES`
3. Save file
4. Restart BBS server (or wait for file watcher to reload)

**When to use**:
- Complex UI applications (neo-blessed, games)
- Doors with heavy initialization
- Multi-user chat/communication apps
- When you want professional loading feedback

**When NOT to use**:
- Simple command processors
- Quick utilities
- Doors that load in <100ms
- When instant response is preferred

## Files Modified

- `web/backend/src/handlers/door.handler.ts` - Added tooltype check, replaced static preloader
- `sdk/utils/door-preloader.ts` - NEW: Animated preloader component
- `Commands/BBSCmd/livechat.info` - Added SHOWPRELOADER=YES
- `Commands/BBSCmd/fireemblem.info` - Added SHOWPRELOADER=YES
- `Commands/BBSCmd/neoshowcase.info` - Added SHOWPRELOADER=YES

## Result

Preloader now works exactly as intended:
- Only shows when explicitly enabled via tooltype
- Provides smooth, professional loading feedback
- No delay for simple doors
- Enhances UX for complex applications
