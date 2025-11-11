#!/bin/bash

# Parse command-line flags
DEBUG_MODE=false
DEBUG_OUTPUT="false"
OPEN_MODE="sdk-only"  # Default: Only open SDK Preview

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
if [ "$DEBUG_MODE" = true ]; then
  echo "→ Starting in DEBUG mode (full logs enabled)"
else
  echo "→ Starting in normal mode (clean door output)"
  echo "   Use --debug to see full debug logs"
fi

if [ "$OPEN_MODE" = "full" ]; then
  echo "→ Will open both BBS and SDK Preview in browser"
else
  echo "→ Will open SDK Preview only in browser"
  echo "   Use --full to open both BBS and SDK"
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

echo "→ Logs will be saved to:"
echo "   $BACKEND_LOG"
echo "   $FRONTEND_LOG"
echo "   $PREVIEW_LOG"
echo ""

# === ENHANCED SETUP CHECKS ===
echo "→ Checking environment setup..."
echo ""

# Check for .env.local
if [ ! -f "$REPO_ROOT/.env.local" ]; then
  echo "⚠️  Warning: .env.local not found"
  echo "   Copying .env.example to .env.local..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.local"
  echo "   ✓ Created .env.local - please review and update if needed"
  echo ""
fi

# Unset NODE_ENV for dependency installation (we need devDependencies)
unset NODE_ENV

# Function to check and install dependencies
check_and_install_deps() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir/node_modules" ]; then
    echo "→ $name: Installing dependencies (this may take a minute)..."
    (cd "$dir" && npm install --include=dev --loglevel=error)
    if [ $? -eq 0 ]; then
      echo "   ✓ $name dependencies installed"
    else
      echo "   ❌ $name dependency installation failed"
      echo "   Try running: cd $dir && npm install --include=dev"
      exit 1
    fi
  else
    echo "   ✓ $name dependencies up to date"
  fi
}

# Check backend dependencies
check_and_install_deps "$REPO_ROOT/web/backend" "Backend"

# Check frontend dependencies
check_and_install_deps "$REPO_ROOT/web/frontend" "Frontend"

# Check SDK dependencies and build
if [ ! -d "$REPO_ROOT/sdk/node_modules" ]; then
  echo "→ SDK: Installing dependencies (this may take a minute)..."
  (cd "$REPO_ROOT/sdk" && npm install --loglevel=error)
  if [ $? -eq 0 ]; then
    echo "   ✓ SDK dependencies installed"
  else
    echo "   ❌ SDK dependency installation failed"
    echo "   Try running: cd sdk && npm install"
    exit 1
  fi
else
  echo "   ✓ SDK dependencies up to date"
fi

# Check if SDK is built
if [ ! -d "$REPO_ROOT/sdk/dist" ] || [ ! -f "$REPO_ROOT/sdk/dist/index.js" ]; then
  echo "→ SDK: Building (this may take a minute)..."
  (cd "$REPO_ROOT/sdk" && npm run build --loglevel=error)
  if [ $? -eq 0 ]; then
    echo "   ✓ SDK built successfully"
  else
    echo "   ❌ SDK build failed"
    echo "   Try running: cd sdk && npm run build"
    exit 1
  fi
else
  echo "   ✓ SDK already built"
fi

# TypeScript check for backend (quick check only, don't block startup)
echo "→ Running quick TypeScript check..."
(cd "$REPO_ROOT/web/backend" && npx tsc --noEmit > /dev/null 2>&1)
if [ $? -ne 0 ]; then
  echo "   ⚠️  Warning: TypeScript errors detected in backend"
  echo "   Run 'cd web/backend && npx tsc --noEmit' to see details"
else
  echo "   ✓ TypeScript check passed"
fi

echo ""
echo "→ Environment setup complete!"
echo ""

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend, frontend, and preview server..."
echo ""

# Trap to kill all servers on exit
trap 'echo ""; echo "→ Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID $PREVIEW_PID 2>/dev/null; wait; echo "✓ Servers stopped"; exit' EXIT INT TERM

