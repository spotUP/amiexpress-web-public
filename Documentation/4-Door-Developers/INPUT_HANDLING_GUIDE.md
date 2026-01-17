# Door Input Handling Guide

## Critical Decision: enableGrabKeys

When using `DoorInputManager`, the most important configuration choice is **`enableGrabKeys`**. This determines whether your door intercepts keyboard input before blessed widgets can see it, or lets blessed widgets handle input naturally.

## Decision Tree

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

## Pattern 1: Blessed Widget Doors (enableGrabKeys: false)

**Use this for:** Menus, forms, editors, file browsers, lists, dialog boxes, text input

### Example: ANSI Editor, BBS Dashboard, Voice Chat Lobby

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

### What Happens:
1. Frontend sends keyboard events to backend
2. `DoorInputManager` (with `enableGrabKeys: false`) enables the event flow
3. Blessed screen receives keyboard events
4. Blessed routes events to focused widget
5. Widget's key handlers fire (e.g., arrow keys, enter)

### Why This Works:
- `enableGrabKeys: false` = "Enable keyboard event flow, but don't intercept"
- Blessed widgets have built-in keyboard handling (arrow keys, enter, vi keys, etc.)
- Your door just needs to set up event handlers on widgets

---

## Pattern 2: Game Doors (enableGrabKeys: true)

**Use this for:** Tetris, Arkanoid, action games, custom keyboard handling

### Example: Tetris, Arkanoid, Frogger

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

### What Happens:
1. Frontend sends keyboard events to backend
2. `DoorInputManager` (with `enableGrabKeys: true`) intercepts events
3. Your `setKeyboardHandler` callback receives raw key events
4. Blessed widgets DON'T receive the events (you handle them)

### Why This Works:
- `enableGrabKeys: true` = "Intercept all keyboard input"
- Perfect for games that need immediate, raw keyboard access
- Your code has full control over input handling

---

## Common Mistakes

### ❌ WRONG: enableGrabKeys: true with blessed widgets

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

### ❌ WRONG: No DoorInputManager at all

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

### ❌ WRONG: enableGrabKeys: false for games

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

## Quick Reference

| Door Type | enableGameMode | enableGrabKeys | Input Destination |
|-----------|---------------|----------------|-------------------|
| Blessed Widgets (menus, forms, editors) | `false` | `false` | Blessed widgets |
| Games (Tetris, Arkanoid, etc.) | `true` | `true` | Your keyboard handler |
| Hybrid (game + blessed UI) | See below | See below | Both (with care) |

---

## Advanced: Hybrid Doors (Game + Blessed UI)

Some doors need both game input AND blessed widgets (e.g., game with pause menu).

### Pattern: Toggle Input Modes

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

## Debugging Input Issues

### Symptoms: Blessed widgets don't respond to keyboard

**Check:**
1. Is `DoorInputManager` created and enabled?
2. Is `enableGrabKeys: false`?
3. Is the widget focused? (`widget.focus()`)
4. Does the widget have `keys: true`?

**Solution:** Use Pattern 1 (Blessed Widget Doors) above.

### Symptoms: Keyboard handler never fires in game

**Check:**
1. Is `DoorInputManager` created and enabled?
2. Is `enableGrabKeys: true`?
3. Did you call `setKeyboardHandler()` BEFORE `enable()`?

**Solution:** Use Pattern 2 (Game Doors) above.

### Symptoms: Input works in menu but not in canvas/editor

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

## Summary

- **Blessed widgets** (menus, forms, editors) → `enableGrabKeys: false`
- **Games** (Tetris, Arkanoid) → `enableGrabKeys: true`
- **No DoorInputManager** → No keyboard input at all
- **Wrong enableGrabKeys setting** → Input goes to wrong destination

**When in doubt:** If you're using blessed widgets, use `enableGrabKeys: false`.
