# Gamepad API Guide for Door Developers

## Overview

The BBS Door SDK provides comprehensive USB gamepad/controller support for TypeScript doors. This enables classic arcade-style gameplay with modern controllers (Xbox, PlayStation, generic USB gamepads).

**Features:**
- Hot-plug support (connect/disconnect detection)
- Multiple controller support (up to 4 players)
- Standard button mapping (Xbox/PlayStation layout)
- D-pad and analog stick support
- Configurable deadzone and button mapping
- Event-driven architecture
- Fallback to keyboard input

## Quick Start

```typescript
import { GamepadInputManager } from '@amiexpress/bbs-door-sdk/utils/gamepad-input-manager';
import { GamepadButton } from '@amiexpress/bbs-door-sdk';

export class MyGameDoor extends BaseDoor {
  private gamepad: GamepadInputManager;

  async run(): Promise<void> {
    // Initialize gamepad manager
    this.gamepad = new GamepadInputManager(this.session, {
      deadzone: 0.15,
      pollRate: 16,
    });

    // Listen for button presses
    this.gamepad.on('button:a', (pressed, value, controllerId) => {
      if (pressed) {
        console.log('A button pressed!');
      }
    });

    // Listen for D-pad
    this.gamepad.on('dpad', (direction, horizontal, vertical, controllerId) => {
      console.log(`D-pad: ${direction}`);
    });

    // Listen for analog sticks
    this.gamepad.on('axis:left-x', (value, controllerId) => {
      console.log(`Left stick X: ${value}`);
    });

    // Check controller connection
    this.gamepad.on('connected', (controllerId, controllerName) => {
      console.log(`Controller ${controllerId} connected: ${controllerName}`);
    });

    this.gamepad.on('disconnected', (controllerId) => {
      console.log(`Controller ${controllerId} disconnected`);
    });
  }

  quit(): void {
    // Clean up gamepad manager
    this.gamepad?.destroy();
  }
}
```

## Button Layout

Standard gamepad mapping (Xbox/PlayStation compatible):

```
GamepadButton.A          (0)  - A/Cross
GamepadButton.B          (1)  - B/Circle
GamepadButton.X          (2)  - X/Square
GamepadButton.Y          (3)  - Y/Triangle
GamepadButton.L1         (4)  - Left Bumper/L1
GamepadButton.R1         (5)  - Right Bumper/R1
GamepadButton.L2         (6)  - Left Trigger/L2
GamepadButton.R2         (7)  - Right Trigger/R2
GamepadButton.SELECT     (8)  - Select/Share
GamepadButton.START      (9)  - Start/Options
GamepadButton.L3        (10)  - Left Stick Click
GamepadButton.R3        (11)  - Right Stick Click
GamepadButton.DPAD_UP   (12)  - D-pad Up
GamepadButton.DPAD_DOWN (13)  - D-pad Down
GamepadButton.DPAD_LEFT (14)  - D-pad Left
GamepadButton.DPAD_RIGHT(15)  - D-pad Right
GamepadButton.HOME      (16)  - Home/PS Button
```

## Analog Sticks

```
GamepadAxis.LEFT_STICK_X  (0)  - Left stick horizontal (-1 to 1)
GamepadAxis.LEFT_STICK_Y  (1)  - Left stick vertical (-1 to 1)
GamepadAxis.RIGHT_STICK_X (2)  - Right stick horizontal (-1 to 1)
GamepadAxis.RIGHT_STICK_Y (3)  - Right stick vertical (-1 to 1)
```

## Events

### Button Events

```typescript
// Generic button event
gamepad.on('button', (button, pressed, value, controllerId) => {
  console.log(`Button ${button} ${pressed ? 'pressed' : 'released'}`);
});

// Specific button events
gamepad.on('button:a', (pressed, value, controllerId) => {});
gamepad.on('button:b', (pressed, value, controllerId) => {});
gamepad.on('button:start', (pressed, value, controllerId) => {});
gamepad.on('button:select', (pressed, value, controllerId) => {});
```

