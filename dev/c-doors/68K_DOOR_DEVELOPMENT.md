# Creating 68K Amiga Doors for AmiExpress BBS

## Overview

This guide documents how to create authentic 68K Amiga executables that run on AmiExpress BBS using assembly language. These doors run natively on the Amiga emulator and provide maximum performance and compatibility.

## Prerequisites

### 1. Amiga NDK Headers
The Amiga Native Development Kit (NDK) provides essential headers for Amiga development.

**Location:** `Documentation/7-Reference Sources/NDK3.2R4/`
- `Include_H/` - C headers (exec.h, dos.h, etc.)
- `Include_I/` - Assembly includes (exec/types.i, etc.)

### 2. vasm Assembler
Virtual Assembler (vasm) creates Amiga hunk format executables.

**Installation:**
```bash
brew install tditlu/amiga/vasm
```

**Usage:**
```bash
# Assembler executable
/opt/homebrew/bin/vasmm68k_mot

# Command format
vasmm68k_mot -Fhunk -I<path/to/ndk/includes> -o <output> <input.s>
```

## Door Structure

### 1. Basic Assembly Template

```asm
;==============================================================================
; Amiga Door Template - 68K Assembly
;==============================================================================

		include	"exec/types.i"
		include	"exec/libraries.i"
		include	"exec/execbase.i"
		include	"dos/dos.i"

		section	code,code

;------------------------------------------------------------------------------
; Main entry point
;------------------------------------------------------------------------------
start:
		; Save registers (Amiga calling convention)
		movem.l	d2-d7/a2-a6,-(sp)

		; Open DOS library
		move.l	4.w,a6				; ExecBase
		lea	dosname(pc),a1
		moveq	#0,d0
		jsr	_LVOOpenLibrary(a6)
		move.l	d0,dosbase
		beq.w	exit				; Failed to open DOS

		; Your door logic here
		bsr	do_door_logic

		; Clean shutdown
		move.l	dosbase(pc),a6
		jsr	_LVOCloseLibrary(a6)

exit:
		; Restore registers
		movem.l	(sp)+,d2-d7/a2-a6

		; Exit with success
		moveq	#0,d0
		rts

;------------------------------------------------------------------------------
; Door logic functions
;------------------------------------------------------------------------------

do_door_logic:
		; Print welcome message
		move.l	dosbase(pc),a6
		lea	welcome_msg(pc),a0
		jsr	_LVOPutStr(a6)

		; Add your door functionality here
		; Call C SDK functions via library interface

		rts

;------------------------------------------------------------------------------
; Data section
;------------------------------------------------------------------------------

		section	data,data

dosname		dc.b	"dos.library",0
welcome_msg	dc.b	"Welcome to my 68K Amiga Door!",10,0

dosbase		dc.l	0

;------------------------------------------------------------------------------
; BSS section (uninitialized data)
;------------------------------------------------------------------------------

		section	bss,bss

		end
```

### 2. Key Components

**Sections:**
- `code,code` - Executable code
- `data,data` - Initialized data
- `bss,bss` - Uninitialized data

**Library Access:**
- `move.l 4.w,a6` - Get ExecBase
- `_LVOOpenLibrary` - Open libraries
- `_LVOPutStr` - DOS output function

**Register Conventions:**
- `d0-d1/a0-a1` - Scratch registers (can be modified)
- `d2-d7/a2-a6` - Must be preserved
- `a7` - Stack pointer

## Integration with C SDK

### 1. Calling C Functions

To call C SDK functions from assembly, link with the glue library:

```makefile
# Link assembly object with C glue library
$(TARGET): $(ASM_OBJECTS) glue-amiga.o
	m68k-amiga-elf-gcc $(ASM_OBJECTS) glue-amiga.o -o $@ -nostdlib -Wl,--entry=_start

# Compile glue library for Amiga
glue-amiga.o: glue-amiga.c
	m68k-amiga-elf-gcc -D__AMIGA_CROSS__ -Iincludes/amiga -c glue-amiga.c -o $@
```

### 2. Function Calling Convention

```asm
; Call C function: sendmessage("Hello", 1)
		pea	1					; Push newline parameter
		pea	message_string		; Push string parameter
		jsr	_sendmessage		; Call C function
		addq.l	#8,sp				; Clean stack (2 longs)
```

## Building the Door

### 1. Directory Structure

```
dev/c-doors/doors/yourdoor/
├── yourdoor.s          # Assembly source
├── glue-amiga.c        # C glue functions
├── Makefile           # Build configuration
└── yourdoor.info      # BBS registration
```

### 2. Makefile Template

