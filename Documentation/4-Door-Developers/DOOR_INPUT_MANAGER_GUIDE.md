# Door Input Manager Guide

## Overview

`DoorInputManager` is a centralized class for managing door input state. It encapsulates all the complexity of BBS game mode, blessed keyboard capture, mouse events, and input handlers into a single, easy-to-use API.

## Why DoorInputManager?

### The Problem

Before DoorInputManager, door input handling was complex and error-prone:

**7 layers of input state:**
1. BBS game mode (`enableGameMode` / `disableGameMode`)
2. BBS session flag (`inDoorManager`)
3. Blessed keyboard capture (`grabKeys`)
4. Blessed mouse events (`enableMouse` / `disableMouse`)
5. Input handler (`doorInputHandler`)
6. Setup function (`setupInputHandler`)
7. Cleanup function (`removeInputHandler`)

**Common bugs:**
- Forgetting to disable `grabKeys` → BBS input breaks after door exit
- Forgetting to disable mouse → Memory leaks
- Wrong cleanup order → Terminal state corrupted
- Missing cleanup steps → "Can't type in BBS" bugs

### The Solution

DoorInputManager provides **one enable, one disable** - that's it.

```typescript
// Enable all input systems
this.inputManager.enable();

// Disable all input systems (automatic cleanup)
this.inputManager.disable();
```

**Benefits:**
- ✅ Can't forget cleanup steps
- ✅ Correct order guaranteed (enable: 1-5, disable: 5-1)
- ✅ Type-safe configuration
- ✅ Optional debug logging
- ✅ Suspend/resume for modals
- ✅ Auto-cleanup on destroy

## Basic Usage

### 1. Import

```typescript
import {
  createScreen,
  DoorInputManager,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
```

### 2. Create in Constructor

```typescript
class MyDoor {
  private inputManager: DoorInputManager;
  private screen: Screen;
  private session: any;

  constructor(session: any) {
    this.session = session;
    this.screen = createScreen(session.bbs, { /* options */ });

    // Create input manager
    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: true,   // Raw keyboard events (games, real-time input)
      enableGrabKeys: true,   // Global keyboard capture (all keys)
      enableMouse: true,      // Mouse events
      debug: false,           // Console logging
      debugName: 'MyDoor'     // Name for log messages
    });
  }
}
```

### 3. Enable on Start

```typescript
async run(): Promise<void> {
  // Enable door input
  this.inputManager.enable();

  // Your door code here...
  await this.showMenu();
}
```

### 4. Disable on Exit

```typescript
async quit(): Promise<void> {
  // Disable door input (restores BBS state)
  this.inputManager.disable();

  // Cleanup other resources
  this.screen.destroy();
}
```

## Configuration Options

### DoorInputOptions

```typescript
interface DoorInputOptions {
  /**
   * Enable BBS game mode (raw keyboard events, bypass line buffering)
   * Required for real-time input like games
   * Default: true
   */
  enableGameMode?: boolean;

  /**
   * Enable blessed grabKeys (global keyboard capture)
   * Required for doors that need to capture all keys (arrows, function keys, etc.)
   * CRITICAL: Must be disabled on exit or BBS input breaks
   * Default: true
   */
  enableGrabKeys?: boolean;

  /**
   * Enable blessed mouse events
   * Required for doors with mouse interaction
   * Default: true
   */
  enableMouse?: boolean;

  /**
   * Enable debug logging
   * Default: false
   */
  debug?: boolean;

  /**
   * Debug name for log messages
   * Default: 'DoorInputManager'
   */
  debugName?: string;
}
```

## Advanced Features

### Suspend/Resume (For Modals)

If you have modal dialogs that need to temporarily disable input:

```typescript
// Show modal - suspend input
this.inputManager.suspend();
await this.showModal();

// Modal closed - resume input
this.inputManager.resume();
```

**Note:** `suspend()` only disables `grabKeys`, keeping game mode active. This is perfect for modal dialogs that use their own input handling.

### Check State

```typescript
if (this.inputManager.isEnabled()) {
  console.log('Input is enabled');
}
```

### Debug Logging

Enable debug logging to see exactly what's happening:

