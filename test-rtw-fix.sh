#!/bin/bash
# Test script to verify RTW door output is fixed

echo "Testing RTW door with MULTICOM fix..."
echo ""

# Clean old logs
rm -f logs/door-68k-RTW-*.log
rm -f /tmp/rtw-test-output.txt

# Give user instructions
echo "Please:"
echo "1. Connect to the BBS (telnet localhost 2323)"
echo "2. Login as: sysop / password"
echo "3. Run command: RTW"
echo "4. Press Ctrl+C when done viewing RTW output"
echo ""
echo "Waiting for RTW execution..."

# Wait for RTW log to appear
while [ ! -f logs/door-68k-RTW-*.log ]; do
  sleep 1
done

echo ""
echo "RTW executed! Checking logs..."
sleep 2

# Find the most recent RTW log
LATEST_LOG=$(ls -t logs/door-68k-RTW-*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
  echo "ERROR: No RTW log found!"
  exit 1
fi

echo "Analyzing: $LATEST_LOG"
echo ""
echo "=== RTW Output ==="
grep -A 100 "string: .*Node.*Name/Handle.*Location" "$LATEST_LOG" | grep "string:" | head -30
echo ""
echo "=== Checking for corruption ==="

# Check for corruption markers
if grep -q "ÿþ" "$LATEST_LOG"; then
  echo "❌ FAILED: Found garbage characters (ÿþ)"
  exit 1
fi

if grep -q "Nºn" "$LATEST_LOG"; then
  echo "❌ FAILED: Found corrupted data (Nºn)"
  exit 1
fi

# Check that offline nodes show empty strings
OFFLINE_NODE_CHECK=$(grep "string:.*\| 05 \|" "$LATEST_LOG" | head -1)
if echo "$OFFLINE_NODE_CHECK" | grep -q "[a-zA-Z0-9]\{5,\}"; then
  echo "⚠️  WARNING: Offline node 05 might have non-empty data"
else
  echo "✅ PASS: Offline nodes appear clean"
fi

# Check that current node shows correct data
CURRENT_NODE=$(grep "string:.*\| 04 \|.*sysop" "$LATEST_LOG" | head -1)
if [ -n "$CURRENT_NODE" ]; then
  echo "✅ PASS: Current node (04) shows user data"
else
  echo "❌ FAILED: Current node (04) missing user data"
  exit 1
fi

echo ""
echo "=== Test Result ==="
echo "✅ RTW output appears clean - no memory corruption detected!"
