# SDK 2.0 - 68K Binary Door Development

**Part of the AmiExpress BBS Door SDK 2.0**

This is the **68K cross-compilation** component of SDK 2.0. It allows you to write BBS doors in **C or 68000 assembly** that compile to authentic **Motorola 68000 machine code**, identical to doors written for classic Amiga computers in the 1990s. These binaries run in the MOIRA 68K emulator with 100% compatibility with the original AmiExpress BBS system.

**Location**: `/sdk/68k/` (part of unified SDK 2.0)

## Supported Languages

- **C**: Cross-compiled with vbcc → Native Amiga HUNK ✅
- **Assembly**: Assembled with vasm → HUNK (direct output) ✅
- **C + Assembly**: Mixed C/ASM for library calls and optimizations ✅

## When to Use 68K vs TypeScript

SDK 2.0 offers two development approaches:

### TypeScript SDK (`/sdk/core/`)
- **Best for**: New doors, modern features, rapid development
- **Execution**: Native Node.js (fast, no emulation overhead)
- **Libraries**: Full npm ecosystem available
- **Development**: Hot reload, modern tooling

### 68K SDK (`/sdk/68k/` - this directory)
- **Best for**: Porting classic doors, authentic Amiga experience, learning retro programming
- **Execution**: MOIRA 68K emulator (100% Amiga-compatible)
- **Performance**: 10-20% overhead from emulation, but negligible for I/O-bound BBS apps
- **Advantages**: Smallest binaries (1-2KB), educational value, classic feel

Both produce doors that work identically from the user's perspective!

## Quick Start

### Prerequisites

**1. vbcc cross-compiler**
```bash
brew tap tditlu/amiga
brew install vbcc
export VBCC=/opt/homebrew/opt/vbcc
```

**2. AmigaOS NDK headers**
Already included in `ndk-includes/` - no separate installation needed!

### Create Your First Door

1. **Create door directory**:
   ```bash
   cd ~/Code/amiexpress-web/sdk/68k
   mkdir doors/mydoor
   ```

2. **Write your door** (`doors/mydoor/mydoor.c`):
   ```c
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

       WriteStr("Hello from my C door!\r\n", AEDoorBase);
       WriteStr("This is running on a 68K CPU!\r\n", AEDoorBase);

       CloseLibrary(AEDoorBase);
       return 0;
   }
   ```

3. **Create assembly wrapper** (`doors/mydoor/writestr.asm`):
   ```asm
   ; AEDoor.library WriteStr wrapper
           section code,code
           xdef _WriteStr

   _WriteStr:
           move.l  4(sp),a0        ; Get text parameter
           move.l  8(sp),a6        ; Get AEDoorBase parameter
           jsr     -84(a6)         ; Call WriteStr (LVO -84)
           rts
           end
   ```

4. **Build the door**:
   ```bash
   # Assemble wrapper
   vasmm68k_mot -Fhunk -nowarn=62 doors/mydoor/writestr.asm -o doors/mydoor/writestr.o

   # Compile C code
   export VBCC=/opt/homebrew/opt/vbcc
   vc +aos68k -c -O2 -Indk-includes doors/mydoor/mydoor.c -o doors/mydoor/mydoor.o

   # Link
   vc +aos68k -lamiga doors/mydoor/mydoor.o doors/mydoor/writestr.o -o doors/mydoor/mydoor
   ```

   Or use the Makefile (simpler):
   ```bash
   make door NAME=mydoor
   ```

5. **Install to BBS**:
   ```bash
   make install NAME=mydoor
   ```

6. **Create .info files**:

   `Doors/MYDOOR/mydoor.info`:
   ```
   TYPE=XIM
   LOCATION=doors/MYDOOR/mydoor
   ACCESS=0
   TIMELIMIT=60
   ```

   `Commands/BBSCmd/MYDOOR.info`:
   ```
   TYPE=XIM
   LOCATION=doors/MYDOOR/mydoor
   ACCESS=0
   TIMELIMIT=60
   ```

7. **Test it!**:
   - Restart the BBS server
   - Type `mydoor` at the BBS prompt
   - You should see your message output

## Documentation

- **BUILD_GUIDE.md**: Complete vbcc cross-compilation guide
- **ndk-includes/**: AmigaOS NDK 3.2R4 headers
- **doors/hello-vbcc/**: Minimal example door
- **doors/hello-output/**: Example with AEDoor.library integration

## Architecture

### vbcc Compilation Flow

```
mydoor.c  →  vbcc  →  mydoor.o  ┐
                                 ├→  vlink  →  mydoor (HUNK)
writestr.asm  →  vasm  →  writestr.o  ┘
```

No conversion needed - vbcc produces native Amiga HUNK format directly!

### Execution Flow

```
User types "MYDOOR"  →  BBS loads mydoor binary
                     →  MOIRA emulator executes 68K code
                     →  AEDoor.library calls handled by TypeScript backend
                     →  Output sent to user's terminal
```

## Why vbcc?

vbcc is the only supported compiler for 68K door development:

- Native Amiga toolchain (designed for AmigaOS)
- Produces correct HUNK format directly
- Works in vamos and real Amiga
- Proper entry points
- No ELF conversion needed

## Testing

Test binaries with vamos before deploying:

```bash
# Install vamos
pip3 install amitools

# Test your door
vamos doors/mydoor/mydoor

# Exit code 20 = library not found (expected - vamos doesn't have AEDoor.library)
# Exit code 0 = success
# Crash = something wrong with binary
```

## Examples

Check these working examples:

- **hello-vbcc**: Minimal door (returns 0)
- **hello-output**: Uses AEDoor.library WriteStr

Run them with:
```bash
# From BBS terminal
hellovbcc
helloout
```

## File Structure

```
sdk/68k/
├── Makefile              # vbcc build system
├── BUILD_GUIDE.md        # Complete development guide
├── README.md             # This file
├── ndk-includes/         # AmigaOS NDK 3.2R4 headers
├── includes/             # SDK-specific headers
│   └── amiexpress.h     # AEDoor.library definitions
├── src/
│   └── glue.c           # Glue layer with string functions
├── doors/               # Example doors
│   ├── hello-vbcc/      # Minimal example
│   └── hello-output/    # AEDoor.library example
└── templates/           # Door templates
```

## Need Help?

1. Read **BUILD_GUIDE.md** for complete documentation
2. Check example doors in `doors/`
3. Test binaries with `vamos` before deploying
4. Check `logs/door-68k-*.log` for execution traces

## Next Steps

- **Read BUILD_GUIDE.md** for complete vbcc guide
- **Study examples** in doors/hello-vbcc/ and doors/hello-output/
- **Implement more AEDoor API calls** - add assembly wrappers as needed
- **Port classic Amiga doors** - they should compile with minimal changes
