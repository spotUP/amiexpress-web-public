#!/bin/bash
#
# Test Example Doors - Install and build all SDK example doors
#
# This script verifies that all example doors build successfully.
# Run this after making changes to the SDK to ensure examples still work.
#
# Usage:
#   ./dev/scripts/test-example-doors.sh
#   ./dev/scripts/test-example-doors.sh --clean  # Remove node_modules first
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SDK_DIR="$REPO_ROOT/sdk"
EXAMPLES_DIR="$SDK_DIR/examples"

# Example doors to test
DOORS=(
  "hello-world"
  "bug-tracker"
  "dungeon-rpg"
  "fire-emblem"
  "space-shooter"
  "tetris"
  "tic-tac-toe"
  "tracker-door"
)

# Check if --clean flag is passed
CLEAN_MODE=false
if [[ "$1" == "--clean" ]]; then
  CLEAN_MODE=true
  echo -e "${YELLOW}Clean mode enabled - removing node_modules${NC}"
fi

# Counters
SUCCESS_COUNT=0
FAIL_COUNT=0
FAILED_DOORS=()

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing SDK Example Doors${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# First, ensure SDK is built
echo -e "${YELLOW}Building SDK...${NC}"
cd "$SDK_DIR"
npm install > /dev/null 2>&1
npm run build > /dev/null 2>&1
echo -e "${GREEN}[OK] SDK built successfully${NC}"
echo ""

# Test each door
for door in "${DOORS[@]}"; do
  DOOR_PATH="$EXAMPLES_DIR/$door"

  if [[ ! -d "$DOOR_PATH" ]]; then
    echo -e "${RED}✗ $door - Directory not found${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DOORS+=("$door (not found)")
    continue
  fi

  echo -e "${BLUE}Testing: $door${NC}"
  cd "$DOOR_PATH"

  # Clean if requested
  if [[ "$CLEAN_MODE" == true ]]; then
    echo "  Cleaning..."
    rm -rf node_modules package-lock.json > /dev/null 2>&1 || true
  fi

  # Install dependencies
  echo "  Installing dependencies..."
  if npm install > /dev/null 2>&1; then
    echo -e "  ${GREEN}[OK] Dependencies installed${NC}"
  else
    echo -e "  ${RED}✗ npm install failed${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DOORS+=("$door (install failed)")
    continue
  fi

  # Build
  echo "  Building..."
  if npm run build > /dev/null 2>&1; then
    echo -e "  ${GREEN}[OK] Build successful${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "  ${RED}✗ Build failed${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DOORS+=("$door (build failed)")
    # Show build error
    echo -e "${YELLOW}  Error output:${NC}"
    npm run build 2>&1 | tail -10 | sed 's/^/    /'
  fi

  echo ""
done

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Total doors tested: ${#DOORS[@]}"
echo -e "${GREEN}Successful: $SUCCESS_COUNT${NC}"
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo -e "${RED}Failed: $FAIL_COUNT${NC}"
  echo ""
  echo -e "${RED}Failed doors:${NC}"
  for failed in "${FAILED_DOORS[@]}"; do
    echo -e "  ${RED}- $failed${NC}"
  done
  exit 1
else
  echo -e "${RED}Failed: $FAIL_COUNT${NC}"
  echo ""
  echo -e "${GREEN}All example doors built successfully!${NC}"
  exit 0
fi
