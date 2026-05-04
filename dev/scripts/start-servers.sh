#!/bin/bash

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
RESET='\033[0m'

# Usage helper
print_usage() {
  # Defensive: if the user's terminal is still in raw mode from a prior TUI
  # session that didn't restore cooked mode on exit, `cat` output looks like
  # a staircase (LF without CR). Reset to a sane terminal state before
  # printing help so --help is always readable. Silent on non-TTY stdin.
  [ -t 0 ] && stty sane 2>/dev/null
  cat <<'EOF'
Usage: ./dev/scripts/start-servers.sh [options]

Options:
  --debug | -v | --verbose   Enable debug mode (full logs + profiling)
  --quick | -q               FAST START: Skip all builds AND cache clearing
  --clean                    Nuclear cache clear (slow). Default: off
  --full | --all             Open BBS + Admin/Settings + SDK (default)
  --sdk-only                 Open SDK preview only; build SDK only
  --bbs-only                 Open BBS terminal only; build BBS only
  --telnet-only              Backend only (telnet/ssh debug); skip frontends/preview/browser
  --no-watch                 Disable door file watcher (auto-restart)
  --help                     Show this help and exit

Note: Door file watcher is ENABLED by default. Backend auto-restarts when
      door files change. Use --no-watch to disable for production-like testing.

Quick mode (--quick) skips: npm checks, SDK build, door builds, frontend builds,
TypeScript check, and cache clearing. Use for fast debugging when dependencies
haven't changed.

Clean mode (--clean) clears ALL caches before startup (npm, node_modules/.cache,
TypeScript build info, every dist/ dir, stale .js files, Vite caches). Only
needed after a rebase/merge or when things are visibly broken. Runtime ESM
cache-busting in door.handler.ts already prevents stale door module issues, so
day-to-day development does not need this.

Debug mode (--debug) enables:
  - DEBUG_68K: Verbose 68K CPU execution tracing
  - DEBUG_EXEC: ExecLibrary calls (GetMsg, ReplyMsg, etc.)
  - DEBUG_DOS: DosLibrary file operations
  - DEBUG_FILE: FileManager operations
  - DEBUG_TRAP: Library trap handler debugging
  - DOOR_PROFILE: Performance profiling (iterations/sec, timing breakdown)
  - XIM_DEBUG_*: XIM protocol debugging
EOF
}

# Parse command-line flags
DEBUG_MODE=false
DEBUG_OUTPUT="false"
OPEN_MODE="full"  # Default: Open all three tabs (BBS, Admin, SDK)
WATCH_DOORS=true  # Default: Enable door file watcher (auto-restart on changes)
QUICK_MODE=false  # Default: Full build (set true with --quick for fast debug startup)
CLEAN_MODE=false  # Default: Skip nuclear cache clear (set true with --clean)
TELNET_ONLY=false # Default: Start everything unless telnet-only requested

# Check all arguments
for arg in "$@"; do
  case "$arg" in
    --help)
      print_usage
      exit 0
      ;;
    --debug|-v|--verbose)
      DEBUG_MODE=true
      DEBUG_OUTPUT="true"
      ;;
    --full|--all)
      OPEN_MODE="full"
      ;;
    --sdk-only)
      OPEN_MODE="sdk-only"
      ;;
    --bbs-only)
      OPEN_MODE="bbs-only"
      ;;
    --telnet-only)
      OPEN_MODE="telnet-only"
      TELNET_ONLY=true
      ;;
    --no-watch)
      WATCH_DOORS=false
      ;;
    --quick|-q)
      QUICK_MODE=true
      ;;
    --clean)
      CLEAN_MODE=true
      ;;
  esac
done

