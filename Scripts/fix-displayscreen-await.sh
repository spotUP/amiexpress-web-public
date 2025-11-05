#!/bin/bash
# Fix displayScreen calls to be awaited

cd ~/Code/amiexpress-web/web/backend/src

# Find all TypeScript files with displayScreen calls
find . -name "*.ts" -type f -exec grep -l "displayScreen(" {} \; | while read f; do
  echo "Processing: $f"
  # Add await before displayScreen( calls that don't already have it
  sed -i.bak 's/\([^a-zA-Z_]\)displayScreen(/\1await displayScreen(/g' "$f"
  # Also handle start of line
  sed -i.bak 's/^displayScreen(/await displayScreen(/g' "$f"
  # Also handle after = sign
  sed -i.bak 's/= displayScreen(/= await displayScreen(/g' "$f"
  # Clean up double awaits
  sed -i.bak 's/await await /await /g' "$f"
  rm -f "$f.bak"
done

echo "Done! Updated displayScreen calls to be awaited"
