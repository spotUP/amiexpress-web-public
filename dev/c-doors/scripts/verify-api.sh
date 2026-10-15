#!/bin/bash
# Verify that all AmiExpress API functions are implemented

cd "$(dirname "$0")"

echo "=== AmiExpress API Implementation Verification ==="
echo

# Extract function names from header
echo "📋 Functions declared in amiexpress.h:"
declare -a declared_functions
while IFS= read -r line; do
    if [[ $line =~ extern.*\ ([a-zA-Z_][a-zA-Z0-9_]*)\( ]]; then
        func="${BASH_REMATCH[1]}"
        declared_functions+=("$func")
    fi
done < <(grep "^extern.*(" includes/amiexpress.h)

echo "Found ${#declared_functions[@]} function declarations"

# Check GCC implementations
echo
echo "🔧 Functions implemented in glue-gcc.c:"
declare -a gcc_functions
while IFS= read -r line; do
    if [[ $line =~ ^[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)\s*\{ ]]; then
        func="${line%%(*}"
        gcc_functions+=("$func")
    fi
done < <(grep "^[a-zA-Z_].*(" src/glue-gcc.c)

echo "Found ${#gcc_functions[@]} function implementations"

# Check vbcc implementations (excluding Amiga system calls)
echo
echo "🔧 Functions implemented in glue-vbcc.c:"
declare -a vbcc_functions
while IFS= read -r line; do
    if [[ $line =~ ^[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)\s*\{ ]]; then
        func="${line%%(*}"
        vbcc_functions+=("$func")
    fi
done < <(grep "^[a-zA-Z_].*(" src/glue-vbcc.c)

echo "Found ${#vbcc_functions[@]} function implementations"

# Check for missing functions
echo
echo "🔍 Checking for missing implementations..."
missing_gcc=()
missing_vbcc=()

for func in "${declared_functions[@]}"; do
    found_gcc=false
    found_vbcc=false

    for gcc_func in "${gcc_functions[@]}"; do
        if [[ "$gcc_func" == "$func" ]]; then
            found_gcc=true
            break
        fi
    done

    for vbcc_func in "${vbcc_functions[@]}"; do
        if [[ "$vbcc_func" == "$func" ]]; then
            found_vbcc=true
            break
        fi
    done

    if [[ "$found_gcc" != "true" ]]; then
        missing_gcc+=("$func")
    fi

    if [[ "$found_vbcc" != "true" ]]; then
        missing_vbcc+=("$func")
    fi
done

echo
if [ ${#missing_gcc[@]} -eq 0 ]; then
    echo "✅ GCC glue: All ${#declared_functions[@]} functions implemented"
else
    echo "❌ GCC glue: ${#missing_gcc[@]} functions missing:"
    for func in "${missing_gcc[@]}"; do
        echo "   - $func"
    done
fi

echo
if [ ${#missing_vbcc[@]} -eq 0 ]; then
    echo "✅ vbcc glue: All ${#declared_functions[@]} functions implemented"
else
    echo "❌ vbcc glue: ${#missing_vbcc[@]} functions missing:"
    for func in "${missing_vbcc[@]}"; do
        echo "   - $func"
    done
fi

echo
echo "=== Summary ==="
echo "Total API functions: ${#declared_functions[@]}"
echo "GCC implementations: ${#gcc_functions[@]}"
echo "vbcc implementations: ${#vbcc_functions[@]}"
echo "GCC missing: ${#missing_gcc[@]}"
echo "vbcc missing: ${#missing_vbcc[@]}"

if [ ${#missing_gcc[@]} -eq 0 ] && [ ${#missing_vbcc[@]} -eq 0 ]; then
    echo "🎉 SUCCESS: Complete 1:1 API implementation!"
    exit 0
else
    echo "⚠️  INCOMPLETE: Some functions still missing"
    exit 1
fi