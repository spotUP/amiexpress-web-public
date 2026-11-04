#!/bin/bash
# AEDoor.library Reverse Engineering Script
# Disassembles key functions to understand memory layout

LIB="${AMIEXPRESS_REFERENCE:-~/Code/Reference}/reference-boardBBS/Node0/Libs/AEDoor.library"

echo "=== AEDoor.library Function Analysis ==="
echo ""
echo "Library: $LIB"
echo "Size: $(wc -c < "$LIB") bytes"
echo ""

# Library info
echo "=== Library Header ==="
r2 -q -c "e asm.arch=m68k; e asm.bits=32; e scr.color=0; px 128 @ 0" "$LIB" 2>/dev/null
echo ""

# Look for jump table (Amiga libraries use JMP instructions)
echo "=== Function Jump Table (looking for JMP patterns) ==="
r2 -q -c "e asm.arch=m68k; e asm.bits=32; e scr.color=0; /x 4efa; pd 5 @ hit0_0" "$LIB" 2>/dev/null
echo ""

# Disassemble first 200 bytes to find structure
echo "=== First 200 bytes disassembly ==="
r2 -q -c "e asm.arch=m68k; e asm.bits=32; e scr.color=0; s 0; pd 100 @ 0x20" "$LIB" 2>/dev/null
echo ""

# Try to find string table
echo "=== Embedded Strings ==="
strings "$LIB"
echo ""

echo "=== Analysis complete ==="
echo "Next steps:"
echo "1. Identify CreateComm() function address"
echo "2. Identify getname() function address"
echo "3. Trace memory reads in each function"
echo "4. Map BBSInfo structure layout"
