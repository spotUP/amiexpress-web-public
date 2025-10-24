#!/bin/bash

# ============================================
# AmiExpress Full-Stack Deployment Script
# ============================================
# This script deploys BOTH backend and frontend:
# - Backend: Render.com (WebSocket server)
# - Frontend: Vercel (Static site)
#
# Usage:
#   ./deploy.sh [commit-sha]
#
# If no commit SHA is provided, uses the latest commit.
#
# Prerequisites:
#   - Render CLI: npm install -g @render/cli
#   - Vercel CLI: npm install -g vercel
#   - Must be logged in: render login && vercel login
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Webhook configuration
# Load from .env.local file if it exists
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # Source .env.local file and extract DEPLOY_WEBHOOK_URL
    WEBHOOK_URL=$(grep -E "^DEPLOY_WEBHOOK_URL=" "$PROJECT_ROOT/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
else
    # Fallback to environment variable
    WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"
fi

# Function to send webhook notification
send_webhook() {
    local title="$1"
    local description="$2"
    local color="$3"  # decimal color (e.g., 65280 for green, 16711680 for red)
    local emoji="$4"

    if [ -z "$WEBHOOK_URL" ]; then
        return 0  # Skip if no webhook configured
    fi

    # Detect webhook type (Discord vs Slack)
    if [[ "$WEBHOOK_URL" == *"discord.com"* ]]; then
        # Discord webhook format - use jq for proper JSON encoding
        echo "[DEBUG] Sending webhook: $title" >&2

        # Build JSON payload with jq for proper escaping
        JSON_PAYLOAD=$(jq -n \
            --arg title "$title" \
            --arg description "$description" \
            --argjson color "$color" \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                embeds: [{
                    title: $title,
                    description: $description,
                    color: $color,
                    timestamp: $timestamp,
                    footer: {
                        text: "AmiExpress Deployment"
                    }
                }]
            }')

        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "$JSON_PAYLOAD" 2>&1 || true)
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        if [ "$HTTP_CODE" != "204" ] && [ "$HTTP_CODE" != "200" ]; then
            echo "[WARNING] Webhook failed with code $HTTP_CODE: $RESPONSE" >&2
        fi
    elif [[ "$WEBHOOK_URL" == *"hooks.slack.com"* ]]; then
        # Slack webhook format
        JSON_PAYLOAD=$(jq -n \
            --arg title "$title" \
            --arg description "$description" \
            --argjson color "$color" \
            '{
                text: ("*" + $title + "*"),
                attachments: [{
                    color: (if $color == 65280 then "good" elif $color == 16711680 then "danger" else "warning" end),
                    text: $description,
                    footer: "AmiExpress Deployment",
                    ts: now
                }]
            }')
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "$JSON_PAYLOAD" > /dev/null 2>&1 || true  # Don't exit on webhook failure
    fi
}

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  AmiExpress Full-Stack Deployment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get commit SHA (use provided or latest)
COMMIT_SHA="${1:-$(git rev-parse HEAD)}"
COMMIT_SHORT=$(echo "$COMMIT_SHA" | cut -c1-7)
COMMIT_MSG=$(git log -1 --pretty=%B "$COMMIT_SHA" | head -1)

echo -e "${BLUE}Commit:${NC} $COMMIT_SHORT - $COMMIT_MSG"
echo ""

# Send deployment started webhook
send_webhook \
    "Deployment Started" \
    "Deploying commit \`$COMMIT_SHORT\`

**Changes:**
$COMMIT_MSG" \
    "3447003" \
    "🚀"

# Check prerequisites
echo -e "${YELLOW}→${NC} Checking prerequisites..."

if ! command -v render &> /dev/null; then
    echo -e "${RED}✗ Error: Render CLI not installed${NC}"
    echo -e "${YELLOW}  Install: npm install -g @render/cli${NC}"
    exit 1
fi

if ! command -v vercel &> /dev/null; then
    echo -e "${RED}✗ Error: Vercel CLI not installed${NC}"
    echo -e "${YELLOW}  Install: npm install -g vercel${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites satisfied"
echo ""

