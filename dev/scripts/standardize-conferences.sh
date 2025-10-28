#!/bin/bash
# Script to standardize conference directory structure
# Based on reference-boardBBS real AmiExpress structure

echo "Standardizing Conference Directories..."
echo "========================================"

for i in {1..14}; do
    CONF_DIR="Conf$i"
    
    if [ ! -d "$CONF_DIR" ]; then
        echo "Warning: $CONF_DIR not found, skipping..."
        continue
    fi
    
    echo ""
    echo "Processing $CONF_DIR..."
    
    # Create missing subdirectories
    mkdir -p "$CONF_DIR/Bulletins"
    mkdir -p "$CONF_DIR/MsgBase"
    mkdir -p "$CONF_DIR/Hold"
    mkdir -p "$CONF_DIR/Upload"
    mkdir -p "$CONF_DIR/PartUpload"
    mkdir -p "$CONF_DIR/LCFiles"
    mkdir -p "$CONF_DIR/Dir0"
    mkdir -p "$CONF_DIR/Dir1"
    mkdir -p "$CONF_DIR/Dir2"
    
    # Create standard files if they don't exist
    
    if [ ! -f "$CONF_DIR/Menu.txt" ]; then
        cat > "$CONF_DIR/Menu.txt" << 'EOF'
Conference Menu
===============

Available Commands:
[R]ead Messages
[P]ost Message
[F]ile Areas
[L]ist Files
[U]pload Files
[D]ownload Files
[B]ulletins
[Q]uit to Main Menu

Command:
EOF
        echo "  Created Menu.txt"
    fi
    
    if [ ! -f "$CONF_DIR/downloadmsg.txt" ]; then
        cat > "$CONF_DIR/downloadmsg.txt" << 'EOF'
Download in progress...
Please wait while your file is prepared.
EOF
        echo "  Created downloadmsg.txt"
    fi
    
    if [ ! -f "$CONF_DIR/uploadmsg.txt" ]; then
        cat > "$CONF_DIR/uploadmsg.txt" << 'EOF'
Upload in progress...
Please wait while your file is received.
EOF
        echo "  Created uploadmsg.txt"
    fi
    
    if [ ! -f "$CONF_DIR/NDIRS" ]; then
        echo "3" > "$CONF_DIR/NDIRS"
        echo "  Created NDIRS (set to 3 directories)"
    fi
    
    echo "  ✓ $CONF_DIR standardized"
done

echo ""
echo "========================================"
echo "Conference standardization complete!"
echo ""
echo "All conferences now have:"
echo "  - Bulletins/"
echo "  - MsgBase/"
echo "  - Hold/"
echo "  - Upload/"
echo "  - PartUpload/"
echo "  - LCFiles/"
echo "  - Dir0/, Dir1/, Dir2/"
echo "  - Menu.txt"
echo "  - downloadmsg.txt"
echo "  - uploadmsg.txt"
echo "  - NDIRS"