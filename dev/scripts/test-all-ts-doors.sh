#!/bin/bash
# Test all TypeScript doors to ensure they load without errors
# This script validates door structure but doesn't run them

set -e

echo "=== TypeScript Door Validation ==="
echo ""

cd ~/Code/AmiExpress/amiexpress-web/board

total=0
passed=0
failed=0
missing_info=0

for dir in Doors/*/; do
  if [ ! -f "$dir/package.json" ]; then continue; fi

  total=$((total + 1))
  name=$(basename "$dir")

  # Extract door info from package.json
  runtime=$(grep -o '"runtime"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
  bbscmd=$(grep -o '"bbsCommand"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
  main=$(grep -o '"main"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' | sed 's|^./||')

  # Check for .info file
  has_info=0
  if [ -f "Commands/BBSCmd/${bbscmd}.info" ]; then
    has_info=1
  elif [ -f "Commands/BBSCmd/${name}.info" ]; then
    has_info=1
    bbscmd=$name
  fi

  # Validate based on runtime
  status="[OK]"
  errors=()

  if [ $has_info -eq 0 ]; then
    status="[FAIL]"
    errors+=("Missing .info file")
    missing_info=$((missing_info + 1))
    failed=$((failed + 1))
  fi

  case "$runtime" in
    server)
      # Server doors need main entry with runDoor export
      if [ -z "$main" ]; then
        status="[FAIL]"
        errors+=("Missing main entry")
        failed=$((failed + 1))
      elif [ ! -f "$dir/$main" ]; then
        status="[FAIL]"
        errors+=("Main file not found: $main")
        failed=$((failed + 1))
      elif ! grep -q "export.*runDoor\|export default.*runDoor" "$dir/$main" 2>/dev/null; then
        status="[FAIL]"
        errors+=("No runDoor export in $main")
        failed=$((failed + 1))
      else
        [ "$status" = "[OK]" ] && passed=$((passed + 1))
      fi
      ;;

    client)
      # Client doors need main entry
      if [ -z "$main" ]; then
        status="[FAIL]"
        errors+=("Missing main entry")
        failed=$((failed + 1))
      elif [ ! -f "$dir/$main" ]; then
        status="[FAIL]"
        errors+=("Main file not found: $main")
        failed=$((failed + 1))
      else
        [ "$status" = "[OK]" ] && passed=$((passed + 1))
      fi
      ;;

    hybrid)
      # Hybrid doors need client.ts and server.ts
      if [ ! -f "$dir/client.ts" ]; then
        status="[FAIL]"
        errors+=("Missing client.ts")
        failed=$((failed + 1))
      fi

      if [ ! -f "$dir/server.ts" ]; then
        status="[FAIL]"
        errors+=("Missing server.ts")
        failed=$((failed + 1))
      elif ! grep -q "export.*rpcHandlers\|export function\|ServerDoor\|door\.start()" "$dir/server.ts" 2>/dev/null; then
        status="[WARN]"
        errors+=("server.ts has no RPC handlers or ServerDoor")
      fi

      [ "$status" = "[OK]" ] && passed=$((passed + 1))
      ;;

    *)
      status="[WARN]"
      errors+=("Unknown runtime: $runtime")
      ;;
  esac

  # Print results
  printf "%-20s %-10s %-15s %s" "$name" "$runtime" "$bbscmd" "$status"
  if [ ${#errors[@]} -gt 0 ]; then
    echo ""
    for error in "${errors[@]}"; do
      echo "                                                   - $error"
    done
  else
    echo ""
  fi
done

echo ""
echo "=== Summary ==="
echo "Total TypeScript doors: $total"
echo "Passed: $passed"
echo "Failed: $failed"
echo "Missing .info files: $missing_info"

if [ $failed -gt 0 ]; then
  echo ""
  echo "[FAIL] Some TypeScript doors have issues"
  exit 1
else
  echo ""
  echo "[OK] All TypeScript doors validated successfully"
  exit 0
fi
