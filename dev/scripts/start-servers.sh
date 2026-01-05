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
  cat <<'EOF'
Usage: ./dev/scripts/start-servers.sh [options]

Options:
  --debug | -v | --verbose   Enable debug mode (full logs)
  --quick | -q               FAST START: Skip all builds, use existing
  --full | --all             Open BBS + Admin/Settings + SDK (default)
  --sdk-only                 Open SDK preview only; build SDK only
  --bbs-only                 Open BBS terminal only; build BBS only
  --no-watch                 Disable door file watcher (auto-restart)
  --help                     Show this help and exit

Note: Door file watcher is ENABLED by default. Backend auto-restarts when
      door files change. Use --no-watch to disable for production-like testing.

Quick mode (--quick) skips: npm checks, SDK build, door builds, frontend builds,
TypeScript check. Use for fast debugging when dependencies haven't changed.
EOF
}

# Parse command-line flags
DEBUG_MODE=false
DEBUG_OUTPUT="false"
OPEN_MODE="full"  # Default: Open all three tabs (BBS, Admin, SDK)
WATCH_DOORS=true  # Default: Enable door file watcher (auto-restart on changes)
QUICK_MODE=false  # Default: Full build (set true with --quick for fast debug startup)

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
    --no-watch)
      WATCH_DOORS=false
      ;;
    --quick|-q)
      QUICK_MODE=true
      ;;
  esac
done

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

  # Delete huge consolidated door log if it exists (prevents 800MB+ files)
  if [ -f "$LOGS_DIR/door-68k.log" ]; then
    local log_size
    log_size=$(du -m "$LOGS_DIR/door-68k.log" 2>/dev/null | cut -f1)
    if [ -n "$log_size" ] && [ "$log_size" -gt 100 ]; then
      printf "%b\n" "${YELLOW}   [CLEANUP] Removing large door-68k.log (${log_size}MB)${RESET}"
      rm -f "$LOGS_DIR/door-68k.log"
    fi
  fi

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

# Clean backend build artifacts that can cause stale runtime
# CRITICAL: Remove stale .js files that override .ts files when using tsx
printf "%b\n" "${CYAN}→ Cleaning stale .js files in amiga-emulation...${RESET}"
STALE_JS=$(find "$REPO_ROOT/web/backend/src/amiga-emulation" -name "*.js" -type f \
  ! -path "*/moira-source/*" ! -path "*/build/*" 2>/dev/null)
if [ -n "$STALE_JS" ]; then
  echo "$STALE_JS" | xargs rm -f
  printf "%b\n" "   ${YELLOW}[CLEANED]${RESET} Removed stale .js files that could override .ts"
else
  printf "%b\n" "   ${GREEN}[OK]${RESET} No stale .js files found"
fi
rm -rf "$REPO_ROOT/web/backend/dist"
rm -f "$REPO_ROOT/web/backend/src/api/"*.js

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

# Check backend dependencies
check_and_install_deps "$REPO_ROOT/web/backend" "Backend"

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
elif [ -n "$(find "$REPO_ROOT/sdk/core" "$REPO_ROOT/sdk/engines" -name "*.ts" -newer "$REPO_ROOT/sdk/dist/index.js" 2>/dev/null | head -1)" ]; then
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

# Build all SDK doors IN PARALLEL (CRITICAL - prevents stale code issues)
printf "%b\n" "${CYAN}-> SDK Doors: Building all example/installed doors (parallel)...${RESET}"
DOOR_PIDS=""
DOOR_NAMES=""

for door_dir in "$REPO_ROOT/sdk/doors"/*/ ; do
  if [ -f "$door_dir/package.json" ]; then
    door_name=$(basename "$door_dir")
    # Only rebuild if source exists and is newer than dist
    if [ -d "$door_dir/src" ]; then
      # Skip if dist/index.js exists and is newer than all src files
      if [ -f "$door_dir/dist/index.js" ]; then
        NEWEST_SRC=$(find "$door_dir/src" -name "*.ts" -newer "$door_dir/dist/index.js" 2>/dev/null | head -1)
        if [ -z "$NEWEST_SRC" ]; then
          continue  # Skip - dist is up to date
        fi
      fi
      # Build in background
      (cd "$door_dir" && npm run build --loglevel=error > /dev/null 2>&1) &
      DOOR_PIDS="$DOOR_PIDS $!"
      DOOR_NAMES="$DOOR_NAMES $door_name"
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
  printf "%b\n" "   ${GREEN}[OK] All doors up to date (skipped rebuild)${RESET}"
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

DO_BUILD_BBS=true
DO_BUILD_ADMIN=true
DO_BUILD_SDK=true

if [ "$OPEN_MODE" = "bbs-only" ]; then
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

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

printf "%b\n" "${CYAN}→ Starting servers (unified deployment - all frontends served from backend)...${RESET}"
echo ""

# Trap to kill all servers on exit
trap 'echo ""; printf "%b\n" "${CYAN}→ Stopping servers...${RESET}"; kill $BACKEND_PID $PREVIEW_PID 2>/dev/null; wait; printf "%b\n" "${GREEN}[OK] Servers stopped${RESET}"; exit' EXIT INT TERM

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
  printf "%b\n" "   ${CYAN}XIM protocol debugging enabled (logs/xim-debug.json)${RESET}"
  (cd "$REPO_ROOT" && XIM_DEBUG_JSON=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx dev/scripts/watch-doors.ts 2>&1 | tee "$BACKEND_LOG") &
  BACKEND_PID=$!
else
  # NORMAL MODE: Direct backend start (no auto-restart)
  printf "%b\n" "${GREEN}[OK]${RESET}"
  printf "%b\n" "   ${CYAN}XIM protocol debugging enabled (logs/xim-debug.json)${RESET}"
  if [ "$DEBUG_MODE" = true ]; then
    # DEBUG MODE: Show all logs and save to file
    (cd "$REPO_ROOT/web/backend" && XIM_DEBUG_JSON=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG"; echo "BACKEND_DONE") &
  else
    # NORMAL MODE: Show filtered messages but save full logs to file
    (cd "$REPO_ROOT/web/backend" && XIM_DEBUG_JSON=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|[WEB]|Database initialized|Error|Warning)"; echo "BACKEND_DONE") &
  fi
  BACKEND_PID=$!
fi

# Start SDK preview backend server in background (handles SDK door preview WebSocket API)
printf "%b\n" "${GREEN}[STARTED]${RESET}"
printf "%b" "   ${MAGENTA}[2/2]${RESET} Starting SDK preview backend... "
# DEBUG_OUTPUT controls whether door-handling debug messages are shown
# In normal mode, door output is clean without debug messages
# In debug mode, all debug messages are shown
(cd "$REPO_ROOT/sdk" && DEBUG_OUTPUT="$DEBUG_OUTPUT" node tools/preview/server.js 2>&1 | tee "$PREVIEW_LOG") &
PREVIEW_PID=$!
printf "%b\n" "${GREEN}[STARTED]${RESET}"

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
printf "%b\n" "${WHITE}  Note: All frontends built and served as static files from backend${RESET}"
printf "%b\n" "${WHITE}        No separate dev servers running for instant startup${RESET}"
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

if [ "$OPEN_MODE" = "full" ]; then
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