# ============================================
# PART 1: Deploy Backend to Render.com
# ============================================

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  [1/2] Deploying Backend to Render${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get backend service ID
echo -e "${YELLOW}→${NC} Finding Render backend service..."
SERVICES_JSON=$(render services list -o json 2>/dev/null)

if [ -z "$SERVICES_JSON" ]; then
    echo -e "${RED}✗ Error: Failed to fetch Render services${NC}"
    echo -e "${YELLOW}  Run 'render login' to authenticate${NC}"
    exit 1
fi

# Extract backend service ID
if command -v jq &> /dev/null; then
    SERVICE_ID=$(echo "$SERVICES_JSON" | jq -r '.[] | select(.service.name == "amiexpress-backend") | .service.id' 2>/dev/null | head -1)
else
    SERVICE_ID=$(echo "$SERVICES_JSON" | grep -A 20 '"name": "amiexpress-backend"' | grep -o '"id": "srv-[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$SERVICE_ID" ]; then
    echo -e "${RED}✗ Error: Could not find amiexpress-backend service${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found service: ${CYAN}$SERVICE_ID${NC}"
echo ""

# Trigger deployment
echo -e "${YELLOW}→${NC} Triggering backend deployment..."
echo "[DEBUG] SERVICE_ID=$SERVICE_ID" >&2
echo "[DEBUG] COMMIT_SHA=$COMMIT_SHA" >&2
echo "[DEBUG] Running: render deploys create \"$SERVICE_ID\" --commit \"$COMMIT_SHA\" --confirm -o json" >&2

set +e  # Temporarily disable exit on error to capture output
DEPLOY_OUTPUT=$(render deploys create "$SERVICE_ID" --commit "$COMMIT_SHA" --confirm -o json 2>&1)
DEPLOY_EXIT=$?
set -e  # Re-enable exit on error

echo "[DEBUG] DEPLOY_EXIT=$DEPLOY_EXIT" >&2
echo "[DEBUG] DEPLOY_OUTPUT=$DEPLOY_OUTPUT" >&2

if [ $DEPLOY_EXIT -ne 0 ]; then
    echo -e "${RED}✗ Error: Failed to trigger deployment${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

# Extract deployment ID
DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | jq -r '.id' 2>/dev/null || echo "unknown")

echo -e "${GREEN}✓${NC} Backend deployment triggered: ${CYAN}$DEPLOY_ID${NC}"
echo ""

# Monitor backend deployment
echo -e "${YELLOW}→${NC} Monitoring backend build (max 5 minutes)..."

MAX_WAIT=300  # 5 minutes
ELAPSED=0
CHECK_INTERVAL=10

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check build logs for completion
    LOG_SAMPLE=$(render logs --resources "$SERVICE_ID" --type build --limit 5 -o text 2>/dev/null || echo "")

    if echo "$LOG_SAMPLE" | grep -q "Build successful"; then
        echo -e "\n${GREEN}✓ Backend build successful!${NC}"
        echo ""

        # Wait for service to restart
        echo -e "${YELLOW}→${NC} Waiting for backend service to restart..."
        sleep 10

        echo -e "${GREEN}✓ Backend deployment complete!${NC}"
        echo ""

        # Send backend success webhook
        send_webhook \
            "Backend Deployed" \
            "Backend successfully deployed to Render

**Service:** amiexpress-backend
**Commit:** \`$COMMIT_SHORT\`" \
            "65280" \
            "✅"

        break
    elif echo "$LOG_SAMPLE" | grep -q "Build failed"; then
        echo -e "\n${RED}✗ Backend build failed!${NC}"
        echo ""
        echo -e "${YELLOW}Check logs:${NC} render logs --resources $SERVICE_ID --type build"
        echo -e "${YELLOW}Dashboard:${NC}  https://dashboard.render.com/web/$SERVICE_ID"
        exit 1
    fi

    echo -ne "  Waiting for build... ${ELAPSED}s / ${MAX_WAIT}s\r"
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo -e "\n${YELLOW}⚠ Backend deployment timeout after ${MAX_WAIT}s${NC}"
    echo -e "${YELLOW}  Continuing with frontend deployment...${NC}"
    echo ""
fi

# ============================================
# PART 2: Deploy Frontend to Vercel
# ============================================

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  [2/2] Deploying Frontend to Vercel${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if we're in the right directory
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}→${NC} Deploying frontend to production..."

# Deploy to Vercel production
# --prod: Deploy to production
# --yes: Skip confirmation prompts
VERCEL_OUTPUT=$(vercel --prod --yes 2>&1)
VERCEL_EXIT=$?

if [ $VERCEL_EXIT -ne 0 ]; then
    echo -e "${RED}✗ Error: Vercel deployment failed${NC}"
    echo "$VERCEL_OUTPUT"
    exit 1
fi

# Extract deployment URL
DEPLOYMENT_URL=$(echo "$VERCEL_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)
PRODUCTION_URL=$(echo "$VERCEL_OUTPUT" | grep -oE 'https://bbs\.uprough\.net' || echo "https://bbs.uprough.net")

echo -e "${GREEN}✓${NC} Frontend deployment complete!"
echo ""

# Debug: Log before webhook call
echo "[DEBUG] About to send frontend webhook..." >&2
echo "[DEBUG] WEBHOOK_URL is set: $([ -n "$WEBHOOK_URL" ] && echo "yes" || echo "NO")" >&2
echo "[DEBUG] PRODUCTION_URL=$PRODUCTION_URL" >&2

# Send frontend success webhook
send_webhook \
    "Frontend Deployed" \
    "Frontend successfully deployed to Vercel

**URL:** $PRODUCTION_URL
**Commit:** \`$COMMIT_SHORT\`" \
    "65280" \
    "✅"

echo "[DEBUG] Frontend webhook call completed" >&2

# ============================================
# Deployment Summary
# ============================================

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Full-Stack Deployment Successful${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Backend (Render):${NC}"
echo -e "  Service URL: https://amiexpress-backend.onrender.com"
echo -e "  Dashboard:   https://dashboard.render.com/web/$SERVICE_ID"
echo ""
echo -e "${BLUE}Frontend (Vercel):${NC}"
echo -e "  Production:  $PRODUCTION_URL"
if [ -n "$DEPLOYMENT_URL" ]; then
    echo -e "  Preview:     $DEPLOYMENT_URL"
fi
echo ""
echo -e "${BLUE}Commit:${NC} $COMMIT_SHORT - $COMMIT_MSG"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Debug: Log before final webhook call
echo "[DEBUG] About to send 'Deployment Complete' webhook..." >&2

# Send final success webhook
send_webhook \
    "Deployment Complete 🎉" \
    "Full-stack deployment successful!

**Backend:** https://amiexpress-backend.onrender.com
**Frontend:** $PRODUCTION_URL
**Commit:** \`$COMMIT_SHORT\` - $COMMIT_MSG" \
    "3447003" \
    "🎉"

echo "[DEBUG] 'Deployment Complete' webhook call completed" >&2

exit 0
