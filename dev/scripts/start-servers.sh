#!/bin/bash

# Check for debug flag
DEBUG_MODE=false
if [[ "$1" == "--debug" ]] || [[ "$1" == "-v" ]] || [[ "$1" == "--verbose" ]]; then
  DEBUG_MODE=true
  echo "→ Starting in DEBUG mode (full logs enabled)"
else
  echo "→ Starting in normal mode (filtered logs)"
  echo "   Use --debug to see full logs"
fi

# Create logs directory if it doesn't exist
LOGS_DIR="~/Code/amiexpress-web/logs"
mkdir -p "$LOGS_DIR"

# Generate timestamped log filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKEND_LOG="$LOGS_DIR/backend_$TIMESTAMP.log"
FRONTEND_LOG="$LOGS_DIR/frontend_$TIMESTAMP.log"

# Create symlinks to latest logs for easy access
ln -sf "$BACKEND_LOG" "$LOGS_DIR/backend_latest.log"
ln -sf "$FRONTEND_LOG" "$LOGS_DIR/frontend_latest.log"

echo "→ Logs will be saved to:"
echo "   Backend:  $BACKEND_LOG"
echo "   Frontend: $FRONTEND_LOG"
echo ""
echo "→ Quick access (latest logs):"
echo "   tail -f logs/backend_latest.log"
echo "   tail -f logs/frontend_latest.log"
echo ""

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend and frontend..."
echo ""

# Trap to kill both on exit
trap 'echo ""; echo "→ Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; echo "✓ Servers stopped"; exit' EXIT INT TERM

# Start backend in background (conditionally filter output, always save to log)
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show all logs and save to file
  (cd ~/Code/amiexpress-web/web/backend && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG"; echo "BACKEND_DONE") &
else
  # NORMAL MODE: Show filtered messages but save full logs to file
  (cd ~/Code/amiexpress-web/web/backend && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | tee "$BACKEND_LOG" | grep --line-buffered -E "^(✅|🌐|Database initialized|Error|Warning)"; echo "BACKEND_DONE") &
fi
BACKEND_PID=$!

# Start frontend in background (conditionally show output, always save to log)
if [ "$DEBUG_MODE" = true ]; then
  # DEBUG MODE: Show frontend logs and save to file
  (cd ~/Code/amiexpress-web/web/frontend && npm run dev 2>&1 | tee "$FRONTEND_LOG") &
else
  # NORMAL MODE: Suppress frontend output but save to file
  (cd ~/Code/amiexpress-web/web/frontend && npm run dev 2>&1 | tee "$FRONTEND_LOG" > /dev/null) &
fi
FRONTEND_PID=$!

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
echo "📝 Logs saved to:" > /dev/tty
echo "   $BACKEND_LOG" > /dev/tty
echo "   $FRONTEND_LOG" > /dev/tty
echo "" > /dev/tty
if [ "$DEBUG_MODE" = true ]; then
  echo "🔍 DEBUG MODE: All backend and frontend logs visible below" > /dev/tty
  echo "" > /dev/tty
fi
echo "Press Ctrl+C to stop both servers" > /dev/tty
echo "" > /dev/tty

# Keep script running and wait for both processes
wait
