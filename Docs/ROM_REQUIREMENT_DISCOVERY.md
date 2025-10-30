# ROM Requirement Discovery (2025-10-30)

## Critical Discovery

**Both GetAnswer and Bulls doors fail because we have NO ROM MEMORY AT ALL.**

## What vAmiga Does

From analyzing `Docs/vAmiga/Core/Components/Memory/Memory.h` and `Memory.cpp`:

###1. vAmiga Allocates Real ROM Memory

```cpp
// Memory.h line 64-66
#define READ_ROM_8(x)       R8BE (rom + ((x) & romMask))
#define READ_ROM_16(x)      R16BE(rom + ((x) & romMask))
```

vAmiga has actual ROM memory buffers:
- `rom` - Kickstart ROM (256KB or 512KB)
- `wom` - Write-Once Memory
- `ext` - Extended ROM

### 2. vAmiga Loads Kickstart ROM File

```cpp
// Memory.cpp
if (auto romPath = Emulator::defaults.getRaw("ROM_PATH"); romPath != "") {
    loadRom(romPath);
}

if (!hasRom || FORCE_ROM_MISSING) {
    throw AppError(Fault::ROM_MISSING);
}
```

**vAmiga REQUIRES a Kickstart ROM file to run!**

### 3. Memory Map

From Memory.h:
- **0x000000 - 0x1FFFFF**: Chip RAM
- **0xA00000 - 0xBFFFFF**: CIA (I/O registers)
- **0xC00000 - 0xC7FFFF**: Slow RAM
- **0xC00000 - 0xDFFFFF**: Custom chip registers
- **0xE80000 - 0xE8FFFF**: AutoConfig
- **0xF80000 - 0xFFFFFF**: ROM SPACE (512KB)

## What We're Missing

### 1. Exception Vector Table (0x000000 - 0x0003FF)

The 68000 CPU requires exception vectors at the start of memory:

```
Address    Vector
--------   ------
0x000000   Initial SSP (Stack Pointer)
0x000004   Initial PC (Program Counter)
0x000008   Bus Error
0x00000C   Address Error
0x000010   Illegal Instruction
...        (64 vectors total, 4 bytes each = 256 bytes)
```

**Without these vectors, the CPU doesn't know where to jump on interrupts/exceptions!**

### 2. ROM Space (0xF80000 - 0xFFFFFF)

Kickstart ROM contains:
- **exec.library** - Core OS functions
- **dos.library** - File system functions
- **intuition.library** - GUI functions
- **Function jump tables** - Where library calls actually go
- **System data structures**
- **Boot code**

**Without ROM, library calls and system functions don't exist!**

### 3. Library Base Pointers

Programs find libraries by reading pointers from low memory (set up by ROM):

```
0x000004   SysBase - pointer to exec.library
0x000014   IntVector[5] - interrupt vectors
```

**Without these, programs can't find libraries!**

## Why Both Doors Failed

### Bulls Door (21KB)
1. Loaded successfully ✅
2. Executed code ✅
3. Called aePuts() → "dos.library" output ✅
4. Tried to read ROM at 0xFF0000 ❌
5. Got 0 instead of function pointer ❌
6. Jumped to address 0x0 (NULL) ❌
7. Infinite loop at PC=0x0 ❌

### GetAnswer Door (8KB)
1. Loaded successfully ✅
2. Executed code ✅
3. Called aePuts() → "dos.library" output ✅
4. Tried to read from low memory (exception vectors?) ❌
5. Got garbage instead of valid address ❌
6. Jumped to 0x2700c008 (invalid) ❌
7. Infinite loop at PC=0x2700c008 ❌

## PC Value 0x2700c008 Explained

This could be:
1. **Garbage from uninitialized memory** being interpreted as an address
2. **Exception vector table entry** that we never initialized
3. **Data being executed as code** because PC got corrupted

The value `0x2700` is also the 68k opcode for `MOVE #0,SR` (enter supervisor mode), which might be coincidence or might be actual code at that address.

