# {{displayName}}

{{description}}

Version: {{version}}
Author: {{author}}
Category: {{category}}

## Running on Classic Amiga

```
RX {{name}}.rexx
```

## Running on UAE

```
# In UAE, mount the SDK directory
# Then run the door script
```

## Development

Edit `{{name}}.rexx` to add your game logic.

The ARexx bridge provides access to all SDK features through simple procedure calls.

## Available Functions

- `CreateDoor(name, version, author)` - Initialize door
- `ClearScreen()` - Clear terminal
- `SendAnsi(code)` - Send ANSI escape codes
- `WaitForInput()` - Wait for keyboard input
- `PlaySound(sound)` - Play sound effect
- `DrawSprite(id, x, y)` - Draw sprite
- `DisposeDoor()` - Clean up and exit

See `../../docs/AREXX_GUIDE.md` for complete API reference.

---

Created with AmiExpress BBS Door SDK
https://github.com/amiexpress/sdk
