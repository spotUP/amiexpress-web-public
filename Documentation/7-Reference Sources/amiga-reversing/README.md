# Amiga Reversing Knowledge Bases

Source: https://github.com/rmtew/amiga-reversing by rmtew

Spec-driven knowledge bases extracted from official Amiga documentation:

- **M68K Programmer's Reference Manual** (Motorola, 1992)
- **Amiga Hardware Reference Manual** (Commodore)
- **NDK 3.1** (Commodore/Hyperion)

## Files

| File | Size | Description |
|------|------|-------------|
| `amiga_ndk_includes_parsed.json` | 4.0MB | NDK 3.1 structs, constants, library FD signatures |
| `amiga_ndk_other_parsed.json` | 975KB | Additional NDK parsed data |
| `amiga_hw_registers.json` | 237KB | All custom chip registers (Agnus, Denise, Paula, CIA) |
| `amiga_hw_reference.md` | 111KB | Hardware reference (human-readable) |
| `m68k_instructions.json` | 1.2MB | Complete M68K ISA (126 instructions, encodings, CC) |
| `m68k_reference.md` | 187KB | M68K instruction reference (human-readable) |
| `amiga_hunk_format.json` | 19KB | Formal hunk format spec with wire formats, LOADSEG citations |
| `amiga_hunk_format.md` | 6.2KB | Hunk format quick reference |
| `amiga_hunk_file.json` | 18KB | Hunk file parsing rules |
| `amiga-file-formats.md` | 24KB | Amiga file formats (hunks, IFF, ADF/OFS/FFS) |

## Usage

These files serve two purposes:

### 1. MCP Tools (primary)

Run `node mcp-server/build-indexes.js` to generate compact search indexes in
`mcp-server/data/`. The MCP server exposes three tools:

- `search_ndk_structs` -- Search structs, constants, library functions
- `search_hw_registers` -- Search Amiga custom chip registers
- `search_m68k_isa` -- Search M68K instruction set

### 2. Human Reference

The `.md` files can be read directly for reference:
- `amiga_hunk_format.md` -- Quick hunk format lookup
- `m68k_reference.md` -- Full M68K instruction descriptions
- `amiga_hw_reference.md` -- Hardware register descriptions
- `amiga-file-formats.md` -- File format specifications

## Provenance

All data is parsed from official Motorola, Commodore, and Hyperion documentation.
The amiga-reversing project uses these to generate disassemblers and analysis tools.
We use them as structured reference data for our 68K emulator and door debugging.

License: Knowledge bases contain factual technical data from public documentation.
The amiga-reversing toolchain is open source.
