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

# Parse command-line flags
DEBUG_MODE=false
DEBUG_OUTPUT="false"
OPEN_MODE="full"  # Default: Open all three tabs (BBS, Admin, SDK)

# Check all arguments
for arg in "$@"; do
  case "$arg" in
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
  esac
done

# Display startup mode
echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                    AmiExpress BBS Startup                         ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

if [ "$DEBUG_MODE" = true ]; then
  echo -e "${YELLOW}→ Starting in DEBUG mode (full logs enabled)${RESET}"
else
  echo -e "${CYAN}→ Starting in normal mode (clean door output)${RESET}"
  echo -e "   ${WHITE}Use --debug to see full debug logs${RESET}"
fi

if [ "$OPEN_MODE" = "full" ]; then
  echo -e "${CYAN}→ Will open BBS, Admin/Settings, and SDK Preview in browser${RESET}"
  echo -e "   ${WHITE}Use --sdk-only to open only SDK${RESET}"
else
  echo -e "${CYAN}→ Will open SDK Preview only in browser${RESET}"
  echo -e "   ${WHITE}Use --full to open all three apps${RESET}"
fi

# Get the repository root directory (portable)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Create logs directory if it doesn't exist
LOGS_DIR="$REPO_ROOT/logs"
mkdir -p "$LOGS_DIR"

# Use fixed log filenames (will be overwritten each time)
BACKEND_LOG="$LOGS_DIR/backend.log"
FRONTEND_LOG="$LOGS_DIR/frontend.log"
PREVIEW_LOG="$LOGS_DIR/preview.log"
CONFIG_LOG="$LOGS_DIR/config.log"

echo -e "${CYAN}→ Logs will be saved to:${RESET}"
echo -e "   ${WHITE}$BACKEND_LOG${RESET}"
echo -e "   ${WHITE}$FRONTEND_LOG${RESET}"
echo -e "   ${WHITE}$PREVIEW_LOG${RESET}"
echo -e "   ${WHITE}$CONFIG_LOG${RESET}"
echo ""

# === ENHANCED SETUP CHECKS ===
echo -e "${CYAN}→ Checking environment setup...${RESET}"
echo ""

# Check for .env.local
if [ ! -f "$REPO_ROOT/.env.local" ]; then
  echo -e "${YELLOW}[WARNING] .env.local not found${RESET}"
  echo -e "   ${WHITE}Copying .env.example to .env.local...${RESET}"
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.local"
  echo -e "   ${GREEN}[OK] Created .env.local - please review and update if needed${RESET}"
  echo ""
fi

# Unset NODE_ENV for dependency installation (we need devDependencies)
unset NODE_ENV

# Function to check and install dependencies
check_and_install_deps() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir/node_modules" ]; then
    echo -e "${CYAN}→ $name: Installing dependencies (this may take a minute)...${RESET}"
    (cd "$dir" && npm install --include=dev --loglevel=error)
    if [ $? -eq 0 ]; then
      echo -e "   ${GREEN}[OK] $name dependencies installed${RESET}"
    else
      echo -e "   ${RED}[ERROR] $name dependency installation failed${RESET}"
      echo -e "   ${WHITE}Try running: cd $dir && npm install --include=dev${RESET}"
      exit 1
    fi
  else
    # Check if package.json is newer than node_modules (dependencies changed)
    if [ "$dir/package.json" -nt "$dir/node_modules" ]; then
      echo -e "${CYAN}→ $name: Dependencies changed, updating...${RESET}"
      (cd "$dir" && npm install --include=dev --loglevel=error)
      if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}[OK] $name dependencies updated${RESET}"
      else
        echo -e "   ${RED}[ERROR] $name dependency update failed${RESET}"
        exit 1
      fi
    else
      echo -e "   ${GREEN}[OK] $name dependencies up to date${RESET}"
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
  echo -e "${CYAN}→ SDK: Installing dependencies (this may take a minute)...${RESET}"
  (cd "$REPO_ROOT/sdk" && npm install --loglevel=error)
  if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}[OK] SDK dependencies installed${RESET}"
  else
    echo -e "   ${RED}[ERROR] SDK dependency installation failed${RESET}"
    echo -e "   ${WHITE}Try running: cd sdk && npm install${RESET}"
    exit 1
  fi
