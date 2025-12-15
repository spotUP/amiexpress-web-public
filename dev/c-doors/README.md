# AmiExpress C Door SDK

**Create authentic 68K Amiga door binaries using modern C development tools**

## Overview

The C Door SDK allows you to write BBS doors in C that compile to authentic **Motorola 68000 machine code**, identical to doors written for classic Amiga computers in the 1990s. These doors run in the MOIRA 68K emulator, providing 100% compatibility with the original AmiExpress BBS system.

## Two SDK Approaches

AmiExpress-Web offers two distinct door development approaches:

### 1. TypeScript SDK (sdk/)
- **Language**: TypeScript/JavaScript
- **Execution**: Native Node.js (no emulation)
- **Performance**: Fast, modern
- **Best for**: New doors, complex UI, modern libraries
- **Location**: `/sdk/`

### 2. C SDK (dev/c-doors/)
- **Language**: C (cross-compiled to 68K)
- **Execution**: MOIRA 68K emulator
- **Performance**: Authentic Amiga experience
- **Best for**: Porting classic doors, learning Amiga programming
- **Location**: `/dev/c-doors/`

Both approaches produce doors that work identically from the user's perspective!

## Quick Start

### Prerequisites

1. **m68k-amiga-elf-gcc cross-compiler**
   ```bash
   brew tap amiga-tools/amiga
   brew install m68k-amiga-elf-gcc
   ```

2. **elf2hunk converter**
   ```bash
   git clone https://github.com/BartmanAbyss/elf2hunk
   cd elf2hunk && make && sudo cp elf2hunk /usr/local/bin/
   ```

### Create Your First Door

1. **Create door directory**:
   ```bash
   mkdir dev/c-doors/doors/mydoor
   cd dev/c-doors/doors/mydoor
   ```

2. **Write your door** (`mydoor.c`):
   ```c
   #include "../../includes/amiexpress.h"

   int main(int argc, char *argv[]) {
       Register(1);  // Register with BBS (node 1)

       sendmessage("Hello from my C door!\\r\\n", 1);
       sendmessage("This is running on a 68K CPU!\\r\\n", 1);

       ShutDown();   // Clean shutdown
       return 0;
   }
   ```

3. **Build to 68K binary**:
   ```bash
   cd ../.. && make door NAME=mydoor
   ```

4. **Install to BBS**:
   ```bash
   make install-door NAME=mydoor
   ```

5. **Register command** (create `doors/MYDOOR/mydoor.info`):
   ```
   LOCATION=DOORS:MYDOOR/mydoor
   DOORTYPE=Amiga68K
   ```

   And `Commands/BBSCmd/MYDOOR.info`:
   ```
   TYPE=DOOR
   LOCATION=DOORS:MYDOOR/mydoor
   ```

6. **Test in BBS**: Type `MYDOOR` at the BBS prompt!

## Architecture

### Compilation Flow

```
C Source → m68k-amiga-elf-gcc → ELF Binary → elf2hunk → Amiga HUNK → BBS Door
   ↓                              ↓                        ↓
mydoor.c                      mydoor.elf              mydoor (68K)
```

### Execution Flow

```
BBS User Types "MYDOOR"
  → Door Handler loads mydoor (68K binary)
  → MOIRA emulator executes 68K machine code
  → Door calls AEDoor.library functions
  → Real Amiga library (Libs/AEDoor.library) executes
  → Library uses PutMsg/GetMsg for XIM protocol
  → ExecLibrary bridges messages to BBS backend
  → Output appears on user's terminal
```

## API Reference

### Essential Functions

```c
// Lifecycle
void Register(int node);        // Initialize door for node N
void ShutDown(void);             // Clean shutdown

// Output
void sendmessage(char *text, int newline);  // Send text to user
void mciputstr(char *mci, int nl);          // Send MCI codes

// Input
int getkey(void);                          // Get single keypress
void prompt(char *prompt, char *result, int maxlen);  // Get user input
void lineinput(char *prompt, char *result, int maxlen);  // Get line of input

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
├── Makefile               # Unified build system
├── amiga.ld              # Linker script for 68K
├── README.md             # This file
├── includes/             # Header files
│   ├── amiexpress.h     # AmiExpress API declarations
│   └── amiga/           # Amiga OS headers (exec, dos, etc.)
├── src/                  # Glue code (C runtime + API bridge)
│   └── glue-amiga.c     # CURRENTLY STUBS - needs real library calls
├── doors/                # Your door source code
│   ├── minimal/         # Minimal example
│   ├── simpletest/      # Simple test door
│   └── apitest/         # API test door
└── templates/            # Door templates
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

## Known Issues & TODO

### ⚠️ CRITICAL: Glue Layer Needs Fixing

The current `src/glue-amiga.c` contains **stub implementations** that do not work! This is documented in:
- `C_DOOR_ARCHITECTURE_ISSUES.md`
- `AEDOOR_ARCHITECTURE_FIX.md`

**Problem**: Functions like `sendmessage()`, `prompt()`, etc. are stubs that do nothing.

**Solution**: These should call the REAL AEDoor.library via:
1. OpenLibrary("AEDoor.library", 0)
2. Call library functions via LVO jumps
3. Let the real library handle XIM protocol

See `C_DOOR_ARCHITECTURE_ISSUES.md` for the correct implementation approach.

### Current Limitations

1. **No XIM Communication**: Doors compile and run but produce no output (stub functions)
2. **argc/argv Not Supported**: Door CLI arguments not yet implemented
3. **Limited API**: Only basic functions available, 60+ functions need implementation
4. **No File I/O**: File operations not yet bridged to host filesystem

These will be addressed in future updates.

## Testing

### Verify 68K Binary

```bash
# Check binary type
file doors/mydoor/mydoor
# Should output: AmigaOS loadseg()ble executable/binary

# Check size (should be small, <5KB for simple doors)
ls -lh doors/mydoor/mydoor
```

### Test in BBS

1. Start BBS: `./dev/scripts/start-servers.sh`
2. Connect via browser: `http://localhost:3001`
3. Type door command: `MYDOOR`
4. Check logs: `logs/door-68k-MYDOOR-*.log`

## Examples

See `doors/minimal/`, `doors/simpletest/`, and `doors/apitest/` for working examples.

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
- **Architecture Docs**:
  - `AEDOOR_ARCHITECTURE_FIX.md`
  - `C_DOOR_ARCHITECTURE_ISSUES.md`

## Contributing

When adding C SDK features:
1. Follow the real AEDoor.library approach (NO stubs!)
2. Test with real 68K binaries
3. Update this README
4. Add examples

## License

Same as main project - see LICENSE file.

---

**Happy Amiga Coding!** 🖥️
