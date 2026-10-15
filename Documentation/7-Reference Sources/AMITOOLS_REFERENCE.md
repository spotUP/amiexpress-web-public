# Amitools Reference

**Location**: `Documentation/7-Reference Sources/amitools/`
**Purpose**: Essential tools for Amiga development and 68K door debugging
**Source**: https://github.com/cnvogelg/amitools

---

## What is Amitools?

Amitools is a collection of Python tools for working with AmigaOS binaries and files on modern platforms (macOS, Linux, Windows). Written by Christian Vogelgsang, it provides critical functionality for the AmiExpress-Web project.

**Key Use Case**: **vamos** - The reference Amiga emulator used to validate 68K door behavior

---

## Critical Tools for AmiExpress-Web

### 1. vamos - Amiga Binary Emulator

**Purpose**: Execute 68K Amiga binaries on modern systems (GROUND TRUTH for door behavior)

**Usage**:
```bash
# Run a door binary
vamos doors/Bulls/Bulls

# Run with detailed logging
vamos --log-file=/tmp/vamos.log doors/AquaScan/AquaScan.000

# Run with specific Kickstart version
vamos --kickstart=40.63 doors/RTW/rtw
```

**Why This Matters**:
- **Ground truth for correct behavior**: If a door works in vamos, it should work in our emulator
- **Reference implementation**: Compare MOIRA emulator output with vamos output
- **Debugging**: When our emulator fails, vamos shows what SHOULD happen
- **Validation**: Test doors before integrating into BBS

**From CLAUDE.md**:
> NEVER assume Amiga binaries are buggy - if they work in vamos or on real Amiga, the bug is in OUR emulator, not the binary. Use vamos as ground truth for correct behavior.

**Critical Rule**: Always test doors in vamos first when debugging emulation issues.

---

### 2. vda68k - Motorola 68000 Disassembler

**Purpose**: Disassemble 68K binaries to understand their behavior

**Usage**:
```bash
# Disassemble specific address range
vda68k doors/RTW/rtw -s 0x1156 -e 0x1200

# Full disassembly
vda68k doors/Bulls/Bulls > bulls_disasm.asm
```

**Use Cases**:
- Understand door polling loops
- Identify missing library calls
- Debug infinite loops
- Analyze door startup sequences

---

### 3. hunktool - Amiga Executable Analyzer

**Purpose**: Analyze Amiga hunk files (executable format)

**Usage**:
```bash
# Show hunk structure
hunktool info doors/Bulls/Bulls

# Extract segments
hunktool extract doors/Bulls/Bulls -o bulls_segments/

# Show relocations
hunktool reloc doors/Bulls/Bulls
```

**Use Cases**:
- Understand executable structure
- Debug relocation issues
- Identify code/data segments
- Analyze door memory layout

---

### 4. xdftool - Amiga Disk Image Tool

**Purpose**: Work with ADF (Amiga Disk Format) images

**Usage**:
```bash
# List files in ADF
xdftool list disk.adf

# Extract files from ADF
xdftool extract disk.adf -o output_dir/

# Create ADF from directory
xdftool pack output_dir/ -o disk.adf
```

**Use Cases**:
- Extract door files from old BBS disk images
- Access archived BBS data
- Import classic Amiga BBS files

---

### 5. rdbtool - Rigid Disk Block Tool

**Purpose**: Work with Amiga hard disk images

**Usage**:
```bash
# Show RDB info
rdbtool info harddisk.hdf

# Extract partition
rdbtool extract harddisk.hdf -p DH0 -o partition.img
```

**Use Cases**:
- Import data from Amiga hard disk images
- Recover BBS data from old backups

---

### 6. romtool - Amiga ROM Analyzer

**Purpose**: Analyze Kickstart ROM files

**Usage**:
```bash
# Show ROM info
romtool info kickstart.rom

# Extract ROM modules
romtool modules kickstart.rom
```

**Use Cases**:
- Verify Kickstart ROM integrity
- Understand ROM structure for emulation
- Extract ROM functions for reference

---

### 7. typetool - AmigaOS Type Definitions

**Purpose**: Work with AmigaOS structure definitions

**Usage**:
```bash
# Show structure definitions
typetool show ExecBase
typetool show ProcessStruct
```

**Use Cases**:
- Reference exact structure layouts
- Debug memory layout issues
- Verify offset calculations

---

## Installation

### Prerequisites
- Python 3.7+
- pip3
- C compiler (for native extensions)

### Install from Source (Included)

```bash
cd Documentation/7-Reference\ Sources/amitools
pip3 install .
```

### Install from PyPI

```bash
pip3 install amitools
```

---

## Common Workflows

