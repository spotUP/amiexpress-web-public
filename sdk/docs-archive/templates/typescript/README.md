# {{displayName}}

{{description}}

Version: {{version}}
Author: {{author}}
Category: {{category}}

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Test in browser preview
npm run preview

# Build for production
npm run build

# Create release ZIP
npm run pack
```

## Development

Edit `index.ts` to add your game logic.

### Key Features Available

- **Graphics Engine**: ANSI/ASCII rendering, sprites, parallax, particles
- **Physics Engine**: Collision detection, gravity, forces
- **Audio Engine**: Sound effects and music generation
- **Menu System**: Professional menus with keyboard navigation
- **HUD Builder**: Health bars, scores, timers

### Example Code

See the SDK documentation for examples:
- `../../docs/QUICK_START.md`
- `../../docs/API_REFERENCE.md`
- `../../examples/tetris/`

## File Structure

```
{{name}}/
├── index.ts           # Main door code
├── package.json       # Dependencies and metadata
├── tsconfig.json      # TypeScript configuration
├── README.md          # This file
└── assets/            # Game assets (ANSI art, data)
```

## Adding Game Logic

1. **Initialize Game State** - Define variables for your game
2. **Handle Input** - Process keyboard input in `handleInput()`
3. **Update Logic** - Update game state in `updateGame()`
4. **Render Graphics** - Draw to screen in `renderGame()`

## Testing

```bash
# Start preview server
npm run preview

# Open browser to http://localhost:8080
# Select your door from the list
# Test with full ANSI rendering and keyboard input
```

## Deployment

```bash
# Create BBS-ready release ZIP
npm run pack

# Output: releases/{{name}}-v{{version}}.zip
# Includes: FILE_ID.DIZ, .NFO, README.TXT, all assets
```

## Support

- SDK Documentation: `../../docs/`
- API Reference: `../../docs/API_REFERENCE.md`
- Examples: `../../examples/`

---

Created with AmiExpress BBS Door SDK
https://github.com/amiexpress/sdk
