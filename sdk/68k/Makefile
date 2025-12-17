# Makefile for building 68K Amiga doors with vbcc
# Produces native Amiga HUNK executables (no conversion needed)

# Paths
VBCC := /opt/homebrew/opt/vbcc
export VBCC

# Toolchain
CC := vc
VASM := vasmm68k_mot
NDK_INCLUDES := ndk-includes
CFLAGS := +aos68k -c99 -O2 -speed -cpu=68000 -I$(NDK_INCLUDES)
LDFLAGS := +aos68k -lamiga -lvc

# Directories
SRC_DIR := src
INCLUDES_DIR := includes
DOORS_DIR := doors

# Source files
GLUE_SRC := $(SRC_DIR)/glue.c
WRITESTR_ASM := $(SRC_DIR)/writestr.asm

# Default target
.PHONY: help
help:
	@echo "68K Amiga Door Build System (vbcc)"
	@echo ""
	@echo "Usage:"
	@echo "  make door NAME=mydoor        - Build a C door"
	@echo "  make install NAME=mydoor     - Build and install to BBS"
	@echo "  make clean                   - Clean build artifacts"
	@echo ""
	@echo "Environment:"
	@echo "  VBCC=$(VBCC)"
	@echo "  CC=$(CC)"
	@echo "  VASM=$(VASM)"
	@echo ""
	@echo "See BUILD_GUIDE.md for complete documentation"

# Build a C door
.PHONY: door
door:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make door NAME=mydoor"; \
		exit 1; \
	fi
	@echo "[1/4] Building 68K Amiga door: $(NAME)"
	@echo "[2/5] Compiling $(NAME).c"
	$(CC) $(CFLAGS) -I$(INCLUDES_DIR) -c doors/$(NAME)/$(NAME).c -o doors/$(NAME)/$(NAME).o
	@echo "[3/5] Compiling glue layer"
	$(CC) $(CFLAGS) -I$(INCLUDES_DIR) -c $(GLUE_SRC) -o doors/$(NAME)/glue.o
	@echo "[4/5] Assembling writestr.asm"
	$(VASM) -Fhunk -o doors/$(NAME)/writestr.o $(WRITESTR_ASM)
	@echo "[5/5] Linking to Amiga HUNK executable"
	$(CC) $(LDFLAGS) doors/$(NAME)/glue.o doors/$(NAME)/writestr.o doors/$(NAME)/$(NAME).o -o doors/$(NAME)/$(NAME)
	@echo ""
	@file doors/$(NAME)/$(NAME)
	@ls -lh doors/$(NAME)/$(NAME)
	@echo ""
	@echo "[OK] Built 68K Amiga binary: doors/$(NAME)/$(NAME)"

# Install a door to the BBS
.PHONY: install
install:
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME not specified. Usage: make install NAME=mydoor"; \
		exit 1; \
	fi
	@$(MAKE) door NAME=$(NAME)
	@UPPER_NAME=$$(echo $(NAME) | tr '[:lower:]' '[:upper:]'); \
	echo "Installing $$UPPER_NAME to BBS..."; \
	mkdir -p ../../Doors/$$UPPER_NAME; \
	cp doors/$(NAME)/$(NAME) ../../Doors/$$UPPER_NAME/; \
	echo "[OK] Installed to Doors/$$UPPER_NAME/$(NAME)"; \
	echo ""; \
	echo "Next steps:"; \
	echo "  1. Create door .info: Doors/$$UPPER_NAME/$(NAME).info"; \
	echo "  2. Register command: Commands/BBSCmd/$$UPPER_NAME.info"

# Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	find doors -name "*.o" -delete
	@echo "[OK] Clean complete"