```typescript
this.inputManager = new DoorInputManager(session, screen, {
  debug: true,
  debugName: 'MyDoor'
});

// When enable() is called:
// [MyDoor] Enabling door input...
// [MyDoor] ✓ Game mode enabled
// [MyDoor] ✓ inDoorManager = true
// [MyDoor] ✓ grabKeys enabled
// [MyDoor] ✓ Mouse events enabled
// [MyDoor] ✓ Input handler connected
// [MyDoor] Door input enabled

// When disable() is called:
// [MyDoor] Disabling door input...
// [MyDoor] ✓ Input handler removed
// [MyDoor] ✓ Mouse events disabled
// [MyDoor] ✓ grabKeys disabled
// [MyDoor] ✓ inDoorManager = false
// [MyDoor] ✓ Game mode disabled
// [MyDoor] Door input disabled
```

## Complete Example (GMASTER)

See `Doors/grandmaster/app.ts` for a complete real-world example:

```typescript
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export class GrandmasterApp {
  private inputManager: DoorInputManager;
  private screen: Screen;
  private session: any;

  constructor(session: any) {
    this.session = session;
    this.screen = createScreen(session.bbs, {
      title: 'GRANDMASTER',
      smartCSR: false,
      fastCSR: false,
      focusKeys: false,
    });

    // Create input manager
    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: true,
      enableGrabKeys: true,
      enableMouse: true,
      debug: false,
      debugName: 'GRANDMASTER'
    });
  }

  async run(): Promise<void> {
    // Clear screen
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();
    this.screen.render();
    await this.sleep(200); // Wait for clear at modem speeds

    // Enable input
    this.inputManager.enable();

    // Run door
    await this.showAttractMode();
    await this.showMainMenu();
  }

  async quit(): Promise<void> {
    // Disable input (automatic cleanup)
    this.inputManager.disable();

    // Cleanup other resources
    if (this.network) {
      this.network.disconnect();
    }

    this.screen.destroy();
  }
}
```

## Testing Checklist

After implementing DoorInputManager, test thoroughly:

### Exit Test
1. ✅ Launch door
2. ✅ Navigate to menu
3. ✅ Press ESC or Q to quit
4. ✅ **Immediately try typing in BBS** - commands should work
5. ✅ Chat should work
6. ✅ All BBS features should work

### Multiple Entry Test
1. ✅ Enter door
2. ✅ Exit door
3. ✅ Enter door again - should work
4. ✅ Exit door again - BBS input should still work
5. ✅ Repeat 5+ times - input must work every time

### Modal Test (if using suspend/resume)
1. ✅ Open modal
2. ✅ Verify input works in modal
3. ✅ Close modal
4. ✅ Verify input works in main door
5. ✅ Exit door - verify BBS input works

## Migration Guide

### Before (Manual Input Handling)

```typescript
class OldDoor {
  constructor(session: any) {
    this.screen = createScreen(session.bbs, { /* ... */ });

    // Manual setup
    (this.screen.program as any).grabKeys = true;
    if (session.bbsSession) {
      session.bbsSession.inDoorManager = true;
      setupInputHandler(session, this.screen);
    }
  }

  async run() {
    if (this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
    }
    if (this.session.bbs?.enableMouseEvents) {
      this.session.bbs.enableMouseEvents();
    }
    // ... door code ...
  }

  async quit() {
    // Manual cleanup (easy to forget steps!)
    if (this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
    }
    if (this.screen?.program) {
      (this.screen.program as any).grabKeys = false;
      this.screen.program.disableMouse();
    }
    if (this.session.bbsSession) {
      this.session.bbsSession.inDoorManager = false;
      delete this.session.bbsSession.doorInputHandler;
    }
    this.screen.destroy();
  }
}
```

### After (DoorInputManager)

```typescript
class NewDoor {
  private inputManager: DoorInputManager;

  constructor(session: any) {
    this.screen = createScreen(session.bbs, { /* ... */ });

    // One line
    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: true,
      enableGrabKeys: true,
      enableMouse: true,
    });
  }

  async run() {
    // One line
    this.inputManager.enable();
    // ... door code ...
  }

  async quit() {
    // One line (can't forget cleanup!)
    this.inputManager.disable();
    this.screen.destroy();
  }
}
```

