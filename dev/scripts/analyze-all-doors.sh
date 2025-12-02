#!/bin/bash
# Analyze all doors to determine their type (XIM vs SIM)

echo "=== DOOR TYPE ANALYSIS ==="
echo ""

XIM_COUNT=0
SIM_COUNT=0
UNKNOWN_COUNT=0

echo "Scanning doors directory..."
echo ""

for dir in doors/*/; do
  if [ ! -d "$dir" ]; then
    continue
  fi

  doorname=$(basename "$dir")

  # Find executable (Amiga hunk header 0x000003F3)
  doorbin=""
  for file in "$dir"*; do
    if [ -f "$file" ] && [ ! "${file##*.}" = "info" ] && [ ! "${file##*.}" = "guide" ] && [ ! "${file##*.}" = "txt" ]; then
      # Check for Amiga hunk header
      header=$(xxd -l 4 -p "$file" 2>/dev/null)
      if [ "$header" = "000003f3" ]; then
        doorbin="$file"
        break
      fi
    fi
  done

  if [ -z "$doorbin" ]; then
    continue
  fi

  # Analyze door
  has_aedoorport=$(strings "$doorbin" 2>/dev/null | grep -i "AEDoorPort" | head -1)
  has_doorcontrol=$(strings "$doorbin" 2>/dev/null | grep -i "DoorControl" | head -1)
  has_0x790=$(xxd "$doorbin" 2>/dev/null | grep "2079 0000 0790" | head -1)
  declared_xim=$(strings "$doorbin" 2>/dev/null | grep -i "XIM.*DOOR" | head -1)
  declared_sim=$(strings "$doorbin" 2>/dev/null | grep -i "SIM.*DOOR" | head -1)

  # Determine type
  doortype="UNKNOWN"
  notes=""

  if [ -n "$has_aedoorport" ]; then
    doortype="XIM"
    notes="Uses AEDoorPort"
    XIM_COUNT=$((XIM_COUNT + 1))
  elif [ -n "$has_doorcontrol" ]; then
    doortype="SIM"
    notes="Uses DoorControl"
    SIM_COUNT=$((SIM_COUNT + 1))
  elif [ -n "$has_0x790" ]; then
    doortype="SIM"
    notes="Has 0x790 BBS API access"
    SIM_COUNT=$((SIM_COUNT + 1))
  else
    UNKNOWN_COUNT=$((UNKNOWN_COUNT + 1))
  fi

  if [ -n "$declared_xim" ]; then
    notes="$notes, Declares: $declared_xim"
  fi

  if [ -n "$declared_sim" ]; then
    notes="$notes, Declares: $declared_sim"
  fi

  echo "[$doortype] $doorname"
  if [ -n "$notes" ]; then
    echo "        $notes"
  fi
done

echo ""
echo "=== SUMMARY ==="
echo "XIM Doors: $XIM_COUNT"
echo "SIM Doors: $SIM_COUNT"
echo "Unknown: $UNKNOWN_COUNT"
