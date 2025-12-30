# Game Mode and Mouse Events for TypeScript Doors

This document explains how to enable smooth keyboard input and mouse support in TypeScript doors using the BBS API.

## Overview

By default, TypeScript doors receive keyboard input through the standard terminal path, which is subject to OS key repeat delays (~300ms before repeat starts). For interactive UI frameworks like neo-blessed, or games requiring responsive input, you need to enable **game mode** and **mouse events**.

## Enabling Game Mode

Game mode bypasses OS key repeat delays and provides:
- Immediate key response with no initial delay
- Fast key repeat (33ms interval = ~30 keys/second)
- Raw keydown/keyup events for multi-key support

### How to Enable

In your door's initialization, call `bbs.enableGameMode()`:

```typescript
export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs } = session;

  // Enable game mode for smooth keyboard input
  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  // ... rest of door initialization
}
```

### When to Use Game Mode

- **DO use** for:
  - Interactive UI frameworks (neo-blessed, blessed)
  - Games requiring responsive controls
  - Any door where holding arrow keys should scroll smoothly

- **DON'T use** for:
  - Simple menu-driven doors using `bbs.getKey()` prompts
  - Doors that only need single key presses
  - Text input forms

## Enabling Mouse Events

Mouse events allow your door to receive clicks, drags, and wheel scroll events.

### How to Enable

Call `bbs.enableMouseEvents()` in your door initialization:

```typescript
export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs } = session;

  // Enable mouse events for click/wheel support
  if (bbs?.enableMouseEvents) {
    bbs.enableMouseEvents();
  }

  // ... rest of door initialization
}
```

### For Neo-Blessed Doors

Neo-blessed doors need BOTH the screen's mouse mode AND the BBS API mouse events:

```typescript
// Create screen
const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  output: (data: string) => bbs.write(data),
});

// CRITICAL: Set BOTH flags for input routing (see TYPESCRIPT_DOOR_TROUBLESHOOTING.md)
session.bbsSession.inDoorManager = true;  // Required for input to reach your door
session.bbsSession.doorInputHandler = (data: string) => {
  screen._handleData(data);
};

// Enable mouse on BOTH screen (ANSI) and BBS API (Socket.IO)
screen.enableMouse();
if (bbs?.enableMouseEvents) {
  bbs.enableMouseEvents();
}
```

### Mouse Event Types

The door receives these JSON events through the input handler:

```typescript
// Mouse click
{ type: 'mouse-click', x: 10, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse drag (button held while moving)
{ type: 'mouse-drag', x: 11, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse up (button released)
{ type: 'mouse-up', x: 11, y: 5, button: 0, shift: false, ctrl: false, alt: false }

// Mouse wheel
{ type: 'mouse-wheel', x: 10, y: 5, deltaY: -100, shift: false, ctrl: false, alt: false }
// deltaY < 0 = scroll up, deltaY > 0 = scroll down

// Mouse hover (movement without button)
{ type: 'mouse-hover', x: 12, y: 6, shift: false, ctrl: false, alt: false }
```

Button values: 0 = left, 1 = middle, 2 = right

## Complete Example

Here's a complete neo-blessed door with game mode and mouse support:

```typescript
import * as blessed from '@amiexpress/bbs-door-sdk/engines/ui/neo-blessed';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

export async function runDoor(session: DoorSession): Promise<void> {
  const { bbs, user } = session;

  // Enable game mode for smooth keyboard input
  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'My Door',
    output: (data: string) => bbs.write(data),
  });

  // Set up input routing
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Enable mouse on both screen and BBS API
  screen.enableMouse();
  if (bbs?.enableMouseEvents) {
    bbs.enableMouseEvents();
  }

  // Create a scrollable list
  const list = blessed.list({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    items: ['Item 1', 'Item 2', 'Item 3', /* ... */],
    keys: true,
    mouse: true,
    scrollbar: { ch: ' ', style: { bg: 'cyan' } },
    style: {
      selected: { bg: 'blue', fg: 'white' },
    },
  });

  list.focus();

  // Handle selection
  list.on('select', (item, index) => {
    // Handle item selection
  });

  // Handle quit
  screen.key(['escape', 'q', 'C-c'], () => {
    screen.destroy();
  });

  // Initial render
  screen.render();

  // Wait for door to close
  return new Promise<void>((resolve) => {
    screen.once('destroy', resolve);
  });
}
```

## Technical Details

### How Game Mode Works

1. Door calls `bbs.enableGameMode()`
2. Backend emits `game-mode` event to frontend
3. Frontend switches to raw keydown/keyup mode:
   - Blocks xterm.js from handling keys
   - Captures keydown events via window listener
   - Immediately sends `key-down` event to backend
   - Starts key repeat timer (33ms interval)
   - On keyup, stops repeat and sends `key-up` event
4. Backend converts key names to ANSI sequences (e.g., `ArrowDown` → `\x1b[B`)
5. Door receives ANSI sequences through input handler

### How Mouse Events Work

1. Door calls `bbs.enableMouseEvents()`
2. Backend sets `session.mouseEventsEnabled = true`
3. Frontend captures mouse events via native event listeners
4. Frontend sends events via Socket.IO (`mouse-click`, `mouse-wheel`, etc.)
5. Backend forwards as JSON to `session.doorInputHandler`
6. Neo-blessed's `_handleData` parses JSON and emits blessed events

### Key Repeat Timing

- Initial key press: Sent immediately
- Repeat starts: After first 33ms interval
- Repeat rate: 33ms (~30 keys/second)
- No initial delay (unlike OS default ~300ms)

## Troubleshooting

### Keys not responding or slow
- Ensure `bbs.enableGameMode()` is called
- Check browser console for `[GameMode] RECEIVED: ENABLED`

### Mouse wheel not working
- Ensure `bbs.enableMouseEvents()` is called
- For neo-blessed: also call `screen.enableMouse()`
- Check backend log for `mouseEnabled= true`

### Mouse clicks not registering
- Ensure input handler is set: `session.bbsSession.doorInputHandler = ...`
- For neo-blessed: ensure handler calls `screen._handleData(data)`