# Start backend in background (conditionally filter output, always save to log)
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show all logs and save to file
  (cd "$REPO_ROOT/web/backend" && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG"; echo "BACKEND_DONE") &
else
  # NORMAL MODE: Show filtered messages but save full logs to file
  (cd "$REPO_ROOT/web/backend" && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|🌐|Database initialized|Error|Warning)"; echo "BACKEND_DONE") &
fi
BACKEND_PID=$!

# Start frontend in background (conditionally show output, always save to log)
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show frontend logs and save to file
  (cd "$REPO_ROOT/web/frontend" && npm run dev 2>&1 | tee "$FRONTEND_LOG") &
else
  # NORMAL MODE: Suppress frontend output but save to file
  (cd "$REPO_ROOT/web/frontend" && npm run dev 2>&1 | tee "$FRONTEND_LOG" > /dev/null) &
fi
FRONTEND_PID=$!

# Start SDK preview server in background
# DEBUG_OUTPUT controls whether door-handling debug messages are shown
# In normal mode, door output is clean without debug messages
# In debug mode, all debug messages are shown
(cd "$REPO_ROOT/sdk" && DEBUG_OUTPUT="$DEBUG_OUTPUT" node tools/preview/server.js 2>&1 | tee "$PREVIEW_LOG") &
PREVIEW_PID=$!

# Wait for servers to finish startup
sleep 5

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
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║   🎮  AmiExpress BBS - All Servers Running                     ║"
echo "║                                                                ║"
echo "║   🌐 BBS Frontend:  http://localhost:$FRONTEND_PORT/"
echo "║      (Main BBS interface - login: sysop/sysop)                 ║"
echo "║                                                                ║"
echo "║   🔧 BBS Backend:   http://localhost:3001/                     ║"
echo "║      (API server)                                              ║"
echo "║                                                                ║"
echo "║   🎪 SDK Preview:   http://localhost:8080/                     ║"
echo "║      (Door testing preview)                                    ║"
echo "║                                                                ║"
if [ "$DEBUG_MODE" = true ]; then
echo "║   🔍 DEBUG MODE: All logs visible below                        ║"
echo "║                                                                ║"
fi
echo "║   Press Ctrl+C to stop all servers                             ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Open browser tabs based on OPEN_MODE
BBS_URL="http://localhost:$FRONTEND_PORT"
SDK_URL="http://localhost:8080"

if [ "$OPEN_MODE" = "full" ]; then
  # Open both BBS and SDK
  echo "🚀 Opening BBS at $BBS_URL..."
  echo "🎮 Opening SDK Preview at $SDK_URL..."

  # Detect OS and open both URLs in browser tabs
  if command -v open &> /dev/null; then
    # macOS
    open "$BBS_URL" 2>/dev/null &
    sleep 0.5
    open "$SDK_URL" 2>/dev/null &
  elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "$BBS_URL" 2>/dev/null &
    sleep 0.5
    xdg-open "$SDK_URL" 2>/dev/null &
  elif command -v start &> /dev/null; then
    # Windows (Git Bash)
    start "$BBS_URL" 2>/dev/null &
    sleep 0.5
    start "$SDK_URL" 2>/dev/null &
  elif command -v explorer.exe &> /dev/null; then
    # WSL
    explorer.exe "$BBS_URL" 2>/dev/null &
    sleep 0.5
    explorer.exe "$SDK_URL" 2>/dev/null &
  else
    echo "⚠️  Could not detect browser command. Please open URLs manually:"
    echo "   $BBS_URL"
    echo "   $SDK_URL"
  fi
else
  # Open SDK only
  echo "🎮 Opening SDK Preview at $SDK_URL..."

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
    echo "⚠️  Could not detect browser command. Please open URL manually:"
    echo "   $SDK_URL"
  fi
fi

echo ""

# Keep script running and wait for both processes
wait