# ─── tmux console ────────────────────────────────────────────────────────────
# Only activate in an interactive terminal that has tmux AND is not already
# inside a tmux session ($TMUX is set by tmux in all child processes).
launch_tmux_session() {
  local session="amiexpress"

  # If session already exists, just attach
  if tmux has-session -t "$session" 2>/dev/null; then
    exec tmux attach -t "$session"
  fi

  # Build the console app if it hasn't been built yet
  local console_dir
  console_dir="$(cd "$(dirname "$0")/../.." && pwd)/dev/console"
  if [ -d "$console_dir" ] && [ -f "$console_dir/package.json" ]; then
    (cd "$console_dir" && npm run build --silent 2>/dev/null) || true
  fi

  # Determine the project root (two levels up from this script)
  local root
  root="$(cd "$(dirname "$0")/../.." && pwd)"

  # Single window, 3-pane layout:
  #   ┌──────────────────┬───────────────┐
  #   │  Stack startup    │  Console TUI  │
  #   │  (top-left, 75%)  │  (full-height,│
  #   ├──────────────────┤  45% wide)    │
  #   │  Backend log tail │               │
  #   │  (bottom-left)    │               │
  #   └──────────────────┴───────────────┘
  #   Status bar: keybindings for quit/restart/browser

  # Pane 0: stack startup output (env setup, port checks, banners).
  # Runs start-servers.sh recursively in --bbs-only mode; once that returns
  # (or is killed) the pane drops to a bash prompt for interactive use.
  tmux new-session -d -s "$session" -n amiexpress \
    "cd '$root' && bash '$0' --bbs-only; bash"

  # Pane 1: console TUI (right side, waits for backend)
  tmux split-window -h -p 45 -t "${session}:amiexpress.0" \
    "cd '$root' && sleep 8 && node dev/console/dist/src/index.js; bash"

  # Pane 2: live backend log tail (bottom-left). `tail -F` follows the file
  # across rotation; we wait for the file to appear so tail doesn't error
  # before start-servers writes the first line. Falls through to bash on
  # exit so the user can take the pane back if they want.
  tmux split-window -v -p 25 -t "${session}:amiexpress.0" \
    "cd '$root' && \
     while [ ! -f logs/backend.log ]; do sleep 0.2; done && \
     tail -n 200 -F logs/backend.log; \
     bash"

  # ── Status bar & keybindings ──────────────────────────────────────────────
  # Style: Amiga-esque blue bar with yellow hotkeys
  tmux set-option -t "$session" status on
  tmux set-option -t "$session" status-position bottom
  tmux set-option -t "$session" status-style "bg=blue,fg=white"
  tmux set-option -t "$session" status-left " #[fg=cyan,bold]AmiExpress#[default] "
  tmux set-option -t "$session" status-left-length 15
  tmux set-option -t "$session" status-right \
    "#[fg=yellow]F1#[default]=Help #[fg=yellow]F2#[default]=Restart #[fg=yellow]F3#[default]=BBS #[fg=yellow]F4#[default]=Admin #[fg=yellow]F5#[default]=Logs #[fg=yellow]F10#[default]=Quit "
  tmux set-option -t "$session" status-right-length 80
  tmux set-option -t "$session" window-status-format ""
  tmux set-option -t "$session" window-status-current-format ""

  # F1 = Show help popup
  tmux bind-key -n F1 display-popup -w 60 -h 18 -T " AmiExpress Hotkeys " \
    "echo ''; \
     echo '  F1   This help'; \
     echo '  F2   Restart dialog (TUI — pick start-servers flags)'; \
     echo '  F3   Open BBS in browser'; \
     echo '  F4   Open Admin in browser'; \
     echo '  F5   Tail backend log'; \
     echo '  F10  Quit (stop servers + exit)'; \
     echo ''; \
     echo '  Ctrl+B arrows  Switch panes'; \
     echo '  Ctrl+B z        Zoom pane (fullscreen toggle)'; \
     echo '  Ctrl+B d        Detach (servers keep running)'; \
     echo ''; \
     echo '  Press any key to close'; \
     read -n1"

  # F2 = Forward into the TUI pane so the TUI's restart dialog opens.
  #
  # Target by direction (`{right}`) rather than pane index — splits made
  # below this point reshuffle pane indices (the bottom-left log-tail
  # split bumps the TUI from index 1 to index 2 in the current layout).
  # Direction targets are stable across layout changes as long as the
  # TUI stays in the right column.
  tmux bind-key -n F2 \
    send-keys -t "${session}:amiexpress.{right}" F2

  # F3 = Open BBS in browser
  tmux bind-key -n F3 \
    run-shell "open 'http://localhost:3001/' 2>/dev/null || xdg-open 'http://localhost:3001/' 2>/dev/null"

  # F4 = Open Admin in browser
  tmux bind-key -n F4 \
    run-shell "open 'http://localhost:3001/admin/' 2>/dev/null || xdg-open 'http://localhost:3001/admin/' 2>/dev/null"

  # F5 = Tail backend log in a popup
  tmux bind-key -n F5 display-popup -w 90% -h 80% -T " Backend Log " \
    "tail -100f '$root/logs/backend.log'"

  # F10 = Quit everything
  tmux bind-key -n F10 confirm-before -p \
    "Stop all servers and exit? (y/n)" \
    "run-shell 'cd $root && ./dev/scripts/kill-servers.sh 2>/dev/null'; kill-session -t $session"

  # Clean up global keybindings when session dies
  tmux set-hook -t "$session" session-closed \
    "unbind-key -n F1; unbind-key -n F2; unbind-key -n F3; unbind-key -n F4; unbind-key -n F5; unbind-key -n F10"

  # Focus the server log pane
  tmux select-pane -t "${session}:amiexpress.0"

  exec tmux attach -t "$session"
}

if [ -t 1 ] && command -v tmux &>/dev/null && [ -z "${TMUX:-}" ]; then
  launch_tmux_session
fi
# ─────────────────────────────────────────────────────────────────────────────

# Display startup mode
printf "%b\n" "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                    AmiExpress BBS Startup                         ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
printf "%b\n" "${RESET}"

if [ "$DEBUG_MODE" = true ]; then
  printf "%b\n" "${YELLOW}→ Starting in DEBUG mode (full logs enabled)${RESET}"
else
  printf "%b\n" "${CYAN}→ Starting in normal mode (clean door output)${RESET}"
  printf "%b\n" "   ${WHITE}Use --debug to see full debug logs${RESET}"
fi

if [ "$OPEN_MODE" = "full" ]; then
  printf "%b\n" "${CYAN}→ Will open BBS, Admin/Settings, and SDK Preview in browser${RESET}"
  printf "%b\n" "   ${WHITE}Use --bbs-only to open only BBS, or --sdk-only for SDK only${RESET}"
elif [ "$OPEN_MODE" = "sdk-only" ]; then
  printf "%b\n" "${CYAN}→ Will open SDK Preview only in browser${RESET}"
  printf "%b\n" "   ${WHITE}Use --full to open all three apps, or --bbs-only for BBS only${RESET}"
elif [ "$OPEN_MODE" = "telnet-only" ]; then
  printf "%b\n" "${CYAN}→ Telnet-only mode: backend only (no browser, no frontends)${RESET}"
  printf "%b\n" "   ${WHITE}Use --full/--bbs-only/--sdk-only to open browser tabs${RESET}"
else
  printf "%b\n" "${CYAN}→ Will open BBS terminal only (no Admin/SDK tabs)${RESET}"
  printf "%b\n" "   ${WHITE}Use --full to open all three apps, or --sdk-only for SDK only${RESET}"
fi

if [ "$WATCH_DOORS" = true ]; then
  printf "%b\n" "${CYAN}→ Door file watcher ENABLED (auto-restart on door changes)${RESET}"
  printf "%b\n" "   ${WHITE}Use --no-watch to disable${RESET}"
else
  printf "%b\n" "${YELLOW}→ Door file watcher DISABLED (manual restart required)${RESET}"
  printf "%b\n" "   ${WHITE}Remove --no-watch to enable auto-restart${RESET}"
fi

if [ "$QUICK_MODE" = true ]; then
  printf "%b\n" "${YELLOW}${BOLD}→ QUICK MODE: Skipping all builds (using existing artifacts)${RESET}"
  printf "%b\n" "   ${WHITE}Remove --quick for full build with dependency checks${RESET}"
fi

if [ "$CLEAN_MODE" = true ]; then
  printf "%b\n" "${YELLOW}${BOLD}→ CLEAN MODE: Will nuke all caches before startup (slow)${RESET}"
fi

# Get the repository root directory (portable)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Create logs directory if it doesn't exist
LOGS_DIR="$REPO_ROOT/logs"
mkdir -p "$LOGS_DIR"

