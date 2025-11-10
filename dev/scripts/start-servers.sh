#!/bin/bash

# Check for debug flag
DEBUG_MODE=false
DEBUG_OUTPUT="false"
if [[ "$1" == "--debug" ]] || [[ "$1" == "-v" ]] || [[ "$1" == "--verbose" ]]; then
  DEBUG_MODE=true
  DEBUG_OUTPUT="true"
  echo "→ Starting in DEBUG mode (full logs enabled)"
else
  echo "→ Starting in normal mode (clean door output)"
  echo "   Use --debug to see full debug logs"
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

# Function to check and install dependencies
check_and_install_deps() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir/node_modules" ]; then
    echo "→ $name: Installing dependencies (this may take a minute)..."
    (cd "$dir" && npm install --loglevel=error)
    if [ $? -eq 0 ]; then
      echo "   ✓ $name dependencies installed"
    else
      echo "   ❌ $name dependency installation failed"
      echo "   Try running: cd $dir && npm install"
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

# Wait for backend to finish startup (look for BACKEND_DONE marker)
sleep 5

# Detect actual frontend port by checking common Vite ports
FRONTEND_PORT=""
for port in 5174 5175 5176 5177 5178; do
  if lsof -ti:$port > /dev/null 2>&1; then
    FRONTEND_PORT=$port
    break
  fi
done

# Fallback to 5174 if detection fails
if [ -z "$FRONTEND_PORT" ]; then
  FRONTEND_PORT="5174"
fi

# Force print frontend URL (use /dev/tty to ensure it shows)
echo "🌐 Frontend accessible at http://localhost:$FRONTEND_PORT/" > /dev/tty
echo "" > /dev/tty
if [ "$DEBUG_MODE" = true ]; then
  echo "🔍 DEBUG MODE: All logs visible below" > /dev/tty
  echo "" > /dev/tty
fi
echo "Press Ctrl+C to stop both servers" > /dev/tty
echo "" > /dev/tty

# Open browser to door preview page
PREVIEW_URL="http://localhost:8080"
echo "🎮 Opening door preview page at $PREVIEW_URL..." > /dev/tty

# Detect OS and open browser
if command -v open &> /dev/null; then
  # macOS
  open "$PREVIEW_URL" 2>/dev/null &
elif command -v xdg-open &> /dev/null; then
  # Linux
  xdg-open "$PREVIEW_URL" 2>/dev/null &
elif command -v start &> /dev/null; then
  # Windows (Git Bash)
  start "$PREVIEW_URL" 2>/dev/null &
elif command -v explorer.exe &> /dev/null; then
  # WSL
  explorer.exe "$PREVIEW_URL" 2>/dev/null &
else
  echo "⚠️  Could not detect browser command. Please open $PREVIEW_URL manually." > /dev/tty
fi

echo "" > /dev/tty

# Keep script running and wait for both processes
wait
