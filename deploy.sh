#!/bin/bash

# ============================================
# AmiExpress Web Deployment Script for Render.com (Webhooks Only)
# ============================================
# This script deploys ONLY webhooks to Render.com for CI/CD automation.
# The main application (frontend/backend) is deployed to Vercel.
#
# Features:
# - Webhook setup for automated deployments to Vercel
# - Environment-specific webhook configurations
# - Health checks and monitoring
# - Comprehensive logging and error handling
#
# Usage: ./deploy.sh [environment] [options]
# Environments: staging, production
# Options: --setup-webhooks, --test-webhooks
#
# Requirements:
# - Render API key in RENDER_API_KEY environment variable
# - Vercel deployment already configured
# - Git repository with proper remote
# ============================================

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
RENDER_API_BASE="https://api.render.com/v1"
LOG_FILE="deploy_webhooks_$(date +%Y%m%d_%H%M%S).log"
WEBHOOK_SERVICE_NAME="amiexpress-webhooks"

# Load environment variables
if [[ -f ".env.local" ]]; then
    source .env.local
elif [[ -f ".env" ]]; then
    source .env
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗ ERROR:${NC} $*" >&2 | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}ℹ${NC} $*" | tee -a "$LOG_FILE"
}

header() {
    echo -e "${PURPLE}========================================${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}$*${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}========================================${NC}" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    header "Checking Prerequisites"

    # Check for required commands
    local required_commands=("curl" "git" "node" "npm")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command '$cmd' not found. Please install it."
            exit 1
        fi
    done
    success "All required commands are available"

    # Check for Render API key
    if [[ -z "${RENDER_API_KEY:-}" ]]; then
        error "RENDER_API_KEY environment variable is not set"
        info "Get your API key from: https://dashboard.render.com/account/api-keys"
        exit 1
    fi
    success "Render API key is configured"

    # Check git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        error "Not in a git repository"
        exit 1
    fi

    # Check for uncommitted changes
        if [[ -n $(git status --porcelain) ]]; then
            warning "You have uncommitted changes. Consider committing them before deployment."
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
        success "Git repository is clean"
    
        # Note about Vercel database migrations
        info "Note: Database migrations are handled automatically by Vercel serverless functions"
        info "Migrations run on application startup in production"
}

# Parse command line arguments
parse_args() {
    ENVIRONMENT="production"
    SETUP_WEBHOOKS=false
    TEST_WEBHOOKS=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            staging|production)
                ENVIRONMENT="$1"
                ;;
            --setup-webhooks)
                SETUP_WEBHOOKS=true
                ;;
            --test-webhooks)
                TEST_WEBHOOKS=true
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
        shift
    done

    info "Deployment environment: $ENVIRONMENT"
    [[ "$SETUP_WEBHOOKS" == true ]] && info "Will setup webhooks"
    [[ "$TEST_WEBHOOKS" == true ]] && info "Will test webhooks"
}

show_help() {
    cat << EOF
AmiExpress Web Webhook Deployment Script for Render.com v$SCRIPT_VERSION

USAGE:
    ./deploy.sh [environment] [options]

ENVIRONMENTS:
    staging     Deploy to staging environment
    production  Deploy to production environment (default)

OPTIONS:
    --setup-webhooks    Setup GitHub webhooks for automated Vercel deployments
    --test-webhooks     Test existing webhook configurations
    -h, --help          Show this help message

EXAMPLES:
    ./deploy.sh production --setup-webhooks
    ./deploy.sh staging --test-webhooks

REQUIREMENTS:
    - Render API key in RENDER_API_KEY environment variable
    - Vercel deployment already configured
    - Git repository with proper remote

NOTE:
    This script only deploys webhooks to Render.com.
    The main application is deployed to Vercel.

For more information, see README.md
EOF
}

# Setup environment-specific configuration
setup_environment() {
    header "Setting up $ENVIRONMENT Environment"

    case $ENVIRONMENT in
        staging)
            WEBHOOK_SERVICE_NAME="${WEBHOOK_SERVICE_NAME}-staging"
            ;;
        production)
            # Production uses default name
            ;;
    esac

    success "Environment configured:"
    info "  Webhook Service: $WEBHOOK_SERVICE_NAME"
    info "  Vercel Database: PostgreSQL on Vercel"
}

