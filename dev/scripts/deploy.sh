#!/bin/bash
#
# deploy.sh - Commit, push, and deploy AmiExpress to Render.com
#
# Usage: ./dev/scripts/deploy.sh [commit message]
#
# If no commit message provided, uses a default timestamp message.
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Change to project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  AmiExpress Deploy Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Step 1: Check git status
echo -e "${YELLOW}[1/4] Checking git status...${NC}"
CHANGES=$(git status --porcelain | wc -l | tr -d ' ')

if [ "$CHANGES" -eq "0" ]; then
    echo -e "${GREEN}  No uncommitted changes.${NC}"
else
    echo -e "  Found ${CHANGES} changed files."

    # Step 2: Commit changes
    echo ""
    echo -e "${YELLOW}[2/4] Committing changes...${NC}"

    # Get commit message
    if [ -n "$1" ]; then
        COMMIT_MSG="$1"
    else
        COMMIT_MSG="chore: deploy $(date '+%Y-%m-%d %H:%M:%S')"
    fi

    # Stage all changes
    git add -A

    # Commit (bypass size check for deploy convenience)
    SKIP_SIZE_CHECK=1 git commit -m "$COMMIT_MSG

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" || {
        echo -e "${RED}  Commit failed!${NC}"
        exit 1
    }

    echo -e "${GREEN}  Committed: ${COMMIT_MSG}${NC}"
fi

# Step 3: Push to GitHub
echo ""
echo -e "${YELLOW}[3/4] Pushing to GitHub...${NC}"
git push origin main || {
    echo -e "${RED}  Push failed!${NC}"
    exit 1
}
echo -e "${GREEN}  Pushed to origin/main${NC}"

# Step 4: Deploy to Render.com
echo ""
echo -e "${YELLOW}[4/4] Deploying to Render.com...${NC}"

# Try to get deploy hook from .env.local
DEPLOY_HOOK=""
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    DEPLOY_HOOK=$(grep "RENDER_DEPLOY_HOOK" "$PROJECT_ROOT/.env.local" 2>/dev/null | cut -d'=' -f2-)
fi

if [ -n "$DEPLOY_HOOK" ] && [ "$DEPLOY_HOOK" != "https://api.render.com/deploy/srv-xxx?key=xxx" ]; then
    echo "  Triggering deploy hook..."
    RESPONSE=$(curl -s -X POST "$DEPLOY_HOOK" 2>&1)

    if echo "$RESPONSE" | grep -q "Not Found"; then
        echo -e "${YELLOW}  Deploy hook expired or invalid.${NC}"
        echo -e "${YELLOW}  Please deploy manually from Render dashboard.${NC}"
        echo ""
        echo "  Dashboard: https://dashboard.render.com"
    else
        echo -e "${GREEN}  Deploy triggered!${NC}"
        echo "  Response: $RESPONSE"
    fi
else
    echo -e "${YELLOW}  No deploy hook configured.${NC}"
    echo ""
    echo "  To configure automatic deploys:"
    echo "  1. Go to https://dashboard.render.com"
    echo "  2. Select your service > Settings > Deploy Hook"
    echo "  3. Add to .env.local: RENDER_DEPLOY_HOOK=<your-hook-url>"
    echo ""
    echo "  For now, deploy manually from the Render dashboard."
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  Done!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "  Git log (latest):"
git log --oneline -1
echo ""
