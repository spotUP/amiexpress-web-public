/* Linker script for Amiga 68K executables */
/* Produces ELF that elf2hunk converts to Amiga HUNK format */

OUTPUT_FORMAT("elf32-m68k")
OUTPUT_ARCH(m68k)
ENTRY(_start)

SECTIONS
{
  /* Code section */
  .text 0x1000 : {
    *(.text .text.*)
    *(.rodata .rodata.*)
  }

  /* Data section */
  .data : {
    *(.data .data.*)
  }

  /* BSS section (uninitialized data) */
  .bss : {
    *(.bss .bss.*)
    *(COMMON)
  }

  /* Discard debug sections */
  /DISCARD/ : {
    *(.comment)
    *(.note)
    *(.debug*)
  }
}
