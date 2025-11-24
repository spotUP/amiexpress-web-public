#!/bin/bash
# Quick test to run RTW and check GetMsg() behavior
# Filters logs to show only RTW-related messages

echo "=== Testing RTW GetMsg() behavior ==="
echo "Looking for:"
echo "  - GetMsg() calls and return values"
echo "  - RTW polling loop behavior"
echo "  - AllocSignal() calls"
echo ""

npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test_rtw_polling.ts 2>&1 | grep -E "(GetMsg|AllocSignal|RTW-POLL|Signal\(|Wait\()" | head -100
