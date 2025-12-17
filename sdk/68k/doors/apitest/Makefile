# Makefile template for AmiExpress door compilation
# Uses standard C compiler for initial testing, vbcc for final builds

# Compiler selection (prioritize COMPILER variable)
COMPILER ?= gcc
VC := $(shell which vc 2>/dev/null)
CC ?= gcc

# Door name (derived from current directory)
TARGET ?= $(notdir $(CURDIR))

# Source files (door code only - apitest has its own stubs)
SOURCES = $(TARGET).c
OBJECTS = $(SOURCES:.c=.o)

# Include paths
INCLUDES = -I../includes

# Build rules based on COMPILER selection
ifeq ($(COMPILER),gcc)
$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@

%.o: %.c
	$(CC) $(INCLUDES) -c $< -o $@
else ifeq ($(COMPILER),vbcc)
# vbcc build for Amiga executable
$(TARGET): $(OBJECTS)
	vc +aos68k $(OBJECTS) -o $@

%.o: %.c
	vc +aos68k $(INCLUDES) -c $< -o $@
endif

# Clean build artifacts
clean:
	rm -f *.o $(TARGET)

# Show build info
info:
	@echo "Building door: $(TARGET)"
	@echo "Compiler: $(COMPILER)"
	@echo "vbcc available: $(if $(VC),yes,no)"

# Phony targets
.PHONY: clean all info

# Default target
all: $(TARGET)