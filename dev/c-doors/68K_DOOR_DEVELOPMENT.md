# Creating 68K Amiga Doors for AmiExpress BBS

## Overview

This guide documents how to create authentic 68K Amiga executables that run on AmiExpress BBS using C and assembly language. These doors run natively on the Amiga emulator and provide maximum performance and compatibility.

## Prerequisites

### 1. vbcc Cross-Compiler

```bash
# Install vbcc via Homebrew
brew tap tditlu/amiga
brew install vbcc

# Set environment variable (add to ~/.zshrc)
export VBCC=/opt/homebrew/opt/vbcc

# Verify installation
vc -version
# Should show: vbcc configuration
```

### 2. vasm Assembler (included with vbcc)

```bash
# Verify installation
vasmm68k_mot -version
# Should show: vasm 2.0d
```

### 3. Amiga NDK Headers

The Amiga Native Development Kit (NDK) provides essential headers for Amiga development.

**Included Location:** `sdk/68k/ndk-includes/`
- `exec/` - Exec library headers
- `dos/` - DOS library headers
- `clib/` - C library prototypes
- `pragmas/` - vbcc pragma files

**Reference Location:** `Documentation/7-Reference Sources/NDK3.2R4/`
- `Include_H/` - C headers (exec.h, dos.h, etc.)
- `Include_I/` - Assembly includes (exec/types.i, etc.)

## Door Structure

### 1. Basic C Door Template

```c
// mydoor.c
#include <clib/exec_protos.h>
#include <exec/types.h>

extern struct Library *SysBase;
struct Library *AEDoorBase = NULL;

// Assembly wrapper declarations
extern void WriteStr(char *text, struct Library *base);

int main(int argc, char **argv) {
    // Open AEDoor.library
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    if (!AEDoorBase) {
        return 20;  // ERROR - library not found
    }

    // Your door logic here
    WriteStr("Hello from my 68K door!\r\n", AEDoorBase);

    // Clean up
    CloseLibrary(AEDoorBase);
    return 0;  // SUCCESS
}
```

### 2. Assembly Wrapper for Library Calls

```asm
; writestr.asm - Assembly wrapper for AEDoor.library WriteStr
        section code,code
        xdef _WriteStr

_WriteStr:
        move.l  4(sp),a0        ; Get text parameter
        move.l  8(sp),a6        ; Get AEDoorBase parameter
        jsr     -84(a6)         ; Call WriteStr (LVO -84)
        rts
        end
```

### 3. Pure Assembly Door

```asm
;==============================================================================
; Amiga Door Template - 68K Assembly
;==============================================================================

        include "exec/types.i"
        include "exec/libraries.i"
        include "exec/execbase.i"

        section code,code

;------------------------------------------------------------------------------
; Main entry point
;------------------------------------------------------------------------------
start:
        ; Save registers (Amiga calling convention)
        movem.l d2-d7/a2-a6,-(sp)

        ; Get ExecBase
        move.l  4.w,a6

        ; Open AEDoor.library
        lea     aedoor_name(pc),a1
        moveq   #0,d0
        jsr     _LVOOpenLibrary(a6)
        move.l  d0,aedoor_base
        beq.w   exit

        ; Your door logic here
        bsr     do_door_logic

        ; Close library
        move.l  4.w,a6
        move.l  aedoor_base(pc),a1
        jsr     _LVOCloseLibrary(a6)

exit:
        ; Restore registers
        movem.l (sp)+,d2-d7/a2-a6

        ; Exit with success
        moveq   #0,d0
        rts

;------------------------------------------------------------------------------
; Door logic functions
;------------------------------------------------------------------------------

do_door_logic:
        ; Call AEDoor.library WriteStr
        move.l  aedoor_base(pc),a6
        lea     welcome_msg(pc),a0
        jsr     -84(a6)         ; LVO_WriteStr = -84
        rts

;------------------------------------------------------------------------------
; Data section
;------------------------------------------------------------------------------

        section data,data

aedoor_name     dc.b    "AEDoor.library",0
welcome_msg     dc.b    "Welcome to my 68K Amiga Door!",13,10,0

aedoor_base     dc.l    0

        end
```

### 4. Key Components

**Sections:**
- `code,code` - Executable code
- `data,data` - Initialized data
- `bss,bss` - Uninitialized data

