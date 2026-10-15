#!/bin/bash
# AmiExpress C Door Build Script

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOOR_NAME="$1"

if [ -z "$DOOR_NAME" ]; then
    echo "Usage: $0 <door_name>"
    echo "Creates a new C door project in doors/<door_name>/"
    exit 1
fi

DOOR_DIR="doors/$DOOR_NAME"

# Check if door already exists
if [ -d "$DOOR_DIR" ]; then
    echo "Error: Door '$DOOR_NAME' already exists in $DOOR_DIR"
    exit 1
fi

echo "Creating C door: $DOOR_NAME"

# Create directory structure
mkdir -p "$DOOR_DIR"

# Copy template files
cp "$SCRIPT_DIR/../templates/Makefile.vbcc" "$DOOR_DIR/Makefile"
cp "$SCRIPT_DIR/../templates/hello-door.c" "$DOOR_DIR/$DOOR_NAME.c"

# Create .info file for BBS integration
cat > "$DOOR_DIR/$DOOR_NAME.info" << EOF
LOCATION=
STACK=20000
STARTUP=1
EOF

echo "✓ Created door structure:"
echo "  $DOOR_DIR/"
echo "  ├── $DOOR_NAME.c     (main source)"
echo "  ├── Makefile         (build config)"
echo "  └── $DOOR_NAME.info  (BBS registration)"
echo ""
echo "To build: cd $DOOR_DIR && make"
echo "To test:  node web/backend/dist/scripts/run-amiga-door.js $DOOR_DIR/$DOOR_NAME 1"