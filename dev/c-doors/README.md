# AmiExpress C/Assembly Door SDK

**Create authentic 68K Amiga door binaries using vbcc and assembly development tools**

## Overview

The C/Assembly Door SDK allows you to write BBS doors in **C or 68000 assembly** that compile to authentic **Motorola 68000 machine code**, identical to doors written for classic Amiga computers in the 1990s. These doors run in the MOIRA 68K emulator, providing 100% compatibility with the original AmiExpress BBS system.

**Supported Languages**:
- **C**: Cross-compiled with vbcc -> Native Amiga HUNK
- **Assembly**: Assembled with vasm -> HUNK (direct output)
- **C + Assembly**: Mixed C/ASM for library calls and optimizations

## Two SDK Approaches

AmiExpress-Web offers two distinct door development approaches:

### 1. TypeScript SDK (sdk/)
- **Language**: TypeScript/JavaScript
- **Execution**: Native Node.js (no emulation)
- **Performance**: Fast, modern
- **Best for**: New doors, complex UI, modern libraries
- **Location**: `/sdk/`

### 2. C SDK (dev/c-doors/)
- **Language**: C (cross-compiled to 68K with vbcc)
- **Execution**: MOIRA 68K emulator
- **Performance**: Authentic Amiga experience
- **Best for**: Porting classic doors, learning Amiga programming
- **Location**: `/dev/c-doors/`

Both approaches produce doors that work identically from the user's perspective!

## Quick Start

### Prerequisites

1. **vbcc cross-compiler**
   ```bash
   brew tap tditlu/amiga
   brew install vbcc
   export VBCC=/opt/homebrew/opt/vbcc
   ```

2. **vasm assembler** (included with vbcc)
   ```bash
   vasmm68k_mot -version
   # Should show: vasm 2.0d
   ```

### Create Your First Door

1. **Create door directory**:
   ```bash
   mkdir dev/c-doors/doors/mydoor
   cd dev/c-doors/doors/mydoor
   ```

2. **Write your door** (`mydoor.c`):
   ```c
   #include <clib/exec_protos.h>
   #include <exec/types.h>

   extern struct Library *SysBase;
   struct Library *AEDoorBase = NULL;

   extern void WriteStr(char *text, struct Library *base);

   int main(int argc, char **argv) {
       AEDoorBase = OpenLibrary("AEDoor.library", 0);
       if (!AEDoorBase) return 20;

       WriteStr("Hello from my C door!\r\n", AEDoorBase);

       CloseLibrary(AEDoorBase);
       return 0;
   }
   ```

3. **Create assembly wrapper** (`writestr.asm`):
   ```asm
           section code,code
           xdef _WriteStr

   _WriteStr:
           move.l  4(sp),a0        ; Get text parameter
           move.l  8(sp),a6        ; Get AEDoorBase parameter
           jsr     -84(a6)         ; Call WriteStr (LVO -84)
           rts
           end
   ```

4. **Build to 68K binary**:
   ```bash
   # Assemble wrapper
   vasmm68k_mot -Fhunk -nowarn=62 writestr.asm -o writestr.o

   # Compile C code
   export VBCC=/opt/homebrew/opt/vbcc
   vc +aos68k -c -O2 -I../../ndk-includes mydoor.c -o mydoor.o

   # Link
   vc +aos68k -lamiga mydoor.o writestr.o -o mydoor
   ```

5. **Install to BBS**:
   ```bash
   cp mydoor ../../Doors/MYDOOR/
   ```

6. **Register command** (create `Doors/MYDOOR/mydoor.info`):
   ```
   TYPE=XIM
   LOCATION=doors/MYDOOR/mydoor
   ACCESS=0
   TIMELIMIT=60
   ```

   And `Commands/BBSCmd/MYDOOR.info`:
   ```
   TYPE=XIM
   LOCATION=doors/MYDOOR/mydoor
   ACCESS=0
   TIMELIMIT=60
   ```

7. **Test in BBS**: Type `MYDOOR` at the BBS prompt!

### Create Your First Assembly Door

1. **Create door directory**:
   ```bash
   mkdir dev/c-doors/doors/mydoor-asm
   cd dev/c-doors/doors/mydoor-asm
   ```

2. **Write your door** (`mydoor-asm.asm`):
   ```asm
   ; AmigaOS Constants
   ABSEXECBASE     EQU     4
   LVO_OpenLibrary EQU     -552
   LVO_CloseLibrary EQU    -414

   ; AEDoor.library LVOs
   LVO_Register    EQU     -132
   LVO_WriteStr    EQU     -84
   LVO_ShutDown    EQU     -138

           SECTION code,CODE

   start:
           movem.l d0-d7/a0-a6,-(sp)

           ; Get ExecBase and open AEDoor.library
           move.l  ABSEXECBASE,a6
           lea     aedoor_name(pc),a1
           moveq   #0,d0
           jsr     LVO_OpenLibrary(a6)
           move.l  d0,aedoor_base
           beq.s   .exit

           ; Register with BBS
           move.l  aedoor_base(pc),a6
           moveq   #1,d0
           jsr     LVO_Register(a6)

           ; Display message
           move.l  aedoor_base(pc),a6
           lea     hello_msg(pc),a0
           jsr     LVO_WriteStr(a6)

           ; Shutdown
           move.l  aedoor_base(pc),a6
           jsr     LVO_ShutDown(a6)

           ; Close library
           move.l  ABSEXECBASE,a6
           move.l  aedoor_base(pc),a1
           jsr     LVO_CloseLibrary(a6)

   .exit:
           movem.l (sp)+,d0-d7/a0-a6
           moveq   #0,d0
           rts

           SECTION data,DATA

   aedoor_base:
           dc.l    0

   aedoor_name:
           dc.b    'AEDoor.library',0
           EVEN

   hello_msg:
           dc.b    'Hello from assembly!',13,10,0
           EVEN

           END
   ```

