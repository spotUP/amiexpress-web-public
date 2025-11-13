#!/bin/bash
cd /home/user/amiexpress-web/sdk
ERRORS=0
for dir in examples/*/; do
  example=$(basename "$dir")
  echo -n "Checking $example... "
  cd "$dir"
  npx tsc --noEmit > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "[OK] OK"
  else
    echo "[ERROR] ERRORS"
    ERRORS=$((ERRORS + 1))
  fi
  cd - > /dev/null
done
echo ""
if [ $ERRORS -eq 0 ]; then
  echo "All examples compile successfully!"
else
  echo "$ERRORS example(s) have compilation errors"
fi
exit $ERRORS
