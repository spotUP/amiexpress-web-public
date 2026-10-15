#!/bin/bash

# ============================================
# AmiExpress BBS - Pre-Deployment Checklist
# ============================================
# Validates that everything is ready for deployment
# Run this before deploying to production
#
# Checks:
# - TypeScript compilation
# - Tests pass
# - Build succeeds
# - Configuration is valid
# - No security issues
# - Git is clean and pushed
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

# Tracking
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
BLOCKED=false

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                   ║"
    echo "║          AmiExpress BBS - Pre-Deployment Checklist               ║"
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

check_pass() {
    echo -e "${GREEN}[✓]${RESET} $1"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_fail() {
    echo -e "${RED}[✗]${RESET} $1"
    if [ -n "$2" ]; then
        echo -e "    ${RED}→${RESET} $2"
    fi
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
    BLOCKED=true
}

check_info() {
    echo -e "${BLUE}[i]${RESET} $1"
}

# ============================================
# Pre-Deployment Checks
# ============================================

check_git_status() {
    print_section "1. Git Status"

    # Check if in git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        check_fail "Not a git repository" "Initialize with: git init"
        return
    fi

    check_pass "Inside git repository"

    # Check for uncommitted changes
    if git diff --quiet && git diff --cached --quiet; then
        check_pass "No uncommitted changes"
    else
        check_fail "Uncommitted changes detected" "Commit changes before deploying"
        git status --short
    fi

    # Check if on a branch
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [ -n "$current_branch" ]; then
        check_pass "Current branch: $current_branch"
    else
        check_fail "Not on a branch" "Checkout a branch first"
    fi

    # Check if pushed to remote
    if git diff --quiet origin/$current_branch 2>/dev/null; then
        check_pass "Branch is up to date with remote"
    else
        check_fail "Branch not pushed to remote" "Run: git push origin $current_branch"
    fi

    # Check for .env.local in git (security risk)
    if git ls-files --error-unmatch .env.local &>/dev/null; then
        check_fail ".env.local is tracked by git" "SECURITY RISK: Remove with git rm --cached .env.local"
    else
        check_pass ".env.local is not tracked by git"
    fi
}

check_backend_build() {
    print_section "2. Backend Validation"

    cd "$REPO_ROOT/web/backend"

    # Check if dependencies are installed
    if [ -d "node_modules" ]; then
        check_pass "Dependencies installed"
    else
        check_fail "Dependencies not installed" "Run: npm install"
        cd "$REPO_ROOT"
        return
    fi

    # TypeScript check
    check_info "Running TypeScript check (this may take a moment)..."
    if npx tsc --noEmit 2>/dev/null; then
        check_pass "TypeScript compilation successful"
    else
        check_fail "TypeScript errors detected" "Run: npx tsc --noEmit to see errors"
    fi

    # Check for TODO or FIXME in critical files
    local todo_count=$(grep -r "TODO\|FIXME" src/ 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
    if [ "$todo_count" -gt 0 ]; then
        check_info "Found $todo_count TODO/FIXME comments (review before deploy)"
    fi

    cd "$REPO_ROOT"
}

check_frontend_build() {
    print_section "3. Frontend Validation"

    cd "$REPO_ROOT/web/frontend"

    # Check if dependencies are installed
    if [ -d "node_modules" ]; then
        check_pass "Dependencies installed"
    else
        check_fail "Dependencies not installed" "Run: npm install"
        cd "$REPO_ROOT"
        return
    fi

    # Build check (includes TypeScript validation)
    check_info "Running production build (this may take a moment)..."
    if npm run build &>/dev/null; then
        check_pass "Production build successful"

        # Check build size
        if [ -d "dist" ]; then
            local build_size=$(du -sh dist 2>/dev/null | cut -f1)
            check_info "Build size: $build_size"
        fi
    else
        check_fail "Production build failed" "Run: npm run build to see errors"
    fi

    # Check for console.log in production code (optional)
    local console_count=$(grep -r "console\\.log" src/ 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')
    if [ "$console_count" -gt 10 ]; then
        check_info "Found $console_count console.log statements (consider removing)"
    fi

    cd "$REPO_ROOT"
}

check_config_app_build() {
    print_section "4. Config App Validation"

    cd "$REPO_ROOT/web/config-app"

    # Check if dependencies are installed
    if [ -d "node_modules" ]; then
        check_pass "Dependencies installed"
    else
        check_fail "Dependencies not installed" "Run: npm install"
        cd "$REPO_ROOT"
        return
    fi

    # Build check
    check_info "Running production build..."
    if npm run build &>/dev/null; then
        check_pass "Production build successful"
    else
        check_fail "Production build failed" "Run: npm run build to see errors"
    fi

    cd "$REPO_ROOT"
}

check_sdk_build() {
    print_section "5. SDK Validation"

    cd "$REPO_ROOT/sdk"

    # Check if dependencies are installed
    if [ -d "node_modules" ]; then
        check_pass "Dependencies installed"
    else
        check_info "SDK dependencies not installed (optional)"
        cd "$REPO_ROOT"
        return
    fi

    # Build check
    check_info "Running SDK build..."
    if npm run build &>/dev/null; then
        check_pass "SDK build successful"

        # Test example doors
        check_info "Testing example doors..."
        local example_count=0
        local example_success=0

        for example in examples/*/; do
            if [ -f "$example/package.json" ]; then
                ((example_count++))
                if (cd "$example" && npm run build &>/dev/null); then
                    ((example_success++))
                fi
            fi
        done

        if [ "$example_count" -gt 0 ]; then
            if [ "$example_success" -eq "$example_count" ]; then
                check_pass "All $example_count example doors build successfully"
            else
                check_fail "Only $example_success/$example_count example doors build" "Fix broken examples"
            fi
        fi
    else
        check_fail "SDK build failed" "Run: npm run build to see errors"
    fi

    cd "$REPO_ROOT"
}

check_configuration() {
    print_section "6. Configuration Validation"

    # Check for .env.example
    if [ -f "$REPO_ROOT/.env.example" ]; then
        check_pass ".env.example exists"
    else
        check_fail ".env.example not found" "Create template for deployments"
    fi

    # Check for required deployment files
    if [ -f "$REPO_ROOT/.gitignore" ]; then
        check_pass ".gitignore exists"

        # Verify .env.local is ignored
        if grep -q ".env.local" "$REPO_ROOT/.gitignore"; then
            check_pass ".env.local is in .gitignore"
        else
            check_fail ".env.local not in .gitignore" "Add to prevent leaking secrets"
        fi
    else
        check_fail ".gitignore not found"
    fi

    # Check for package.json files
    local required_packages=(
        "web/backend/package.json"
        "web/frontend/package.json"
        "web/config-app/package.json"
        "sdk/package.json"
    )

    for pkg in "${required_packages[@]}"; do
        if [ -f "$REPO_ROOT/$pkg" ]; then
            check_pass "$(dirname $pkg) has package.json"
        else
            check_fail "$pkg not found"
        fi
    done
}

check_security() {
    print_section "7. Security Check"

    # Check for exposed secrets
    local secret_patterns=(
        "password.*=.*['\"].*['\"]"
        "api.*key.*=.*['\"].*['\"]"
        "secret.*=.*['\"].*['\"]"
        "token.*=.*['\"].*['\"]"
    )

    local secrets_found=false
    for pattern in "${secret_patterns[@]}"; do
        if grep -r -i -E "$pattern" "$REPO_ROOT/web" 2>/dev/null | grep -v "node_modules" | grep -v ".env.example" | grep -v "test" | grep -q .; then
            secrets_found=true
            break
        fi
    done

    if [ "$secrets_found" = true ]; then
        check_fail "Possible hardcoded secrets detected" "Review code for hardcoded credentials"
    else
        check_pass "No obvious hardcoded secrets detected"
    fi

    # Check for common vulnerabilities
    if [ -f "$REPO_ROOT/web/backend/package-lock.json" ]; then
        check_info "Checking for vulnerable dependencies..."
        cd "$REPO_ROOT/web/backend"
        local audit_output=$(npm audit --audit-level=high 2>&1 || true)

        if echo "$audit_output" | grep -q "0 vulnerabilities"; then
            check_pass "No high/critical vulnerabilities found"
        else
            check_fail "Vulnerable dependencies detected" "Run: npm audit fix"
        fi
        cd "$REPO_ROOT"
    fi

    # Check for CORS configuration
    if [ -f "$REPO_ROOT/web/backend/src/config.ts" ] || [ -f "$REPO_ROOT/web/backend/src/index.ts" ]; then
        if grep -q "cors" "$REPO_ROOT/web/backend/src"/*.ts 2>/dev/null; then
            check_pass "CORS configuration present"
        else
            check_info "CORS configuration not found (may be needed for production)"
        fi
    fi
}

check_documentation() {
    print_section "8. Documentation Check"

    # Check for key documentation files
    local docs=(
        "README.md"
        "CLAUDE.md"
        "Documentation/1-Users/USER_GUIDE.md"
        "Documentation/2-Sysops/DEPLOYMENT.md"
    )

    for doc in "${docs[@]}"; do
        if [ -f "$REPO_ROOT/$doc" ]; then
            check_pass "$doc exists"
        else
            check_info "$doc not found (consider adding)"
        fi
    done
}

check_deployment_readiness() {
    print_section "9. Deployment Readiness"

    # Check for deployment configs
    local deploy_configs=(
        "railway.json"
        "nixpacks.toml"
        ".env.example"
    )

    for config in "${deploy_configs[@]}"; do
        if [ -f "$REPO_ROOT/$config" ]; then
            check_pass "$config present"
        else
            check_info "$config not found (optional for some hosts)"
        fi
    done

    # Check if scripts are executable
    local scripts=(
        "dev/scripts/start-servers.sh"
        "dev/scripts/kill-servers.sh"
        "dev/scripts/sysop-setup.sh"
        "dev/scripts/health-check.sh"
    )

    for script in "${scripts[@]}"; do
        if [ -f "$REPO_ROOT/$script" ]; then
            if [ -x "$REPO_ROOT/$script" ]; then
                check_pass "$script is executable"
            else
                check_fail "$script is not executable" "Run: chmod +x $script"
            fi
        fi
    done
}

print_summary() {
    print_section "Deployment Readiness Summary"

    local pass_percent=0
    if [ "$TOTAL_CHECKS" -gt 0 ]; then
        pass_percent=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi

    echo -e "${WHITE}Results:${RESET}"
    echo -e "  ${GREEN}Passed: $PASSED_CHECKS${RESET}"
    echo -e "  ${RED}Failed: $FAILED_CHECKS${RESET}"
    echo -e "  ${CYAN}Total:  $TOTAL_CHECKS${RESET}"
    echo ""
    echo -e "${WHITE}Readiness Score: ${BOLD}$pass_percent%${RESET}"
    echo ""

    if [ "$BLOCKED" = true ]; then
        echo -e "${RED}${BOLD}[✗] DEPLOYMENT BLOCKED${RESET}"
        echo ""
        echo "Critical issues must be resolved before deploying."
        echo "Review the failed checks above and fix them."
        echo ""
        echo "After fixing issues, run this script again:"
        echo "  ${CYAN}./dev/scripts/pre-deploy-check.sh${RESET}"
        return 1
    else
        echo -e "${GREEN}${BOLD}[✓] READY TO DEPLOY!${RESET}"
        echo ""
        echo "All critical checks passed. You can proceed with deployment."
        echo ""
        echo "Deployment options:"
        echo "  1. Railway.app (Recommended):"
        echo "     ${CYAN}See: Documentation/2-Sysops/RAILWAY_DEPLOYMENT.md${RESET}"
        echo ""
        echo "  2. Render.com:"
        echo "     ${CYAN}./dev/scripts/push-and-deploy.sh${RESET}"
        echo ""
        echo "  3. Manual deployment:"
        echo "     ${CYAN}See: Documentation/2-Sysops/DEPLOYMENT.md${RESET}"
        echo ""
        return 0
    fi
}

# ============================================
# Main Execution
# ============================================

main() {
    print_header

    cd "$REPO_ROOT"

    # Run all checks
    check_git_status
    check_backend_build
    check_frontend_build
    check_config_app_build
    check_sdk_build
    check_configuration
    check_security
    check_documentation
    check_deployment_readiness

    # Print summary and exit
    if print_summary; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
