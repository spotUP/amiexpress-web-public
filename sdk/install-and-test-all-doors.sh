#!/bin/bash
cd /home/user/amiexpress-web/sdk

echo "Installing and testing all SDK example doors..."
echo ""

failed=0
success=0

for dir in examples/*/; do
  name=$(basename "$dir")
  echo "=== Installing and testing $name ==="

  cd "$dir"

  # Install dependencies quietly
  npm install --silent > /dev/null 2>&1

  # Build and check for errors
  if npm run build 2>&1 | grep -q "error TS"; then
    echo "❌ FAILED: $name"
    npm run build 2>&1 | grep "error TS" | head -3
    failed=$((failed + 1))
  else
    echo "✓ SUCCESS: $name"
    success=$((success + 1))
  fi

  cd - > /dev/null
  echo ""
done

echo "================================"
echo "Results: $success passed, $failed failed"
echo "================================"

exit $failed