**Migration steps:**
1. Add `DoorInputManager` import
2. Create `inputManager` in constructor
3. Remove manual input setup from constructor/createScreen
4. Replace manual enable code with `inputManager.enable()`
5. Replace manual cleanup code with `inputManager.disable()`
6. Test thoroughly

## Common Patterns

### Pattern 1: Simple Door

```typescript
constructor(session: any) {
  this.screen = createScreen(session.bbs, {});
  this.inputManager = new DoorInputManager(session, this.screen);
}

async run() {
  this.inputManager.enable();
  await this.showMenu();
}

async quit() {
  this.inputManager.disable();
  this.screen.destroy();
}
```

### Pattern 2: Door with Debug Logging

```typescript
constructor(session: any) {
  this.screen = createScreen(session.bbs, {});
  this.inputManager = new DoorInputManager(session, this.screen, {
    debug: true,
    debugName: 'MyDoor'
  });
}
```

### Pattern 3: Door with Modals

```typescript
async showModal() {
  this.inputManager.suspend();  // Disable grabKeys temporarily

  const modal = createModal({ /* ... */ });
  await modal.show();

  this.inputManager.resume();   // Re-enable grabKeys
}
```

### Pattern 4: Text-Only Door (No Game Mode)

```typescript
constructor(session: any) {
  this.screen = createScreen(session.bbs, {});
  this.inputManager = new DoorInputManager(session, this.screen, {
    enableGameMode: false,  // Disable raw keyboard mode
    enableGrabKeys: true,
    enableMouse: true,
  });
}
```

## Troubleshooting

### Issue: "Can't type in BBS after exiting door"

**Cause:** `inputManager.disable()` not called, or called too early

**Fix:**
```typescript
async quit() {
  this.inputManager.disable();  // MUST be called
  this.screen.destroy();
}
```

### Issue: "Input doesn't work in door"

**Cause:** `inputManager.enable()` not called

**Fix:**
```typescript
async run() {
  this.inputManager.enable();  // MUST be called before input
  // ... rest of door ...
}
```

### Issue: "Modal input doesn't work"

**Cause:** `grabKeys` still enabled, capturing all input

**Fix:**
```typescript
async showModal() {
  this.inputManager.suspend();  // Temporarily disable grabKeys
  await modal.show();
  this.inputManager.resume();   // Re-enable grabKeys
}
```

### Issue: "Input works once, then breaks"

**Cause:** `enable()` called multiple times without matching `disable()`

**Fix:** Only call `enable()` once at door start, `disable()` once at door exit

## Best Practices

1. **Always create in constructor** - Early initialization prevents state issues
2. **Enable once, disable once** - Don't call multiple times
3. **Disable before screen.destroy()** - Cleanup input state first
4. **Use suspend/resume for modals** - Not enable/disable
5. **Enable debug during development** - See exactly what's happening
6. **Test exit thoroughly** - BBS input MUST work after exit

## Related Documentation

- `CLAUDE.md` - Rule 16: NEO-BLESSED DOOR INPUT CLEANUP
- `Documentation/6-Progress/GRANDMASTER_INPUT_CLEANUP_FIX_2026-01-13.md` - Real-world bug example
- `sdk/utils/door-input-manager.ts` - Source code
- `Doors/grandmaster/app.ts` - Complete example

## Status

- ✅ SDK implementation complete
- ✅ GMASTER migrated as example
- ✅ Documentation complete
- ✅ Rule 16 added to CLAUDE.md
- 🔄 Other doors should migrate gradually

---

## Merged from Input Cleanup Checklist for TypeScript Blessed Doors

### ⚠️ CRITICAL: The #1 Cause of "BBS Input Broken After Door Exit"

**EVERY blessed UI door MUST use `DoorInputManager` or BBS input will break when the door exits.**

---


### Quick Checklist

Before releasing your door, verify:

