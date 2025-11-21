Title: Hunk File Format - Amiga Development

URL Source: http://amiga-dev.wikidot.com/file-format:hunk

Markdown Content:
Overview
--------

The Amiga executable file format.

Files
-----

There are two different types of files, load files and object files.

| Hunk file header blocks | Load file | Object file | Library file |
| --- | --- | --- | --- |
| HUNK_HEADER block. | X |  |  |
| HUNK_UNIT block. |  | X | X |

As of v31 of dos.library, note that any hunk blocks with ID values higher than HUNK_ABSRELOC16 (the highest value handled by it) are processed as HUNK_DEBUG blocks. An exception to this are blocks with IDs that have bit 29 set, if this is the case, loading fails.

Blocks
------

Files are composed of hunks, and hunks in turn are composed of blocks.

| Block | Load file | Object file |
| --- | --- | --- |
| Initial hunk block. | X | X |
| Relocatable block. | X | X |
| Relocation information block. | X | X |
| External symbol information block. |  | X |
| Symbol table block. | X | X |
| Debug block. | X | X |
| End block. | X | X |

Note that with the exception of the first hunk, HUNK_HEADER, only the lower 29 bits of the leading ID are used.

hunk_id = read_uint32(f)if hunk_id == HUNK_HEADER: ... hunk_id = read_uint32(f)hunk_id &= 0x3FFFFFFFif hunk_id == HUNK_NAME: ...

Data structures
---------------

Internal data structures
------------------------

### String

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of uint32s that compose the string. |
| uint32 * N |  | Each uint32 is composed of four characters, with the exception of the last uint32. Extra space at the end of the last uint32 is filled with the 0 byte. |

import struct def read_uchar(f): return struct.unpack("<B", f.read(1))[0] def read_uint16(f): return struct.unpack("<H", f.read(2))[0] def read_uint32(f): return struct.unpack("<I", f.read(4))[0] def read_string(f): num_longs = read_uint32(f) if num_longs < 1: return "" s = f.read(num_longs * 4) idx = s.find("\0") return s[:idx]

File header blocks
------------------

### HUNK_HEADER [0x3F3]

The hunk file header block used for load (executable) files.

| Datatype | Label | Description |
| --- | --- | --- |
| strings |  | A number of resident library names. This is simply one or more strings, one after the other. The last string in the list, which may also be the first, will simply be a zero size potentially indicating an empty list. Note: This is expected to be an empty list for load files, otherwise the file loading will error with ERROR_BAD_HUNK. |
| uint32 |  | Table size. The highest hunk number plus one. |
| uint32 | F | First hunk. The first hunk that should be used in loading. |
| uint32 | L | Last hunk. The last hunk that should be used in loading. |
| uint32 * (L-F+1) |  | A list of hunk sizes. |

def read_hunk_header(f): resident_library_names = [] while 1: s = read_string(f) if s == "": break resident_library_names.append(s) table_size = read_uint32(f) first_hunk_slot = read_uint32(f) last_hunk_slot = read_uint32(f) num_hunk_sizes = last_hunk_slot - first_hunk_slot + 1 hunk_sizes = [] for i in xrange(num_hunk_sizes): hunk_sizes.append(read_uint32(f))

The hunk size of each block is expected to indicate in its two highest bits which flags to pass to AllocMem. All hunk memory is implicitly allocated with the MEMF_PUBLIC flag.

| Bit 31 | Bit 30 | Description |
| --- | --- | --- |
| 0 | 0 | The hunk can be loaded into whatever memory is available, with a preference for fast memory. |
| 1 | 0 | The hunk should be loaded into fast memory or the process should fail. |
| 0 | 1 | The hunk should be loaded into chip memory or the process should fail. |
| 1 | 1 | Indicates an additional following longword containing the specific flags, of which bit 30 gets cleared before use. |

value = read_uint32(f)hunk_type = value & 0x3FFFFFFFmem_flags = value & 0xC0000000) >> 29if mem_flags == MEMF_CHIP | MEMF_FAST: mem_flags = read_uint32(f) & (1 << 30)mem_flags = mem_flags | MEMF_PUBLIC

### HUNK_UNIT [0x3E7]

If a load file starts with this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

Initial hunk blocks
-------------------

### HUNK_CODE [0x3E9]

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords of code. |
| uint32 * N |  | Machine code. |

