#!/bin/bash
cd /home/user/amiexpress-web/sdk

echo "Testing all SDK example doors..."
echo ""

failed=0
success=0

for dir in examples/*/; do
  name=$(basename "$dir")
  echo "=== Testing $name ==="

  cd "$dir"

  if npm run build 2>&1 | grep -q "error TS"; then
    echo "❌ FAILED: $name"
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
