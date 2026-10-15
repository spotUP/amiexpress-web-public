# AmiExpress BBS - Process Management

## Problem

The BBS server infrastructure can accumulate zombie/stuck processes when:
1. `start-servers.sh` is interrupted (Ctrl+C, terminal closed, etc.)
2. Scripts are nested/forked multiple times
3. `watch-doors.ts` spawns child processes that aren't tracked
4. System crashes or unexpected exits

This leads to:
- Multiple servers running on same ports
- High CPU usage from zombie processes
- Computer overheating
- Port conflicts preventing new server starts

## Solutions Implemented

### 1. Lockfile Prevention (start-servers.sh)

**Location:** `dev/scripts/start-servers.sh` lines 477-490

Prevents multiple instances from running simultaneously:

```bash
LOCKFILE="/tmp/amiexpress-servers.lock"
if [ -f "$LOCKFILE" ]; then
  LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[ERROR] Servers already running (PID $LOCK_PID)"
    echo "Run ./dev/scripts/kill-servers.sh first"
    exit 1
  else
    # Stale lock file, remove it
    rm -f "$LOCKFILE"
  fi
fi
echo $$ > "$LOCKFILE"
```

**What this prevents:** Multiple nested start-servers.sh instances

### 2. Process Group Cleanup (start-servers.sh lines 498-526)

**Enhanced trap handler** that kills entire process groups:

```bash
cleanup_servers() {
  # Kill entire process group (negative PID kills process group)
  [ -n "$BACKEND_PID" ] && kill -TERM -$BACKEND_PID 2>/dev/null
  [ -n "$PREVIEW_PID" ] && kill -TERM -$PREVIEW_PID 2>/dev/null

  # Graceful shutdown (2 seconds)
  sleep 2

  # Force kill if still alive
  [ -n "$BACKEND_PID" ] && kill -9 -$BACKEND_PID 2>/dev/null
  [ -n "$PREVIEW_PID" ] && kill -9 -$PREVIEW_PID 2>/dev/null

  # Wait for all children
  wait 2>/dev/null

  # Remove lockfile
  rm -f "$LOCKFILE"
}

trap cleanup_servers EXIT INT TERM
```

**What this fixes:** Kills entire process tree, not just parent

### 3. Process Group Cleanup (start-servers.sh lines 502-542)

**Use `pkill -P` to kill child processes (macOS compatible):**

```bash
# Kill parent and all children
kill -TERM "$BACKEND_PID" 2>/dev/null
pkill -P "$BACKEND_PID" 2>/dev/null  # Kill all children of parent

# After grace period, force kill
kill -9 "$BACKEND_PID" 2>/dev/null
pkill -9 -P "$BACKEND_PID" 2>/dev/null  # Force kill remaining children
```

**What this fixes:** `pkill -P $PID` kills all processes whose parent is $PID, which catches watch-doors spawning backend

### 4. Enhanced kill-servers.sh

**Location:** `dev/scripts/kill-servers.sh` lines 5-35

Improvements:
- **Removes stale lockfile** (line 6)
- **Kills ALL start-servers instances** (lines 15-21) - no longer excludes current process
- **Explicitly kills watch-doors** (lines 23-28) - catches leaked watch-doors processes
- **Kills backend tsx processes** (lines 30-35) - catches any remaining backend instances

**Why this is needed:** If start-servers.sh is interrupted abnormally, the trap handler may not fire, leaving processes running

### 5. New Process Monitor Script

**Location:** `dev/scripts/process-monitor.sh`

**Features:**
- Detects multiple instances of scripts
- Identifies high CPU usage (>50% per process)
- Checks for stale lockfiles
- Reports port usage
- Can auto-fix with `--fix` flag

**Usage:**
```bash
# Check for issues
./dev/scripts/process-monitor.sh

# Automatically fix issues
./dev/scripts/process-monitor.sh --fix
```

## How to Use

### Normal Operation
```bash
# Start servers (lockfile prevents multiple instances)
./dev/scripts/start-servers.sh

# Stop servers (cleans up everything)
./dev/scripts/kill-servers.sh
```

### If Computer is Hot/Slow
```bash
# Check for zombie processes
./dev/scripts/process-monitor.sh

# Auto-cleanup
./dev/scripts/process-monitor.sh --fix

# Nuclear option (kill everything)
./dev/scripts/kill-servers.sh
```

### For Automated Monitoring (Optional)
Add to cron to check every 5 minutes:
```bash
*/5 * * * * /path/to/amiexpress-web/dev/scripts/process-monitor.sh --fix
```

## Technical Details

### Process Groups and Child Process Cleanup

**The Problem:**
- `watch-doors.ts` spawns `src/index.ts` as a child process
- Killing the parent doesn't automatically kill children
- Children become orphans and continue running

**The Solution (macOS-compatible):**
```bash
# Kill parent
kill -TERM $PARENT_PID

# Kill all children whose parent is $PARENT_PID
pkill -P $PARENT_PID
```

**Why `pkill -P` instead of `setsid`:**
- `setsid` is Linux-only (not available on macOS by default)
- `pkill -P $PID` is POSIX-compliant and works on both Linux and macOS
- `-P $PID` flag means "kill processes whose parent is $PID"

### Lockfile Pattern
Standard Unix pattern to prevent multiple instances:
1. Check if lockfile exists
2. If yes, verify process is alive
3. If process is dead, remove stale lockfile
4. Create new lockfile with current PID
5. Remove lockfile on exit (trap handler)

## Summary

These improvements prevent the overheating issues by:
1. **Lockfile** - Prevents accidental multiple start-servers instances
2. **Process groups** - All children die when parent dies
3. **Enhanced trap handler** - Properly kills entire process trees on exit
4. **Improved kill-servers.sh** - Finds and kills all nested/leaked instances
5. **Process monitor** - Can be run manually or automated to detect issues early

You can now safely start servers without worrying about zombie processes accumulating!