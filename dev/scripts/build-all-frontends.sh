#!/bin/bash

# Build All Frontends for Unified Deployment
# This script builds all three frontend applications:
# - BBS Terminal (/) - web/frontend
# - Admin Config (/admin) - web/config-app
# - SDK Preview (/sdk) - sdk/tools/preview/frontend

set -e  # Exit on error

echo "======================================"
echo "Building All Frontends"
echo "======================================"
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Build BBS Terminal Frontend
echo "[1/3] Building BBS Terminal Frontend (/)..."
cd web/frontend
npm install
npm run build
echo "[OK] BBS Terminal built successfully"
echo ""

# Build Admin Config Frontend
echo "[2/3] Building Admin Config Frontend (/admin)..."
cd "$PROJECT_ROOT/web/config-app"
npm install
npm run build
echo "[OK] Admin Config built successfully"
echo ""

# Build SDK Preview Frontend
echo "[3/3] Building SDK Preview Frontend (/sdk)..."
cd "$PROJECT_ROOT/sdk/tools/preview/frontend"
npm install
npm run build
echo "[OK] SDK Preview built successfully"
echo ""

echo "======================================"
echo "[OK] All Frontends Built Successfully!"
echo "======================================"
echo ""
echo "Production URLs (https://bbs.uprough.net):"
echo "  /        - BBS Terminal"
echo "  /admin/  - Admin Config Panel"
echo "  /sdk/    - SDK Preview Tool"
echo ""
echo "All three share the same authentication!"
echo ""