### D-Pad Events

```typescript
// D-pad direction change
gamepad.on('dpad', (direction, horizontal, vertical, controllerId) => {
  // direction: 'up' | 'down' | 'left' | 'right' | 'neutral'
  // horizontal: 'left' | 'right' | 'neutral'
  // vertical: 'up' | 'down' | 'neutral'
});

// Specific D-pad directions
gamepad.on('dpad:up', (controllerId) => {});
gamepad.on('dpad:down', (controllerId) => {});
gamepad.on('dpad:left', (controllerId) => {});
gamepad.on('dpad:right', (controllerId) => {});
```

### Analog Stick Events

```typescript
// Generic axis event
gamepad.on('axis', (axis, value, controllerId) => {
  console.log(`Axis ${axis}: ${value}`);
});

// Specific axis events
gamepad.on('axis:left-x', (value, controllerId) => {});
gamepad.on('axis:left-y', (value, controllerId) => {});
gamepad.on('axis:right-x', (value, controllerId) => {});
gamepad.on('axis:right-y', (value, controllerId) => {});
```

### Connection Events

```typescript
// Controller connected
gamepad.on('connected', (controllerId, controllerName) => {
  console.log(`Controller ${controllerId} connected: ${controllerName}`);
});

// Controller disconnected
gamepad.on('disconnected', (controllerId) => {
  console.log(`Controller ${controllerId} disconnected`);
});
```

## State Queries

Check controller state at any time:

```typescript
// Check if button is pressed
const isAPressed = gamepad.isButtonPressed(GamepadButton.A, 0);

// Get axis value
const leftX = gamepad.getAxisValue(GamepadAxis.LEFT_STICK_X, 0);

// Check if controller is connected
const isConnected = gamepad.isConnected(0);

// Get all connected controllers
const controllers = gamepad.getConnectedControllers(); // [0, 1, 2, 3]
```

## Configuration

```typescript
const gamepad = new GamepadInputManager(this.session, {
  // Analog stick deadzone (0-1, default: 0.15)
  deadzone: 0.15,

  // Poll rate in milliseconds (default: 16ms = ~60fps)
  pollRate: 16,

  // Enable/disable features
  enableDPad: true,
  enableAnalogSticks: true,
  enableTriggers: true,

  // Custom button mapping (optional)
  buttonMapping: {
    [GamepadButton.A]: 'jump',
    [GamepadButton.B]: 'fire',
  },

  // Custom axis mapping (optional)
  axisMapping: {
    [GamepadAxis.LEFT_STICK_X]: 'move-horizontal',
    [GamepadAxis.LEFT_STICK_Y]: 'move-vertical',
  },
});

// Update config at runtime
gamepad.updateConfig({
  deadzone: 0.2,
  pollRate: 32,
});
```

## Multi-Player Support

Support up to 4 simultaneous controllers:

```typescript
const players = new Map();

gamepad.on('connected', (controllerId, controllerName) => {
  players.set(controllerId, {
    id: controllerId,
    name: controllerName,
    score: 0,
  });
});

gamepad.on('button:a', (pressed, value, controllerId) => {
  if (pressed) {
    const player = players.get(controllerId);
    console.log(`Player ${player.id} pressed A`);
  }
});

gamepad.on('disconnected', (controllerId) => {
  players.delete(controllerId);
});
```

## Hybrid Input (Keyboard + Gamepad)

Support both keyboard and gamepad input:

```typescript
// Keyboard handler
screen.key(['w', 'up'], () => {
  this.movePlayerUp();
});

// Gamepad handler
gamepad.on('dpad:up', () => {
  this.movePlayerUp();
});

gamepad.on('axis:left-y', (value, controllerId) => {
  if (value < -0.5) {
    this.movePlayerUp();
  } else if (value > 0.5) {
    this.movePlayerDown();
  }
});
```

## Arcade Game Example