- ✅ Imported `DoorInputManager` from `@amiexpress/bbs-door-sdk/utils/blessed-helpers`
- ✅ Created `inputManager` instance in constructor/setup
- ✅ Called `inputManager.enable()` after creating screen
- ✅ Called `inputManager.disable()` BEFORE `screen.destroy()` in cleanup
- ✅ Tested exit → immediate typing in BBS → works
- ✅ Tested exit → run door again → works
- ✅ Tested 5+ exit/re-enter cycles → BBS input always works

---


### The Problem

Input handling has 7+ layers that must be set up AND torn down:

1. BBS game mode (`enableGameMode` / `disableGameMode`)
2. BBS session flag (`inDoorManager = true/false`)
3. Blessed keyboard capture (`grabKeys = true/false`)
4. Blessed mouse events (`enableMouse()` / `disableMouse()`)
5. BBS mouse events flag (`mouseEventsEnabled = true/false`)
6. Input handler registration (`doorInputHandler`)
7. Input handler cleanup (`delete doorInputHandler`)

**Missing even ONE cleanup step = broken BBS input.**

---


### The Solution: DoorInputManager

```typescript
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

class MyDoor {
  private inputManager!: DoorInputManager;

  async run() {
    // 1. Create screen
    this.screen = createScreen(this.session.bbs, { ... });

    // 2. Create input manager
    this.inputManager = new DoorInputManager(this.session, this.screen, {
      enableGameMode: false,  // Blessed UI mode (true for ncurses games)
      enableGrabKeys: false,  // Blessed focus system (true for games)
      enableMouse: true,      // Enable mouse events
      debug: false,
      debugName: 'MyDoor'
    });

    // 3. Enable input
    this.inputManager.enable();

    // ... door logic ...
  }

  cleanup() {
    // CRITICAL: Disable input FIRST (before screen.destroy)
    if (this.inputManager) {
      this.inputManager.disable();
    }

    if (this.screen) {
      this.screen.destroy();
    }
  }
}
```

---


### Test Procedure

Run this test BEFORE committing your door:

```bash
# 1. Start servers
./dev/scripts/start-servers.sh

# 2. Connect to BBS
telnet localhost 2323

# 3. Test sequence (5 times)
Run your door → Exit cleanly → Type in BBS prompt (should work!)
→ Run door again → Exit → Type (should work!)
→ Run door again → Exit → Type (should work!)
→ Run door again → Exit → Type (should work!)
→ Run door again → Exit → Type (should work!)

# 4. If typing doesn't work after exit = BROKEN CLEANUP!
```

**If BBS input is broken:** You forgot `inputManager.disable()` or called it AFTER `screen.destroy()`.

---


### ⚠️ CRITICAL: Cleanup Must Run on ALL Exit Paths

**The most common mistake:** cleanup() only called on user quit (Ctrl+C), but not on:
- Browser tab close
- Connection disconnect
- Network error
- Door crash/exception
- Abnormal exit

**Result:** BBS input breaks because `inputManager.disable()` never runs.

#### ✅ SOLUTION: Use try/finally + disconnect handler

```typescript
async run() {
  try {
    // Door setup and main loop
    this.screen = createScreen(...);
    this.inputManager = new DoorInputManager(...);
    this.inputManager.enable();

    // Setup disconnect handler
    socket.on('disconnect', (reason: string) => {
      console.log('[DEBUG] Socket disconnected:', reason);
      this.cleanup();  // CRITICAL: Cleanup on disconnect!
    });

    // ... door logic ...

    // Wait for exit
    await new Promise<void>((resolve) => {
      this.screen.on('destroy', resolve);
    });
  } finally {
    // CRITICAL: Cleanup runs even if door crashes or exits abnormally
    console.log('[DEBUG] run() exiting, calling cleanup()');
    if (this.state.running) {
      this.cleanup();
    }
  }
}

cleanup() {
  this.state.running = false;

  // CRITICAL: Disable input FIRST
  if (this.inputManager) {
    this.inputManager.disable();
  }

  if (this.screen) {
    this.screen.destroy();
  }
}
```

**Why this works:**
- `try/finally` ensures cleanup() runs even on exceptions
- `socket.on('disconnect')` ensures cleanup() runs on connection loss
- `if (this.state.running)` prevents double-cleanup
- Order: `inputManager.disable()` BEFORE `screen.destroy()`

