#!/bin/bash
for file in download.handler.ts alter-flags.handler.ts zippy-search.handler.ts batch-download.handler.ts view-file.handler.ts file-status.handler.ts; do
  echo "Fixing $file..."
  # Find the first import line and add our import after it
  awk '
    /^import / && !added { 
      print 
      if (getline > 0) {
        print "import { config } from '"'"'../config'"'"';"
        print $0
        added=1
        next
      }
    }
    /const config = \(global as any\)\.config;/ { next }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
done