### Workflow 1: Debug a Door That Fails in MOIRA

1. **Test in vamos first**:
   ```bash
   vamos doors/AquaScan/AquaScan.000
   ```

2. **If it works in vamos**:
   - Bug is in our MOIRA emulator, not the door
   - Compare MOIRA output with vamos behavior
   - Check library call implementations

3. **If it fails in vamos too**:
   - Door may need specific Kickstart version
   - Door may need specific environment setup
   - Check door documentation

### Workflow 2: Understand Door Behavior

1. **Run with logging**:
   ```bash
   vamos --log-file=/tmp/door.log doors/Bulls/Bulls
   ```

2. **Disassemble critical sections**:
   ```bash
   # Find the polling loop
   vda68k doors/Bulls/Bulls -s 0x1000 -e 0x2000 > bulls_loop.asm
   ```

3. **Analyze hunk structure**:
   ```bash
   hunktool info doors/Bulls/Bulls
   ```

### Workflow 3: Extract BBS Data from Old Disk Images

1. **List contents**:
   ```bash
   xdftool list old_bbs.adf
   ```

2. **Extract all files**:
   ```bash
   xdftool extract old_bbs.adf -o recovered_data/
   ```

3. **Import into AmiExpress-Web**:
   ```bash
   # Use import scripts with recovered data
   npx tsx web/backend/src/scripts/import-users.ts recovered_data/Users.DB
   ```

---

## Integration with AmiExpress-Web

### Current Usage

**In Development**:
- vamos used for validating door behavior (see CLAUDE.md)
- vda68k used for disassembly analysis (see door logs)
- hunktool used for executable analysis

**In Testing**:
- Door validation script: `dev/scripts/validate-door-against-vamos.sh`
- Compares MOIRA output vs vamos output
- Automatically flags discrepancies

### Recommended Integration

**Add to Development Workflow**:
```bash
# Before integrating a new door
./dev/scripts/validate-door-against-vamos.sh doors/NewDoor/NewDoor.000

# Validate all doors
find doors -name "*.000" -o -name "*.exe" | while read door; do
  ./dev/scripts/validate-door-against-vamos.sh "$door"
done
```

**Add to CI/CD**:
- Run vamos validation on all doors during PR builds
- Fail PR if door behavior differs from vamos
- Maintain compatibility database

---

## Advanced Usage

### Memory Structure Analysis

```python
# Using vamos Python API
from amitools.vamos.libcore import LibManager

# Load library definitions
lib_mgr = LibManager()
exec_lib = lib_mgr.open_lib("exec.library", 0)

# Get structure offsets
task_offset = exec_lib.get_struct_def("Task")
print(f"tc_Node offset: {task_offset.tc_Node}")
```

### Custom Library Stubs

```python
# Create custom library implementations for testing
from amitools.vamos.lib import LibImpl

class CustomDoorLib(LibImpl):
    def setup(self):
        self.name = "customdoor.library"

    def FunctionA(self, ctx):
        # Custom implementation
        return 0
```

---

## Troubleshooting

### vamos: Command Not Found

```bash
# Ensure amitools is installed
pip3 install amitools

# Or install from source
cd Documentation/7-Reference\ Sources/amitools
pip3 install .
```

### Door Runs in vamos But Not MOIRA

**Common Causes**:
1. Missing library function implementation
2. Incorrect structure offset
3. Wrong Kickstart version emulated
4. Missing environment variables

**Debug Steps**:
1. Compare MOIRA log with vamos log
2. Check library call sequences
3. Verify structure layouts (use typetool)
4. Validate Kickstart ROM version

### Permission Denied

```bash
# Make vamos executable
chmod +x bin/vamos

# Or run via Python
python3 bin/vamos doors/Bulls/Bulls
```

---

## Reference Documentation

**Full Documentation**:
- GitHub: https://github.com/cnvogelg/amitools
- ReadTheDocs: https://amitools.readthedocs.io/
- Local: `Documentation/7-Reference Sources/amitools/docs/`

**Key Docs**:
- vamos: `amitools/docs/vamos.md`
- Structure Defs: `amitools/amitools/vamos/libstructs/`
- Library Stubs: `amitools/amitools/vamos/lib/`

---

## Summary

**Amitools is CRITICAL for AmiExpress-Web development**:

✅ **vamos** = Ground truth for door behavior (ALWAYS test here first)
✅ **vda68k** = Disassemble to understand door code
✅ **hunktool** = Analyze executable structure
✅ **xdftool** = Extract from disk images
✅ **typetool** = Reference structure layouts

**Golden Rule**: If it works in vamos, our emulator should make it work too.

---

**Last Updated**: 2025-12-08
**Version**: amitools bundled version (from repo)
