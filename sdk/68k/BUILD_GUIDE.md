# 68K C Door Development Guide

## Quick Start

Build your first 68K Amiga door in C:

```bash
cd ~/Code/amiexpress-web/sdk/68k

# Build a door
make door NAME=hello-vbcc

# Install to BBS
make install NAME=hello-vbcc
```

## Cross-Compiler Installation

### Required Tools

**1. vbcc** (Recommended Amiga C Compiler)

vbcc is the **native Amiga cross-compiler** that produces correct, working Amiga HUNK binaries.

```bash
# Install vbcc via Homebrew
brew tap tditlu/amiga
brew install vbcc

# Verify installation
vc -version
# Should show: vbcc configuration

# Set environment variable
export VBCC=/opt/homebrew/opt/vbcc
```

**Installation Location**: `/opt/homebrew/opt/vbcc/`

**Why vbcc?**
- Produces native Amiga HUNK format directly (no conversion)
- Correct entry points (works with vamos and real Amiga)
- Designed specifically for AmigaOS
- No elf2hunk workarounds needed

**2. vasmm68k_mot** (M68k Assembler)

Already included with vbcc installation. Used for assembly wrappers.

```bash
# Verify installation
vasmm68k_mot -version
# Should show: vasm 2.0d
```

**3. AmigaOS NDK 3.2R4 Headers**

**Already included** in `sdk/68k/ndk-includes/` - no separate installation needed.

Contains:
- `exec/` - Exec library headers
- `dos/` - DOS library headers
- `clib/` - C library prototypes
- `pragmas/` - vbcc pragma files for inline functions
- `inline/` - Inline function definitions

## Building 68K Doors

### Basic C Door

Create a minimal door:

```c
// doors/mydoor/mydoor.c
#include <clib/exec_protos.h>
#include <exec/types.h>

extern struct Library *SysBase;
struct Library *AEDoorBase = NULL;

extern void WriteStr(char *text, struct Library *base);

int main(int argc, char **argv) {
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    if (!AEDoorBase) {
        return 20;  /* ERROR */
    }

    WriteStr("Hello from my 68K door!\r\n", AEDoorBase);

    CloseLibrary(AEDoorBase);
    return 0;  /* SUCCESS */
}
```

Create assembly wrapper for AEDoor.library calls:

```asm
; doors/mydoor/writestr.asm
        section code,code
        xdef _WriteStr

_WriteStr:
        move.l  4(sp),a0        ; Get text parameter
        move.l  8(sp),a6        ; Get AEDoorBase parameter
        jsr     -84(a6)         ; Call WriteStr (LVO -84)
        rts
        end
```

Build the door:

```bash
# Assemble the wrapper
vasmm68k_mot -Fhunk -nowarn=62 doors/mydoor/writestr.asm -o doors/mydoor/writestr.o

# Compile C code
export VBCC=/opt/homebrew/opt/vbcc
vc +aos68k -c -O2 -Indk-includes doors/mydoor/mydoor.c -o doors/mydoor/mydoor.o

# Link
vc +aos68k -lamiga doors/mydoor/mydoor.o doors/mydoor/writestr.o -o doors/mydoor/mydoor
```

Or use the Makefile (recommended):

```bash
# Just build
make door NAME=mydoor

# Build and install to BBS
make install NAME=mydoor
```

### Using the Glue Layer

The SDK includes a glue layer (`src/glue.c`) that provides:
- String functions (strlen, strcpy, strcmp, memset, memcpy)
- Stub implementations of common AEDoor API functions

Include the glue layer automatically with `make door NAME=...`

### AEDoor.library Function Offsets

Common library call offsets (LVO = Library Vector Offset):

```c
#define LVO_WriteStr    -84   /* Output text to user */
#define LVO_ReadStr     -90   /* Read input from user */
#define LVO_GetKey      -96   /* Read single key */
#define LVO_Prompt      -102  /* Display prompt */
```

Create inline wrappers in assembly for each function you need.

## vbcc Compiler Flags

### Optimization Flags

```bash
-O2           # Optimization level 2 (recommended)
-speed        # Optimize for speed over size
-size         # Optimize for size over speed (alternative)
```

### CPU Flags

```bash
-cpu=68000    # Target 68000 CPU (most compatible)
-cpu=68020    # Target 68020 CPU
-cpu=68030    # Target 68030 CPU
```

### Configuration

```bash
+aos68k       # Use AmigaOS 68K configuration
-c99          # Enable C99 features
-nostdlib     # Don't link standard library (we use custom startup)
-lamiga       # Link with amiga.lib (for library stubs)
```

### Include Paths

```bash
-Indk-includes              # NDK 3.2R4 headers
-Iincludes                  # SDK includes
```

## Testing with vamos

vamos is a valuable tool for testing Amiga binaries before deploying to the BBS:

```bash
# Install vamos
pip3 install amitools

# Test a door
vamos doors/mydoor/mydoor

# Exit codes:
# 0  = Success
# 20 = ERROR (e.g., library not found - expected with vamos)
```

**Note:** vamos doesn't include AEDoor.library, so doors will fail to open it (exit 20). This is expected - the important part is that the binary loads and executes without crashes.

## Common Issues

### "No config file!" error

vbcc needs the VBCC environment variable:

```bash
export VBCC=/opt/homebrew/opt/vbcc
```

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
echo 'export VBCC=/opt/homebrew/opt/vbcc' >> ~/.zshrc
```

### "File not found" errors with headers

Make sure you're using the correct include path:

```bash
-Indk-includes    # Correct - relative to sdk/68k/
```

### Linking errors

Make sure to link with amiga.lib for library stubs:

```bash
vc +aos68k -lamiga your.o -o your
```

### Library call crashes

Always use assembly wrappers for library calls - vbcc's inline assembly syntax is limited. See the writestr.asm example above.

## Directory Structure

```
sdk/68k/
├── Makefile              # vbcc build system
├── BUILD_GUIDE.md        # This file
├── ndk-includes/         # AmigaOS NDK 3.2R4 headers
├── includes/             # SDK-specific headers
├── src/
│   └── glue.c           # Glue layer with string functions
├── doors/
│   ├── hello-vbcc/      # Example minimal door
│   └── hello-output/    # Example with AEDoor.library
└── templates/           # Door templates
```

## Next Steps

1. **Read the examples**: Check `doors/hello-vbcc/` and `doors/hello-output/`
2. **Test in BBS**: Run your door with the HELLOOUT command
3. **Check logs**: Look at `logs/door-68k-*.log` for execution traces
4. **Implement AEDoor API**: Add more library calls as needed

## Reference Documentation

- **vbcc Manual**: http://sun.hasenbraten.de/vbcc/docs/vbcc.pdf
- **AmigaOS NDK 3.2**: Headers in `ndk-includes/`
- **AEDoor.library**: See `includes/amiexpress.h` for API definitions
- **vasm Manual**: http://sun.hasenbraten.de/vasm/

## Compiler Choice

vbcc is the only supported compiler for 68K door development. It produces native Amiga HUNK binaries directly without any conversion steps.
