#!/bin/bash
# Comprehensive Door Testing Script
# Tests all installed doors and generates detailed report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "[INFO] Starting comprehensive door testing..."
echo "[INFO] This will test all installed doors in the Doors/ directory"
echo ""

# Parse arguments
TIMEOUT=5000
OUTPUT="/tmp/door-test-report.txt"
VERBOSE=""
FILTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE="--verbose"
      shift
      ;;
    --filter)
      FILTER="--filter $2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --timeout <ms>      Timeout per door in milliseconds (default: 5000)"
      echo "  --output <file>     Output report file (default: /tmp/door-test-report.txt)"
      echo "  --verbose           Show detailed output during testing"
      echo "  --filter <pattern>  Only test doors matching pattern (e.g., 'WHO,RTW,B')"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Test all doors with defaults"
      echo "  $0 --verbose                          # Test all doors with verbose output"
      echo "  $0 --filter 'WHO,RTW'                 # Test only WHO and RTW doors"
      echo "  $0 --timeout 10000 --verbose          # Test with 10s timeout, verbose"
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $1"
      echo "Run '$0 --help' for usage information"
      exit 1
      ;;
  esac
done

# Run the TypeScript test script
npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-doors.ts \
  --timeout "$TIMEOUT" \
  --output "$OUTPUT" \
  $VERBOSE \
  $FILTER

echo ""
echo "[OK] Door testing complete!"
echo "[OK] Report saved to: $OUTPUT"
echo ""
echo "To view the report:"
echo "  cat $OUTPUT"
echo "  less $OUTPUT"
echo "  code $OUTPUT"
