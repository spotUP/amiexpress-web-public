# Door Types in AmiExpress

## Three Types of "Doors"

Not all doors are executables! AmiExpress has 3 types:

### 1. TYPE=XIM (Executable Doors)
**Most common** - Real 68k executables that run in emulator

**Example:** GetAnswer (GA)
```
TYPE=XIM
LOCATION=Doors:GetAnswer/GetAnswer
MULTINODE=YES
ACCESS=0
```

**Characteristics:**
- Launches actual Amiga executable
- Uses XIM protocol for I/O
- Can use file I/O (PROGDIR:, Doors:, BBS:)
- Subject to emulator bugs

### 2. TYPE=MCI (Text Display Doors)
**Built-in** - Just displays text with MCI codes

**Example:** CONFLIST
```
TYPE=MCI
LOCATION=Commands/BBSCmd/CONFLIST
ACCESS=1
MCI_TEXT=~\r\n[36mAmiexpress's CONFERENCE LIST[0m\r\n\r\n~CL.\r\n\r\n[32mPress any key...[0m
```

**Characteristics:**
- No executable launched
- Displays MCI_TEXT content
- MCI codes like `~CL.` are expanded
- Cannot crash (no emulator involved)
- Perfect for testing MCI system

### 3. TYPE=REXX (ARexx Scripts)
**Scripts** - Runs ARexx scripts

**Example:** (if any exist in Commands/BBSCmd)
```
TYPE=REXX
LOCATION=Doors:SomeScript.rexx
ACCESS=0
```

**Characteristics:**
- Executes ARexx script
- Not yet implemented in our port
- Would need ARexx interpreter

---

## Testing Implications

### For File I/O Testing
**Only test TYPE=XIM doors** - these use file operations

### For MCI Testing
**Test TYPE=MCI doors** - CONFLIST is perfect for this

### For Emulator Testing
**Only TYPE=XIM are affected** by emulator bugs

---

## Finding Door Types

Check the `.info` file:
```bash
grep "^TYPE=" Commands/BBSCmd/CONFLIST.info
# Output: TYPE=MCI
```

---

## Current Distribution (58 registered doors)

Run this to categorize:
```bash
for f in Commands/BBSCmd/*.info; do
  type=$(grep "^TYPE=" "$f" 2>/dev/null || echo "TYPE=UNKNOWN")
  echo "$(basename $f): $type"
done | sort -t: -k2
```

Expected distribution:
- **TYPE=XIM:** ~50 doors (most)
- **TYPE=MCI:** ~5-10 doors (built-in displays)
- **TYPE=REXX:** ~0-3 doors (scripts)

---

## Why This Matters

**CONFLIST is NOT a good file I/O test** because:
- It's TYPE=MCI (no executable)
- It just displays text
- No file operations happen

**Better file I/O tests:**
- AquaWho (TYPE=XIM, uses Doors: device)
- GetAnswer (TYPE=XIM, uses BBS: device)
- Any TYPE=XIM door that creates data files

---

**Date:** 2025-11-01
**Status:** Door types documented
**Next:** Categorize all 58 doors by type
