# Input Cleanup Checklist for TypeScript Blessed Doors

## ⚠️ CRITICAL: The #1 Cause of "BBS Input Broken After Door Exit"

**EVERY blessed UI door MUST use `DoorInputManager` or BBS input will break when the door exits.**

---

## Quick Checklist

Before releasing your door, verify:

- ✅ Imported `DoorInputManager` from `@amiexpress/bbs-door-sdk/utils/blessed-helpers`
- ✅ Created `inputManager` instance in constructor/setup
- ✅ Called `inputManager.enable()` after creating screen
- ✅ Called `inputManager.disable()` BEFORE `screen.destroy()` in cleanup
- ✅ Tested exit → immediate typing in BBS → works
- ✅ Tested exit → run door again → works
- ✅ Tested 5+ exit/re-enter cycles → BBS input always works

---

## The Problem

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

## The Solution: DoorInputManager

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

## Test Procedure

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

## Common Mistakes

### ❌ WRONG: Manual Input Setup

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

### ❌ WRONG: Wrong Order

```typescript
screen.destroy();         // ❌ Too early!
inputManager.disable();   // ❌ Too late - flags already lost!
```

### ❌ WRONG: Redundant Calls

```typescript
inputManager.enable();
screen.program.enableMouse();  // ❌ Already done by inputManager!
```

### ✅ CORRECT: DoorInputManager

```typescript
inputManager.enable();    // ✓ Handles everything
// ... door runs ...
inputManager.disable();   // ✓ Cleanup FIRST
screen.destroy();         // ✓ Then destroy UI
```

---

## Input Modes

### Blessed UI Mode (Desktop-like doors)

```typescript
new DoorInputManager(session, screen, {
  enableGameMode: false,  // Blessed handles input routing
  enableGrabKeys: false,  // Blessed focus system works
  enableMouse: true       // Mouse events enabled
});
```

**Use for:** Livechat, dashboards, card games, editors, menus

### Game Mode (Arcade games, ncurses)

```typescript
new DoorInputManager(session, screen, {
  enableGameMode: true,   // Raw keyboard input
  enableGrabKeys: true,   // Capture ALL keys
  enableMouse: true       // Mouse events enabled
});
```

**Use for:** Zoo Keeper, Frogger, Galaga, Pengo, Super Qix

---

## Reference Doors

**Good examples with correct cleanup:**

- `Doors/livechat/server.ts` - Chat door with blessed UI
- `Doors/ansi-editor/index.ts` - ANSI editor
- `Doors/whip/app.ts` - Project management
- `Doors/zoo-keeper/index.ts` - Game with blessed UI
- `Doors/card-lobby/index.ts` - Card game lobby
- `Doors/bbs-dashboard/index.ts` - Dashboard

**Before January 2026:** Many doors had manual input setup - DO NOT copy those patterns!

---

## Debugging

If BBS input is broken after exit:

1. Check cleanup function - is `inputManager.disable()` called?
2. Check order - is `disable()` BEFORE `screen.destroy()`?
3. Check setup - is `inputManager.enable()` called?
4. Add debug logging - set `debug: true` in DoorInputManager options
5. Check logs - `logs/backend.log` will show input state changes

---

## See Also

- [TYPESCRIPT_DOOR_GUIDE.md](TYPESCRIPT_DOOR_GUIDE.md) - Full door development guide
- [DOOR_INPUT_MANAGER_GUIDE.md](DOOR_INPUT_MANAGER_GUIDE.md) - Complete DoorInputManager API
- [TYPESCRIPT_DOOR_TROUBLESHOOTING.md](TYPESCRIPT_DOOR_TROUBLESHOOTING.md) - Common issues
