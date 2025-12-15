# AmiExpress C Door SDK - Unified Makefile
# Produces authentic 68K Amiga HUNK executables
# Uses Bartman's m68k-amiga-elf-gcc cross-compiler

# ============================================================================
# CRITICAL: This Makefile ONLY produces 68K Amiga binaries
# ============================================================================
#
# These binaries run in the MOIRA 68K emulator, NOT natively on the host.
# They are identical to doors compiled on a real Amiga computer.
#
# Requirements:
# - m68k-amiga-elf-gcc cross-compiler installed
# - elf2hunk converter installed
#
# Installation:
#   brew tap amiga-tools/amiga
#   brew install m68k-amiga-elf-gcc
#   git clone https://github.com/BartmanAbyss/elf2hunk && cd elf2hunk && make
# ============================================================================

# Cross-compiler toolchain (REQUIRED)
CC = m68k-amiga-elf-gcc
LD = m68k-amiga-elf-ld
ELF2HUNK = elf2hunk

# Amiga 68000 compilation flags
CFLAGS = -m68000 -O2 -fomit-frame-pointer -nostdlib -nostdinc
CFLAGS += -I./includes -D__AMIGA_CROSS__
CFLAGS += -Wall -Wextra

# Linker flags
LDFLAGS = -T amiga.ld

# Glue code (AmiExpress API stubs - NEEDS FIXING per C_DOOR_ARCHITECTURE_ISSUES.md)
GLUE_SRC = src/glue-amiga.c
GLUE_OBJ = glue-amiga.o

# Default target
.PHONY: all
all: help

# Help message
.PHONY: help
help:
	@echo "AmiExpress C Door SDK - 68K Amiga Binary Builder"
	@echo ""
	@echo "Usage:"
	@echo "  make door NAME=myDoor        Build 68K binary from doors/myDoor/myDoor.c"
	@echo "  make test-doors               Build all test doors (minimal, simpletest, apitest)"
	@echo "  make install-door NAME=myDoor Install door to BBS (copies to doors/MYDOOR/)"
	@echo "  make clean                    Remove build artifacts"
	@echo ""
	@echo "Example:"
	@echo "  make door NAME=minimal        → builds doors/minimal/minimal.c → minimal.hunk"
	@echo "  make install-door NAME=minimal → copies to doors/MINIMAL/"
	@echo ""
	@echo "Requirements:"
	@echo "  - m68k-amiga-elf-gcc (brew install m68k-amiga-elf-gcc)"
	@echo "  - elf2hunk converter"

# Build a specific door
.PHONY: door
door:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make door NAME=myDoor"; \
		exit 1; \
	fi
	@echo "[1/5] Building 68K Amiga door: $(NAME)"
	@echo "[2/5] Compiling $(NAME).c → $(NAME).o"
	$(CC) $(CFLAGS) -c doors/$(NAME)/$(NAME).c -o doors/$(NAME)/$(NAME).o
	@echo "[3/5] Compiling glue layer → glue-amiga.o"
	$(CC) $(CFLAGS) -c $(GLUE_SRC) -o doors/$(NAME)/glue-amiga.o
	@echo "[4/5] Linking ELF executable → $(NAME).elf"
	$(LD) $(LDFLAGS) doors/$(NAME)/$(NAME).o doors/$(NAME)/glue-amiga.o -o doors/$(NAME)/$(NAME).elf
	@echo "[5/5] Converting to Amiga HUNK → $(NAME)"
	$(ELF2HUNK) doors/$(NAME)/$(NAME).elf doors/$(NAME)/$(NAME)
	@echo ""
	@echo "[OK] Built 68K Amiga binary: doors/$(NAME)/$(NAME)"
	@file doors/$(NAME)/$(NAME)
	@ls -lh doors/$(NAME)/$(NAME)

# Build all test doors
.PHONY: test-doors
test-doors:
	@echo "Building all test doors..."
	$(MAKE) door NAME=minimal
	$(MAKE) door NAME=simpletest
	$(MAKE) door NAME=apitest
	@echo ""
	@echo "[OK] All test doors built"

# Install a door to the BBS
.PHONY: install-door
install-door:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make install-door NAME=myDoor"; \
		exit 1; \
	fi
	@UPPER_NAME=$$(echo $(NAME) | tr '[:lower:]' '[:upper:]'); \
	echo "[1/2] Installing $(NAME) to BBS..."; \
	mkdir -p ../../doors/$$UPPER_NAME; \
	cp doors/$(NAME)/$(NAME) ../../doors/$$UPPER_NAME/; \
	echo "[2/2] Verifying installation..."; \
	file ../../doors/$$UPPER_NAME/$(NAME); \
	echo ""; \
	echo "[OK] Installed to doors/$$UPPER_NAME/$(NAME)"; \
	echo ""; \
	echo "Next steps:"; \
	echo "  1. Create .info file: doors/$$UPPER_NAME/$(NAME).info"; \
	echo "  2. Register command in Commands/BBSCmd/$$UPPER_NAME.info"

# Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	find doors -name "*.o" -delete
	find doors -name "*.elf" -delete
	@echo "[OK] Clean complete"

# Verify toolchain is installed
.PHONY: check-tools
check-tools:
	@echo "Checking required tools..."
	@command -v $(CC) >/dev/null 2>&1 || { echo "ERROR: $(CC) not found. Install with: brew install m68k-amiga-elf-gcc"; exit 1; }
	@command -v $(ELF2HUNK) >/dev/null 2>&1 || { echo "ERROR: $(ELF2HUNK) not found. Build from: https://github.com/BartmanAbyss/elf2hunk"; exit 1; }
	@echo "[OK] All required tools installed"
	@$(CC) --version | head -1
	@$(ELF2HUNK) --version 2>&1 | head -1 || echo "elf2hunk (no version info)"
