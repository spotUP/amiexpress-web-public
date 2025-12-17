# Makefile for SDK Test Door
# Comprehensive test of all C door SDK functions using vbcc

# vbcc cross-compiler
CC = vc
CFLAGS = +aos68k -c -O2 -cpu=68000
LDFLAGS = +aos68k -lamiga

# Include paths
INCLUDES = -I../../includes -I../../ndk-includes

# Amiga assembler (vasm)
ASM = vasmm68k_mot
ASMFLAGS = -Fhunk -nowarn=62

# Door name
TARGET ?= sdktest

# Source files
DOOR_SRC = sdktest.c
GLUE_SRC = ../../src/glue.c

# Build rules
all: $(TARGET)

$(TARGET): $(TARGET).o glue.o
	$(CC) $(LDFLAGS) $(TARGET).o glue.o -o $@
	@echo ""
	@echo "[OK] Built 68K Amiga binary: $(TARGET)"
	@file $(TARGET) 2>/dev/null || true

$(TARGET).o: $(DOOR_SRC)
	$(CC) $(CFLAGS) $(INCLUDES) $< -o $@

glue.o: $(GLUE_SRC)
	$(CC) $(CFLAGS) $(INCLUDES) $< -o $@

# Clean build artifacts
clean:
	rm -f *.o $(TARGET)

# Show build info
info:
	@echo "Building door: $(TARGET)"
	@echo "Compiler: vbcc"
	@echo "VBCC env: $$VBCC"

# Phony targets
.PHONY: clean all info
