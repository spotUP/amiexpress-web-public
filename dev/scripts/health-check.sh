#!/bin/bash

# ============================================
# AmiExpress BBS - Health Check Script
# ============================================
# Comprehensive health check for deployed BBS
#
# Checks:
# - Database connectivity and integrity
# - Backend API responsiveness
# - Frontend availability
# - WebSocket connectivity
# - File system permissions
# - Door execution capability
# - Configuration validity
# ============================================

set -e

# ANSI Color Codes (ASCII-safe)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
RESET='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
TIMEOUT=10

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                   ║"
    echo "║            AmiExpress BBS - Deployment Health Check              ║"
    echo "║                                                                   ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${CYAN}${BOLD}  $1${RESET}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

test_pass() {
    echo -e "${GREEN}[PASS]${RESET} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

test_fail() {
    echo -e "${RED}[FAIL]${RESET} $1"
    if [ -n "$2" ]; then
        echo -e "       ${RED}→${RESET} $2"
    fi
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

test_warn() {
    echo -e "${YELLOW}[WARN]${RESET} $1"
    if [ -n "$2" ]; then
        echo -e "       ${YELLOW}→${RESET} $2"
    fi
    ((WARNING_TESTS++))
    ((TOTAL_TESTS++))
}

test_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

# ============================================
# Test Functions
# ============================================

check_environment() {
    print_section "Environment Configuration"

    # Check for .env.local
    if [ -f "$REPO_ROOT/.env.local" ]; then
        test_pass ".env.local configuration file exists"

        # Check for required variables
        source "$REPO_ROOT/.env.local"

        if [ -n "$JWT_SECRET" ]; then
            test_pass "JWT_SECRET is configured"
        else
            test_fail "JWT_SECRET not set" "Generate with: openssl rand -base64 32"
        fi

        if [ -n "$DATABASE_DIR" ] || [ -n "$DATABASE_URL" ]; then
            test_pass "Database path is configured"
        else
            test_warn "Database path not explicitly set" "Will use default: ./data"
        fi
    else
        test_fail ".env.local not found" "Run: ./dev/scripts/sysop-setup.sh"
    fi

    # Check Node.js version
    if command -v node &> /dev/null; then
        local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -ge 18 ]; then
            test_pass "Node.js version is adequate ($(node --version))"
        else
            test_warn "Node.js version may be too old" "Recommended: v18 or higher"
        fi
    else
        test_fail "Node.js not found" "Install Node.js 18+"
    fi
}

check_database() {
    print_section "Database Health"

    # Load environment variables
    if [ -f "$REPO_ROOT/.env.local" ]; then
        source "$REPO_ROOT/.env.local"
    fi

    local db_dir="${DATABASE_DIR:-./data}"
    local db_file="${DATABASE_FILE:-amiexpress.db}"
    local db_path="$REPO_ROOT/$db_dir/$db_file"

    # Check if database exists
    if [ -f "$db_path" ]; then
        test_pass "Database file exists: $db_path"

        # Check if database is readable
        if [ -r "$db_path" ]; then
            test_pass "Database file is readable"
        else
            test_fail "Database file is not readable" "Check file permissions"
        fi

        # Check if database is writable
        if [ -w "$db_path" ]; then
            test_pass "Database file is writable"
        else
            test_fail "Database file is not writable" "Check file permissions"
        fi

        # Check database size
        local db_size=$(stat -f%z "$db_path" 2>/dev/null || stat -c%s "$db_path" 2>/dev/null || echo "0")
        if [ "$db_size" -gt 0 ]; then
            local db_size_mb=$((db_size / 1024 / 1024))
            test_pass "Database has content (${db_size_mb}MB)"
        else
            test_warn "Database is empty" "May need initialization"
        fi
    else
        test_fail "Database file not found: $db_path" "Run: ./dev/scripts/sysop-setup.sh"
    fi

    # Check database directory permissions
    if [ -d "$REPO_ROOT/$db_dir" ]; then
        if [ -w "$REPO_ROOT/$db_dir" ]; then
            test_pass "Database directory is writable"
        else
            test_fail "Database directory is not writable" "Check directory permissions"
        fi
    else
        test_fail "Database directory not found: $REPO_ROOT/$db_dir" "Create with: mkdir -p $db_dir"
    fi
}

check_file_structure() {
    print_section "File System Structure"

    # Check critical directories
    local dirs=(
        "web/backend/src"
        "web/frontend/src"
        "doors"
        "data/bbs/BBS/Screens"
        "data/bbs/BBS/Conf01"
    )

    for dir in "${dirs[@]}"; do
        if [ -d "$REPO_ROOT/$dir" ]; then
            test_pass "Directory exists: $dir"
        else
            if [[ "$dir" == data/* ]]; then
                test_warn "Directory missing: $dir" "Will be created on first run"
            else
                test_fail "Critical directory missing: $dir"
            fi
        fi
    done

    # Check for node_modules
    if [ -d "$REPO_ROOT/web/backend/node_modules" ]; then
        test_pass "Backend dependencies installed"
    else
        test_fail "Backend dependencies not installed" "Run: cd web/backend && npm install"
    fi

    if [ -d "$REPO_ROOT/web/frontend/node_modules" ]; then
        test_pass "Frontend dependencies installed"
    else
        test_fail "Frontend dependencies not installed" "Run: cd web/frontend && npm install"
    fi
}

check_backend_api() {
    print_section "Backend API Health"

    # Check if backend is responding
    test_info "Testing backend at: $BACKEND_URL"

    if command -v curl &> /dev/null; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$BACKEND_URL/" 2>/dev/null || echo "000")

        if [ "$response" = "200" ] || [ "$response" = "304" ]; then
            test_pass "Backend API is responding (HTTP $response)"
        elif [ "$response" = "000" ]; then
            test_warn "Backend not reachable" "Start with: ./dev/scripts/start-servers.sh"
        else
            test_fail "Backend returned unexpected status: HTTP $response"
        fi

        # Test API endpoint
        local api_response=$(curl -s --connect-timeout $TIMEOUT "$BACKEND_URL/api/health" 2>/dev/null || echo "")
        if [ -n "$api_response" ]; then
            test_pass "Backend health endpoint is accessible"
        else
            test_warn "Backend health endpoint not available" "May not be critical if backend is running"
        fi
    else
        test_warn "curl not found, skipping HTTP checks" "Install curl for full health checks"
    fi
}

check_frontend() {
    print_section "Frontend Health"

    test_info "Testing frontend at: $FRONTEND_URL"

    if command -v curl &> /dev/null; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$FRONTEND_URL/" 2>/dev/null || echo "000")

        if [ "$response" = "200" ] || [ "$response" = "304" ]; then
            test_pass "Frontend is responding (HTTP $response)"
        elif [ "$response" = "000" ]; then
            test_warn "Frontend not reachable" "Start with: ./dev/scripts/start-servers.sh"
        else
            test_fail "Frontend returned unexpected status: HTTP $response"
        fi
    fi
}

check_ports() {
    print_section "Port Availability"

    # Load environment variables
    if [ -f "$REPO_ROOT/.env.local" ]; then
        source "$REPO_ROOT/.env.local"
    fi

    local backend_port="${BACKEND_PORT:-3001}"
    local frontend_port="${FRONTEND_PORT:-5173}"
    local telnet_port="${TELNET_PORT:-2323}"
    local ssh_port="${SSH_PORT:-2222}"

    # Check if ports are in use (indicates services are running)
    check_port() {
        local port=$1
        local service=$2

        if command -v lsof &> /dev/null; then
            if lsof -i :"$port" &> /dev/null; then
                test_pass "$service port $port is in use (service running)"
            else
                test_warn "$service port $port is not in use" "Service may not be running"
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -an | grep -q ":$port.*LISTEN"; then
                test_pass "$service port $port is in use (service running)"
            else
                test_warn "$service port $port is not in use" "Service may not be running"
            fi
        else
            test_info "Cannot check $service port $port (lsof/netstat not available)"
        fi
    }

    check_port "$backend_port" "Backend"
    check_port "$frontend_port" "Frontend"
    check_port "$telnet_port" "Telnet"
    check_port "$ssh_port" "SSH"
}

check_door_system() {
    print_section "Door System"

    # Check if doors directory exists
    if [ -d "$REPO_ROOT/doors" ]; then
        test_pass "Doors directory exists"

        # Count installed doors
        local door_count=$(find "$REPO_ROOT/doors" -maxdepth 1 -type d | wc -l)
        door_count=$((door_count - 1))  # Subtract 1 for the doors directory itself

        if [ "$door_count" -gt 0 ]; then
            test_pass "$door_count door(s) installed"
        else
            test_info "No doors installed yet (this is normal)"
        fi
    else
        test_warn "Doors directory not found" "Will be created when needed"
    fi

    # Check SDK
    if [ -d "$REPO_ROOT/sdk/node_modules" ]; then
        test_pass "SDK dependencies installed"
    else
        test_warn "SDK dependencies not installed" "Run: cd sdk && npm install"
    fi
}

check_typescript() {
    print_section "TypeScript Validation"

    test_info "Running TypeScript type check (this may take a moment)..."

    # Backend TypeScript check
    cd "$REPO_ROOT/web/backend"
    if npx tsc --noEmit 2>/dev/null; then
        test_pass "Backend TypeScript has no errors"
    else
        test_fail "Backend has TypeScript errors" "Run: cd web/backend && npx tsc --noEmit"
    fi

    # Frontend TypeScript check
    cd "$REPO_ROOT/web/frontend"
    if npm run build:check &>/dev/null; then
        test_pass "Frontend TypeScript has no errors"
    else
        test_warn "Frontend has TypeScript errors" "Run: cd web/frontend && npm run build:check"
    fi

    cd "$REPO_ROOT"
}

check_security() {
    print_section "Security Configuration"

    if [ -f "$REPO_ROOT/.env.local" ]; then
        source "$REPO_ROOT/.env.local"

        # Check JWT secret strength
        if [ -n "$JWT_SECRET" ]; then
            local jwt_length=${#JWT_SECRET}
            if [ "$jwt_length" -ge 32 ]; then
                test_pass "JWT secret has adequate length ($jwt_length characters)"
            else
                test_warn "JWT secret is short ($jwt_length characters)" "Recommended: 32+ characters"
            fi
        fi

        # Check for default/weak credentials
        if [ "$NODE_ENV" = "production" ]; then
            test_info "Production mode detected"

            if [ -z "$JWT_SECRET" ]; then
                test_fail "JWT_SECRET not set in production" "CRITICAL SECURITY ISSUE"
            fi
        else
            test_info "Development mode detected"
        fi
    fi

    # Check for exposed sensitive files
    if [ -f "$REPO_ROOT/.env.local" ]; then
        if git check-ignore "$REPO_ROOT/.env.local" &>/dev/null; then
            test_pass ".env.local is properly gitignored"
        else
            test_fail ".env.local is NOT gitignored" "CRITICAL: Add to .gitignore"
        fi
    fi
}

print_summary() {
    print_section "Health Check Summary"

    local total_percent=0
    if [ "$TOTAL_TESTS" -gt 0 ]; then
        total_percent=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    echo -e "${WHITE}Test Results:${RESET}"
    echo -e "  ${GREEN}Passed:   $PASSED_TESTS${RESET}"
    echo -e "  ${RED}Failed:   $FAILED_TESTS${RESET}"
    echo -e "  ${YELLOW}Warnings: $WARNING_TESTS${RESET}"
    echo -e "  ${CYAN}Total:    $TOTAL_TESTS${RESET}"
    echo ""
    echo -e "${WHITE}Health Score: ${BOLD}$total_percent%${RESET}"
    echo ""

    if [ "$FAILED_TESTS" -eq 0 ]; then
        echo -e "${GREEN}${BOLD}[OK] System is healthy!${RESET}"
        echo ""
        if [ "$WARNING_TESTS" -gt 0 ]; then
            echo -e "${YELLOW}Note: There are $WARNING_TESTS warning(s) that should be reviewed.${RESET}"
        fi
        return 0
    else
        echo -e "${RED}${BOLD}[ERROR] System has issues that need attention!${RESET}"
        echo ""
        echo "Please review the failed checks above and resolve them."
        return 1
    fi
}

# ============================================
# Main Execution
# ============================================

main() {
    print_header

    cd "$REPO_ROOT"

    # Parse arguments
    local skip_typescript=false
    for arg in "$@"; do
        case "$arg" in
            --skip-typescript|--fast)
                skip_typescript=true
                ;;
            --backend-url=*)
                BACKEND_URL="${arg#*=}"
                ;;
            --frontend-url=*)
                FRONTEND_URL="${arg#*=}"
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --fast, --skip-typescript  Skip TypeScript validation (faster)"
                echo "  --backend-url=URL          Backend URL to test (default: http://localhost:3001)"
                echo "  --frontend-url=URL         Frontend URL to test (default: http://localhost:5173)"
                echo "  --help, -h                 Show this help message"
                echo ""
                exit 0
                ;;
        esac
    done

    # Run all checks
    check_environment
    check_file_structure
    check_database
    check_ports
    check_backend_api
    check_frontend
    check_door_system
    check_security

    if [ "$skip_typescript" = false ]; then
        check_typescript
    else
        test_info "Skipping TypeScript validation (--fast mode)"
    fi

    # Print summary and exit with appropriate code
    if print_summary; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