---


### Common Mistakes

#### ❌ WRONG: Manual Input Setup

```typescript
// Missing cleanup - will break BBS input!
session.bbsSession.inDoorManager = true;
session.bbsSession.mouseEventsEnabled = true;
session.bbsSession.doorInputHandler = (data) => screen.program.emit('data', data);

// Incomplete cleanup
screen.destroy();
// Missing: inDoorManager = false
// Missing: mouseEventsEnabled = false
// Missing: delete doorInputHandler
```

#### ❌ WRONG: Wrong Order

```typescript
screen.destroy();         // ❌ Too early!
inputManager.disable();   // ❌ Too late - flags already lost!
```

#### ❌ WRONG: Redundant Calls

```typescript
inputManager.enable();
screen.program.enableMouse();  // ❌ Already done by inputManager!
```

#### ✅ CORRECT: DoorInputManager

```typescript
inputManager.enable();    // ✓ Handles everything
// ... door runs ...
inputManager.disable();   // ✓ Cleanup FIRST
screen.destroy();         // ✓ Then destroy UI
```

---


### Input Modes

#### Blessed UI Mode (Desktop-like doors)

```typescript
new DoorInputManager(session, screen, {
  enableGameMode: false,  // Blessed handles input routing
  enableGrabKeys: false,  // Blessed focus system works
  enableMouse: true       // Mouse events enabled
});
```

**Use for:** Livechat, dashboards, card games, editors, menus

#### Game Mode (Arcade games, ncurses)

```typescript
new DoorInputManager(session, screen, {
  enableGameMode: true,   // Raw keyboard input
  enableGrabKeys: true,   // Capture ALL keys
  enableMouse: true       // Mouse events enabled
});
```

**Use for:** Zoo Keeper, Frogger, Galaga, Pengo, Super Qix

---


### Reference Doors

**Good examples with correct cleanup (try/finally + disconnect handler):**

- ⭐ `Doors/livechat/server.ts` - Chat door with blessed UI (BEST EXAMPLE - has try/finally + disconnect)
- `Doors/ansi-editor/index.ts` - ANSI editor
- `Doors/whip/app.ts` - Project management
- `Doors/zoo-keeper/index.ts` - Game with blessed UI
- `Doors/card-lobby/index.ts` - Card game lobby
- `Doors/bbs-dashboard/index.ts` - Dashboard

**⚠️ Before January 22, 2026:** Many doors only called cleanup() on user quit, not on disconnect/exceptions - DO NOT copy those patterns!

---


### Debugging

If BBS input is broken after exit:

1. Check cleanup function - is `inputManager.disable()` called?
2. Check order - is `disable()` BEFORE `screen.destroy()`?
3. Check setup - is `inputManager.enable()` called?
4. Add debug logging - set `debug: true` in DoorInputManager options
5. Check logs - `logs/backend.log` will show input state changes

---

---

## Merged from Door Input Handling Guide

### Critical Decision: enableGrabKeys

When using `DoorInputManager`, the most important configuration choice is **`enableGrabKeys`**. This determines whether your door intercepts keyboard input before blessed widgets can see it, or lets blessed widgets handle input naturally.


### Decision Tree

```
Is your door primarily a blessed widget-based UI?
  ├─ YES (menus, forms, editors, lists, etc.)
  │   └─> Use enableGrabKeys: false
  │       └─> Blessed widgets handle their own input
  │
  └─ NO (games, custom input handling)
      └─> Use enableGrabKeys: true
          └─> Your code handles raw keyboard input
```

---


### Pattern 1: Blessed Widget Doors (enableGrabKeys: false)

**Use this for:** Menus, forms, editors, file browsers, lists, dialog boxes, text input

#### Example: ANSI Editor, BBS Dashboard, Voice Chat Lobby

