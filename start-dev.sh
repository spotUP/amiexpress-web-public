#!/bin/bash

# AmiExpress-Web Development Server Startup Script
# This script starts both backend and frontend dev servers with proper error handling

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Progress indicators
STEP=1
TOTAL_STEPS=8

print_step() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}[$STEP/$TOTAL_STEPS]${NC} $1"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    STEP=$((STEP + 1))
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
}

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Header
clear
echo -e "${CYAN}"
cat << "EOF"
    ___            _ ______
   /   |  ____ ___(  )  ____/  ______  ________  __________
  / /| | / __ `__ \ / /  __/  |  \/  \/  ___  / / / ___/ _ \
 / ___ |/ / / / / /  / /____  >    </ / /_/ / /_|_\___ \__  )
/_/  |_/_/ /_/ /_/  /_____/  /_/|_/  / .___/\_____/____/____/
                                    /_/
EOF
echo -e "${NC}"
echo -e "${CYAN}Development Server Startup Script${NC}"
echo -e "${CYAN}Version 1.0.0${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Check prerequisites
print_step "Checking prerequisites"

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    print_error "Not in AmiExpress-Web root directory"
    exit 1
fi
print_success "Project structure verified"

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js v18+"
    exit 1
fi
NODE_VERSION=$(node --version)
print_success "Node.js $NODE_VERSION found"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install npm"
    exit 1
fi
NPM_VERSION=$(npm --version)
print_success "npm $NPM_VERSION found"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL client not found in PATH"
else
    print_success "PostgreSQL client found"
fi

# Check if PostgreSQL is running
if ! lsof -i:5432 &> /dev/null; then
    print_warning "PostgreSQL may not be running on port 5432"
else
    print_success "PostgreSQL is running"
fi

# Step 2: Clean up existing processes
print_step "Cleaning up existing processes"

BACKEND_PIDS=$(lsof -ti:3001 2>/dev/null || true)
FRONTEND_PIDS=$(lsof -ti:5173,5174 2>/dev/null || true)

if [ -n "$BACKEND_PIDS" ]; then
    print_info "Killing existing backend processes on port 3001"
    echo "$BACKEND_PIDS" | xargs kill -9 2>/dev/null || true
    print_success "Backend processes cleaned"
else
    print_info "No existing backend processes found"
fi

if [ -n "$FRONTEND_PIDS" ]; then
    print_info "Killing existing frontend processes on ports 5173/5174"
    echo "$FRONTEND_PIDS" | xargs kill -9 2>/dev/null || true
    print_success "Frontend processes cleaned"
else
    print_info "No existing frontend processes found"
fi

# Wait for ports to be released
print_info "Waiting for ports to be released..."
sleep 2

# Step 3: Check/create database
print_step "Checking database"

DB_NAME="amiexpress"
DB_EXISTS=$(psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    print_success "Database '$DB_NAME' exists"
else
    print_info "Creating database '$DB_NAME'..."
    if psql postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null; then
        print_success "Database created"
    else
        print_warning "Could not create database (may already exist or PostgreSQL not accessible)"
    fi
fi

# Step 4: Create/verify .env file
print_step "Setting up environment variables"

BACKEND_ENV="backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
    print_info "Creating $BACKEND_ENV"
    cat > "$BACKEND_ENV" << EOF
# Local development environment variables
DATABASE_URL=postgresql://$(whoami)@localhost/amiexpress
NODE_ENV=development
PORT=3001
EOF
    print_success ".env file created"
else
    print_success ".env file exists"
fi

# Step 5: Install dependencies
print_step "Installing dependencies"

# Backend dependencies
if [ ! -d "backend/node_modules" ]; then
    print_info "Installing backend dependencies..."
    cd backend && npm install &> /dev/null
    cd ..
    print_success "Backend dependencies installed"
else
    print_success "Backend dependencies already installed"
fi

# Frontend dependencies
print_info "Installing/verifying frontend dependencies..."
cd frontend
rm -rf node_modules .vite-temp 2>/dev/null || true
npm install --include=dev &> /dev/null
cd ..
print_success "Frontend dependencies installed"

# Step 6: Start backend
print_step "Starting backend server"

cd backend

# Create log directory
mkdir -p ../logs

print_info "Starting backend on port 3001..."
DATABASE_URL="postgresql://$(whoami)@localhost/amiexpress" \
NODE_ENV=development \
npm run dev > ../logs/backend.log 2>&1 &

BACKEND_PID=$!
print_info "Backend PID: $BACKEND_PID"

# Wait for backend to start
print_info "Waiting for backend to initialize..."
MAX_WAIT=30
WAIT_COUNT=0
BACKEND_READY=false

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        BACKEND_READY=true
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done
echo ""

cd ..

if [ "$BACKEND_READY" = true ]; then
    print_success "Backend is running on http://localhost:3001"
    HEALTH=$(curl -s http://localhost:3001/health)
    print_info "Health check: $HEALTH"
else
    print_error "Backend failed to start within ${MAX_WAIT}s"
    print_info "Check logs/backend.log for details"
    tail -20 logs/backend.log
    exit 1
fi

# Step 7: Start frontend
print_step "Starting frontend server"

cd frontend

print_info "Starting frontend on port 5173..."
npx vite > ../logs/frontend.log 2>&1 &

FRONTEND_PID=$!
print_info "Frontend PID: $FRONTEND_PID"

# Wait for frontend to start
print_info "Waiting for frontend to initialize..."
MAX_WAIT=30
WAIT_COUNT=0
FRONTEND_READY=false

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if lsof -i:5173 > /dev/null 2>&1; then
        FRONTEND_READY=true
        break
    fi
    # Also check 5174 in case 5173 was taken
    if lsof -i:5174 > /dev/null 2>&1; then
        FRONTEND_READY=true
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done
echo ""

cd ..

if [ "$FRONTEND_READY" = true ]; then
    # Determine which port it's on
    if lsof -i:5173 > /dev/null 2>&1; then
        FRONTEND_PORT=5173
    else
        FRONTEND_PORT=5174
    fi
    print_success "Frontend is running on http://localhost:$FRONTEND_PORT"
else
    print_error "Frontend failed to start within ${MAX_WAIT}s"
    print_info "Check logs/frontend.log for details"
    tail -20 logs/frontend.log
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Step 8: Final verification
print_step "Final verification"

# Verify backend
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Backend health check: PASS"
else
    print_error "Backend health check: FAIL"
fi

# Verify frontend
if lsof -i:$FRONTEND_PORT > /dev/null 2>&1; then
    print_success "Frontend port check: PASS"
else
    print_error "Frontend port check: FAIL"
fi

# Summary
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Development servers started successfully!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  Backend:  ${GREEN}http://localhost:3001${NC} (PID: $BACKEND_PID)"
echo -e "  Frontend: ${GREEN}http://localhost:$FRONTEND_PORT${NC} (PID: $FRONTEND_PID)"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Backend:  ${CYAN}logs/backend.log${NC}"
echo -e "  Frontend: ${CYAN}logs/frontend.log${NC}"
echo ""
echo -e "${BLUE}To view logs:${NC}"
echo -e "  tail -f logs/backend.log"
echo -e "  tail -f logs/frontend.log"
echo ""
echo -e "${BLUE}To stop servers:${NC}"
echo -e "  kill $BACKEND_PID $FRONTEND_PID"
echo -e "  or run: ${CYAN}./stop-dev.sh${NC}"
echo ""
echo -e "${YELLOW}Opening browser in 3 seconds...${NC}"
sleep 3

# Open browser
if command -v open &> /dev/null; then
    open "http://localhost:$FRONTEND_PORT"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$FRONTEND_PORT"
fi

# Save PIDs for stop script
echo "$BACKEND_PID" > .backend.pid
echo "$FRONTEND_PID" > .frontend.pid

print_success "Development environment ready!"