def read_hunk_code(f): num_longwords = read_uint32(f) return f.read(num_longwords * 4)

### HUNK_DATA [0x3EA]

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords of data. |
| uint32 * N |  | Data. |

def read_hunk_data(f): num_longwords = read_uint32(f) return f.read(num_longwords * 4)

#### Notes

Data hunks have been observed with trailing ds.width variables present, but not contributing to the local hunk length. Presumably the OS loader takes this into account, allocating the extra space based on the load file header.

### HUNK_BSS [0x3EB]

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 |  | The number of longwords of zeroed memory to allocate. |

Relocation is not done within the block defined by this hunk, so it will not be followed by a reloc32 hunk.

Additional hunk blocks
----------------------

### HUNK_RELOC32 [0x3EC]

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of offsets for a given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint32 |  | The number of the hunk the offsets are to point into. |
| uint32 * N |  | Offsets in the current CODE or DATA hunk to relocate. |

A reloc32 block describes how the current hunk's data should be modified so that the addresses within it refer to the correct locations. This is done by adding the base address of the target hunk associated with each of the longword offsets.

 def read_hunk_reloc32(f): hunk_offsets = {} while 1: num_offsets = structures.read_uint32(f) if num_offsets == 0: break hunk_number = structures.read_uint32(f) l = [] for i in xrange(num_offsets): l.append(structures.read_uint32(f)) hunk_offsets.append((hunk_number, l)) return hunk_offsets def apply_reloc32_offsets(hunk_num, hunk_offsets): hunk_address = get_hunk_address(hunk_num) for target_hunk_num, offsets in hunk_offsets[hunk_num]: target_hunk_address = get_hunk_address(target_hunk_num) for offset in offsets: value = get_memory_longword(hunk_address, offset) set_memory_longword(hunk_address, target_hunk_address + value)

### HUNK_RELOC32SHORT [0x3FC]

| Datatype | Label | Description |
| --- | --- | --- |
| uint16 | N | The number of offsets for a given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint16 |  | The number of the hunk the offsets are to point into. |
| uint16 * N |  | Offsets in the current CODE or DATA hunk to relocate. |

A reloc32short block describes how the current hunk's data should be modified so that the addresses within it refer to the correct locations. This is done by adding the base address of the target hunk associated with each of the word-sized offsets.

 def read_hunk_reloc32short(f): hunk_offsets = {} while 1: num_offsets = structures.read_uint16(f) if num_offsets == 0: break hunk_number = structures.read_uint16(f) l = [] for i in xrange(num_offsets): l.append(structures.read_uint16(f)) hunk_offsets.append((hunk_number, l))  file_offset = f.tell() if file_offset & 2: structures.read_uint16(f) return hunk_offsets def apply_reloc32short_offsets(hunk_num, hunk_offsets): hunk_address = get_hunk_address(hunk_num) for target_hunk_num, offsets in hunk_offsets[hunk_num]: target_hunk_address = get_hunk_address(target_hunk_num) for offset in offsets: value = get_memory_longword(hunk_address, offset) set_memory_longword(hunk_address, target_hunk_address + value)

### HUNK_RELOC16 [0x3ED]

Reportedly used for linking. If a load file contains this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

### HUNK_RELOC8 [0x3EE]

Reportedly used for linking. If a load file contains this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

### HUNK_DREL32 [0x3F7]

This is handled exactly the same as HUNK_RELOC32SHORT.

### HUNK_DREL16 [0x3F8]

Not used in load files.

### HUNK_DREL8 [0x3F9]

Not used in load files.

### HUNK_ABSRELOC16 [0x3FD]

This is read from the load file the same way as HUNK_RELOC32SHORT and HUNK_DREL32. However its relocations are applied in the following way:

 def apply_absreloc32_offsets(hunk_num, hunk_offsets): hunk_address = get_hunk_address(hunk_num) for target_hunk_num, offsets in hunk_offsets[hunk_num]: target_hunk_address = get_hunk_address(target_hunk_num) for offset in offsets: value = get_memory_longword(hunk_address, offset) value = value - (hunk_address + offset) set_memory_longword(hunk_address, target_hunk_address + value)

### HUNK_SYMBOL [0x3F0]