else
  echo -e "   ${GREEN}[OK] SDK dependencies up to date${RESET}"
fi

# Check if SDK is built
if [ ! -d "$REPO_ROOT/sdk/dist" ] || [ ! -f "$REPO_ROOT/sdk/dist/index.js" ]; then
  echo -e "${CYAN}→ SDK: Building (this may take a minute)...${RESET}"
  (cd "$REPO_ROOT/sdk" && npm run build --loglevel=error)
  if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}[OK] SDK built successfully${RESET}"
  else
    echo -e "   ${RED}[ERROR] SDK build failed${RESET}"
    echo -e "   ${WHITE}Try running: cd sdk && npm run build${RESET}"
    exit 1
  fi
else
  echo -e "   ${GREEN}[OK] SDK already built${RESET}"
fi

# Always rebuild all frontends for unified deployment (ensures correct base paths)
echo -e "${CYAN}→ Building all frontends for unified deployment...${RESET}"
echo -e "   ${WHITE}(This takes 15-30 seconds, please wait...)${RESET}"

# Build BBS Terminal Frontend (/)
echo -ne "   ${MAGENTA}[1/3]${RESET} Building BBS Terminal... "
(cd "$REPO_ROOT/web/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
BUILD_PID=$!
while kill -0 $BUILD_PID 2>/dev/null; do
  echo -n "."
  sleep 1
done
wait $BUILD_PID
if [ $? -eq 0 ]; then
  echo -e " ${GREEN}[OK]${RESET}"
else
  echo -e " ${YELLOW}[WARNING]${RESET}"
fi

# Build Admin Config Frontend (/admin/)
echo -ne "   ${MAGENTA}[2/3]${RESET} Building Admin Config... "
(cd "$REPO_ROOT/web/config-app" && npm run build --loglevel=error > /dev/null 2>&1) &
BUILD_PID=$!
while kill -0 $BUILD_PID 2>/dev/null; do
  echo -n "."
  sleep 1
done
wait $BUILD_PID
if [ $? -eq 0 ]; then
  echo -e " ${GREEN}[OK]${RESET}"
else
  echo -e " ${YELLOW}[WARNING]${RESET}"
fi

# Build SDK Preview Frontend (/sdk/)
echo -ne "   ${MAGENTA}[3/3]${RESET} Building SDK Preview... "
(cd "$REPO_ROOT/sdk/tools/preview/frontend" && npm run build --loglevel=error > /dev/null 2>&1) &
BUILD_PID=$!
while kill -0 $BUILD_PID 2>/dev/null; do
  echo -n "."
  sleep 1
done
wait $BUILD_PID
if [ $? -eq 0 ]; then
  echo -e " ${GREEN}[OK]${RESET}"
else
  echo -e " ${YELLOW}[WARNING]${RESET}"
fi

echo -e "   ${GREEN}[OK] All frontends built successfully${RESET}"

# TypeScript check for backend (quick check only, don't block startup)
echo -e "${CYAN}→ Running quick TypeScript check...${RESET}"
(cd "$REPO_ROOT/web/backend" && npx tsc --noEmit > /dev/null 2>&1)
if [ $? -ne 0 ]; then
  echo -e "   ${YELLOW}[WARNING] TypeScript errors detected in backend${RESET}"
  echo -e "   ${WHITE}Run 'cd web/backend && npx tsc --noEmit' to see details${RESET}"
else
  echo -e "   ${GREEN}[OK] TypeScript check passed${RESET}"
fi

echo ""
echo -e "${GREEN}${BOLD}→ Environment setup complete!${RESET}"
echo ""

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo -e "${CYAN}→ Starting backend, frontend, config app, and preview server...${RESET}"
echo ""

# Trap to kill all servers on exit
trap 'echo ""; echo -e "${CYAN}→ Stopping servers...${RESET}"; kill $BACKEND_PID $FRONTEND_PID $CONFIG_PID $PREVIEW_PID 2>/dev/null; wait; echo -e "${GREEN}[OK] Servers stopped${RESET}"; exit' EXIT INT TERM

# Start backend in background (conditionally filter output, always save to log)
echo -ne "   ${MAGENTA}[1/4]${RESET} Starting backend... "
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show all logs and save to file
  (cd "$REPO_ROOT/web/backend" && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG"; echo "BACKEND_DONE") &
else
  # NORMAL MODE: Show filtered messages but save full logs to file
  (cd "$REPO_ROOT/web/backend" && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|[WEB]|Database initialized|Error|Warning)"; echo "BACKEND_DONE") &
fi
BACKEND_PID=$!

# Start frontend in background (conditionally show output, always save to log)
echo -e "${GREEN}[STARTED]${RESET}"
echo -ne "   ${MAGENTA}[2/4]${RESET} Starting frontend... "
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show frontend logs and save to file
  (cd "$REPO_ROOT/web/frontend" && npm run dev 2>&1 | tee "$FRONTEND_LOG") &
else
  # NORMAL MODE: Suppress frontend output but save to file
  (cd "$REPO_ROOT/web/frontend" && npm run dev 2>&1 | tee "$FRONTEND_LOG" > /dev/null) &
fi
FRONTEND_PID=$!

# Start config app in background (conditionally show output, always save to log)
echo -e "${GREEN}[STARTED]${RESET}"
echo -ne "   ${MAGENTA}[3/4]${RESET} Starting config app... "
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show config app logs and save to file
  (cd "$REPO_ROOT/web/config-app" && npm run dev 2>&1 | tee "$CONFIG_LOG") &
else
  # NORMAL MODE: Suppress config app output but save to file
  (cd "$REPO_ROOT/web/config-app" && npm run dev 2>&1 | tee "$CONFIG_LOG" > /dev/null) &
fi
CONFIG_PID=$!

# Start SDK preview server in background
echo -e "${GREEN}[STARTED]${RESET}"
echo -ne "   ${MAGENTA}[4/4]${RESET} Starting SDK preview... "
# DEBUG_OUTPUT controls whether door-handling debug messages are shown
# In normal mode, door output is clean without debug messages
# In debug mode, all debug messages are shown
(cd "$REPO_ROOT/sdk" && DEBUG_OUTPUT="$DEBUG_OUTPUT" node tools/preview/server.js 2>&1 | tee "$PREVIEW_LOG") &
PREVIEW_PID=$!
echo -e "${GREEN}[STARTED]${RESET}"

# Wait for backend to be ready (check port 3001)
echo ""
echo -ne "${CYAN}→ Waiting for backend to be ready (port 3001)... ${RESET}"
WAIT_COUNT=0
MAX_WAIT=60  # 60 seconds max
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  if lsof -ti:3001 > /dev/null 2>&1; then
    echo -e " ${GREEN}[OK]${RESET}"
    break
  fi
  echo -n "."
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))

  # Check if backend crashed
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e " ${RED}[ERROR]${RESET}"
    echo ""
    echo -e "${RED}[ERROR] Backend crashed during startup!${RESET}"
    echo -e "${WHITE}Check logs/backend.log for details${RESET}"
    tail -20 "$BACKEND_LOG"
    exit 1
  fi
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
  echo -e " ${YELLOW}[TIMEOUT]${RESET}"
  echo ""
  echo -e "${YELLOW}[WARNING] Backend did not start within 60 seconds${RESET}"
  echo -e "${WHITE}Check logs/backend.log for details${RESET}"
  exit 1
