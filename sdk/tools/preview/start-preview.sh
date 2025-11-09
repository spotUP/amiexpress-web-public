#!/bin/bash

# Enhanced SDK Preview Server
# - Kills old servers on port 8080
# - Builds SDK and frontend (silently)
# - Starts preview server
# - Example compilation happens in browser console

echo "🔍 Checking for existing servers on port 8080..."

# Kill any process using port 8080
OLD_PIDS=$(lsof -ti:8080 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
    echo "⚠️  Killing old servers: $OLD_PIDS"
    kill -9 $OLD_PIDS 2>/dev/null || true
    sleep 1
    echo "✅ Old servers killed"
else
    echo "✅ No old servers found"
fi

echo ""
echo "🔨 Building SDK..."
npm run build > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ SDK build failed!"
    exit 1
fi
echo "✅ SDK built successfully"

echo ""
echo "📦 Building React frontend..."

# Navigate to frontend directory and build
cd tools/preview/frontend

# Check if dependencies need to be installed
NEED_INSTALL=false
if [ ! -d "node_modules" ]; then
    NEED_INSTALL=true
    echo "📥 Installing frontend dependencies (node_modules missing)..."
elif [ "package-lock.json" -nt "node_modules" ]; then
    NEED_INSTALL=true
    echo "📥 Installing frontend dependencies (package-lock.json updated)..."
fi

if [ "$NEED_INSTALL" = true ]; then
    npm install > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "❌ Frontend dependency installation failed!"
        cd ../../..
        exit 1
    fi
    echo "✅ Frontend dependencies installed"
fi

# Check if build is needed
NEED_BUILD=false
if [ ! -d "../public-react" ]; then
    NEED_BUILD=true
    echo "🔨 Building frontend (build output missing)..."
elif [ ! -f "../public-react/index.html" ]; then
    NEED_BUILD=true
    echo "🔨 Building frontend (build incomplete)..."
elif [ "src" -nt "../public-react" ] || [ "package.json" -nt "../public-react" ]; then
    NEED_BUILD=true
    echo "🔨 Rebuilding frontend (source files changed)..."
fi

if [ "$NEED_BUILD" = true ]; then
    npm run build > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "❌ Frontend build failed!"
        cd ../../..
        exit 1
    fi
    echo "✅ Frontend built successfully"
else
    echo "✅ Frontend build is up to date"
fi
cd ../../..

echo ""
echo "🚀 Starting preview server..."
echo "📦 Example games will be compiled in the browser console"
echo ""

node tools/preview/server.js