| Datatype | Label | Description |
| --- | --- | --- |
| string |  | The name of the current symbol. A zero size indicates the immediate end of this block. |
| uint32 |  | The offset of the current symbol from the start of the hunk. |

def read_hunk_symbol(f): l = [] while 1: symbol_name = read_string(f) if symbol_name == "": break symbol_offset = read_uint32(f) l.append((symbol_name, symbol_offset)) return l

### HUNK_DEBUG [0x3F1]

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. If this value is zero, then it indicates the immediate end of this block. |

AmigaDOS expects only that this hunk specify the number of longwords N which make up this hunk. The actual contents of the remaining hunk depend on the application which created it.

#### "HCLN" - Devpac

When the Devpac line debug option is set to "compressed", the Hisoft Compressed Line Numbers (HCLN) format is used.

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint32 |  | The base offset within the source file. |
| char[4] |  | "HCLN" |
| string |  | The source file name. |
| uint8[M] |  | The table of line offsets within the local code, data or bss section. |

The following implementation works for basic situations. It is likely that there are variations on the compression scheme that are not yet covered, like the case where there are more lines between two lines of code than can be indicated in a byte.

Describing the packed line data results in psuedo-code, so it is best to consult the implementation.

def read_hunk_debug(f): num_longwords = read_uint32(f) debug_base = read_uint32(f) debug_id = f.read(4) if debug_id == "HCLN": num_name_longwords = read_uint32(f) f.seek(-4, os.SEEK_CUR) file_name = read_string(f) data_longwords = num_longwords - 3 - num_name_longwords if data_longwords: num_lines = read_uint32(f) line_info = [] line_number_sum = 0 file_offset_sum = debug_base while len(line_info) < num_lines: def _read_hcln_value(f): value = read_uchar(f) if value == 0: value = read_uint16(f) if value == 0: value = read_uint32(f) return value line_number_sum += _read_hcln_value(f) file_offset_sum += _read_hcln_value(f) line_info.append((line_number_sum, file_offset_sum))  if f.tell() & 2: f.seek(2, os.SEEK_CUR)

#### "HEAD" - Devpac

This is output by Devpac when a line debug option other than "None" is specified. While it differs when a debug symbol option other than "None" is also specified, it does not appear without the selection of a line debug option.

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint32 |  | The base offset within the source file. |
| char[4] |  | "HEAD" |
| char[8] |  | "DBGV01 " |
| uint8[M] |  | Unknown. |

Values of the unknown data for different selected options:

| Options | Hunk Value |
| --- | --- |
| Line Debug="Standard", Debug Symbols="None" | 0000000000000000000000010000000000000000aeafb0b1 |
| Line Debug="Compressed", Debug Symbols="None" | 0000000000000000000000010000000000000000aeafb0b1 |
| Line Debug="Compressed", Debug Symbols="All" | 000000000000000000000001000000000000000100000060b2b3b4b5 |
| Line Debug="Compressed", Debug Symbols="Exports" | 000000000000000000000001000000000000000100000060b2b3b4b5 |

#### "LINE" - Generic debug hunk format

This is the output of the SAS C debug=line option and is a simple index of which offset in the local code, data or bss section maps to which line within the given source file name. It is also supported by Basm, Dice C, Devpac, Powervisor and other programming tools.

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint32 |  | The base offset within the source file. |
| char[4] |  | "LINE" |
| string |  | The source file name. |
| line_info[M] |  | The table of line offsets within the local code, data or bss section. |

The structure of line_info is:

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 |  | Line number. |
| uint32 |  | Offset of line from base offset. |

M = ((N - 3) - number_of_string_longwords) / 2. Note that number_of_string_longwords is the first uint32 of the source file name entry. The 3 is accounted for by the base offset unint32, the four characters of the ID and the string length uint32 mentioned in the previous sentence.

def read_hunk_debug(f): num_longwords = read_uint32(f) base_file_offset = read_uint32(f) debug_id = f.read(4) if debug_id == "LINE": num_name_longwords = read_uint32(f) f.seek(-4, os.SEEK_CUR) file_name = read_string(f) loop_longwords = num_longwords - 3 - num_name_longwords line_info = [] while loop_longwords > 0: line_number = read_uint32(f) file_offset = read_uint32(f) line_info.append((line_number, base_file_offset + file_offset)) loop_longwords -= 2 return file_name, line_info raise RuntimeError("Unknown debug hunk format", debug_id)

