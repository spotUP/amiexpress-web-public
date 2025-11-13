#!/bin/bash
#
# Configuration System Test Suite
#
# Runs comprehensive tests of the BBS configuration system:
# 1. Verifies database tables are created
# 2. Creates/elevates test sysop user
# 3. Tests all configuration API endpoints
#
# Usage: ./dev/scripts/test-config-system.sh

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}AmiExpress Configuration System Test Suite${NC}\n"

# Check if server is running
echo -e "${CYAN}=== Checking Server Status ===${NC}\n"

if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "${GREEN}[OK] Server is running${NC}"
else
    echo -e "${RED}✗ Server is not running${NC}"
    echo -e "${YELLOW}Please start the server first:${NC}"
    echo -e "  ./dev/scripts/start-servers.sh"
    exit 1
fi

# Step 1: Verify database tables
echo -e "\n${CYAN}=== Step 1: Verify Database Tables ===${NC}\n"

node dev/scripts/verify-config-tables.js
VERIFY_EXIT=$?

if [ $VERIFY_EXIT -ne 0 ]; then
    echo -e "\n${RED}Database verification failed${NC}"
    echo -e "${YELLOW}The server may need to be restarted to create all tables${NC}"
    exit 1
fi

# Step 2: Make test user sysop
echo -e "\n${CYAN}=== Step 2: Setup Test Sysop User ===${NC}\n"

# First run the API test to create the user
node dev/scripts/test-config-api.js > /tmp/config-test-initial.log 2>&1
INITIAL_EXIT=$?

# Check if it failed due to permissions
if grep -q "doesn't have sysop privileges" /tmp/config-test-initial.log; then
    echo -e "${YELLOW}Test user needs sysop privileges${NC}"
    echo -e "Elevating user 'testsysop' to sysop level..."

    node dev/scripts/make-user-sysop.js testsysop
    SYSOP_EXIT=$?

    if [ $SYSOP_EXIT -ne 0 ]; then
        echo -e "${RED}Failed to elevate user to sysop${NC}"
        exit 1
    fi
fi

# Step 3: Run full API tests
echo -e "\n${CYAN}=== Step 3: Run Configuration API Tests ===${NC}\n"

node dev/scripts/test-config-api.js
TEST_EXIT=$?

# Summary
echo -e "\n${CYAN}=== Test Suite Complete ===${NC}\n"

if [ $TEST_EXIT -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo -e "${GREEN}Configuration system is fully functional${NC}\n"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    echo -e "${YELLOW}Check the output above for details${NC}\n"
    exit 1
fi