# Rotate old logs
cleanup_logs_dir() {
  local retention_days=${LOG_RETENTION_DAYS:-7}
  local max_files=${LOG_MAX_FILES:-250}
  local max_door_logs=${LOG_MAX_DOOR_LOGS:-20}  # Keep only 20 recent door logs

  printf "%b\n" "${CYAN}→ Cleaning up old logs (retain ${retention_days}d, max ${max_files} files)...${RESET}"

  # Truncate session debug logs — they accumulate across restarts and can reach
  # hundreds of MB, causing OOM crashes. Only the current session's data matters.
  for debug_log in door-68k.log filehandle-debug.log bb-conflocal-debug.log; do
    if [ -f "$LOGS_DIR/$debug_log" ]; then
      local log_size
      log_size=$(du -k "$LOGS_DIR/$debug_log" 2>/dev/null | cut -f1)
      if [ -n "$log_size" ] && [ "$log_size" -gt 0 ]; then
        printf "%b\n" "${CYAN}   [CLEANUP] Truncating $debug_log (${log_size}KB)${RESET}"
      fi
      : > "$LOGS_DIR/$debug_log"
    fi
  done

  # Keep only recent door logs (prevent accumulation of hundreds of logs)
  local door_log_count
  door_log_count=$(ls -1 "$LOGS_DIR"/door-68k-*.log 2>/dev/null | wc -l | tr -d ' ')
  if [ "$door_log_count" -gt "$max_door_logs" ]; then
    printf "%b\n" "${YELLOW}   [CLEANUP] Keeping ${max_door_logs} most recent door logs (deleting $(expr $door_log_count - $max_door_logs) old)${RESET}"
    ls -t "$LOGS_DIR"/door-68k-*.log 2>/dev/null | tail -n +$(expr $max_door_logs + 1) | xargs rm -f 2>/dev/null
  fi

  # Remove stale logs older than retention window
  find "$LOGS_DIR" -maxdepth 1 -type f -name "*.log" -mtime +"$retention_days" -print -delete 2>/dev/null

  # Trim file count if still too high
  local log_count
  log_count=$(find "$LOGS_DIR" -maxdepth 1 -type f -name "*.log" 2>/dev/null | wc -l)
  while [ "$log_count" -gt "$max_files" ]; do
    local oldest
    # Use ls -t (sort by modification time) instead of find -printf (GNU find only)
    oldest=$(ls -t "$LOGS_DIR"/*.log 2>/dev/null | tail -n 1)
    if [ -n "$oldest" ]; then
      rm -f "$oldest"
    else
      break
    fi
    log_count=$(find "$LOGS_DIR" -maxdepth 1 -type f -name "*.log" 2>/dev/null | wc -l)
  done
}

cleanup_logs_dir

# ============================================================================
# COMPREHENSIVE CACHE CLEARING - opt-in via --clean
# Runtime ESM cache-busting in door.handler.ts (?t=timestamp query) already
# prevents stale door module imports, so day-to-day dev does NOT need this.
# ============================================================================
if [ "$CLEAN_MODE" = true ]; then
printf "%b\n" "${CYAN}${BOLD}→ Clearing ALL caches (npm, build artifacts, TypeScript)...${RESET}"

# 1. Clear npm cache (force fresh package resolution)
printf "%b\n" "   ${CYAN}[1/7] Clearing npm cache...${RESET}"
npm cache clean --force > /dev/null 2>&1
printf "%b\n" "   ${GREEN}[OK] npm cache cleared${RESET}"

# 2. Remove ALL node_modules/.cache directories (webpack/babel/vite/etc)
printf "%b\n" "   ${CYAN}[2/7] Clearing build tool caches (webpack/babel/vite)...${RESET}"
find "$REPO_ROOT" -type d -name ".cache" -path "*/node_modules/.cache" -exec rm -rf {} + 2>/dev/null || true
printf "%b\n" "   ${GREEN}[OK] Build tool caches cleared${RESET}"

# 3. Remove ALL TypeScript build info files (.tsbuildinfo)
printf "%b\n" "   ${CYAN}[3/7] Clearing TypeScript build info...${RESET}"
find "$REPO_ROOT" -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true
printf "%b\n" "   ${GREEN}[OK] TypeScript build info cleared${RESET}"

# 4. Remove ALL dist/ directories (force complete rebuild)
printf "%b\n" "   ${CYAN}[4/7] Removing ALL dist/ directories...${RESET}"
rm -rf "$REPO_ROOT/web/backend/dist" 2>/dev/null || true
rm -rf "$REPO_ROOT/web/frontend/dist" 2>/dev/null || true
rm -rf "$REPO_ROOT/web/config-app/dist" 2>/dev/null || true
rm -rf "$REPO_ROOT/sdk/dist" 2>/dev/null || true
rm -rf "$REPO_ROOT/sdk/tools/preview/frontend/dist" 2>/dev/null || true
rm -rf "$REPO_ROOT/packages/terminal/dist" 2>/dev/null || true
# Remove all door dist/ directories
find "$REPO_ROOT/Doors" -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
printf "%b\n" "   ${GREEN}[OK] All dist/ directories removed${RESET}"

# 5. Clean stale .js files that can override .ts files
printf "%b\n" "   ${CYAN}[5/7] Removing stale .js files in source directories...${RESET}"
STALE_JS=$(find "$REPO_ROOT/web/backend/src/amiga-emulation" -name "*.js" -type f \
  ! -path "*/moira-source/*" ! -path "*/build/*" 2>/dev/null)
if [ -n "$STALE_JS" ]; then
  echo "$STALE_JS" | xargs rm -f
fi
rm -f "$REPO_ROOT/web/backend/src/api/"*.js 2>/dev/null || true
# Also clean stale .js files in other source directories
find "$REPO_ROOT/web/frontend/src" -name "*.js" -type f -delete 2>/dev/null || true
find "$REPO_ROOT/web/config-app/src" -name "*.js" -type f -delete 2>/dev/null || true
find "$REPO_ROOT/sdk" -name "*.js" -type f ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/tools/preview/server.js" -delete 2>/dev/null || true
printf "%b\n" "   ${GREEN}[OK] Stale .js files removed${RESET}"

# 6. Clear Vite cache directories
printf "%b\n" "   ${CYAN}[6/7] Clearing Vite cache...${RESET}"
rm -rf "$REPO_ROOT/web/frontend/node_modules/.vite" 2>/dev/null || true
rm -rf "$REPO_ROOT/web/config-app/node_modules/.vite" 2>/dev/null || true
rm -rf "$REPO_ROOT/sdk/tools/preview/frontend/node_modules/.vite" 2>/dev/null || true
printf "%b\n" "   ${GREEN}[OK] Vite cache cleared${RESET}"

# 7. Clear ESM loader cache (Node.js internal cache)
printf "%b\n" "   ${CYAN}[7/7] Clearing Node.js ESM loader cache...${RESET}"
rm -rf "$HOME/.node_repl_history" 2>/dev/null || true
# Force NODE_ENV=development to ensure cache-busting is enabled (from door.handler.ts fix)
export NODE_ENV=development
printf "%b\n" "   ${GREEN}[OK] ESM loader cache cleared, development mode enabled${RESET}"

printf "%b\n" "${GREEN}${BOLD}→ ALL caches cleared! Fresh build guaranteed.${RESET}"
echo ""
else
  # Still force NODE_ENV=development for the runtime cache-busting path
  export NODE_ENV=development
  printf "%b\n" "${CYAN}→ Skipping cache clearing (use --clean if needed). Runtime ESM cache-busting is active.${RESET}"
  echo ""
fi
# ============================================================================

# Use fixed log filenames (will be overwritten each time)
BACKEND_LOG="$LOGS_DIR/backend.log"
PREVIEW_LOG="$LOGS_DIR/preview.log"

printf "%b\n" "${CYAN}→ Logs will be saved to:${RESET}"
printf "%b\n" "   ${WHITE}$BACKEND_LOG${RESET}"
printf "%b\n" "   ${WHITE}$PREVIEW_LOG${RESET}"
echo ""

# === ENHANCED SETUP CHECKS ===
# Skip all build/check steps in quick mode
if [ "$QUICK_MODE" = true ]; then
  printf "%b\n" "${YELLOW}→ QUICK MODE: Skipping dependency checks and builds${RESET}"
  echo ""
else
  printf "%b\n" "${CYAN}→ Checking environment setup...${RESET}"
  echo ""

  # Check for .env.local
  if [ ! -f "$REPO_ROOT/.env.local" ]; then
    printf "%b\n" "${YELLOW}[WARNING] .env.local not found${RESET}"
    printf "%b\n" "   ${WHITE}Copying .env.example to .env.local...${RESET}"
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.local"
    printf "%b\n" "   ${GREEN}[OK] Created .env.local - please review and update if needed${RESET}"
    echo ""
  fi

  # Unset NODE_ENV for dependency installation (we need devDependencies)
  unset NODE_ENV

# Function to check and install dependencies
check_and_install_deps() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir/node_modules" ]; then
    printf "%b\n" "${CYAN}→ $name: Installing dependencies (this may take a minute)...${RESET}"
    (cd "$dir" && npm install --include=dev --loglevel=error)
    if [ $? -eq 0 ]; then
      printf "%b\n" "   ${GREEN}[OK] $name dependencies installed${RESET}"
    else
      printf "%b\n" "   ${RED}[ERROR] $name dependency installation failed${RESET}"
      printf "%b\n" "   ${WHITE}Try running: cd $dir && npm install --include=dev${RESET}"
      exit 1
    fi
  else
    # Check if package.json is newer than node_modules (dependencies changed)
    if [ "$dir/package.json" -nt "$dir/node_modules" ]; then
      printf "%b\n" "${CYAN}→ $name: Dependencies changed, updating...${RESET}"
      (cd "$dir" && npm install --include=dev --loglevel=error)
      if [ $? -eq 0 ]; then
        printf "%b\n" "   ${GREEN}[OK] $name dependencies updated${RESET}"
      else
        printf "%b\n" "   ${RED}[ERROR] $name dependency update failed${RESET}"
        exit 1
      fi
    else
      printf "%b\n" "   ${GREEN}[OK] $name dependencies up to date${RESET}"
    fi
  fi
}

# Clean stale .js files (compiled next to .ts sources - shouldn't exist)
if [ -f "$REPO_ROOT/dev/scripts/clean-stale-js.sh" ]; then
  "$REPO_ROOT/dev/scripts/clean-stale-js.sh" > /dev/null 2>&1
fi

# Check backend dependencies
check_and_install_deps "$REPO_ROOT/web/backend" "Backend"

if [ "$TELNET_ONLY" = true ]; then
  printf "%b\n" "${YELLOW}→ Telnet-only: Skipping frontend/SDK dependencies and builds${RESET}"
else
  # Check frontend dependencies
  check_and_install_deps "$REPO_ROOT/web/frontend" "Frontend"

  # Check config app dependencies
  check_and_install_deps "$REPO_ROOT/web/config-app" "Config App"

  # Check SDK dependencies and build
  if [ ! -d "$REPO_ROOT/sdk/node_modules" ]; then
    printf "%b\n" "${CYAN}→ SDK: Installing dependencies (this may take a minute)...${RESET}"
    (cd "$REPO_ROOT/sdk" && npm install --loglevel=error)
    if [ $? -eq 0 ]; then
      printf "%b\n" "   ${GREEN}[OK] SDK dependencies installed${RESET}"
    else
      printf "%b\n" "   ${RED}[ERROR] SDK dependency installation failed${RESET}"
      printf "%b\n" "   ${WHITE}Try running: cd sdk && npm install${RESET}"
      exit 1
    fi
  else
    printf "%b\n" "   ${GREEN}[OK] SDK dependencies up to date${RESET}"
  fi

  # Check if SDK needs rebuild (smart caching)
  SDK_NEEDS_BUILD=false
  if [ ! -d "$REPO_ROOT/sdk/dist" ]; then
    SDK_NEEDS_BUILD=true
  elif [ -n "$(find "$REPO_ROOT/sdk/core" "$REPO_ROOT/sdk/engines" "$REPO_ROOT/sdk/utils" -name "*.ts" -newer "$REPO_ROOT/sdk/dist/index.js" 2>/dev/null | head -1)" ]; then
    SDK_NEEDS_BUILD=true
  fi

  if [ "$SDK_NEEDS_BUILD" = true ]; then
    printf "%b\n" "${CYAN}-> SDK: Building (source changed)...${RESET}"
    (cd "$REPO_ROOT/sdk" && npm run build --loglevel=error)
    if [ $? -eq 0 ]; then
      printf "%b\n" "   ${GREEN}[OK] SDK built successfully${RESET}"
    else
      printf "%b\n" "   ${RED}[ERROR] SDK build failed${RESET}"
      printf "%b\n" "   ${WHITE}Try running: cd sdk && npm run build${RESET}"
      exit 1
    fi
  else
    printf "%b\n" "   ${GREEN}[OK] SDK up to date (skipped rebuild)${RESET}"
  fi

  # Build all TypeScript doors IN PARALLEL (CRITICAL - prevents stale code issues)
  # All production doors live in Doors/ - no more sdk/doors/
  printf "%b\n" "${CYAN}-> TypeScript Doors: Building all doors in Doors/ (parallel)...${RESET}"
  DOOR_PIDS=""
  DOOR_NAMES=""

  # Build all TypeScript doors in Doors/ directory
  for door_dir in "$REPO_ROOT/Doors"/*/ ; do
    if [ -f "$door_dir/package.json" ]; then
      # Check if it's a TypeScript door (has tsconfig.json or *.ts files)
      if [ -f "$door_dir/tsconfig.json" ] || [ -n "$(find "$door_dir" -maxdepth 2 -name "*.ts" 2>/dev/null | head -1)" ]; then
        door_name=$(basename "$door_dir")
        # Check if source is newer than dist (if dist exists)
        NEEDS_BUILD=false
        if [ ! -d "$door_dir/dist" ] || [ ! -f "$door_dir/dist/index.js" ]; then
          NEEDS_BUILD=true
        else
          # Check for any .ts files newer than dist/index.js
          NEWEST_SRC=$(find "$door_dir" -name "*.ts" -newer "$door_dir/dist/index.js" 2>/dev/null | head -1)
          if [ -n "$NEWEST_SRC" ]; then
            NEEDS_BUILD=true
          fi
        fi

        if [ "$NEEDS_BUILD" = true ]; then
          # Build in background
          (cd "$door_dir" && npm run build --loglevel=error > /dev/null 2>&1) &
          DOOR_PIDS="$DOOR_PIDS $!"
          DOOR_NAMES="$DOOR_NAMES $door_name"
        fi
      fi
    fi
  done

  # Wait for all door builds
  DOOR_COUNT=0
  DOOR_ERRORS=0
  for pid in $DOOR_PIDS; do
    wait $pid
    if [ $? -eq 0 ]; then
      ((DOOR_COUNT++))
    else
      ((DOOR_ERRORS++))
    fi
  done

  if [ $DOOR_COUNT -gt 0 ] || [ $DOOR_ERRORS -gt 0 ]; then
    printf "%b\n" "   ${GREEN}[OK] Built $DOOR_COUNT door(s)${RESET}${DOOR_ERRORS:+, ${YELLOW}$DOOR_ERRORS skipped${RESET}}"
  else
    printf "%b\n" "   ${GREEN}[OK] All TypeScript doors up to date (skipped rebuild)${RESET}"
  fi

  # Check and build @amiexpress/terminal package (required by SDK and BBS frontends)
  check_and_install_deps "$REPO_ROOT/packages/terminal" "Terminal Package"

  # Check if Terminal package needs rebuild (smart caching)
  TERM_NEEDS_BUILD=false
  if [ ! -d "$REPO_ROOT/packages/terminal/dist" ] || [ ! -f "$REPO_ROOT/packages/terminal/dist/index.js" ]; then
    TERM_NEEDS_BUILD=true
  elif [ -n "$(find "$REPO_ROOT/packages/terminal/src" -name "*.ts" -o -name "*.tsx" -newer "$REPO_ROOT/packages/terminal/dist/index.js" 2>/dev/null | head -1)" ]; then
    TERM_NEEDS_BUILD=true
  fi

  if [ "$TERM_NEEDS_BUILD" = true ]; then
    printf "%b\n" "${CYAN}-> Terminal Package: Building (source changed)...${RESET}"
    (cd "$REPO_ROOT/packages/terminal" && npm run build --loglevel=error)
    if [ $? -eq 0 ]; then
      printf "%b\n" "   ${GREEN}[OK] Terminal Package built${RESET}"
    else
      printf "%b\n" "   ${RED}[ERROR] Terminal Package build failed${RESET}"
      exit 1
    fi
  else
    printf "%b\n" "   ${GREEN}[OK] Terminal Package up to date (skipped rebuild)${RESET}"
  fi

  # Check SDK Preview Frontend dependencies
  check_and_install_deps "$REPO_ROOT/sdk/tools/preview/frontend" "SDK Preview Frontend"
fi

DO_BUILD_BBS=true
DO_BUILD_ADMIN=true
DO_BUILD_SDK=true

if [ "$TELNET_ONLY" = true ]; then
  DO_BUILD_BBS=false
  DO_BUILD_ADMIN=false
  DO_BUILD_SDK=false
  printf "%b\n" "${CYAN}-> Telnet-only: Skipping frontend builds${RESET}"
elif [ "$OPEN_MODE" = "bbs-only" ]; then
  DO_BUILD_ADMIN=false
  DO_BUILD_SDK=false
  printf "%b\n" "${CYAN}-> Building frontends (BBS-only mode)...${RESET}"
elif [ "$OPEN_MODE" = "sdk-only" ]; then
  DO_BUILD_BBS=false
  DO_BUILD_ADMIN=false
  printf "%b\n" "${CYAN}-> Building frontends (SDK-only mode)...${RESET}"
else
  printf "%b\n" "${CYAN}-> Building all frontends IN PARALLEL...${RESET}"
fi

# Start all frontend builds in parallel (HUGE time savings)
BBS_PID=""
ADMIN_PID=""
SDK_PID=""

if [ "$DO_BUILD_BBS" = true ]; then
  # Skip if dist exists and is newer than src
  if [ -d "$REPO_ROOT/web/frontend/dist" ]; then
    NEWEST_SRC=$(find "$REPO_ROOT/web/frontend/src" -name "*.ts" -o -name "*.tsx" -newer "$REPO_ROOT/web/frontend/dist/index.html" 2>/dev/null | head -1)
    if [ -z "$NEWEST_SRC" ]; then
      printf "%b\n" "   ${GREEN}[1/3] BBS Terminal: up to date (skipped)${RESET}"
    else
      (cd "$REPO_ROOT/web/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
      BBS_PID=$!
      printf "%b\n" "   ${CYAN}[1/3] BBS Terminal: building...${RESET}"
    fi
  else
    (cd "$REPO_ROOT/web/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
    BBS_PID=$!
    printf "%b\n" "   ${CYAN}[1/3] BBS Terminal: building...${RESET}"
  fi
fi

if [ "$DO_BUILD_ADMIN" = true ]; then
  if [ -d "$REPO_ROOT/web/config-app/dist" ]; then
    NEWEST_SRC=$(find "$REPO_ROOT/web/config-app/src" -name "*.ts" -o -name "*.tsx" -newer "$REPO_ROOT/web/config-app/dist/index.html" 2>/dev/null | head -1)
    if [ -z "$NEWEST_SRC" ]; then
      printf "%b\n" "   ${GREEN}[2/3] Admin Config: up to date (skipped)${RESET}"
    else
      (cd "$REPO_ROOT/web/config-app" && npm run build --loglevel=error > /dev/null 2>&1) &
      ADMIN_PID=$!
      printf "%b\n" "   ${CYAN}[2/3] Admin Config: building...${RESET}"
    fi
  else
    (cd "$REPO_ROOT/web/config-app" && npm run build --loglevel=error > /dev/null 2>&1) &
    ADMIN_PID=$!
    printf "%b\n" "   ${CYAN}[2/3] Admin Config: building...${RESET}"
  fi
fi

if [ "$DO_BUILD_SDK" = true ]; then
  if [ -d "$REPO_ROOT/sdk/tools/preview/frontend/dist" ]; then
    NEWEST_SRC=$(find "$REPO_ROOT/sdk/tools/preview/frontend/src" -name "*.ts" -o -name "*.tsx" -newer "$REPO_ROOT/sdk/tools/preview/frontend/dist/index.html" 2>/dev/null | head -1)
    if [ -z "$NEWEST_SRC" ]; then
      printf "%b\n" "   ${GREEN}[3/3] SDK Preview: up to date (skipped)${RESET}"
    else
      (cd "$REPO_ROOT/sdk/tools/preview/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
      SDK_PID=$!
      printf "%b\n" "   ${CYAN}[3/3] SDK Preview: building...${RESET}"
    fi
  else
    (cd "$REPO_ROOT/sdk/tools/preview/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
    SDK_PID=$!
    printf "%b\n" "   ${CYAN}[3/3] SDK Preview: building...${RESET}"
  fi
fi

# Wait for all builds to complete
BUILD_ERRORS=0
if [ -n "$BBS_PID" ]; then
  wait $BBS_PID || ((BUILD_ERRORS++))
fi
if [ -n "$ADMIN_PID" ]; then
  wait $ADMIN_PID || ((BUILD_ERRORS++))
fi
if [ -n "$SDK_PID" ]; then
  wait $SDK_PID || ((BUILD_ERRORS++))
fi

if [ $BUILD_ERRORS -eq 0 ]; then
  printf "%b\n" "   ${GREEN}[OK] Frontend builds complete${RESET}"
else
  printf "%b\n" "   ${YELLOW}[WARNING] $BUILD_ERRORS frontend build(s) had issues${RESET}"
fi

# TypeScript check runs in background (non-blocking - just warns)
printf "%b\n" "${CYAN}-> TypeScript check running in background...${RESET}"
(cd "$REPO_ROOT/web/backend" && npx tsc --noEmit > /dev/null 2>&1; if [ $? -ne 0 ]; then echo "[TS] TypeScript errors - run: cd web/backend && npx tsc --noEmit"; fi) &
TS_CHECK_PID=$!

echo ""
printf "%b\n" "${GREEN}${BOLD}→ Environment setup complete!${RESET}"
echo ""

fi  # End of QUICK_MODE check (if QUICK_MODE=true, all above was skipped)

# Always kill any existing servers / TUI / watchers first so a re-run never
# fights with a previous instance. kill-servers.sh handles the lockfile,
# zombie procs (start-servers, watch-doors, tsx, build-wasm), and the dev/
# console TUI. If anything was running, it's gone after this returns.
LOCKFILE="/tmp/amiexpress-servers.lock"
if [ -f "$LOCKFILE" ]; then
  LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    printf "%b\n" "${YELLOW}[INFO] Existing servers running (PID $LOCK_PID) — stopping them first${RESET}"
  fi
fi
./dev/scripts/kill-servers.sh || true
rm -f "$LOCKFILE"
echo $$ > "$LOCKFILE"

# Build MCP search indexes if missing (compact Amiga knowledge base lookups)
if [ ! -f "$REPO_ROOT/mcp-server/data/ndk-structs-index.json" ]; then
  printf "%b\n" "${CYAN}-> Building MCP knowledge base indexes...${RESET}"
  (cd "$REPO_ROOT" && node mcp-server/build-indexes.js 2>/dev/null) || true
fi

# Regenerate LVO/struct maps if index is newer than generated files
LVO_GEN="$REPO_ROOT/web/backend/src/amiga-emulation/constants/lvo-names.generated.ts"
if [ ! -f "$LVO_GEN" ] || [ "$REPO_ROOT/mcp-server/data/ndk-structs-index.json" -nt "$LVO_GEN" ]; then
  printf "%b\n" "${CYAN}-> Generating LVO/struct maps from NDK index...${RESET}"
  (cd "$REPO_ROOT" && node dev/scripts/generate-lvo-maps.js 2>/dev/null) || true
fi

printf "%b\n" "${CYAN}-> Starting servers (unified deployment - all frontends served from backend)...${RESET}"
echo ""

# Enhanced trap to kill all servers and cleanup on exit
# - Kill entire process group (all children)
# - Remove lockfile
# - Wait for graceful shutdown
cleanup_servers() {
  echo ""
  printf "%b\n" "${CYAN}→ Stopping servers...${RESET}"

  # Kill backend process and all children
  if [ -n "$BACKEND_PID" ]; then
    # Try graceful shutdown first
    kill -TERM "$BACKEND_PID" 2>/dev/null

    # Also kill any child processes (watch-doors spawns backend)
    pkill -P "$BACKEND_PID" 2>/dev/null
  fi

  # Kill preview process
  if [ -n "$PREVIEW_PID" ]; then
    kill -TERM "$PREVIEW_PID" 2>/dev/null
    pkill -P "$PREVIEW_PID" 2>/dev/null
  fi

  # Give processes 2 seconds to terminate gracefully
  sleep 2

  # Force kill if still alive
  if [ -n "$BACKEND_PID" ]; then
    kill -9 "$BACKEND_PID" 2>/dev/null
    pkill -9 -P "$BACKEND_PID" 2>/dev/null
  fi

  if [ -n "$PREVIEW_PID" ]; then
    kill -9 "$PREVIEW_PID" 2>/dev/null
    pkill -9 -P "$PREVIEW_PID" 2>/dev/null
  fi

  # Wait for all children
  wait 2>/dev/null

  # Remove lockfile
  rm -f "$LOCKFILE"

  printf "%b\n" "${GREEN}[OK] Servers stopped${RESET}"
}

trap cleanup_servers EXIT INT TERM

# Start backend in background (conditionally filter output, always save to log)
# Backend serves all three frontends from built static files:
# - BBS Terminal at /
# - Admin Config at /admin/
# - SDK Preview at /sdk/
printf "%b" "   ${MAGENTA}[1/2]${RESET} Starting backend... "

if [ "$WATCH_DOORS" = true ]; then
  # WATCH MODE: Use file watcher for auto-restart on door changes
  printf "%b\n" "${GREEN}[WATCH MODE]${RESET}"
  printf "%b\n" "   ${CYAN}Door file watcher will auto-restart backend when doors change${RESET}"
  if [ "$DEBUG_MODE" = true ]; then
    printf "%b\n" "   ${CYAN}DEBUG_68K enabled for verbose 68K logging${RESET}"
    printf "%b\n" "   ${CYAN}DEBUG_EXEC/DOS/FILE/TRAP enabled for library debugging${RESET}"
    printf "%b\n" "   ${CYAN}DOOR_PROFILE enabled for performance profiling${RESET}"
    # Start in background with job control for process group
    # All debug flags enabled: 68K execution, library calls, file ops, trap handlers, profiling
    (cd "$REPO_ROOT" && DEBUG_68K=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1 DOOR_CALL_TRACKING=1 DEBUG_68K_NATIVE=1 AEDOOR_TRACE=1 DEBUG_LIBRARY_TRAPS=1 DEBUG_EXEC=1 DEBUG_DOS=1 DEBUG_FILE=1 DEBUG_TRAP=1 DOOR_PROFILE=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx dev/scripts/watch-doors.ts 2>&1 | tee "$BACKEND_LOG") &
  else
    # Start in background with job control for process group
    (cd "$REPO_ROOT" && BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx dev/scripts/watch-doors.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|\[WEB\]|Database initialized|Error|Warning|\[WATCH\]|Restarting)") &
  fi
  BACKEND_PID=$!
else
  # NORMAL MODE: Direct backend start (no auto-restart)
  printf "%b\n" "${GREEN}[OK]${RESET}"
  printf "%b\n" "   ${CYAN}XIM protocol debugging enabled (logs/xim-debug.json)${RESET}"
  if [ "$DEBUG_MODE" = true ]; then
    # DEBUG MODE: Show all logs and save to file (all debug flags enabled)
    # DEBUG_68K=1 enables verbose 68K logging
    # DEBUG_EXEC/DOS/FILE/TRAP=1 enables library/file/trap debugging (sync file I/O logs)
    # DOOR_PROFILE=1 enables performance profiling output
    (cd "$REPO_ROOT/web/backend" && DEBUG_68K=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1 DOOR_CALL_TRACKING=1 DEBUG_68K_NATIVE=1 AEDOOR_TRACE=1 DEBUG_LIBRARY_TRAPS=1 DEBUG_EXEC=1 DEBUG_DOS=1 DEBUG_FILE=1 DEBUG_TRAP=1 DOOR_PROFILE=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx src/index.ts 2>&1 | tee "$BACKEND_LOG"; echo "BACKEND_DONE") &
  else
    # NORMAL MODE: Clean output, no verbose 68K logging (DEBUG_68K not set)
    (cd "$REPO_ROOT/web/backend" && BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx src/index.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|\[WEB\]|Database initialized|Error|Warning)"; echo "BACKEND_DONE") &
  fi
  BACKEND_PID=$!
fi

# Start SDK preview backend server in background (handles SDK door preview WebSocket API)
printf "%b\n" "${GREEN}[STARTED]${RESET}"
if [ "$TELNET_ONLY" = true ]; then
  PREVIEW_PID=""
  printf "%b\n" "   ${YELLOW}[SKIPPED]${RESET} SDK preview backend (telnet-only)"
else
  printf "%b" "   ${MAGENTA}[2/2]${RESET} Starting SDK preview backend... "
  # DEBUG_OUTPUT controls whether door-handling debug messages are shown
  # In normal mode, door output is clean without debug messages
  # In debug mode, all debug messages are shown
  (cd "$REPO_ROOT/sdk" && DEBUG_OUTPUT="$DEBUG_OUTPUT" node tools/preview/server.js 2>&1 | tee "$PREVIEW_LOG") &
  PREVIEW_PID=$!
  printf "%b\n" "${GREEN}[STARTED]${RESET}"
fi

# Wait for backend to be ready (check port 3001)
echo ""
printf "%b\n" "${CYAN}→ Waiting for backend to be ready (port 3001)...${RESET}"
WAIT_COUNT=0
MAX_WAIT=60  # 60 seconds max
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  if lsof -ti:3001 > /dev/null 2>&1; then
    printf "%b\n" "   ${GREEN}[OK] Backend listening on port 3001${RESET}"
    break
  fi
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))

  # Check if backend crashed
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    printf "%b\n" " ${RED}[ERROR]${RESET}"
    echo ""
    printf "%b\n" "${RED}[ERROR] Backend crashed during startup!${RESET}"
    printf "%b\n" "${WHITE}Check logs/backend.log for details${RESET}"
    tail -20 "$BACKEND_LOG"
    exit 1
  fi
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
  echo ""
  printf "%b\n" "${YELLOW}[WARNING] Backend did not start within 60 seconds${RESET}"
  printf "%b\n" "${WHITE}Check logs/backend.log for details${RESET}"
  exit 1
fi

# Give everything a moment to stabilize
sleep 2

echo ""
printf "%b\n" "${GREEN}${BOLD}"
echo "======================================================================"
echo "                   AmiExpress BBS - Servers Running                  "
echo "======================================================================"
printf "%b\n" "${RESET}"
printf "%b\n" "${CYAN}  UNIFIED DEPLOYMENT (All Frontends Served from Single Backend):${RESET}"
printf "%b\n" "${CYAN}  ----------------------------------------------------------------${RESET}"
echo ""
if [ "$TELNET_ONLY" = true ]; then
  printf "%b\n" "${YELLOW}  Telnet-only mode: frontends not built/started${RESET}"
  echo ""
else
  printf "%b\n" "${GREEN}  [BBS]${RESET}    ${WHITE}http://localhost:3001/${RESET}"
  printf "%b\n" "           ${CYAN}Main BBS Terminal Interface${RESET}"
  printf "%b\n" "           ${YELLOW}Login: sysop / sysop${RESET}"
  echo ""
  printf "%b\n" "${MAGENTA}  [ADMIN]${RESET}  ${WHITE}http://localhost:3001/admin/${RESET}"
  printf "%b\n" "           ${CYAN}Configuration Management Panel${RESET}"
  printf "%b\n" "           ${YELLOW}Login: sysop / sysop${RESET}"
  echo ""
  printf "%b\n" "${BLUE}  [SDK]${RESET}    ${WHITE}http://localhost:3001/sdk/${RESET}"
  printf "%b\n" "           ${CYAN}Door Development Preview Tool${RESET}"
  printf "%b\n" "           ${YELLOW}(Backend API on port 8080)${RESET}"
  echo ""
fi
printf "%b\n" "${WHITE}  [API]${RESET}    ${WHITE}http://localhost:3001/api/${RESET}"
printf "%b\n" "           ${CYAN}Backend REST API Server${RESET}"
printf "%b\n" "${WHITE}  [TELNET]${RESET} ${WHITE}telnet localhost ${TELNET_PORT:-64128}${RESET}"
printf "%b\n" "${WHITE}  [SSH]${RESET}    ${WHITE}ssh -p ${SSH_PORT:-31337} user@localhost${RESET}"
echo ""
if [ "$DEBUG_MODE" = true ]; then
printf "%b\n" "${YELLOW}  [DEBUG] MODE: Full logs visible below${RESET}"
echo ""
fi
printf "%b\n" "${WHITE}  Production URLs: ${CYAN}https://bbs.uprough.net/${RESET}"
printf "%b\n" "                   ${CYAN}https://bbs.uprough.net/admin/${RESET}"
printf "%b\n" "                   ${CYAN}https://bbs.uprough.net/sdk/${RESET}"
echo ""
if [ "$TELNET_ONLY" = true ]; then
  printf "%b\n" "${WHITE}  Note: Telnet-only skips frontend builds and preview backend${RESET}"
else
  printf "%b\n" "${WHITE}  Note: All frontends built and served as static files from backend${RESET}"
  printf "%b\n" "${WHITE}        No separate dev servers running for instant startup${RESET}"
fi
echo ""
printf "%b\n" "${RED}  Press Ctrl+C to stop all servers${RESET}"
echo ""
printf "%b\n" "${GREEN}${BOLD}"
echo "======================================================================"
printf "%b\n" "${RESET}"
echo ""

# Open browser tabs based on OPEN_MODE
# All three apps now served from single backend on port 3001
BBS_URL="http://localhost:3001/"
ADMIN_URL="http://localhost:3001/admin/"
SDK_URL="http://localhost:3001/sdk/"

if [ "$OPEN_MODE" = "telnet-only" ]; then
  printf "%b\n" "${YELLOW}[LAUNCH]${RESET} Telnet-only mode: not opening browser tabs"
elif [ "$OPEN_MODE" = "full" ]; then
  # Open all three tabs: BBS, Admin, SDK
  printf "%b\n" "${GREEN}[LAUNCH]${RESET} Opening BBS at ${CYAN}$BBS_URL${RESET}..."
  printf "%b\n" "${MAGENTA}[CONFIG]${RESET} Opening Admin/Settings at ${CYAN}$ADMIN_URL${RESET}..."
  printf "%b\n" "${BLUE}[SDK]${RESET} Opening SDK Preview at ${CYAN}$SDK_URL${RESET}..."

  # Detect OS and open all three URLs in browser tabs
  if command -v open &> /dev/null; then
    # macOS
    open "$BBS_URL" 2>/dev/null &
    sleep 0.5
    open "$ADMIN_URL" 2>/dev/null &
    sleep 0.5
    open "$SDK_URL" 2>/dev/null &
  elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "$BBS_URL" 2>/dev/null &
    sleep 0.5
    xdg-open "$ADMIN_URL" 2>/dev/null &
    sleep 0.5
    xdg-open "$SDK_URL" 2>/dev/null &
  elif command -v start &> /dev/null; then
    # Windows (Git Bash)
    start "$BBS_URL" 2>/dev/null &
    sleep 0.5
    start "$ADMIN_URL" 2>/dev/null &
    sleep 0.5
    start "$SDK_URL" 2>/dev/null &
  elif command -v explorer.exe &> /dev/null; then
    # WSL
    explorer.exe "$BBS_URL" 2>/dev/null &
    sleep 0.5
    explorer.exe "$ADMIN_URL" 2>/dev/null &
    sleep 0.5
    explorer.exe "$SDK_URL" 2>/dev/null &
  else
    printf "%b\n" "${YELLOW}[WARNING] Could not detect browser command. Please open URLs manually:${RESET}"
    printf "%b\n" "   ${CYAN}$BBS_URL${RESET}"
    printf "%b\n" "   ${CYAN}$ADMIN_URL${RESET}"
    printf "%b\n" "   ${CYAN}$SDK_URL${RESET}"
  fi
elif [ "$OPEN_MODE" = "sdk-only" ]; then
  # Open SDK only
  printf "%b\n" "${BLUE}[SDK]${RESET} Opening SDK Preview at ${CYAN}$SDK_URL${RESET}..."

  # Detect OS and open SDK URL in browser
  if command -v open &> /dev/null; then
    # macOS
    open "$SDK_URL" 2>/dev/null &
  elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "$SDK_URL" 2>/dev/null &
  elif command -v start &> /dev/null; then
    # Windows (Git Bash)
    start "$SDK_URL" 2>/dev/null &
  elif command -v explorer.exe &> /dev/null; then
    # WSL
    explorer.exe "$SDK_URL" 2>/dev/null &
  else
    printf "%b\n" "${YELLOW}[WARNING] Could not detect browser command. Please open URL manually:${RESET}"
    printf "%b\n" "   ${CYAN}$SDK_URL${RESET}"
  fi
else
  # BBS only
  printf "%b\n" "${GREEN}[LAUNCH]${RESET} Opening BBS at ${CYAN}$BBS_URL${RESET}..."

  if command -v open &> /dev/null; then
    open "$BBS_URL" 2>/dev/null &
  elif command -v xdg-open &> /dev/null; then
    xdg-open "$BBS_URL" 2>/dev/null &
  elif command -v start &> /dev/null; then
    start "$BBS_URL" 2>/dev/null &
  elif command -v explorer.exe &> /dev/null; then
    explorer.exe "$BBS_URL" 2>/dev/null &
  else
    printf "%b\n" "${YELLOW}[WARNING] Could not detect browser command. Please open URL manually:${RESET}"
    printf "%b\n" "   ${CYAN}$BBS_URL${RESET}"
  fi
fi

echo ""

# Keep script running and wait for both processes
wait
