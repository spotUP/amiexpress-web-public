#!/bin/bash

# Enhanced SDK Preview Server
# - Kills old servers on port 8080
# - Builds SDK and frontend
# - Compiles TypeScript examples (shows errors)
# - Starts preview server

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
npm run build

if [ $? -ne 0 ]; then
    echo "❌ SDK build failed!"
    exit 1
fi

echo ""
echo "📦 Building React frontend..."

# Navigate to frontend directory and build
cd tools/preview/frontend

# Check if node_modules exists, install if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Frontend dependency installation failed!"
        cd ../../..
        exit 1
    fi
fi

# Build the frontend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    cd ../../..
    exit 1
fi

echo "✅ Frontend built successfully"
cd ../../..

echo ""
echo "🚀 Starting preview server..."
echo "📦 Example games will be compiled in the browser console"
echo ""

node tools/preview/server.js