## The "dos.library" Output

Both doors output "dos.library" before crashing. This tells us:

1. **Our library trap system WORKS** ✅
2. **AEDoor.library aePuts() WORKS** ✅
3. **Text I/O WORKS** ✅
4. **Doors are executing properly** ✅

The crash happens AFTER successful library calls, when doors try to:
- Read ROM for function pointers
- Access exception vectors
- Call system functions that need ROM

## Solutions

### Option 1: Minimal Exception Vector Table

Implement a minimal vector table at 0x000000:

```typescript
// Initialize exception vectors
memory[0x000000] = 0x00; // Initial SSP (high byte)
memory[0x000001] = 0x01;
memory[0x000002] = 0x00;
memory[0x000003] = 0x00; // SSP = 0x00010000

memory[0x000004] = entry PC address (from door executable)
memory[0x000008] = bus error handler
memory[0x00000C] = address error handler
// ... etc
```

**Pros:** Small, focused fix
**Cons:** May not be enough - doors still need ROM functions

### Option 2: AROS ROM (Open Source)

Use AROS Kickstart ROM (open-source Amiga OS replacement):
- Legal and free to use
- Compatible with Kickstart 3.1
- Contains all system libraries
- ~512KB in size

**Pros:** Complete solution, legal, well-tested
**Cons:** Large file, need to load and map correctly

### Option 3: ROM Stubs

Create minimal ROM stubs that:
- Return safe values for ROM reads
- Implement basic library functions
- Provide function jump tables
- Set up exception vectors

**Pros:** Lightweight, custom tailored
**Cons:** Complex, may miss edge cases

### Option 4: Hybrid Approach

1. Implement exception vector table
2. Stub out common ROM reads
3. Implement library functions we need (dos.library, exec.library)
4. Use AROS ROM as fallback for complex cases

**Pros:** Best of all worlds
**Cons:** Most work

## Recommended Approach

**START WITH:** Exception vector table + basic ROM stubs

```typescript
class RomEmulation {
  private vectors: Uint8Array;  // 0x000000 - 0x0003FF
  private romSpace: Uint8Array; // 0xF80000 - 0xFFFFFF

  initializeVectors() {
    // Set up 64 exception vectors
    this.vectors[0x00] = /* Initial SSP */
    this.vectors[0x04] = /* Initial PC */
    this.vectors[0x08] = /* Bus error handler */
    // ... etc
  }

  initializeRomStubs() {
    // Create function jump tables
    // Implement common ROM reads
    // Set up library base pointers
  }

  handleRomRead(address: number): number {
    if (address < 0x400) {
      return this.vectors[address];
    }
    if (address >= 0xF80000) {
      return this.romSpace[address - 0xF80000];
    }
    return 0;
  }
}
```

**THEN:** Test with GetAnswer and Bulls doors again

**IF NEEDED:** Load AROS ROM for complete compatibility

## Files to Modify

1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
   - Add ROM memory allocation
   - Initialize exception vectors
   - Set up memory map

2. `web/backend/src/amiga-emulation/api/AmigaDosEnvironment.ts`
   - Update ROM read handler
   - Return actual ROM data instead of 0

3. Create new file: `web/backend/src/amiga-emulation/RomEmulation.ts`
   - Exception vector table
   - ROM stub implementations
   - Memory mapping

## Success Criteria

After implementing ROM support:
- GetAnswer and Bulls should get past the infinite loop
- Doors should execute more code before any errors
- May reveal additional missing pieces (good!)
- Eventually: Doors run successfully!

## References

- vAmiga Memory.h: Exception vector addresses and ROM mapping
- vAmiga Memory.cpp: ROM loading and initialization
- 68000 Programmer's Reference: Exception vector table format
- AROS ROM: Open-source Kickstart replacement
- AmigaDOS Technical Reference: Library base pointers

---

**Next Step:** Implement minimal exception vector table and test doors again.
