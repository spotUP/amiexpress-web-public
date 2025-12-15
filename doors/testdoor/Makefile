# Makefile template for AmiExpress door compilation
# Uses standard C compiler for initial testing, vbcc for final builds

# Check for vc (vbcc frontend), fall back to gcc
VC := $(shell which vc 2>/dev/null)
CC ?= gcc

# Door name (derived from current directory)
TARGET ?= $(notdir $(CURDIR))

# Source files
SOURCES = $(TARGET).c
OBJECTS = $(SOURCES:.c=.o)

# Include paths
INCLUDES = -I../includes

# Build rules - use vbcc if available, otherwise gcc for testing
ifeq ($(VC),)
# GCC build for testing
$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@

%.o: %.c
	$(CC) $(INCLUDES) -c $< -o $@
else
# vbcc build for Amiga executable
export VBCC := /opt/homebrew/opt/vbcc
$(TARGET): $(OBJECTS)
	vc +aos68k $(OBJECTS) -o $@

%.o: %.c
	vc +aos68k -c $< -o $@
endif

# Clean build artifacts
clean:
	rm -f $(OBJECTS) $(TARGET)

# Show build info
info:
	@echo "Building door: $(TARGET)"
	@echo "vbcc available: $(if $(VBCC),yes,no)"
	@echo "Compiler: $(if $(VBCC),vbcc,gcc)"

# Phony targets
.PHONY: clean all info

# Default target
all: $(TARGET)