```makefile
# Amiga Door Makefile

# Cross-compiler
CC_AMIGA = m68k-amiga-elf-gcc
ASSEMBLER = /opt/homebrew/bin/vasmm68k_mot
NDK_PATH = ../../../../Documentation/7-Reference\ Sources/NDK3.2R4

# Files
TARGET = yourdoor
ASM_SRC = $(TARGET).s
GLUE_SRC = glue-amiga.c
ASM_OBJ = $(ASM_SRC:.s=.o)
GLUE_OBJ = glue-amiga.o

# Build rules
$(TARGET): $(ASM_OBJ) $(GLUE_OBJ)
	$(CC_AMIGA) $(ASM_OBJ) $(GLUE_OBJ) -o $@ -nostdlib -Wl,--entry=_start

$(ASM_OBJ): $(ASM_SRC)
	$(ASSEMBLER) -Fhunk -I$(NDK_PATH)/Include_I -o $@ $<

$(GLUE_OBJ): $(GLUE_SRC)
	$(CC_AMIGA) -D__AMIGA_CROSS__ -I$(NDK_PATH)/Include_H -c $< -o $@

clean:
	rm -f $(TARGET) *.o

.PHONY: clean
```

### 3. Compilation Steps

```bash
# 1. Assemble 68K code
vasmm68k_mot -Fhunk -Ipath/to/ndk/includes -o door.o door.s

# 2. Compile C glue functions
m68k-amiga-elf-gcc -D__AMIGA_CROSS__ -Ipath/to/ndk/includes -c glue.c -o glue.o

# 3. Link together
m68k-amiga-elf-gcc door.o glue.o -o door -nostdlib -Wl,--entry=_start
```

## BBS Integration

### 1. Install Door

```bash
# Copy to BBS Doors directory
cp yourdoor Doors/YOURDOOR/
cp yourdoor.info Doors/YOURDOOR/
```

### 2. Register Command

```bash
# Create command registration
cp Commands/BBSCmd/WHO.info Commands/BBSCmd/YOURDOOR.info

# Set door location
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/YOURDOOR.info \
  set LOCATION "DOORS:YOURDOOR/YOURDOOR"
```

### 3. Door Configuration (.info file)

```text
AmiExpress Door
YOURDOOR
Description of your door
LOCATION=DOORS:YOURDOOR/YOURDOOR
STACK=20000
STARTUP=1
FLAGS=0
```

## Testing

### 1. Verify Executable Format

```bash
file Doors/YOURDOOR/yourdoor
# Should show: AmigaOS loadseg()ble executable/binary
```

### 2. Test in BBS

```bash
# Start BBS
npm run dev

# Connect and run: YOURDOOR
```

### 3. Debug Output

The door will show output through the BBS interface. Use debug messages to verify execution:

```asm
		move.l	dosbase(pc),a6
		lea	debug_msg(pc),a0
		jsr	_LVOPutStr(a6)
```

## Advanced Features

### 1. XIM Protocol Communication

For full door functionality, implement XIM message handling:

```asm
; Wait for BBS messages
wait_message:
		; WaitPort implementation
		; GetMsg implementation
		; Parse XIM commands
		rts
```

### 2. Memory Management

```asm
; Allocate memory
		move.l	4.w,a6			; ExecBase
		move.l	#1024,d0		; Size
		move.l	#MEMF_PUBLIC,d1	; Flags
		jsr	_LVOAllocMem(a6)

; Free memory
		move.l	d0,a1			; Address
		move.l	#1024,d0		; Size
		jsr	_LVOFreeMem(a6)
```

### 3. File I/O

```asm
; Open file
		move.l	dosbase,a6
		move.l	#MODE_OLDFILE,d2
		lea	filename(pc),a0
		jsr	_LVOOpen(a6)

; Read/Write operations
		; Use _LVORead/_LVOWrite
```

## Troubleshooting

### Common Issues

**1. "could not open include file"**
- Wrong NDK path in assembler command
- Missing NDK installation

**2. "HunkLoader error"**
- Executable not in Amiga hunk format
- Wrong assembler flags

**3. "Library not found"**
- DOS library not opened correctly
- Wrong library name

**4. Door doesn't start**
- Wrong entry point (_start vs start)
- Missing stack setup

### Debug Tips

1. **Test assembly separately:**
   ```bash
   vasmm68k_mot -Fhunk -Iincludes -o test test.s
   hunktool info test
   ```

2. **Verify executable format:**
   ```bash
   file door_executable
   # Should be: AmigaOS loadseg()ble executable/binary
   ```

3. **Check door loading logs:**
   ```bash
   tail -f logs/backend.log | grep -i door
   ```

## Complete Example

See `dev/c-doors/doors/sdktest/amiga68k.s` for a complete working example that demonstrates:
- Proper Amiga executable structure
- Library opening/closing
- DOS output functions
- Clean shutdown
- BBS integration

This 68K assembly approach provides the most authentic Amiga door experience with maximum performance and compatibility.