**Library Access:**
- `move.l 4.w,a6` - Get ExecBase
- `_LVOOpenLibrary` (-552) - Open libraries
- `_LVOCloseLibrary` (-414) - Close libraries

**Register Conventions:**
- `d0-d1/a0-a1` - Scratch registers (can be modified)
- `d2-d7/a2-a6` - Must be preserved
- `a7` - Stack pointer

## Building Doors

### C Door Build Process

```bash
# 1. Assemble wrapper
vasmm68k_mot -Fhunk -nowarn=62 writestr.asm -o writestr.o

# 2. Compile C code
export VBCC=/opt/homebrew/opt/vbcc
vc +aos68k -c -O2 -Indk-includes mydoor.c -o mydoor.o

# 3. Link together
vc +aos68k -lamiga mydoor.o writestr.o -o mydoor
```

### Assembly Door Build Process

```bash
# Single step - vasm outputs HUNK directly
vasmm68k_mot -Fhunk -nosym -Ipath/to/ndk/Include_I mydoor.asm -o mydoor
```

### Using the Makefile

```bash
# Build specific door
make door NAME=mydoor

# Build and install
make install NAME=mydoor

# Clean build artifacts
make clean
```

## BBS Integration

### 1. Install Door

```bash
# Copy to BBS Doors directory
cp mydoor Doors/MYDOOR/
```

### 2. Create Door .info File

Create `Doors/MYDOOR/mydoor.info`:
```
TYPE=XIM
LOCATION=doors/MYDOOR/mydoor
ACCESS=0
TIMELIMIT=60
```

### 3. Create Command .info File

Create `Commands/BBSCmd/MYDOOR.info`:
```
TYPE=XIM
LOCATION=doors/MYDOOR/mydoor
ACCESS=0
TIMELIMIT=60
```

## Testing

### Verify Executable Format

```bash
file mydoor
# Should show: AmigaOS loadseg()ble executable/binary
```

### Test with vamos

```bash
pip3 install amitools
vamos mydoor
# Exit code 20 = library not found (expected - vamos doesn't have AEDoor.library)
# Exit code 0 = success
```

### Test in BBS

```bash
# Start BBS
./dev/scripts/start-servers.sh

# Connect and run: MYDOOR
```

### Debug Output

Check door execution logs in `logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log`

## Advanced Features

### XIM Protocol Communication

For full door functionality, implement XIM message handling:

```asm
; Wait for BBS messages
wait_message:
        ; WaitPort implementation
        ; GetMsg implementation
        ; Parse XIM commands
        rts
```

### Memory Management

```asm
; Allocate memory
        move.l  4.w,a6          ; ExecBase
        move.l  #1024,d0        ; Size
        move.l  #MEMF_PUBLIC,d1 ; Flags
        jsr     _LVOAllocMem(a6)

; Free memory
        move.l  d0,a1           ; Address
        move.l  #1024,d0        ; Size
        jsr     _LVOFreeMem(a6)
```

### File I/O

```asm
; Open file
        move.l  dosbase,a6
        move.l  #MODE_OLDFILE,d2
        lea     filename(pc),a0
        jsr     _LVOOpen(a6)

; Read/Write operations
        ; Use _LVORead/_LVOWrite
```

## Troubleshooting

### Common Issues

**1. "No config file!" error**
- Set VBCC environment variable: `export VBCC=/opt/homebrew/opt/vbcc`

**2. "could not open include file"**
- Wrong NDK path in compiler command
- Check -I flag points to correct include directory

**3. "HunkLoader error"**
- Executable not in Amiga hunk format
- Wrong compiler flags

**4. "Library not found"**
- AEDoor.library not opened correctly
- Wrong library name

**5. Door doesn't start**
- Check entry point
- Missing stack setup

### Debug Tips

1. **Verify executable format:**
   ```bash
   file door_executable
   # Should be: AmigaOS loadseg()ble executable/binary
   ```

2. **Check door loading logs:**
   ```bash
   tail -f logs/backend.log | grep -i door
   ```

3. **Test with vamos first:**
   ```bash
   vamos mydoor
   ```

## Complete Example

See `sdk/68k/doors/hello-output/` for a complete working example that demonstrates:
- Proper Amiga executable structure
- Library opening/closing
- AEDoor.library output functions
- Clean shutdown
- BBS integration

This 68K C/assembly approach provides the most authentic Amiga door experience with maximum performance and compatibility.
