# AmiExpress Development Server Startup Scripts

## Problem Solved

**Before:** Multiple server instances would run simultaneously, causing:
- Stale code execution
- Confusing errors
- Development workflow issues
- Manual process management required

**After:** Atomic startup scripts that:
- Kill all existing servers on the port
- Wait for port to be released
- Start exactly ONE new server
- Verify server is responding correctly

## Usage

### Start Both Servers (Recommended)
```bash
./start-all.sh
```
Starts both backend (port 3001) and frontend (port 5173) in the correct order.

### Start Individual Servers
```bash
./start-backend.sh    # Backend only
./start-frontend.sh   # Frontend only
```

### Stop All Servers
```bash
./stop-all.sh
```
Cleanly stops all development servers.

## What Each Script Does

### `start-backend.sh`
1. Kills any process on port 3001
2. Waits 3 seconds for port release
3. Verifies port is free (exits if still occupied)
4. Changes to `backend/backend` directory
5. Sets `DATABASE_URL` environment variable
6. Starts backend with `npm run dev`
7. Waits 4 seconds for startup
8. Verifies server responds with "AmiExpress" message
9. Reports success with node process count

### `start-frontend.sh`
1. Kills any process on port 5173
2. Waits 3 seconds for port release
3. Verifies port is free (exits if still occupied)
4. Changes to `frontend` directory
5. Starts frontend with `npm run dev`
6. Waits 4 seconds for startup
7. Verifies server responds with HTML
8. Reports success with node process count

### `start-all.sh`
1. Calls `start-backend.sh`
2. Calls `start-frontend.sh`
3. Displays summary with URLs and login credentials

### `stop-all.sh`
1. Kills all processes on port 3001
2. Kills all processes on port 5173
3. Reports what was stopped

## Why Multiple Processes Show Up

When checking `lsof -ti:3001` or `lsof -ti:5173`, you may see 2+ processes:
- **1 node process** - The actual server
- **1+ Chrome/browser processes** - WebSocket connections from your browser

This is **NORMAL**. The scripts filter these out and only count node processes.

## Exit Codes

All scripts use exit codes for automation:
- `0` - Success
- `1` - Error (port still occupied, server failed to start, etc.)

## Integration with CLAUDE.md

These scripts are **MANDATORY** for all development. The project memory (CLAUDE.md) enforces:
- ✓ Always use these scripts instead of manual `npm run dev`
- ✓ Never run multiple instances
- ✓ Always verify exactly one server process per port
- ✓ Report failures to the user instead of falling back to manual commands

## Troubleshooting

**Port still occupied after script runs?**
```bash
# Manually check and kill
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9

# Then run start script again
./start-all.sh
```

**Server not responding after startup?**
- Check the output logs from the script
- Verify database is running (for backend)
- Try stopping and starting again

**Need to see server logs?**
The startup scripts run servers in background. To see live logs:
```bash
# Backend logs
cd backend/backend && npm run dev

# Frontend logs
cd frontend && npm run dev
```
(But remember to stop these with `./stop-all.sh` when done!)