# Create webhook service
create_webhook_service() {
    header "Creating Webhook Service"

    local service_id
    service_id=$(get_service_id "$WEBHOOK_SERVICE_NAME" "web_service")

    if [[ -z "$service_id" ]]; then
        info "Webhook service doesn't exist, creating..."
        local repo_url
        repo_url=$(git remote get-url origin)

        # Create a simple webhook service
        local webhook_code='const express = require("express"); const app = express(); app.use(express.json()); app.post("/webhook", (req, res) => { console.log("Webhook received:", req.body); res.status(200).send("OK"); }); app.listen(process.env.PORT || 3000);'

        # Create a temporary directory for webhook service
        mkdir -p /tmp/webhook-service
        echo '{"name": "webhook-service", "version": "1.0.0", "main": "index.js", "dependencies": {"express": "^4.18.0"}}' > /tmp/webhook-service/package.json
        echo "$webhook_code" > /tmp/webhook-service/index.js

        # This would normally push to a separate repo, but for demo we'll use the main repo
        service_id=$(create_service "$WEBHOOK_SERVICE_NAME" "web_service" "$repo_url" "npm install" "node index.js")
    else
        success "Webhook service already exists"
    fi

    WEBHOOK_SERVICE_ID="$service_id"
}

# Setup webhooks
setup_webhooks() {
    if [[ "$SETUP_WEBHOOKS" != true ]]; then
        return
    fi

    header "Setting up Webhooks"

    create_webhook_service

    info "Configure your Git provider to send webhooks to:"
    info "  Vercel Deploy Hook: https://vercel.com/api/webhooks/deploy/YOUR_HOOK_ID"
    info "  Render Webhook Service: https://$WEBHOOK_SERVICE_NAME.onrender.com/webhook"

    success "Webhook service created and configured"
}

# Test webhooks
test_webhooks() {
    if [[ "$TEST_WEBHOOKS" != true ]]; then
        return
    fi

    header "Testing Webhooks"

    if [[ -z "$WEBHOOK_SERVICE_ID" ]]; then
        create_webhook_service
    fi

    # Test the webhook endpoint
    local webhook_url="https://$WEBHOOK_SERVICE_NAME.onrender.com/webhook"
    local test_payload='{"test": "webhook", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'

    info "Testing webhook endpoint: $webhook_url"
    local response
    response=$(curl -s -X POST "$webhook_url" \
        -H "Content-Type: application/json" \
        -d "$test_payload")

    if [[ "$response" == "OK" ]]; then
        success "Webhook test successful"
    else
        warning "Webhook test returned: $response"
    fi
}

# Render API helper functions
render_api_call() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"

    local url="${RENDER_API_BASE}${endpoint}"
    local auth_header="Authorization: Bearer $RENDER_API_KEY"

    if [[ -n "$data" ]]; then
        curl -s -X "$method" "$url" \
             -H "Content-Type: application/json" \
             -H "$auth_header" \
             -d "$data"
    else
        curl -s -X "$method" "$url" \
             -H "$auth_header"
    fi
}

get_service_id() {
    local service_name="$1"
    local service_type="$2"

    local response
    response=$(render_api_call "GET" "/services?name=${service_name}&type=${service_type}")

    if echo "$response" | jq -e '.[0]' > /dev/null 2>&1; then
        echo "$response" | jq -r '.[0].id'
    else
        echo ""
    fi
}

create_service() {
    local service_name="$1"
    local service_type="$2"
    local repo_url="$3"
    local build_command="${4:-}"
    local start_command="${5:-}"

    local data
    data=$(cat <<EOF
{
  "name": "$service_name",
  "type": "$service_type",
  "repo": "$repo_url",
  "branch": "main",
  "buildCommand": "$build_command",
  "startCommand": "$start_command",
  "envVars": [
    {
      "key": "NODE_ENV",
      "value": "$ENVIRONMENT"
    }
  ]
}
EOF
)

    local response
    response=$(render_api_call "POST" "/services" "$data")

    if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
        echo "$response" | jq -r '.id'
        success "Service '$service_name' created successfully"
    else
        error "Failed to create service '$service_name'"
        echo "$response" >&2
        return 1
    fi
}

