/* Simple linker script for m68k-amiga-elf-gcc */
OUTPUT_ARCH(m68k)
ENTRY(main)

SECTIONS {
    . = 0x00000000;

    .text : {
        *(.text)
        *(.text.*)
    }

    .data : {
        *(.data)
        *(.data.*)
    }

    .bss : {
        *(.bss)
        *(.bss.*)
        *(COMMON)
    }

    .rodata : {
        *(.rodata)
        *(.rodata.*)
    }
}