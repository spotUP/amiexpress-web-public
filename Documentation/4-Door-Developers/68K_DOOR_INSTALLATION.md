# 68K Door Installation Guide

**CRITICAL**: This guide explains how to properly install Amiga 68K doors. Follow these rules to avoid errors.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Directory Structure](#directory-structure)
3. [.info File Requirements](#info-file-requirements)
4. [Common Errors](#common-errors)
5. [Testing Checklist](#testing-checklist)

---

## Quick Start

### Install a 68K Door in 4 Steps

```bash
# 1. Create door directory
mkdir -p Doors/MYDOOR

# 2. Copy executable to door directory
cp mydoor Doors/MYDOOR/mydoor

# 3. Create .info file for the executable
cat > Doors/MYDOOR/mydoor.info << 'EOF'
STACK=8192
EOF

# 4. Create command .info file
cat > Commands/BBSCmd/MYDOOR.info << 'EOF'
BBSCMD=MYDOOR
TYPE=AMI
LOCATION=Doors/MYDOOR/mydoor
DESCRIPTION=My 68K door
ACCESS=0
MULTINODE=NO
PRIORITY=SAME
EOF
```

**Important**: Notice that `LOCATION` points to the EXECUTABLE FILE, not the directory.

---

## Directory Structure

### Correct Structure

```
AmiExpress-Web/
├── Doors/
│   └── MYDOOR/              # Door directory (can be any case)
│       ├── mydoor           # Executable (MUST exist, can be any case)
│       └── mydoor.info      # Optional: door-specific tooltypes
└── Commands/
    └── BBSCmd/
        └── MYDOOR.info      # Command registration (REQUIRED)
```

### Rules

1. **Door Directory**: Case-insensitive, usually uppercase (e.g., `MYDOOR`)
2. **Executable**: Case-insensitive, usually lowercase (e.g., `mydoor`)
3. **Executable Name**: MUST match directory name (case-insensitive)
   - Directory: `DIAGNOSTIC` → Executable: `diagnostic` ✅
   - Directory: `Bulls` → Executable: `Bulls` ✅
   - Directory: `RTW` → Executable: `rtw` ✅

4. **Command .info**: Case-insensitive, usually uppercase matches BBSCMD

---

## .info File Requirements

### Command .info File (REQUIRED)

**Location**: `Commands/BBSCmd/YOURCOMMAND.info`

**Template**:
```
BBSCMD=YOURCOMMAND
TYPE=AMI
LOCATION=Doors/DOORDIR/executable
DESCRIPTION=Brief description of your door
ACCESS=0
MULTINODE=NO
PRIORITY=SAME
```

**Field Descriptions**:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `BBSCMD` | YES | Command name users type | `DIAGNOSTIC` |
| `TYPE` | YES | Door type (AMI for 68K) | `AMI` |
| `LOCATION` | YES | **Path to EXECUTABLE FILE** | `Doors/DIAGNOSTIC/diagnostic` |
| `DESCRIPTION` | YES | What the door does | `Comprehensive test suite` |
| `ACCESS` | YES | Minimum security level (0-255) | `0` or `250` |
| `MULTINODE` | YES | Allow multiple nodes? | `YES` or `NO` |
| `PRIORITY` | YES | CPU priority | `SAME`, `HIGHER`, `LOWER` |

### Door .info File (OPTIONAL)

**Location**: `Doors/DOORDIR/executable.info` (same name as executable)

**Template**:
```
STACK=8192
DOORUSE=5
LOOP_LIMIT=10000000
```

**Common Tooltypes**:

| Tooltype | Description | Default | Example |
|----------|-------------|---------|---------|
| `STACK` | Stack size in bytes | 8192 | `16384` |
| `DOORUSE` | Times door can run | Unlimited | `5` |
| `LOOP_LIMIT` | Max loop iterations | 1000000 | `10000000` |

---

## Common Errors

### Error: "EISDIR: illegal operation on a directory, read"

**Cause**: `LOCATION` points to a directory instead of the executable file.

**WRONG**:
```
BBSCMD=DIAGNOSTIC
TYPE=AMI
LOCATION=Doors/DIAGNOSTIC          ← Points to directory
```

**CORRECT**:
```
BBSCMD=DIAGNOSTIC
TYPE=AMI
LOCATION=Doors/DIAGNOSTIC/diagnostic  ← Points to executable file
```

**Fix**: Update the command .info file to include the executable filename.

**Note**: The backend NOW handles this automatically (as of Dec 24, 2024), but it's still best practice to specify the full path.

---

### Error: "Door executable not found"

**Cause**: Executable doesn't exist or name doesn't match directory.

**Check**:
```bash
# 1. Verify door directory exists
ls -la Doors/

# 2. Verify executable exists
ls -la Doors/MYDOOR/

# Expected output: executable file with same name as directory
# Doors/MYDOOR/mydoor (lowercase) ✅
# Doors/MYDOOR/MYDOOR (uppercase) ✅
# Doors/MYDOOR/different-name ❌ WRONG
```

**Fix**:
```bash
# If executable has wrong name
cd Doors/MYDOOR
mv wrong-name mydoor

# Or if executable is missing
cp /path/to/executable Doors/MYDOOR/mydoor
```

---

### Error: "Door fails to load or crashes immediately"

**Common Causes**:

1. **Insufficient stack** → Increase `STACK` in door .info file
2. **Missing dependencies** → Check door documentation
3. **Corrupted executable** → Re-download or rebuild
4. **Wrong architecture** → Must be Amiga 68K binary (not x86, ARM, etc.)

**Verify Executable Format**:
```bash
# Check file type
file Doors/MYDOOR/mydoor

# Expected output for Amiga binary:
# "AmigaOS loadseg()ble executable/binary"
# OR starts with HUNK headers (0x000003F3)

# NOT expected:
# "ELF 64-bit" (Linux x86_64)
# "Mach-O" (macOS)
```

**Fix**:
```bash
# If wrong format, rebuild for Amiga 68K
# See sdk/68k/README.md for build instructions
```

---

## Testing Checklist

### 1. Verify Files Exist

```bash
# Check door directory
ls -la Doors/YOURDOOR/

# Expected: At least one executable file
# YOURDOOR/yourdoor or YOURDOOR/YOURDOOR
```

### 2. Verify Command .info File

```bash
# Check command registration
cat Commands/BBSCmd/YOURCOMMAND.info

# MUST have:
# - BBSCMD=YOURCOMMAND
# - TYPE=AMI
# - LOCATION=Doors/DOORDIR/executable (FULL PATH TO EXECUTABLE)
# - ACCESS=<number>
# - MULTINODE=YES or NO
```

### 3. Test in BBS

```bash
# Start servers
./dev/scripts/start-servers.sh

# Connect to BBS
# Open browser: http://localhost:3001/
# Login as sysop (security level 255)
# Type: YOURCOMMAND
```

### 4. Check Logs

**If door fails to start**:
```bash
# Check backend logs
tail -100 logs/backend.log | grep -i "yourdoor\|yourcommand"

# Check door-specific logs
ls -t logs/door-68k-YOURCOMMAND* | head -1 | xargs tail -100
```

**Common Log Messages**:

| Message | Meaning | Fix |
|---------|---------|-----|
| "Door path is a directory" | Backend found directory, looking for executable | Normal (auto-fixed) |
| "Found executable: ..." | Success | OK |
| "No executable found in directory" | Executable missing or wrong name | Rename/add executable |
| "Door executable not found" | LOCATION path wrong | Fix command .info |
| "File read failed: EISDIR" | Old backend version (pre-fix) | Update backend code |

---

## Examples

### Example 1: Simple Door

**Directory**:
```
Doors/
└── Hello/
    └── hello     (executable)
```

**Command .info** (`Commands/BBSCmd/HELLO.info`):
```
BBSCMD=HELLO
TYPE=AMI
LOCATION=Doors/Hello/hello
DESCRIPTION=Simple hello world door
ACCESS=0
MULTINODE=YES
PRIORITY=SAME
```

### Example 2: Door with Tooltypes

**Directory**:
```
Doors/
└── DIAGNOSTIC/
    ├── diagnostic       (executable)
    └── diagnostic.info  (optional tooltypes)
```

**Door .info** (`Doors/DIAGNOSTIC/diagnostic.info`):
```
STACK=16384
LOOP_LIMIT=10000000
```

**Command .info** (`Commands/BBSCmd/DIAGNOSTIC.info`):
```
BBSCMD=DIAGNOSTIC
TYPE=AMI
LOCATION=Doors/DIAGNOSTIC/diagnostic
DESCRIPTION=Comprehensive 68K door emulation test suite
ACCESS=250
MULTINODE=NO
PRIORITY=SAME
```

### Example 3: Test Suite Doors

**From sdk/68k/**:

| Door | Executable | Command | Description |
|------|-----------|---------|-------------|
| diagnostic | `Doors/DIAGNOSTIC/diagnostic` | `DIAGNOSTIC` | Full API test (3,484 lines) |
| comprehensive-test | `Doors/COMPTEST/comprehensive-test` | `COMPTEST` | Basic API tests |
| advanced-test | `Doors/ADVTEST/advanced-test` | `ADVTEST` | Advanced features |
| file-ops-test | `Doors/FILETEST/file-ops-test` | `FILETEST` | File operations |
| interactive-demo | `Doors/INTDEMO/interactive-demo` | `INTDEMO` | Interactive demo |

---

## Building 68K Doors

### Using VBCC (Recommended)

```bash
cd sdk/68k

# Build single door
make door NAME=mydoor

# Install to Doors/ directory
make install NAME=mydoor

# Build all test doors
make all
```

**See**: `sdk/68k/README.md` for full build instructions.

---

## Quick Reference

### Template Command .info

```
BBSCMD=YOURCOMMAND
TYPE=AMI
LOCATION=Doors/YOURDIR/yourexec
DESCRIPTION=Your description here
ACCESS=0
MULTINODE=NO
PRIORITY=SAME
```

### Common ACCESS Levels

| Level | User Type |
|-------|-----------|
| 0 | Guest/New User |
| 10 | Validated User |
| 100 | Trusted User |
| 200 | Co-Sysop |
| 250+ | Sysop Only |

### Common Door Types

| TYPE | Description |
|------|-------------|
| `AMI` | Generic Amiga binary |
| `XIM` | eXpress Internal Module |
| `AIM` | Amiga Internal Module |
| `SIM` | Standard Internal Module |
| `TIM` | Text Internal Module |
| `IIM` | Interactive Internal Module |

**Note**: All types execute via 68K emulation. Use `AMI` if unsure.

---

## Prevention Rules

### NEVER

1. ❌ Point `LOCATION` to a directory (must be full path to executable)
2. ❌ Use executable name different from directory name
3. ❌ Forget to create command .info file
4. ❌ Set ACCESS too high (users won't see door)
5. ❌ Use wrong TYPE (stick with AMI if unsure)

### ALWAYS

1. ✅ Point `LOCATION` to the executable file (`Doors/DIR/exec`)
2. ✅ Name executable same as directory (case-insensitive OK)
3. ✅ Create `Commands/BBSCmd/COMMAND.info` file
4. ✅ Set ACCESS appropriately (0 for all users, 250+ for sysop only)
5. ✅ Use TYPE=AMI for standard 68K binaries
6. ✅ Test door after installation
7. ✅ Check logs if door fails

---

## Troubleshooting

### Door Won't Start

```bash
# 1. Check executable exists
ls -la Doors/YOURDIR/

# 2. Check command .info
cat Commands/BBSCmd/YOURCOMMAND.info

# 3. Check LOCATION points to file, not directory
# Should be: Doors/YOURDIR/executable
# NOT: Doors/YOURDIR

# 4. Check logs
tail -100 logs/backend.log | grep -i yourcommand
```

### Door Crashes

```bash
# Check door-specific log
ls -t logs/door-68k-YOURCOMMAND* | head -1 | xargs less

# Common issues:
# - Stack overflow → Increase STACK in door .info
# - Infinite loop → Increase LOOP_LIMIT
# - Missing files → Check door documentation
```

### Door Not Found

```bash
# Verify command registered
ls Commands/BBSCmd/ | grep -i yourcommand

# Verify ACCESS level allows your user
# If ACCESS=250, you need sysop privileges
```

---

## Getting Help

If you're stuck:

1. Read this guide again
2. Check error message in logs
3. Verify all files exist
4. Verify LOCATION points to executable file (not directory)
5. Test with a known working door (e.g., DIAGNOSTIC)
6. Compare your .info files to working examples

**Most errors are simple**:
- LOCATION pointing to directory instead of file
- Executable missing or wrong name
- Command .info file missing
- ACCESS level too high

**Fix methodically**:
- Verify files exist
- Check .info file syntax
- Update LOCATION to point to executable
- Test
- Check logs
