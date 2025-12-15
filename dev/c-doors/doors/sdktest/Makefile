# Makefile for SDK Test Door
# Comprehensive test of all C door SDK functions

# Compiler selection (prioritize COMPILER variable)
COMPILER ?= gcc
VC := $(shell which vc 2>/dev/null)
CC ?= gcc

# Door name (derived from current directory)
TARGET ?= amiga-test

# Source files (door code + glue implementation)
DOOR_SOURCES = amiga-test.c
ifeq ($(COMPILER),gcc)
# GCC build - use GCC glue
GLUE_SOURCES = ../../src/glue-gcc.c
else ifeq ($(COMPILER),vbcc)
# vbcc build - use vbcc glue
GLUE_SOURCES = ../../src/glue-vbcc.c
else
# Default to GCC if COMPILER not recognized
GLUE_SOURCES = ../../src/glue-gcc.c
endif
SOURCES = $(DOOR_SOURCES) $(GLUE_SOURCES)
OBJECTS = $(SOURCES:.c=.o)

# Include paths
INCLUDES = -I../../includes

# Build rules based on COMPILER selection
ifeq ($(COMPILER),gcc)
$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@

glue-gcc.o: ../../src/glue-gcc.c
	cp ../../src/glue-gcc.c glue-gcc.c
	$(CC) $(INCLUDES) -c glue-gcc.c -o $@
	rm -f glue-gcc.c

%.o: %.c
	$(CC) $(INCLUDES) -c $< -o $@
else ifeq ($(COMPILER),amiga-gcc)
# m68k-amiga-elf-gcc build for Amiga executable (ELF format)
export PATH := /opt/homebrew/opt/m68k-amiga-elf-gcc/bin:$(PATH)
$(TARGET): $(DOOR_SOURCES:.c=.o) glue-amiga.o
	m68k-amiga-elf-gcc $(DOOR_SOURCES:.c=.o) glue-amiga.o -o $@ -nostdlib -Wl,--entry=_start

glue-amiga.o: ../../src/glue-amiga.c
	cp ../../src/glue-amiga.c glue-amiga.c
	m68k-amiga-elf-gcc -D__AMIGA_CROSS__ -I../../includes/amiga -I../../includes -c glue-amiga.c -o $@
	rm -f glue-amiga.c

%.o: %.c
	m68k-amiga-elf-gcc -D__AMIGA_CROSS__ -I../../includes/amiga -I../../includes $< -c -o $@
endif

# Clean build artifacts
clean:
	rm -f *.o $(TARGET) glue-*.c

# Show build info
info:
	@echo "Building door: $(TARGET)"
	@echo "Compiler: $(COMPILER)"
	@echo "vbcc available: $(if $(VC),yes,no)"

# Phony targets
.PHONY: clean all info

# Default target
all: $(TARGET)