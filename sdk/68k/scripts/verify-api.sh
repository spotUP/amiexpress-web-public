#!/bin/bash
# Verify that all AmiExpress API functions are implemented

cd "$(dirname "$0")/.."

echo "=== AmiExpress API Implementation Verification ==="
echo

# Extract function names from header
echo "[INFO] Functions declared in amiexpress.h:"
declare -a declared_functions
while IFS= read -r line; do
    if [[ $line =~ extern.*\ ([a-zA-Z_][a-zA-Z0-9_]*)\( ]]; then
        func="${BASH_REMATCH[1]}"
        declared_functions+=("$func")
    fi
done < <(grep "^extern.*(" includes/amiexpress.h)

echo "Found ${#declared_functions[@]} function declarations"

# Check vbcc implementations
echo
echo "[INFO] Functions implemented in glue.c:"
declare -a vbcc_functions
while IFS= read -r line; do
    if [[ $line =~ ^[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)\s*\{ ]]; then
        func="${line%%(*}"
        vbcc_functions+=("$func")
    fi
done < <(grep "^[a-zA-Z_].*(" src/glue.c 2>/dev/null || true)

echo "Found ${#vbcc_functions[@]} function implementations"

# Check for missing functions
echo
echo "[INFO] Checking for missing implementations..."
missing_vbcc=()

for func in "${declared_functions[@]}"; do
    found_vbcc=false

    for vbcc_func in "${vbcc_functions[@]}"; do
        if [[ "$vbcc_func" == "$func" ]]; then
            found_vbcc=true
            break
        fi
    done

    if [[ "$found_vbcc" != "true" ]]; then
        missing_vbcc+=("$func")
    fi
done

echo
if [ ${#missing_vbcc[@]} -eq 0 ]; then
    echo "[OK] All ${#declared_functions[@]} functions implemented"
else
    echo "[WARN] ${#missing_vbcc[@]} functions missing:"
    for func in "${missing_vbcc[@]}"; do
        echo "   - $func"
    done
fi

echo
echo "=== Summary ==="
echo "Total API functions: ${#declared_functions[@]}"
echo "Implementations: ${#vbcc_functions[@]}"
echo "Missing: ${#missing_vbcc[@]}"

if [ ${#missing_vbcc[@]} -eq 0 ]; then
    echo "[SUCCESS] Complete API implementation!"
    exit 0
else
    echo "[INCOMPLETE] Some functions still missing"
    exit 1
fi