```typescript
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { Screen, List, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

class MyWidgetDoor {
  private screen!: Screen;
  private inputManager!: DoorInputManager;

  async start() {
    // Create blessed screen
    this.screen = createScreen(this.ctx.bbs, {
      title: 'My Widget Door',
    });

    // CRITICAL: enableGrabKeys MUST be false for blessed widgets
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,      // Not a game
      enableGrabKeys: false,       // Let blessed widgets handle keys
      enableMouse: true,           // Enable mouse support
      debugName: 'MY-WIDGET-DOOR'
    });

    // Enable input
    this.inputManager.enable();

    // Create blessed widgets - they will receive keyboard input naturally
    const menu = new List({
      parent: this.screen,
      keys: true,  // Widget handles its own keys
      vi: true,
      items: ['Option 1', 'Option 2', 'Exit'],
    });

    menu.key(['enter'], () => {
      // This works because enableGrabKeys: false
      // Blessed processes keys and fires widget events
    });

    menu.focus();
    this.screen.render();

    // Cleanup
    await this.waitForExit();
    this.inputManager.disable();
  }
}
```

#### What Happens:
1. Frontend sends keyboard events to backend
2. `DoorInputManager` (with `enableGrabKeys: false`) enables the event flow
3. Blessed screen receives keyboard events
4. Blessed routes events to focused widget
5. Widget's key handlers fire (e.g., arrow keys, enter)

#### Why This Works:
- `enableGrabKeys: false` = "Enable keyboard event flow, but don't intercept"
- Blessed widgets have built-in keyboard handling (arrow keys, enter, vi keys, etc.)
- Your door just needs to set up event handlers on widgets

---


### Pattern 2: Game Doors (enableGrabKeys: true)

**Use this for:** Tetris, Arkanoid, action games, custom keyboard handling

#### Example: Tetris, Arkanoid, Frogger

```typescript
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

class MyGameDoor {
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private gameRunning = true;

  async start() {
    this.screen = createScreen(this.ctx.bbs, {
      title: 'My Game',
    });

    // CRITICAL: enableGrabKeys MUST be true for games
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: true,        // Game mode (high-speed input)
      enableGrabKeys: true,         // Intercept keys before blessed
      enableMouse: true,
      debugName: 'MY-GAME'
    });

    // Set up keyboard handler BEFORE enabling
    this.inputManager.setKeyboardHandler((key) => {
      // You receive raw keyboard input here
      // key = { name: 'left', ctrl: false, shift: false, ... }
      
      if (key.name === 'left') {
        this.moveLeft();
      } else if (key.name === 'right') {
        this.moveRight();
      } else if (key.name === 'space') {
        this.fire();
      } else if (key.name === 'escape') {
        this.gameRunning = false;
      }
    });

    // Enable input
    this.inputManager.enable();

    // Game loop
    while (this.gameRunning) {
      this.updateGame();
      this.renderGame();
      await this.sleep(16); // ~60 FPS
    }

    // Cleanup
    this.inputManager.disable();
  }

  private moveLeft() { /* ... */ }
  private moveRight() { /* ... */ }
  private fire() { /* ... */ }
}
```

#### What Happens:
1. Frontend sends keyboard events to backend
2. `DoorInputManager` (with `enableGrabKeys: true`) intercepts events
3. Your `setKeyboardHandler` callback receives raw key events
4. Blessed widgets DON'T receive the events (you handle them)

#### Why This Works:
- `enableGrabKeys: true` = "Intercept all keyboard input"
- Perfect for games that need immediate, raw keyboard access
- Your code has full control over input handling

---


### Common Mistakes

#### ❌ WRONG: enableGrabKeys: true with blessed widgets

```typescript
// DON'T DO THIS - Blessed widgets won't receive input!
this.inputManager = new DoorInputManager(this.ctx, this.screen, {
  enableGameMode: true,
  enableGrabKeys: true,  // <-- WRONG for widgets!
});

const menu = new List({
  parent: this.screen,
  keys: true,
});

menu.key(['enter'], () => {
  // This will NEVER fire because enableGrabKeys: true
  // intercepts the key before blessed sees it
});
```

**Problem:** Blessed widgets appear but don't respond to keyboard input. Arrow keys, enter, etc. don't work.

#### ❌ WRONG: No DoorInputManager at all