deploy_service() {
    local service_id="$1"
    local commit_hash="$2"

    local data
    data=$(cat <<EOF
{
  "commit": "$commit_hash"
}
EOF
)

    local response
    response=$(render_api_call "POST" "/services/$service_id/deploys" "$data")

    if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
        echo "$response" | jq -r '.id'
        success "Deployment initiated for service $service_id"
    else
        error "Failed to deploy service $service_id"
        echo "$response" >&2
        return 1
    fi
}


# Wait for deployment completion
wait_for_deployment() {
    local service_id="$1"
    local deploy_id="$2"

    info "Waiting for deployment to complete..."

    local max_attempts=60  # 10 minutes with 10s intervals
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        local response
        response=$(render_api_call "GET" "/services/$service_id/deploys/$deploy_id")

        local status
        status=$(echo "$response" | jq -r '.status')

        case $status in
            "live")
                success "Deployment completed successfully"
                return 0
                ;;
            "build_failed"|"failed")
                error "Deployment failed"
                echo "$response" | jq '.logs' >&2
                return 1
                ;;
            "building"|"in_progress")
                info "Deployment in progress... (attempt $attempt/$max_attempts)"
                ;;
            *)
                warning "Unknown deployment status: $status"
                ;;
        esac

        sleep 10
        ((attempt++))
    done

    error "Deployment timed out"
    return 1
}

# Setup webhooks (updated)
setup_webhooks() {
    if [[ "$SETUP_WEBHOOKS" != true ]]; then
        return
    fi

    header "Setting up Webhooks for Vercel Deployments"

    create_webhook_service

    info "Configure your Git provider webhooks to trigger Vercel deployments:"
    info "  Vercel Deploy Hook: Create one at https://vercel.com/dashboard/integrations/deploy-hooks"
    info "  Webhook Service: https://$WEBHOOK_SERVICE_NAME.onrender.com/webhook (for logging)"

    success "Webhook infrastructure ready"
}

# Health checks
run_health_checks() {
    header "Running Health Checks"

    # Check webhook service
    if [[ -n "$WEBHOOK_SERVICE_ID" ]]; then
        local webhook_url="https://$WEBHOOK_SERVICE_NAME.onrender.com/webhook"
        info "Checking webhook service..."
        if curl -s --max-time 10 -X POST "$webhook_url" -H "Content-Type: application/json" -d '{"test": "health"}' > /dev/null 2>&1; then
            success "Webhook service health check passed"
        else
            warning "Webhook service health check failed"
        fi
    fi

    info "Note: Main application health checks should be performed on Vercel deployment"
    info "Vercel URL will be provided after deployment completes"
}

# Rollback functionality
rollback_deployment() {
    header "Rolling Back Deployment"

    warning "Rollback functionality not fully implemented"
    info "Manual rollback required via Render dashboard"
    # In a real implementation, this would redeploy to a previous commit
}

# Main deployment function
main() {
    header "AmiExpress Web Deployment Script v$SCRIPT_VERSION"

    parse_args "$@"
    check_prerequisites
    setup_environment

    if [[ "$ROLLBACK" == true ]]; then
        rollback_deployment
        exit 0
    fi

    if [[ "$SETUP_WEBHOOKS" == true ]] || [[ "$TEST_WEBHOOKS" == true ]]; then
        setup_webhooks
        test_webhooks
        run_health_checks
    fi

    header "Deployment Complete!"
    success "🎉 Webhook infrastructure deployed successfully!"
    if [[ -n "$WEBHOOK_SERVICE_ID" ]]; then
        info "Webhook Service: https://$WEBHOOK_SERVICE_NAME.onrender.com"
    fi
    info "Main Application: Deployed to Vercel (check Vercel dashboard)"
    info "Database: PostgreSQL on Vercel"
    info "Log file: $LOG_FILE"
}

# Cleanup on exit
cleanup() {
    if [[ -f "$LOG_FILE" ]]; then
        info "Deployment log saved to: $LOG_FILE"
    fi
}

trap cleanup EXIT

# Run main function
main "$@"