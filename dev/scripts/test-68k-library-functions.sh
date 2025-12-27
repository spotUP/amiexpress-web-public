#!/bin/bash
# Test individual dos.library functions against vamos

DOOR_DIR="~/Code/amiexpress-web/Doors"

echo "=== Testing 68K Library Functions ==="
echo ""

# Test 1: Simple execution
echo "Test 1: WHO door (minimal dos.library usage)"
echo "  - Vamos:"
timeout 5 vamos "$DOOR_DIR/who/who" 2>&1 | head -5
echo ""

# Test 2: File operations  
echo "Test 2: File operations"
echo "  - Vamos:"
timeout 5 vamos "$DOOR_DIR/Bulls/Bulls" 2>&1 | head -5
echo ""

# Test 3: More complex
echo "Test 3: MultiTop (complex file/date operations)"
echo "  - Vamos:"
timeout 5 vamos "$DOOR_DIR/multitop/mtop" 1 2>&1 | head -5
echo ""

echo "=== Next: Run same doors in our emulator and compare ==="
