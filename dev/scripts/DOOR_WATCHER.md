# Door File Watcher - Auto Restart

## Why This Exists

**Node.js CANNOT hot reload ESM modules.** The previous "hot reload" code was broken and never worked.

Once a module is loaded via `import()`, it's cached for the entire process lifetime. The only way to reload door code is to **restart the Node.js process**.

## How It Works

The file watcher (`watch-doors.ts`) monitors door directories and automatically restarts the backend server when door files change:

1. Watches `Doors/**/*.{ts,js}` and `sdk/doors/**/*.{ts,js}`
2. Debounces changes (1 second after last change)
3. Gracefully stops backend server
4. Starts fresh backend server with new code

## Usage

### Development Mode (Recommended)

Start the backend with automatic restart on door changes:

```bash
npm run dev:doors
```

This will:
- Start the backend server
- Watch all door directories
- Auto-restart when you save any door file
- Show which file triggered the restart

### Standard Mode (No Watcher)

If you prefer manual restarts or are working on non-door code:

```bash
./dev/scripts/start-servers.sh
```

Then manually restart when needed:

```bash
./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh
```

## What Gets Watched

- `Doors/**/*.ts` - TypeScript doors in main Doors directory
- `Doors/**/*.js` - Compiled JavaScript doors
- `Doors/**/dist/**/*.js` - **Compiled dist/ output (hybrid doors)**
- `sdk/doors/**/*.ts` - SDK example doors
- `sdk/doors/**/*.js` - SDK compiled doors

**Important for Hybrid Doors:** The watcher monitors `dist/` directories because hybrid TypeScript doors (like card-lobby) load from compiled `dist/index.js`. When you run `npm run build` in a door directory, the watcher sees the `dist/*.js` changes and auto-restarts the backend.

## Excluded from Watching

- `node_modules/` - Dependencies don't trigger restarts
- `.git/` - Version control doesn't trigger restarts

## Performance

- **Debounce delay:** 1 second (prevents restart spam while typing)
- **Graceful shutdown:** 5 second timeout before force kill
- **Restart time:** ~2-3 seconds for full backend reload

## Troubleshooting

### Watcher doesn't restart

- Check if file is in watched directories
- Verify chokidar is installed: `npm install` in project root
- Check logs for watcher errors

### Backend won't start

- Check `logs/backend.log` for errors
- Verify port 3001 is free: `lsof -ti:3001 | xargs kill`
- Try manual start: `cd web/backend && npx tsx src/index.ts`

### Too many restarts

- The debounce delay prevents this
- If you're seeing rapid restarts, check for infinite loops or auto-save tools
- Increase `DEBOUNCE_MS` in `watch-doors.ts` if needed

## Integration with start-servers.sh

The main `start-servers.sh` script does NOT use the watcher by default (to avoid nested processes). Use `npm run dev:doors` for watcher mode, or `start-servers.sh` for standard mode.

## AmiExpress Philosophy

This follows the AmiExpress principle: **don't cache unless necessary**. Every door execution loads fresh code, just like on the original Amiga. The watcher makes this seamless during development.