```typescript
// DON'T DO THIS - No keyboard input will flow at all!
this.screen = createScreen(this.ctx.bbs, {
  title: 'My Door',
});

// No DoorInputManager created!

const menu = new List({
  parent: this.screen,
  keys: true,
});

menu.focus();
// Menu won't respond to keyboard - no input flow enabled
```

**Problem:** Nothing works. Keyboard events never reach the door.

#### ❌ WRONG: enableGrabKeys: false for games

```typescript
// DON'T DO THIS - You won't receive keyboard events!
this.inputManager = new DoorInputManager(this.ctx, this.screen, {
  enableGameMode: true,
  enableGrabKeys: false,  // <-- WRONG for games!
});

this.inputManager.setKeyboardHandler((key) => {
  // This will NEVER fire because enableGrabKeys: false
  // sends keys to blessed, not your handler
  if (key.name === 'left') {
    this.moveLeft();
  }
});
```

**Problem:** Your keyboard handler never receives events. Keys go to blessed instead.

---


### Quick Reference

| Door Type | enableGameMode | enableGrabKeys | Input Destination |
|-----------|---------------|----------------|-------------------|
| Blessed Widgets (menus, forms, editors) | `false` | `false` | Blessed widgets |
| Games (Tetris, Arkanoid, etc.) | `true` | `true` | Your keyboard handler |
| Hybrid (game + blessed UI) | See below | See below | Both (with care) |

---


### Advanced: Hybrid Doors (Game + Blessed UI)

Some doors need both game input AND blessed widgets (e.g., game with pause menu).

#### Pattern: Toggle Input Modes

```typescript
class HybridDoor {
  private inGameMode = false;

  private switchToGameMode() {
    this.inGameMode = true;
    
    // Reconfigure for game input
    this.inputManager.disable();
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: true,
      enableGrabKeys: true,
    });
    this.inputManager.setKeyboardHandler((key) => this.handleGameInput(key));
    this.inputManager.enable();
  }

  private switchToMenuMode() {
    this.inGameMode = false;
    
    // Reconfigure for blessed widgets
    this.inputManager.disable();
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
    });
    this.inputManager.enable();
    
    this.menuWidget.focus();
  }
}
```

**OR** use a single mode and handle both:

```typescript
// Keep enableGrabKeys: true for game, manually route to widgets when needed
this.inputManager.setKeyboardHandler((key) => {
  if (this.isPaused) {
    // Manually send to blessed menu
    this.pauseMenu.emit('keypress', null, key);
  } else {
    // Handle game input
    this.handleGameInput(key);
  }
});
```

---


### Debugging Input Issues

#### Symptoms: Blessed widgets don't respond to keyboard

**Check:**
1. Is `DoorInputManager` created and enabled?
2. Is `enableGrabKeys: false`?
3. Is the widget focused? (`widget.focus()`)
4. Does the widget have `keys: true`?

**Solution:** Use Pattern 1 (Blessed Widget Doors) above.

#### Symptoms: Keyboard handler never fires in game

**Check:**
1. Is `DoorInputManager` created and enabled?
2. Is `enableGrabKeys: true`?
3. Did you call `setKeyboardHandler()` BEFORE `enable()`?

**Solution:** Use Pattern 2 (Game Doors) above.

#### Symptoms: Input works in menu but not in canvas/editor

**Check:**
1. Are key handlers set on the correct widget? (Use `viewport.key()` not `parent.key()`)
2. Is the viewport focused? (`viewport.focus()`)
3. Is the viewport `focusable: true`, `clickable: true`, `input: true`?

**Solution:** Set up handlers on the focused widget, not parent:
```typescript
// WRONG:
this.key(['enter'], () => { ... });  // Handler on parent

// CORRECT:
this.viewport.key(['enter'], () => { ... });  // Handler on focused widget
```

---


### Summary

- **Blessed widgets** (menus, forms, editors) → `enableGrabKeys: false`
- **Games** (Tetris, Arkanoid) → `enableGrabKeys: true`
- **No DoorInputManager** → No keyboard input at all
- **Wrong enableGrabKeys setting** → Input goes to wrong destination

**When in doubt:** If you're using blessed widgets, use `enableGrabKeys: false`.
