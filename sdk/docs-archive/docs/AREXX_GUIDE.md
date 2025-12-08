# ARexx Bridge Guide

Complete guide to developing BBS doors using ARexx with the AmiExpress SDK.

## Table of Contents

1. [Overview](#overview)
2. [Setup](#setup)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Examples](#examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

The ARexx Bridge allows classic Amiga systems to use the full power of the AmiExpress SDK through ARexx scripts. This brings modern game development capabilities to classic hardware while maintaining the authentic Amiga feel.

### Features Available via ARexx

- ✅ Graphics Engine (ANSI/ASCII rendering, sprites, animations)
- ✅ Physics Engine (2D collision, gravity, forces)
- ✅ Audio Engine (sound effects, procedural music)
- ✅ Input handling
- ✅ Full SDK type safety through the bridge

## Setup

### Prerequisites

- Amiga or UAE with ARexx support
- AmiExpress SDK backend running (on same machine or network)
- bsdsocket.library (for network communication)

### Installation

1. Copy `arexx-bridge.rexx` to your door directory
2. Ensure SDK backend is running on port 3002
3. Load the bridge in your ARexx script

```arexx
/* Load SDK Bridge */
CALL 'path/to/arexx-bridge.rexx'

/* Initialize */
result = InitSDK()
IF result < 0 THEN DO
  SAY 'Failed to initialize SDK:' result
  EXIT
END
```

## Quick Start

### Hello World Door

```arexx
/*
 * Hello World - ARexx Door Example
 */

/* Load SDK */
CALL 'sdk/core/arexx-bridge.rexx'

/* Initialize SDK */
result = InitSDK()

/* Create door */
doorId = CreateDoor("Hello World", "1.0", "Your Name", "My first ARexx door")

/* Clear screen */
CALL ClearScreen(0)  /* Black background */

/* Draw text */
CALL DrawText(25, 10, "Hello from ARexx!", 14)  /* Yellow text */
CALL DrawText(20, 12, "Press any key to continue...", 7)  /* White text */

/* Render and display */
ansiOutput = RenderFrame()
SAY ansiOutput

/* Wait for input */
key = WaitForInput(0)

/* Clean up */
CALL DisposeDoor()
```

### Simple Game Loop

```arexx
/*
 * Simple Game with Player Movement
 */

CALL 'sdk/core/arexx-bridge.rexx'
result = InitSDK()

doorId = CreateDoor("Move Demo", "1.0", "Dev", "Movement test")

/* Create player sprite */
playerX = 40
playerY = 12

frame = " O  " || "0A"x || "/|\" || "0A"x || "/ \"
sprite = CreateSprite("player", playerX, playerY, 3, 3, frame)

/* Game loop */
running = 1
DO WHILE running = 1
  /* Clear screen */
  CALL ClearScreen(0)

  /* Draw player */
  CALL DrawSprite("player")

  /* Render */
  ansiOutput = RenderFrame()
  SAY ansiOutput

  /* Get input (50ms timeout) */
  key = WaitForInput(50)

  /* Handle input */
  SELECT
    WHEN key = '1B5B4428'x THEN DO  /* Left arrow */
      playerX = playerX - 1
      CALL MoveSprite("player", playerX, playerY)
    END

    WHEN key = '1B5B4328'x THEN DO  /* Right arrow */
      playerX = playerX + 1
      CALL MoveSprite("player", playerX, playerY)
    END

    WHEN key = '1B5B4128'x THEN DO  /* Up arrow */
      playerY = playerY - 1
      CALL MoveSprite("player", playerX, playerY)
    END

    WHEN key = '1B5B4228'x THEN DO  /* Down arrow */
      playerY = playerY + 1
      CALL MoveSprite("player", playerX, playerY)
    END

    WHEN key = 'q' | key = 'Q' THEN DO
      running = 0
    END

    OTHERWISE NOP
  END
END

CALL DisposeDoor()
```

## API Reference

### Initialization

#### `InitSDK()`
Initialize the SDK bridge connection.

**Returns:** 1 on success, error code on failure

**Example:**
```arexx
result = InitSDK()
IF result < 0 THEN DO
  SAY 'Initialization failed'
  EXIT
END
```

#### `CreateDoor(name, version, author, description)`
Create a new door session.

**Parameters:**
- `name` - Door name (string)
- `version` - Version (e.g., "1.0.0")
- `author` - Author name
- `description` - Short description (optional)

**Returns:** Door ID on success

**Example:**
```arexx
doorId = CreateDoor("My Game", "1.0", "John Doe", "A fun game")
```

### Graphics Functions

#### `ClearScreen(color)`
Clear the screen with a background color.

**Parameters:**
- `color` - ANSI color code (0-15), default = 0

**ANSI Colors:**
- 0 = Black
- 1 = Red
- 2 = Green
- 3 = Yellow
- 4 = Blue
- 5 = Magenta
- 6 = Cyan
- 7 = White
- 8-15 = Bright variants

**Example:**
```arexx
CALL ClearScreen(4)  /* Blue background */
```

#### `DrawText(x, y, text, color)`
Draw text at position.

**Parameters:**
- `x` - X position (0-79)
- `y` - Y position (0-23)
- `text` - Text to draw
- `color` - ANSI color (0-15)

**Example:**
```arexx
CALL DrawText(10, 5, "Hello World!", 14)  /* Yellow text */
```

#### `DrawBox(x, y, width, height, fgColor, bgColor)`
Draw a bordered box.

**Example:**
```arexx
CALL DrawBox(5, 5, 30, 10, 14, 1)  /* Yellow on blue */
```

#### `LoadAnsi(id, filename)`
Load ANSI art from file.

**Parameters:**
- `id` - Unique ID for this ANSI art
- `filename` - Path to .ANS file

**Example:**
```arexx
CALL LoadAnsi("logo", "assets/logo.ans")
```

#### `DrawAnsi(id, x, y)`
Draw previously loaded ANSI art.

**Example:**
```arexx
CALL DrawAnsi("logo", 10, 5)
```

### Sprite Functions

#### `CreateSprite(id, x, y, width, height, frameData)`
Create an animated sprite.

**Parameters:**
- `id` - Unique sprite ID
- `x`, `y` - Initial position
- `width`, `height` - Sprite dimensions
- `frameData` - ASCII art data (use `0A`x for newlines)

**Example:**
```arexx
/* Create stick figure */
frame = " O  " || "0A"x || "/|\" || "0A"x || "/ \"
sprite = CreateSprite("player", 10, 10, 3, 3, frame)
```

#### `MoveSprite(id, x, y)`
Move sprite to new position.

#### `DrawSprite(id)`
Draw sprite at current position.

### Physics Functions

#### `CreatePhysicsBody(id, x, y, width, height, mass, static)`
Create physics-enabled body.

**Parameters:**
- `static` - 0 = dynamic (movable), 1 = static (immovable)

**Example:**
```arexx
/* Create player */
player = CreatePhysicsBody("player", 10, 10, 2, 2, 1, 0)

/* Create platform */
platform = CreatePhysicsBody("ground", 0, 20, 80, 2, 0, 1)
```

#### `ApplyForce(id, forceX, forceY)`
Apply force to body (gradual acceleration).

**Example:**
```arexx
CALL ApplyForce("player", 100, 0)  /* Push right */
```

#### `SetVelocity(id, vx, vy)`
Set body velocity directly (instant).

**Example:**
```arexx
CALL SetVelocity("player", 5, -10)  /* Move right and up */
```

#### `UpdatePhysics(deltaTime)`
Update physics simulation.

**Parameters:**
- `deltaTime` - Time step in seconds (e.g., 0.016 for 60fps)

**Example:**
```arexx
CALL UpdatePhysics(0.016)  /* Update at 60fps */
```

### Audio Functions

#### `PlaySound(type, frequency, duration)`
Play sound effect.

**Parameters:**
- `type` - Sound type identifier
- `frequency` - Frequency in Hz (e.g., 440 = A4)
- `duration` - Duration in seconds

**Example:**
```arexx
CALL PlaySound("beep", 440, 0.5)
CALL PlaySound("explosion", 80, 1.0)
```

#### `GenerateMusic(prompt, tempo, pattern)`
Generate procedural background music.

**Parameters:**
- `prompt` - Description (e.g., "upbeat game music")
- `tempo` - BPM (e.g., 120)
- `pattern` - Rhythm pattern (e.g., "x-x-x-x-")

**Example:**
```arexx
CALL GenerateMusic("retro chiptune", 140, "x-x-x-x-")
```

### Input Functions

#### `WaitForInput(timeout)`
Wait for keyboard input.

**Parameters:**
- `timeout` - Timeout in milliseconds (0 = no timeout)

**Returns:** Key pressed

**Example:**
```arexx
key = WaitForInput(1000)  /* Wait up to 1 second */
IF key ~= '' THEN DO
  SAY 'Key pressed:' key
END
```

### Rendering

#### `RenderFrame()`
Render current frame to ANSI.

**Returns:** ANSI-encoded output

**Example:**
```arexx
ansiOutput = RenderFrame()
SAY ansiOutput
```

### Cleanup

#### `DisposeDoor()`
Clean up and disconnect.

**Example:**
```arexx
CALL DisposeDoor()
```

## Examples

### Complete Game Example

See `sdk/doors/arexx-game/` for a complete game with:
- Player movement
- Physics simulation
- Collision detection
- Score tracking
- Sound effects

### ANSI Art Display

See `sdk/doors/arexx-ansi/` for ANSI art viewer

### Physics Demo

See `sdk/doors/arexx-physics/` for bouncing balls demo

## Best Practices

### 1. Always Initialize and Dispose

```arexx
result = InitSDK()
IF result < 0 THEN EXIT

/* ... your game code ... */

CALL DisposeDoor()  /* Always clean up! */
```

### 2. Frame Rate Management

```arexx
/* Target 60 FPS */
frameTime = 16  /* milliseconds */

DO WHILE running
  startTime = TIME('E')

  /* Game logic */
  CALL UpdateGame()

  /* Rendering */
  ansiOutput = RenderFrame()
  SAY ansiOutput

  /* Frame limiting */
  elapsed = TIME('E') - startTime
  IF elapsed < frameTime THEN DO
    CALL DELAY((frameTime - elapsed) / 1000)
  END
END
```

### 3. Error Handling

```arexx
/* Check for errors */
sprite = CreateSprite("player", 10, 10, 2, 2, frame)
IF sprite = '' THEN DO
  SAY 'Failed to create sprite'
  CALL DisposeDoor()
  EXIT
END
```

### 4. Resource Management

```arexx
/* Load assets once */
CALL LoadAnsi("bg", "assets/background.ans")
CALL LoadAnsi("logo", "assets/logo.ans")

/* Reuse throughout game */
DO i = 1 TO 100
  CALL DrawAnsi("bg", 0, 0)
  /* ... */
END
```

## Troubleshooting

### Connection Failed

```
ERROR: Failed to connect to SDK backend on localhost:3002
```

**Solutions:**
1. Ensure SDK backend is running
2. Check firewall settings
3. Verify bsdsocket.library is loaded
4. Try specifying IP address instead of "localhost"

### Sprite Not Displaying

**Check:**
1. Sprite created successfully?
2. Called `DrawSprite()` before `RenderFrame()`?
3. Sprite position within screen bounds (0-79, 0-23)?
4. Sprite visible? (Check zIndex if using multiple sprites)

### Physics Not Working

**Check:**
1. Calling `UpdatePhysics()` each frame?
2. Delta time reasonable? (0.016 for 60fps)
3. Mass > 0 for dynamic bodies?
4. Applied forces strong enough to overcome friction?

### Memory Issues

If running out of memory on classic Amiga:
1. Reduce sprite count
2. Use smaller ANSI art files
3. Limit particle systems
4. Reduce physics body count

## Platform-Specific Notes

### Classic Amiga (68K)

- Tested on Amiga 500, 1200, 4000
- Requires bsdsocket.library 4.0+
- Performance varies by CPU speed
- Recommended: 68030 or higher for smooth physics

### UAE

- Full compatibility
- Network support via host system
- Better performance than classic hardware
- Easier debugging

## Support

For help:
- Check examples in `sdk/doors/arexx/`
- See main SDK documentation
- Report issues on GitHub