3. **Build to 68K binary**:
   ```bash
   vasmm68k_mot -Fhunk -nosym mydoor-asm.asm -o mydoor-asm
   ```

4. **Register and test**: Same as C door (create .info files and test in BBS)

**Assembly Door Advantages**:
- Direct HUNK output (no linking needed)
- Smallest possible binaries (200-500 bytes typical)
- Full control over register usage and calling conventions
- Educational value for learning Amiga programming

## Architecture

### Compilation Flow

**C Doors (vbcc)**:
```
C Source -> vbcc -> Object File -> vlink -> Amiga HUNK -> BBS Door
   |                   |                        |
mydoor.c           mydoor.o                 mydoor (68K)
```

**Assembly Doors**:
```
Assembly Source -> vasm -> Amiga HUNK -> BBS Door
       |                       |
mydoor.asm                 mydoor (68K)
```

### Execution Flow

```
BBS User Types "MYDOOR"
  -> Door Handler loads mydoor (68K binary)
  -> MOIRA emulator executes 68K machine code
  -> Door calls AEDoor.library functions
  -> AEDoor.library uses PutMsg/GetMsg for XIM protocol
  -> ExecLibrary bridges messages to BBS backend
  -> Output appears on user's terminal
```

## API Reference

### Essential Functions

```c
// Lifecycle
void Register(int node);        // Initialize door for node N
void ShutDown(void);            // Clean shutdown

// Output
void sendmessage(char *text, int newline);  // Send text to user
void mciputstr(char *mci, int nl);          // Send MCI codes

// Input
int getkey(void);                          // Get single keypress
void prompt(char *prompt, char *result, int maxlen);  // Get user input

// User Data
int getlevel(void);              // Get user's security level
char *getname(void);             // Get user's name
char *getlocation(void);         // Get user's location

// BBS Info
int getnode(void);               // Get current node number
char *getbbsname(void);          // Get BBS name
```

See `includes/amiexpress.h` for the complete API (60+ functions).

## Directory Structure

```
dev/c-doors/
├── Makefile               # vbcc build system
├── README.md              # This file
├── includes/              # Header files
│   ├── amiexpress.h       # AmiExpress API declarations
│   └── amiga/             # Amiga OS headers
├── src/                   # Glue code
│   └── glue-vbcc.c        # vbcc-compatible glue layer
├── doors/                 # Your door source code
│   └── apitest/           # API test door
└── templates/             # Door templates
```

## Build Targets

```bash
# Build specific door
make door NAME=mydoor

# Build all test doors
make test-doors

# Install door to BBS
make install-door NAME=mydoor

# Clean build artifacts
make clean

# Verify toolchain
make check-tools

# Show help
make help
```

## Testing

### Verify 68K Binary

```bash
# Check binary type
file doors/mydoor/mydoor
# Should output: AmigaOS loadseg()ble executable/binary

# Test with vamos
pip3 install amitools
vamos doors/mydoor/mydoor
# Exit code 20 = library not found (expected)
# Exit code 0 = success
```

### Test in BBS

1. Start BBS: `./dev/scripts/start-servers.sh`
2. Connect via browser: `http://localhost:3001`
3. Type door command: `MYDOOR`
4. Check logs: `logs/door-68k-MYDOOR-*.log`

## FAQ

### Q: Why C instead of TypeScript?

C doors provide:
- **Authenticity**: Run real 68K code like classic Amiga
- **Learning**: Understand Amiga programming
- **Porting**: Adapt classic BBS doors

TypeScript doors are easier and faster for new development.

### Q: Can I mix C and TypeScript doors?

Yes! They coexist perfectly. Users can't tell the difference.

### Q: How do I debug C doors?

Check door execution logs in `logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log`

### Q: What's the performance difference?

68K emulation adds ~10-20% overhead vs native TypeScript, but for BBS doors (mostly I/O bound), this is negligible.

## Resources

- **Amiga NDK**: `Documentation/7-Reference Sources/NDK3.2R4/`
- **AmiExpress Sources**: `AmiExpress-Sources/express.e`
- **MOIRA Emulator**: `web/backend/src/amiga-emulation/cpu/`
- **vbcc Manual**: http://sun.hasenbraten.de/vbcc/docs/vbcc.pdf
- **vasm Manual**: http://sun.hasenbraten.de/vasm/

## Contributing

When adding C SDK features:
1. Follow the real AEDoor.library approach (NO stubs!)
2. Test with real 68K binaries
3. Update this README
4. Add examples

## License

Same as main project - see LICENSE file.

---

**Happy Amiga Coding!**
