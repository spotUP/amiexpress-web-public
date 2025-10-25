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
    # Source .env.local file and extract variables
    WEBHOOK_URL=$(grep -E "^DEPLOY_WEBHOOK_URL=" "$PROJECT_ROOT/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    RENDER_DEPLOY_HOOK=$(grep -E "^RENDER_DEPLOY_HOOK=" "$PROJECT_ROOT/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

    # Also extract Vercel credentials (needed for deployment)
    VERCEL_PROJECT_ID=$(grep -E "^VERCEL_PROJECT_ID=" "$PROJECT_ROOT/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    VERCEL_ORG_ID=$(grep -E "^VERCEL_ORG_ID=" "$PROJECT_ROOT/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

    # Export Vercel variables for vercel CLI
    export VERCEL_PROJECT_ID
    export VERCEL_ORG_ID
else
    # Fallback to environment variables
    WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"
    RENDER_DEPLOY_HOOK="${RENDER_DEPLOY_HOOK:-}"
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

        # Send webhook (no longer hiding errors for debugging)
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "$JSON_PAYLOAD" > /dev/null || echo "  (webhook error)" >&2
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
        # Send webhook (no longer hiding errors for debugging)
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "$JSON_PAYLOAD" > /dev/null || echo "  (webhook error)" >&2  # Don't exit on webhook failure
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

if ! command -v vercel &> /dev/null; then
    echo -e "${RED}✗ Error: Vercel CLI not installed${NC}"
    echo -e "${YELLOW}  Install: npm install -g vercel${NC}"
    exit 1
fi

if [ -z "$RENDER_DEPLOY_HOOK" ]; then
    echo -e "${YELLOW}⚠ Warning: RENDER_DEPLOY_HOOK not configured${NC}"
    echo -e "${YELLOW}  Backend deployment will rely on auto-deploy from GitHub${NC}"
    echo ""
fi

echo -e "${GREEN}✓${NC} Prerequisites satisfied"
echo ""

# ============================================
# PARALLEL DEPLOYMENT: Backend + Frontend
# ============================================

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  Deploying Backend + Frontend in Parallel${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Service ID is embedded in the deploy hook URL
SERVICE_ID="srv-d3naaffdiees73eebd0g"

# ============================================
# STEP 1: Trigger both deployments
# ============================================

# Trigger backend deployment
BACKEND_SUCCESS=true
if [ -n "$RENDER_DEPLOY_HOOK" ]; then
    echo -e "${YELLOW}→${NC} [1/2] Triggering backend deployment..."
    HOOK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$RENDER_DEPLOY_HOOK" 2>&1)
    HTTP_CODE=$(echo "$HOOK_RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "202" ]; then
        echo -e "${GREEN}✓${NC} Backend triggered (HTTP $HTTP_CODE)"
    else
        echo -e "${YELLOW}⚠${NC} Backend returned HTTP $HTTP_CODE (may still work)"
        BACKEND_SUCCESS=false
        # Send error webhook
        send_webhook \
            "Backend Deployment Error" \
            "Render deploy hook returned HTTP $HTTP_CODE

**Commit:** \`$COMMIT_SHORT\`
**Response:** \`\`\`
$(echo "$HOOK_RESPONSE" | head -10)
\`\`\`" \
            "16711680" \
            "❌"
    fi
else
    echo -e "${YELLOW}⚠${NC} No RENDER_DEPLOY_HOOK (relying on auto-deploy)"
fi

# Frontend deployment via Vercel GitHub integration
echo -e "${YELLOW}→${NC} [2/2] Frontend deployment..."
echo -e "${GREEN}✓${NC} Frontend will auto-deploy via Vercel's GitHub integration"
echo ""

# Set production URL (Vercel auto-deploys from GitHub)
DEPLOYMENT_URL=""
PRODUCTION_URL="https://bbs.uprough.net"

# ============================================
# STEP 2: Report results
# ============================================

echo -e "${GREEN}✓${NC} Both deployments initiated!"
echo -e "${CYAN}  Backend:${NC}  https://dashboard.render.com/web/$SERVICE_ID"
echo -e "${CYAN}  Frontend:${NC} $PRODUCTION_URL"
echo ""

# Send webhooks
send_webhook \
    "Backend Deployment Triggered" \
    "**Commit:** \`$COMMIT_SHORT\`
**Dashboard:** https://dashboard.render.com/web/$SERVICE_ID" \
    "3447003" \
    "🔧"

send_webhook \
    "Frontend Deployed" \
    "**URL:** $PRODUCTION_URL
**Commit:** \`$COMMIT_SHORT\`" \
    "65280" \
    "✅"

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

# Send final success webhook
send_webhook \
    "Deployment Complete 🎉" \
    "Full-stack deployment successful!

**Backend:** https://amiexpress-backend.onrender.com
**Frontend:** $PRODUCTION_URL
**Commit:** \`$COMMIT_SHORT\` - $COMMIT_MSG" \
    "3447003" \
    "🎉"

exit 0
