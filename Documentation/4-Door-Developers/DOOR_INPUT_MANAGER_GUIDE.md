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