```typescript
import { GamepadInputManager, GamepadButton, GamepadAxis } from '@amiexpress/bbs-door-sdk';

export class SpaceShooter extends BaseDoor {
  private gamepad: GamepadInputManager;
  private playerX = 40;
  private playerY = 20;

  async run(): Promise<void> {
    this.gamepad = new GamepadInputManager(this.session, {
      deadzone: 0.2,
      pollRate: 16,
    });

    // Movement with analog stick or D-pad
    this.gamepad.on('axis:left-x', (value) => {
      this.playerX += value * 2; // Scale movement speed
      this.updatePlayer();
    });

    this.gamepad.on('dpad:left', () => {
      this.playerX -= 2;
      this.updatePlayer();
    });

    this.gamepad.on('dpad:right', () => {
      this.playerX += 2;
      this.updatePlayer();
    });

    // Fire with A button
    this.gamepad.on('button:a', (pressed) => {
      if (pressed) {
        this.fireBullet();
      }
    });

    // Pause with START button
    this.gamepad.on('button:start', (pressed) => {
      if (pressed) {
        this.togglePause();
      }
    });

    // Show controller status
    this.gamepad.on('connected', (id, name) => {
      this.showMessage(`Controller connected: ${name}`);
    });

    this.gamepad.on('disconnected', (id) => {
      this.showMessage('Controller disconnected - using keyboard');
    });

    // Start game loop
    this.startGameLoop();
  }

  quit(): void {
    this.gamepad?.destroy();
  }
}
```

## Performance Tips

1. **Poll Rate**: 16ms (60fps) is optimal for most games. Increase to 32ms (30fps) for slower-paced games.

2. **Deadzone**: Start with 0.15, adjust based on controller quality. Cheaper controllers may need 0.2-0.25.

3. **Event Filtering**: Use specific events (`button:a`, `dpad:up`) instead of generic events (`button`, `dpad`) to reduce overhead.

4. **State Queries**: For real-time game loops, use `isButtonPressed()` and `getAxisValue()` instead of events:

```typescript
// In game loop (better performance)
const leftX = this.gamepad.getAxisValue(GamepadAxis.LEFT_STICK_X, 0);
const isFirePressed = this.gamepad.isButtonPressed(GamepadButton.A, 0);

// For UI interactions (more convenient)
this.gamepad.on('button:a', (pressed) => {
  if (pressed) this.selectMenuItem();
});
```

5. **Cleanup**: Always call `gamepad.destroy()` in your `quit()` method to prevent memory leaks.

## Browser Compatibility

The Gamepad API is supported in all modern browsers:
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (macOS 10.9+)

Controllers are detected automatically when connected. Most USB and Bluetooth controllers work out of the box.

## Troubleshooting

**Controller not detected:**
- Ensure controller is connected before starting the door
- Try pressing a button to wake up the controller
- Check browser console for Gamepad API errors

**Buttons not responding:**
- Verify button mapping with `gamepad.on('button', ...)` to see raw button indices
- Some controllers use non-standard mappings - adjust button indices accordingly

**Analog sticks drifting:**
- Increase deadzone value in configuration
- Clean controller analog sticks

**Multiple events firing:**
- Use button press/release detection with state tracking
- Implement cooldown timers for rapid-fire prevention

## Testing Without Hardware

For testing without a physical controller, use browser developer tools:

1. Open browser DevTools (F12)
2. Go to Console
3. Simulate gamepad events:

```javascript
// Test connection
navigator.getGamepads()

// Monitor gamepad state
setInterval(() => {
  const gamepad = navigator.getGamepads()[0];
  if (gamepad) console.log(gamepad.buttons.map(b => b.pressed));
}, 100);
```

Or use virtual gamepad software like vJoy (Windows) or Gamepad Tester (web-based).

## Further Reading

- [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- Standard Gamepad Mapping: https://w3c.github.io/gamepad/#remapping
- SDK Source: `/sdk/utils/gamepad-input-manager.ts`
- Type Definitions: `/sdk/types/gamepad.ts`