fi

# Give everything a moment to stabilize
sleep 2

# Detect actual frontend port by checking common Vite ports (start with 5173)
FRONTEND_PORT=""
for port in 5173 5174 5175 5176 5177 5178 5179 5180 5181 5182 5183 5184; do
  if lsof -ti:$port > /dev/null 2>&1; then
    FRONTEND_PORT=$port
    break
  fi
done

# Fallback to 5173 if detection fails
if [ -z "$FRONTEND_PORT" ]; then
  FRONTEND_PORT="5173"
fi

echo ""
echo -e "${GREEN}${BOLD}"
echo "======================================================================"
echo "                   AmiExpress BBS - All Servers Running              "
echo "======================================================================"
echo -e "${RESET}"
echo -e "${CYAN}  UNIFIED DEPLOYMENT (Single Backend, Multiple Frontends):${RESET}"
echo -e "${CYAN}  --------------------------------------------------------${RESET}"
echo ""
echo -e "${GREEN}  [BBS]${RESET}    ${WHITE}http://localhost:3001/${RESET}"
echo -e "           ${CYAN}Main BBS Terminal Interface${RESET}"
echo -e "           ${YELLOW}Login: sysop / sysop${RESET}"
echo ""
echo -e "${MAGENTA}  [ADMIN]${RESET}  ${WHITE}http://localhost:3001/admin/${RESET}"
echo -e "           ${CYAN}Configuration Management Panel${RESET}"
echo -e "           ${YELLOW}Login: sysop / sysop${RESET}"
echo ""
echo -e "${BLUE}  [SDK]${RESET}    ${WHITE}http://localhost:3001/sdk/${RESET}"
echo -e "           ${CYAN}Door Development Preview Tool${RESET}"
echo ""
echo -e "${WHITE}  [API]${RESET}    ${WHITE}http://localhost:3001/api/${RESET}"
echo -e "           ${CYAN}Backend REST API Server${RESET}"
echo ""
if [ "$DEBUG_MODE" = true ]; then
echo -e "${YELLOW}  [DEBUG] MODE: Full logs visible below${RESET}"
echo ""
fi
echo -e "${WHITE}  Production URLs: ${CYAN}https://bbs.uprough.net/${RESET}"
echo -e "                   ${CYAN}https://bbs.uprough.net/admin/${RESET}"
echo -e "                   ${CYAN}https://bbs.uprough.net/sdk/${RESET}"
echo ""
echo -e "${RED}  Press Ctrl+C to stop all servers${RESET}"
echo ""
echo -e "${GREEN}${BOLD}"
echo "======================================================================"
echo -e "${RESET}"
echo ""

