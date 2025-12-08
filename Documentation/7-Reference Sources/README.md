# Reference Sources

This directory preserves raw reference source material that the AmiExpress-Web documentation depends on:

## Organized Documentation

- `implementation-notes/` - Detailed implementation guides (9,100+ lines)
- `research/` - Research documents and analysis (2,000+ lines)
- `reference/` - Reference materials and guides (4,500+ lines)
- `AMITOOLS_REFERENCE.md` - Guide to amitools (vamos, vda68k, hunktool, xdftool)

## Development Tools

- `amitools/` - Python-based Amiga development toolkit
  - `bin/vamos` - CRITICAL: Ground truth Amiga emulator for door validation
  - `bin/vda68k` - 68K disassembler
  - `bin/hunktool` - Executable analyzer
  - `bin/xdftool` - Disk image tool
- `radare2/` - Reverse engineering framework for 68K binary analysis

## AmigaOS Reference

- `AmiExpressDocs/` - Original AmiExpress/!X documentation
- `AmiExpress-Sources/` - express.e source code (CRITICAL reference)
- `NDK3.2R4/` - AmigaOS Network Development Kit documentation
  - `SANA+RoadshowTCP-IP/` - Network protocol specifications

## Real-World BBS Examples

- `reference-boardBBS/` - Complete vintage AmiExpress BBS backup (399MB, 4,385 files)
  - Real-world configuration example
  - Conference setup, message bases, file areas
  - Screens, doors, bulletins
  - GOLD MINE for understanding classic BBS operations

## Historical BBS Code

- `petscii-bbs-2.1/` - PETSCII-based BBS code with slideshows, screens, and utilities
- `python-cbm-petscii-bbs-main/` - Python proof-of-concept BBS harness with `.seq` art and helpers

## Emulator References

- `uade/` - The UADE emulator source tree showing how Amiga audio/graphics should behave
- `Doors_with_Source/` - Preserved door binaries that inspired the AquaScan/WHO investigations
- `vAmiga/` - The vAmiga emulator tree (Core, GUI, manual, and Objective-C proxy) providing context for Amiga graphical/CPU behavior

---

These archives are not rewritten or summarized; they are preserved verbatim to keep the AmiExpress-Web work 1:1 with its historical references.
