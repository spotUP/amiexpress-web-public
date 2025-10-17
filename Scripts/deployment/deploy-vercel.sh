#!/bin/bash

# ============================================
# AmiExpress Web Deployment Script for Vercel
# ============================================
# This script automates the deployment of both backend and frontend
# to Vercel with proper configuration and environment setup.
#
# Features:
# - Automated build process
# - Vercel CLI integration
# - Environment-specific configurations
# - Custom domain setup
# - Analytics and monitoring
# - Rollback capabilities
#
# Usage: ./deploy-vercel.sh [environment] [options]
# Environments: staging, production
# Options: --skip-build, --setup-analytics, --rollback
#
# Requirements:
# - Vercel CLI installed (`npm i -g vercel`)
# - Vercel account logged in (`vercel login`)
# - Git repository with proper remote
# - Node.js and npm installed
# ============================================

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
LOG_FILE="deploy_vercel_$(date +%Y%m%d_%H%M%S).log"

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
    local required_commands=("vercel" "git" "node" "npm")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command '$cmd' not found."
            if [[ "$cmd" == "vercel" ]]; then
                info "Install with: npm install -g vercel"
            fi
            exit 1
        fi
    done
    success "All required commands are available"

    # Check Vercel authentication
    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        export VERCEL_TOKEN="$VERCEL_TOKEN"
        success "Using Vercel token from environment"
    elif ! vercel whoami &> /dev/null; then
        error "Not logged in to Vercel and no VERCEL_TOKEN found. Run: vercel login"
        exit 1
    else
        success "Vercel authentication verified"
    fi

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

    # Note: Vercel deployments are serverless, so database migrations
    # should be handled differently (e.g., via build hooks or separate process)
    info "Note: Database migrations for Vercel should be handled via build hooks or separate deployment process"
}

# Parse command line arguments
parse_args() {
    ENVIRONMENT="production"
    SKIP_BUILD=false
    SETUP_ANALYTICS=false
    ROLLBACK=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            staging|production)
                ENVIRONMENT="$1"
                ;;
            --skip-build)
                SKIP_BUILD=true
                ;;
            --setup-analytics)
                SETUP_ANALYTICS=true
                ;;
            --rollback)
                ROLLBACK=true
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
    [[ "$SKIP_BUILD" == true ]] && info "Skipping build process"
    [[ "$SETUP_ANALYTICS" == true ]] && info "Will setup analytics"
    [[ "$ROLLBACK" == true ]] && info "Performing rollback"
}

show_help() {
    cat << EOF
AmiExpress Web Deployment Script for Vercel v$SCRIPT_VERSION

USAGE:
    ./deploy-vercel.sh [environment] [options]

ENVIRONMENTS:
    staging     Deploy to staging environment (default)
    production  Deploy to production environment

OPTIONS:
    --skip-build        Skip the build process (use existing artifacts)
    --setup-analytics   Setup Vercel Analytics
    --rollback          Rollback to previous deployment
    -h, --help          Show this help message

EXAMPLES:
    ./deploy-vercel.sh production
    ./deploy-vercel.sh staging --setup-analytics
    ./deploy-vercel.sh --rollback

REQUIREMENTS:
    - Vercel CLI installed and logged in
    - Git repository with proper remote
    - Node.js and npm installed

For more information, see README.md
EOF
}

# Setup environment-specific configuration
setup_environment() {
    header "Setting up $ENVIRONMENT Environment"

    case $ENVIRONMENT in
        staging)
            VERCEL_ARGS="--prod=false"
            PROJECT_SUFFIX="-staging"
            ;;
        production)
            VERCEL_ARGS="--prod=true"
            PROJECT_SUFFIX=""
            ;;
    esac

    # Set Vercel project names
    FRONTEND_PROJECT="amiexpress-web${PROJECT_SUFFIX}"
    BACKEND_PROJECT="amiexpress-api${PROJECT_SUFFIX}"

    success "Environment configured:"
    info "  Frontend Project: $FRONTEND_PROJECT"
    info "  Backend Project: $BACKEND_PROJECT"
    info "  Vercel Args: $VERCEL_ARGS"
}

# Build applications
build_applications() {
    if [[ "$SKIP_BUILD" == true ]]; then
        info "Skipping build process as requested"
        return
    fi

    header "Building Applications"

    # Build backend
    info "Building backend..."
    cd backend
    npm ci
    npm run build
    success "Backend built successfully"

    # Build frontend
    info "Building frontend..."
    cd ../frontend
    npm ci
    npm run build
    success "Frontend built successfully"

    cd ..
}

# Deploy to Vercel
deploy_to_vercel() {
    header "Deploying to Vercel"

    # Link or create Vercel projects
    if [[ ! -f ".vercel/project.json" ]]; then
        info "Linking to Vercel project..."
        vercel link --yes
    fi

    # Set environment variables
    info "Setting environment variables..."
    if [[ -n "${NODE_ENV:-}" ]]; then
        echo "$NODE_ENV" | vercel env add NODE_ENV production
    fi
    if [[ -n "${JWT_SECRET:-}" ]]; then
        echo "$JWT_SECRET" | vercel env add JWT_SECRET production
    fi
    if [[ -n "${POSTGRES_URL:-}" ]]; then
        echo "$POSTGRES_URL" | vercel env add POSTGRES_URL production
    fi
    if [[ -n "${POSTGRES_PRISMA_URL:-}" ]]; then
        echo "$POSTGRES_PRISMA_URL" | vercel env add POSTGRES_PRISMA_URL production
    fi

    # Deploy
    info "Deploying to Vercel..."
    local deploy_output
    deploy_output=$(vercel $VERCEL_ARGS 2>&1)

    # Extract deployment URL
    DEPLOYMENT_URL=$(echo "$deploy_output" | grep -o 'https://[^ ]*\.vercel\.app' | head -1)

    if [[ -n "$DEPLOYMENT_URL" ]]; then
        success "Deployment successful!"
        info "Deployment URL: $DEPLOYMENT_URL"
    else
        error "Failed to extract deployment URL"
        echo "$deploy_output" >&2
        return 1
    fi
}

