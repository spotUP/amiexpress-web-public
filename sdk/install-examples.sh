#!/bin/bash
cd /home/user/amiexpress-web/sdk
for dir in examples/*/; do
  example=$(basename "$dir")
  echo "Installing dependencies for $example..."
  cd "$dir"
  npm install --silent > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "  ✓ $example installed"
  else
    echo "  ✗ $example failed"
  fi
  cd - > /dev/null
done
echo "Done!"