# Open browser tabs based on OPEN_MODE
# All three apps now served from single backend on port 3001
BBS_URL="http://localhost:3001/"
ADMIN_URL="http://localhost:3001/admin/"
SDK_URL="http://localhost:3001/sdk/"

if [ "$OPEN_MODE" = "full" ]; then
  # Open all three tabs: BBS, Admin, SDK
  echo -e "${GREEN}[LAUNCH]${RESET} Opening BBS at ${CYAN}$BBS_URL${RESET}..."
  echo -e "${MAGENTA}[CONFIG]${RESET} Opening Admin/Settings at ${CYAN}$ADMIN_URL${RESET}..."
  echo -e "${BLUE}[SDK]${RESET} Opening SDK Preview at ${CYAN}$SDK_URL${RESET}..."

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
    echo -e "${YELLOW}[WARNING] Could not detect browser command. Please open URLs manually:${RESET}"
    echo -e "   ${CYAN}$BBS_URL${RESET}"
    echo -e "   ${CYAN}$ADMIN_URL${RESET}"
    echo -e "   ${CYAN}$SDK_URL${RESET}"
  fi
else
  # Open SDK only
  echo -e "${BLUE}[SDK]${RESET} Opening SDK Preview at ${CYAN}$SDK_URL${RESET}..."

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
    echo -e "${YELLOW}[WARNING] Could not detect browser command. Please open URL manually:${RESET}"
    echo -e "   ${CYAN}$SDK_URL${RESET}"
  fi
fi

echo ""

# Keep script running and wait for both processes
wait