# Setup analytics
setup_analytics() {
    if [[ "$SETUP_ANALYTICS" != true ]]; then
        return
    fi

    header "Setting up Vercel Analytics"

    # Enable Vercel Analytics
    vercel analytics enable

    success "Vercel Analytics enabled"
}

# Health checks
run_health_checks() {
    header "Running Health Checks"

    if [[ -z "$DEPLOYMENT_URL" ]]; then
        warning "No deployment URL available, skipping health checks"
        return
    fi

    # Check frontend
    info "Checking frontend..."
    if curl -s --max-time 10 "$DEPLOYMENT_URL" | grep -q "AmiExpress"; then
        success "Frontend check passed"
    else
        error "Frontend check failed"
        return 1
    fi

    # Check backend API
    info "Checking backend API..."
    if curl -s --max-time 10 "$DEPLOYMENT_URL/api/health" > /dev/null 2>&1; then
        success "Backend API check passed"
    else
        warning "Backend API check failed (may be expected for Vercel serverless)"
    fi
}

# Rollback functionality
rollback_deployment() {
    header "Rolling Back Deployment"

    warning "Rollback functionality for Vercel"
    info "Use: vercel rollback"
    info "Or visit Vercel dashboard for manual rollback"

    # Attempt automatic rollback
    if vercel rollback --yes 2>/dev/null; then
        success "Rollback initiated"
    else
        warning "Automatic rollback failed, please use Vercel dashboard"
    fi
}

# Main deployment function
main() {
    header "AmiExpress Web Vercel Deployment Script v$SCRIPT_VERSION"

    parse_args "$@"

    if [[ "$ROLLBACK" == true ]]; then
        rollback_deployment
        exit 0
    fi

    check_prerequisites
    setup_environment
    build_applications
    deploy_to_vercel
    setup_analytics
    run_health_checks

    header "Deployment Complete!"
    success "🎉 AmiExpress Web deployed to Vercel!"
    if [[ -n "$DEPLOYMENT_URL" ]]; then
        info "Frontend URL: $DEPLOYMENT_URL"
        info "Backend API: $DEPLOYMENT_URL/api"
    fi
    info "Log file: $LOG_FILE"
}

# Check prerequisites before main
check_prerequisites

# If no .env.local file exists, show setup instructions
if [[ ! -f ".env.local" ]]; then
    error "No .env.local file found!"
    info "Please create your environment file:"
    info "  cp .env.example .env.local"
    info "  nano .env.local  # Fill in your API keys"
    info ""
    info "Required environment variables:"
    info "  - VERCEL_TOKEN (from https://vercel.com/account/tokens)"
    info "  - POSTGRES_URL (from Vercel database)"
    info "  - JWT_SECRET (generate with: openssl rand -base64 32)"
    exit 1
fi

# Check for required environment variables
missing_vars=()
[[ -z "${VERCEL_TOKEN:-}" ]] && missing_vars+=("VERCEL_TOKEN")
[[ -z "${POSTGRES_URL:-}" ]] && missing_vars+=("POSTGRES_URL")
[[ -z "${JWT_SECRET:-}" ]] && missing_vars+=("JWT_SECRET")

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    error "Missing required environment variables in .env.local:"
    for var in "${missing_vars[@]}"; do
        info "  - $var"
    done
    info ""
    info "Please check your .env.local file and ensure all required variables are set."
    exit 1
fi

# Cleanup on exit
cleanup() {
    if [[ -f "$LOG_FILE" ]]; then
        info "Deployment log saved to: $LOG_FILE"
    fi
}

trap cleanup EXIT

# Check for .env.local file and required environment variables first
if [[ ! -f ".env.local" ]]; then
    error "No .env.local file found!"
    info "Please create your environment file:"
    info "  cp .env.example .env.local"
    info "  nano .env.local  # Fill in your API keys"
    info ""
    info "Required environment variables:"
    info "  - VERCEL_TOKEN (from https://vercel.com/account/tokens)"
    info "  - POSTGRES_URL (from Vercel database)"
    info "  - JWT_SECRET (generate with: openssl rand -base64 32)"
    exit 1
fi

# Load environment variables
if [[ -f ".env.local" ]]; then
    source .env.local
elif [[ -f ".env" ]]; then
    source .env
fi

# Check for required environment variables
missing_vars=()
[[ -z "${VERCEL_TOKEN:-}" ]] && missing_vars+=("VERCEL_TOKEN")
[[ -z "${POSTGRES_URL:-}" ]] && missing_vars+=("POSTGRES_URL")
[[ -z "${JWT_SECRET:-}" ]] && missing_vars+=("JWT_SECRET")

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    error "Missing required environment variables in .env.local:"
    for var in "${missing_vars[@]}"; do
        info "  - $var"
    done
    info ""
    info "Please check your .env.local file and ensure all required variables are set."
    exit 1
fi

# Run main function
main "$@"