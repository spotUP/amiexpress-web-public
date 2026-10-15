# AmiExpress C/Assembly Door SDK - vbcc Makefile
# Produces authentic 68K Amiga HUNK executables

# ============================================================================
# CRITICAL: This Makefile ONLY produces 68K Amiga binaries
# ============================================================================
#
# These binaries run in the MOIRA 68K emulator, NOT natively on the host.
# They are identical to doors compiled on a real Amiga computer.
#
# Supported Languages:
# - C:        vbcc -> Native Amiga HUNK
# - Assembly: vasm -> HUNK (direct output)
#
# Requirements:
#   brew tap tditlu/amiga
#   brew install vbcc
#   export VBCC=/opt/homebrew/opt/vbcc
# ============================================================================

# vbcc cross-compiler
CC = vc
CFLAGS = +aos68k -c -O2 -cpu=68000
LDFLAGS = +aos68k -lamiga

# Include paths
INCLUDES = -I./includes -I../sdk/68k/ndk-includes

# Amiga assembler (vasm with Motorola syntax)
ASM = vasmm68k_mot
ASMFLAGS = -Fhunk -kick1hunks -nosym -m68000

# Glue code (vbcc compatible)
GLUE_SRC = src/glue-vbcc.c
GLUE_OBJ = glue-vbcc.o

# Default target
.PHONY: all
all: help

# Help message
.PHONY: help
help:
	@echo "AmiExpress C/Assembly Door SDK - 68K Amiga Binary Builder (vbcc)"
	@echo ""
	@echo "Usage:"
	@echo "  make door NAME=myDoor         Build C door (doors/myDoor/myDoor.c)"
	@echo "  make asm NAME=myDoor          Build assembly door (doors/myDoor/myDoor.asm)"
	@echo "  make test-doors               Build all test C doors"
	@echo "  make install-door NAME=myDoor Install door to BBS (copies to Doors/MYDOOR/)"
	@echo "  make clean                    Remove build artifacts"
	@echo ""
	@echo "Examples:"
	@echo "  make door NAME=apitest        -> builds apitest.c -> apitest (68K binary)"
	@echo "  make asm NAME=hello-asm       -> builds hello-asm.asm -> hello-asm (68K binary)"
	@echo "  make install-door NAME=apitest -> copies to Doors/APITEST/"
	@echo ""
	@echo "Supported Languages:"
	@echo "  C:        Uses vbcc cross-compiler"
	@echo "  Assembly: Uses vasm (Motorola 68000 syntax)"
	@echo ""
	@echo "Requirements:"
	@echo "  vbcc:     brew tap tditlu/amiga && brew install vbcc"
	@echo "  vasm:     Included with vbcc"
	@echo "  VBCC env: export VBCC=/opt/homebrew/opt/vbcc"

# Build a specific door
.PHONY: door
door:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make door NAME=myDoor"; \
		exit 1; \
	fi
	@if [ -z "$$VBCC" ]; then \
		echo "ERROR: VBCC environment variable not set."; \
		echo "Run: export VBCC=/opt/homebrew/opt/vbcc"; \
		exit 1; \
	fi
	@echo "[1/4] Building 68K Amiga door: $(NAME)"
	@echo "[2/4] Compiling $(NAME).c -> $(NAME).o"
	$(CC) $(CFLAGS) $(INCLUDES) doors/$(NAME)/$(NAME).c -o doors/$(NAME)/$(NAME).o
	@echo "[3/4] Compiling glue layer -> glue-vbcc.o"
	$(CC) $(CFLAGS) $(INCLUDES) $(GLUE_SRC) -o doors/$(NAME)/glue-vbcc.o
	@echo "[4/4] Linking -> $(NAME)"
	$(CC) $(LDFLAGS) doors/$(NAME)/$(NAME).o doors/$(NAME)/glue-vbcc.o -o doors/$(NAME)/$(NAME)
	@echo ""
	@echo "[OK] Built 68K Amiga binary: doors/$(NAME)/$(NAME)"
	@file doors/$(NAME)/$(NAME)
	@ls -lh doors/$(NAME)/$(NAME)

# Build an assembly door
.PHONY: asm
asm:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make asm NAME=myDoor"; \
		exit 1; \
	fi
	@echo "[1/2] Building 68K Amiga assembly door: $(NAME)"
	@echo "[2/2] Assembling $(NAME).asm -> $(NAME) (HUNK)"
	$(ASM) $(ASMFLAGS) -o doors/$(NAME)/$(NAME) doors/$(NAME)/$(NAME).asm
	@echo ""
	@echo "[OK] Built 68K Amiga binary: doors/$(NAME)/$(NAME)"
	@file doors/$(NAME)/$(NAME)
	@ls -lh doors/$(NAME)/$(NAME)
	@echo ""
	@echo "Note: Assembly doors are self-contained (no glue layer needed)"
	@echo "They must handle library opening/closing directly in assembly code"

# Build all test doors
.PHONY: test-doors
test-doors:
	@echo "Building all test doors..."
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
	mkdir -p ../../Doors/$$UPPER_NAME; \
	cp doors/$(NAME)/$(NAME) ../../Doors/$$UPPER_NAME/; \
	echo "[2/2] Verifying installation..."; \
	file ../../Doors/$$UPPER_NAME/$(NAME); \
	echo ""; \
	echo "[OK] Installed to Doors/$$UPPER_NAME/$(NAME)"; \
	echo ""; \
	echo "Next steps:"; \
	echo "  1. Create .info file: Doors/$$UPPER_NAME/$(NAME).info"; \
	echo "  2. Register command in Commands/BBSCmd/$$UPPER_NAME.info"

# Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	find doors -name "*.o" -delete
	@echo "[OK] Clean complete"

# Verify toolchain is installed
.PHONY: check-tools
check-tools:
	@echo "Checking required tools..."
	@if [ -z "$$VBCC" ]; then \
		echo "ERROR: VBCC environment variable not set."; \
		echo "Run: export VBCC=/opt/homebrew/opt/vbcc"; \
		exit 1; \
	fi
	@command -v $(CC) >/dev/null 2>&1 || { echo "ERROR: vbcc (vc) not found. Install with: brew install tditlu/amiga/vbcc"; exit 1; }
	@command -v $(ASM) >/dev/null 2>&1 || { echo "ERROR: vasm not found. Install with: brew install tditlu/amiga/vbcc"; exit 1; }
	@echo "[OK] All required tools installed"
	@$(CC) -version 2>&1 | head -3 || echo "vbcc installed"
	@$(ASM) -version 2>&1 | head -1 || echo "vasm installed"