#### "ODEF" - BAsm

This is the Barfly full source debug information option (-od+).

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. Will always be 3, representing the space for the following fields. |
| char[4] |  | "ODEF" |
| uint32 | nL | The number of line index information entries. |
| line_info[nL] |  | Line index information. |
| uint8[?] |  | Longword alignment bytes. |
| char[4] |  | "SDEF" |
| uint32 | nS | The number of bytes of source code. |
| uint32 |  | Unknown longword with expected value 0. |
| uint16 |  | Unknown word with expected value 0xFFFF. |
| char[nS-2] |  | The source code. |
| uint8[?] |  | Longword alignment bytes. |
| uint32 |  | Unknown longword with expected value 0. |

The structure of a line information entry is as follows:

| Datatype | Label | Description |
| --- | --- | --- |
| uint16 |  | Unknown word with expected value 0. |
| uint32 |  | The global offset within all joined SDEF chunks. |
| uint32 |  | The offset in the accompanying code, bss or data hunk. |

The purpose of the unknown values is .. unknown.

def read_hunk_debug(f): num_longwords = read_uint32(f) char_4 = f.read(4) if char_4 == "ODEF": num_lines = structures.read_uint32(f) line_info = [] while len(line_info) < num_lines: leading_uint16 = read_uint16(f) if leading_uint16 != 0: raise RuntimeError("Unexpected ODEF value", leading_uint16) sdef_offset = read_uint32(f) hunk_offset = read_uint32(f) line_info.append((sdef_offset, hunk_offset)) if f.tell() & 2:  f.seek(2, os.SEEK_CUR) char_4 = f.read(4) if char_4 != "SDEF": raise RuntimeError("Expected SDEF, got:", char_4) num_bytes = read_uint32(f) unknown1 = read_uint32(f) if unknown1 != 0: raise RuntimeError("Expected SDEF unknown1=0, got:", unknown1) unknown2 = read_uint16(f) if unknown2 != 0xFFFF: raise RuntimeError("Expected SDEF unknown2=0xFFFF, got:", unknown2)  source_chunk = f.read(num_bytes-2) if f.tell() & 2:  f.seek(2, os.SEEK_CUR) unknown3 = read_uint32(f) if unknown3 != 0: raise RuntimeError("Expected SDEF unknown3=0, got:", unknown3)

#### "OPTS" - SAS/C

Another SAS C debug hunk type. Both the action required to create this hunk and its meaning, are currently unknown.

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. Will always be 3, representing the space for the following fields. |
| uint32 |  | 0 |
| char[4] |  | "OPTS" |
| uint32 |  | An unknown value representing the recorded options. |

This hunk can be found in object files accompanying SAS C 6.5, for example "libinit.o", "devinit.o" and more.

#### ZMAGIC - GNU debug hunk

This is output by the [adtools](http://sourceforge.net/projects/adtools/) versions of the GNU development tools.

| Datatype | Label | Description |
| --- | --- | --- |
| uint32 | N | The number of longwords following in the given hunk. If this value is zero, then it indicates the immediate end of this block. |
| uint32 |  | ZMAGIC = 0413 = 267 |
| uint32 | Nsym | symtabsize |
| uint32 | Nstr | strtabsize |
| uint8[Nsym] |  | symtabdata (supposedly a.out format) |
| uint8[Nstr] |  | strtabdata (supposedly a.out format) |

### HUNK_END [0x3F2]

Additional hunk blocks (object files)
-------------------------------------

### HUNK_EXT [0x3EF]

If a load file contains this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

Additional hunk blocks (load files)
-----------------------------------

### HUNK_OVERLAY [0x3F5]

### HUNK_BREAK [0x3F6]

Additional hunk blocks (library files)
--------------------------------------

### HUNK_LIB [0x3FA]

If a load file contains this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

### HUNK_INDEX [0x3FB]

If a load file contains this hunk, loading will fail with a ERROR_BAD_HUNK IO error.

Other Information
-----------------

### Wiki References

*   [Operating System](http://amiga-dev.wikidot.com/information:operating-system)

### External Links

[Amiga_Hunk](http://en.wikipedia.org/wiki/Amiga_Hunk) - The Wikipedia entry for the Amiga executable file format.