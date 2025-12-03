import { MoiraEmulator } from "../cpu/MoiraEmulator";

/**
 * Amiga Hunk File Format Loader
 *
 * Production-ready implementation based on:
 * - http://amiga-dev.wikidot.com/file-format:hunk
 * - Commodore-Amiga Inc. "Amiga Binary File Structure" The AmigaDOS Manual
 *
 * Supports load files (executables) starting with HUNK_HEADER (0x3F3).
 * Object files (HUNK_UNIT) and library files are not supported.
 */

// Hunk type constants from official Amiga includes
enum HunkType {
  // Object file header (not valid in load files)
  HUNK_UNIT = 0x3e7,
  HUNK_NAME = 0x3e8,

  // Initial hunk blocks
  HUNK_CODE = 0x3e9,
  HUNK_DATA = 0x3ea,
  HUNK_BSS = 0x3eb,

  // Relocation information blocks
  HUNK_RELOC32 = 0x3ec,
  HUNK_RELOC16 = 0x3ed, // Not valid in load files
  HUNK_RELOC8 = 0x3ee, // Not valid in load files

  // External symbol information (not valid in load files)
  HUNK_EXT = 0x3ef,

  // Symbol and debug blocks
  HUNK_SYMBOL = 0x3f0,
  HUNK_DEBUG = 0x3f1,

  // End marker
  HUNK_END = 0x3f2,

  // Load file header
  HUNK_HEADER = 0x3f3,

  // Overlay hunks
  HUNK_OVERLAY = 0x3f5,
  HUNK_BREAK = 0x3f6,

  // Data-relative relocations
  HUNK_DREL32 = 0x3f7, // Handled same as RELOC32SHORT
  HUNK_DREL16 = 0x3f8, // Not used in load files
  HUNK_DREL8 = 0x3f9, // Not used in load files

  // Library hunks (not valid in load files)
  HUNK_LIB = 0x3fa,
  HUNK_INDEX = 0x3fb,

  // Short relocation format
  HUNK_RELOC32SHORT = 0x3fc,

  // PC-relative 32-bit relocation
  HUNK_RELRELOC32 = 0x3fd,

  // Absolute 16-bit relocation (using short format)
  HUNK_ABSRELOC16 = 0x3fe,

  // Extended Hunk Format (PowerPC) - not valid for 68K
  HUNK_PPC_CODE = 0x4e9,
  HUNK_RELRELOC26 = 0x4ec,
}

// Memory flags from hunk size (bits 30-31)
const MEMF_ANY = 0; // 00 - Any memory, prefer fast
const MEMF_FAST = 1; // 10 - Fast memory required
const MEMF_CHIP = 2; // 01 - Chip memory required
const MEMF_EXTENDED = 3; // 11 - Extended flags follow

export enum SegmentType {
  CODE = "code",
  DATA = "data",
  BSS = "bss",
}

export interface HunkSegment {
  type: SegmentType;
  data: Uint8Array;
  address: number; // Start of segment data/code (BPTR<<2 + 8)
  headerAddress: number; // Address of segment header (size/next)
  bptr: number; // BPTR to header (matches LoadSeg return)
  size: number; // Size in bytes
  memFlags: number; // Memory allocation flags
}

export interface Relocation {
  offset: number;
  targetSegment: number;
  isPcRelative?: boolean; // For HUNK_RELRELOC32
}

export interface HunkFile {
  segments: HunkSegment[];
  relocations: Map<number, Relocation[]>;
  entryPoint: number;
}

export class HunkLoaderError extends Error {
  constructor(
    message: string,
    public readonly code: string = "ERROR_BAD_HUNK"
  ) {
    super(message);
    this.name = "HunkLoaderError";
  }
}

export class HunkLoader {
  private buffer!: Buffer;
  private position: number = 0;

  /**
   * Parse an Amiga hunk executable file.
   * @param buffer The raw file buffer
   * @returns Parsed hunk file structure
   * @throws HunkLoaderError on invalid or unsupported hunks
   */
  parse(buffer: Buffer): HunkFile {
    this.buffer = buffer;
    this.position = 0;

    // Verify magic and read header
    const header = this.readHeader();
    const segmentAddresses = this.allocateSegmentAddresses(header.segmentSizes, header.memFlags);
    const segments: HunkSegment[] = [];
    const relocations = new Map<number, Relocation[]>();
    let activeSegmentIndex = -1;

    while (this.position < this.buffer.length) {
      const rawType = this.readLong();
      // Per docs: only lower 29 bits used (except for HUNK_HEADER)
      const hunkType = rawType & 0x3fffffff;

      // Check for bit 29 set (invalid)
      if (rawType & 0x20000000) {
        throw new HunkLoaderError(
          `Invalid hunk ID with bit 29 set: 0x${rawType.toString(16)}`,
          "ERROR_BAD_HUNK"
        );
      }

      switch (hunkType) {
        case HunkType.HUNK_END:
          activeSegmentIndex = -1;
          continue;

        case HunkType.HUNK_NAME: {
          // Hunk name - optional name for the following hunk
          // Format: longword count + name characters (padded to longword)
          const nameLength = this.readLong();
          if (nameLength > 0) {
            this.position += (nameLength & 0xffffff) * 4;
          }
          break;
        }

        case HunkType.HUNK_CODE:
        case HunkType.HUNK_DATA: {
          activeSegmentIndex = segments.length;
          this.assertSegmentIndex(activeSegmentIndex, header.segmentSizes.length);

          const dataLongs = this.readLong();
          const dataSize = dataLongs * 4;
          const dataBuffer = this.readBytes(dataSize);
          const declaredSize = header.segmentSizes[activeSegmentIndex] * 4;

          // Allocate full declared size (may be larger than data for trailing BSS)
          const segmentData = new Uint8Array(declaredSize);
          segmentData.set(dataBuffer, 0);

          segments.push({
            type: hunkType === HunkType.HUNK_CODE ? SegmentType.CODE : SegmentType.DATA,
            data: segmentData,
            address: segmentAddresses[activeSegmentIndex].dataAddress,
            headerAddress: segmentAddresses[activeSegmentIndex].headerAddress,
            bptr: segmentAddresses[activeSegmentIndex].bptr,
            size: declaredSize,
            memFlags: header.memFlags[activeSegmentIndex],
          });
          break;
        }

        case HunkType.HUNK_BSS: {
          activeSegmentIndex = segments.length;
          this.assertSegmentIndex(activeSegmentIndex, header.segmentSizes.length);

          const bssLongs = this.readLong();
          const declaredSize = header.segmentSizes[activeSegmentIndex] * 4;

          // BSS is zero-initialized memory
          segments.push({
            type: SegmentType.BSS,
            data: new Uint8Array(declaredSize), // Already zeroed
            address: segmentAddresses[activeSegmentIndex].dataAddress,
            headerAddress: segmentAddresses[activeSegmentIndex].headerAddress,
            bptr: segmentAddresses[activeSegmentIndex].bptr,
            size: declaredSize,
            memFlags: header.memFlags[activeSegmentIndex],
          });

          if (bssLongs * 4 !== declaredSize) {
            console.warn(
              `[HunkLoader] BSS size mismatch for segment ${activeSegmentIndex}: ` +
              `header=${declaredSize} bytes, hunk=${bssLongs * 4} bytes`
            );
          }
          break;
        }

        case HunkType.HUNK_RELOC32: {
          if (activeSegmentIndex < 0) {
            throw new HunkLoaderError("HUNK_RELOC32 without active segment");
          }
          const relocs = relocations.get(activeSegmentIndex) ?? [];
          this.readReloc32Block(relocs);
          relocations.set(activeSegmentIndex, relocs);
          break;
        }

        case HunkType.HUNK_RELOC32SHORT:
        case HunkType.HUNK_DREL32: {
          // HUNK_DREL32 is handled exactly the same as HUNK_RELOC32SHORT
          if (activeSegmentIndex < 0) {
            throw new HunkLoaderError(`HUNK_${hunkType === HunkType.HUNK_DREL32 ? 'DREL32' : 'RELOC32SHORT'} without active segment`);
          }
          const relocs = relocations.get(activeSegmentIndex) ?? [];
          this.readReloc32ShortBlock(relocs);
          relocations.set(activeSegmentIndex, relocs);
          break;
        }

        case HunkType.HUNK_RELRELOC32: {
          // PC-relative 32-bit relocation (uses short format like RELOC32SHORT)
          // The stored value is offset from current PC to target
          // After relocation: value = targetSegmentBase + storedValue - currentAddress
          if (activeSegmentIndex < 0) {
            throw new HunkLoaderError("HUNK_RELRELOC32 without active segment");
          }
          const relocs = relocations.get(activeSegmentIndex) ?? [];
          this.readReloc32ShortBlock(relocs, true); // Mark as PC-relative
          relocations.set(activeSegmentIndex, relocs);
          break;
        }

        case HunkType.HUNK_ABSRELOC16: {
          // Absolute 16-bit relocation (uses short format)
          // Stores 16-bit absolute addresses that get relocated
          if (activeSegmentIndex < 0) {
            throw new HunkLoaderError("HUNK_ABSRELOC16 without active segment");
          }
          console.warn("[HunkLoader] HUNK_ABSRELOC16 found - using standard relocation semantics");
          const relocs = relocations.get(activeSegmentIndex) ?? [];
          this.readReloc32ShortBlock(relocs);
          relocations.set(activeSegmentIndex, relocs);
          break;
        }

        case HunkType.HUNK_SYMBOL: {
          // Symbol table: string + offset pairs until empty string
          this.skipSymbolBlock();
          break;
        }

        case HunkType.HUNK_DEBUG: {
          // Debug info: longword count + data
          this.skipDebugBlock();
          break;
        }

        case HunkType.HUNK_OVERLAY:
        case HunkType.HUNK_BREAK: {
          // Overlay hunks are rare but valid - skip them
          console.warn(`[HunkLoader] Skipping HUNK_${hunkType === HunkType.HUNK_OVERLAY ? 'OVERLAY' : 'BREAK'}`);
          this.skipOverlayBlock(hunkType);
          break;
        }

        // Invalid hunks in load files
        case HunkType.HUNK_UNIT:
        case HunkType.HUNK_EXT:
        case HunkType.HUNK_LIB:
        case HunkType.HUNK_INDEX:
          throw new HunkLoaderError(
            `HUNK_${this.getHunkName(hunkType)} is not valid in load files`,
            "ERROR_BAD_HUNK"
          );

        case HunkType.HUNK_RELOC16:
        case HunkType.HUNK_RELOC8:
        case HunkType.HUNK_DREL16:
        case HunkType.HUNK_DREL8:
          throw new HunkLoaderError(
            `HUNK_${this.getHunkName(hunkType)} is for linking only, not valid in load files`,
            "ERROR_BAD_HUNK"
          );

        // Extended Hunk Format (PowerPC) - not supported in 68K emulator
        case HunkType.HUNK_PPC_CODE:
        case HunkType.HUNK_RELRELOC26:
          throw new HunkLoaderError(
            `PowerPC hunk (${hunkType === HunkType.HUNK_PPC_CODE ? 'HUNK_PPC_CODE' : 'HUNK_RELRELOC26'}) not supported - 68K emulator only`,
            "ERROR_BAD_HUNK"
          );

        default:
          // Per AmigaDOS v31+: unknown hunks > HUNK_ABSRELOC16 treated as debug
          if (hunkType > HunkType.HUNK_ABSRELOC16) {
            console.warn(`[HunkLoader] Unknown hunk 0x${hunkType.toString(16)} treated as debug block`);
            this.skipDebugBlock();
          } else {
            throw new HunkLoaderError(`Unknown hunk type 0x${hunkType.toString(16)}`);
          }
          break;
      }
    }

    // Entry point is start of first CODE segment
    const entryPoint =
      segments.find((seg) => seg.type === SegmentType.CODE)?.address ||
      segmentAddresses[0]?.dataAddress ||
      0x1000;

    return { segments, relocations, entryPoint };
  }

  /**
   * Load parsed hunks into emulator memory.
   */
  load(emulator: MoiraEmulator, hunkFile: HunkFile): void {
    // Write segments with DOS LoadSeg header format:
    // [size in longwords][BPTR to next segment], then data
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const segment = hunkFile.segments[i];
      const next = hunkFile.segments[i + 1];

      const sizeLongs = segment.size >>> 2;
      const nextBptr = next ? next.bptr : 0;

      emulator.writeMemory32(segment.headerAddress, sizeLongs);
      emulator.writeMemory32(segment.headerAddress + 4, nextBptr);

      for (let j = 0; j < segment.data.length; j++) {
        emulator.writeMemory(segment.address + j, segment.data[j]);
      }
    }

    this.applyRelocations(emulator, hunkFile);
  }

  /**
   * Apply all relocations to loaded segments.
   */
  private applyRelocations(emulator: MoiraEmulator, hunkFile: HunkFile): void {
    let totalRelocs = 0;
    for (const relocs of hunkFile.relocations.values()) {
      totalRelocs += relocs.length;
    }
    console.log(`[HunkLoader] Applying ${totalRelocs} relocations to ${hunkFile.relocations.size} segments`);

    for (const [segmentIndex, relocs] of hunkFile.relocations.entries()) {
      const segment = hunkFile.segments[segmentIndex];
      if (!segment) continue;

      console.log(
        `[HunkLoader] Segment ${segmentIndex} (${segment.type.toUpperCase()}) ` +
        `at 0x${segment.address.toString(16)}: ${relocs.length} relocations`
      );

      for (let i = 0; i < relocs.length; i++) {
        const reloc = relocs[i];
        const targetSegment = hunkFile.segments[reloc.targetSegment];
        if (!targetSegment) {
          console.warn(`[HunkLoader] Relocation target segment ${reloc.targetSegment} not found`);
          continue;
        }

        const offset = reloc.offset;
        if (offset < 0 || offset + 4 > segment.size) {
          throw new HunkLoaderError(
            `Relocation offset 0x${offset.toString(16)} out of bounds ` +
            `(segment size: 0x${segment.size.toString(16)})`
          );
        }

        const address = segment.address + offset;
        const currentValue = emulator.readMemory32(address);

        let relocatedValue: number;
        if (reloc.isPcRelative) {
          // PC-relative: value = targetBase + storedOffset - currentAddress
          // The stored value is already the offset from PC to target within the segment
          relocatedValue = (targetSegment.address + currentValue - address) >>> 0;
        } else {
          // Absolute: value = storedOffset + targetBase
          relocatedValue = (currentValue + targetSegment.address) >>> 0;
        }

        // Log first few relocations for debugging
        if (i < 5) {
          console.log(
            `  [${i}] offset=0x${offset.toString(16)} addr=0x${address.toString(16)} ` +
            `before=0x${currentValue.toString(16)} after=0x${relocatedValue.toString(16)} ` +
            `target=seg${reloc.targetSegment}(0x${targetSegment.address.toString(16)})` +
            (reloc.isPcRelative ? ' [PC-REL]' : '')
          );
        }

        emulator.writeMemory32(address, relocatedValue);
      }
    }
  }

  /**
   * Read HUNK_HEADER and validate file structure.
   */
  private readHeader(): {
    numSegments: number;
    segmentSizes: number[];
    memFlags: number[];
  } {
    const headerType = this.readLong();
    if (headerType !== HunkType.HUNK_HEADER) {
      throw new HunkLoaderError(
        `Not a valid load file: expected HUNK_HEADER (0x3f3), got 0x${headerType.toString(16)}`
      );
    }

    // Skip resident library names (should be empty for load files)
    while (true) {
      const nameLength = this.readLong();
      if (nameLength === 0) break;
      // Non-empty names are an error for load files
      if (nameLength & 0xffffff) {
        throw new HunkLoaderError(
          "Resident library names not allowed in load files",
          "ERROR_BAD_HUNK"
        );
      }
      this.position += (nameLength & 0xffffff) * 4;
    }

    const tableSize = this.readLong(); // Highest hunk number + 1
    const firstHunk = this.readLong();
    const lastHunk = this.readLong();

    if (firstHunk > lastHunk || lastHunk >= tableSize) {
      throw new HunkLoaderError(
        `Invalid hunk range: first=${firstHunk}, last=${lastHunk}, table=${tableSize}`
      );
    }

    const segmentSizes: number[] = [];
    const memFlags: number[] = [];

    for (let i = firstHunk; i <= lastHunk; i++) {
      const sizeWord = this.readLong();
      const flags = (sizeWord >>> 30) & 0x3;
      let size = sizeWord & 0x3fffffff;

      let memFlag = flags;
      if (flags === MEMF_EXTENDED) {
        // Extended flags: next longword contains actual flags (with bit 30 cleared)
        memFlag = this.readLong() & ~(1 << 30);
      }

      segmentSizes.push(size);
      memFlags.push(memFlag);
    }

    return { numSegments: tableSize, segmentSizes, memFlags };
  }

  /**
   * Read HUNK_RELOC32 block (32-bit offsets).
   */
  private readReloc32Block(output: Relocation[]): void {
    while (true) {
      const numOffsets = this.readLong();
      if (numOffsets === 0) break;

      const targetSegment = this.readLong();
      for (let i = 0; i < numOffsets; i++) {
        output.push({
          offset: this.readLong(),
          targetSegment,
        });
      }
    }
  }

  /**
   * Read HUNK_RELOC32SHORT, HUNK_DREL32, or HUNK_RELRELOC32 block (16-bit offsets).
   */
  private readReloc32ShortBlock(output: Relocation[], isPcRelative: boolean = false): void {
    while (true) {
      const numOffsets = this.readU16();
      if (numOffsets === 0) {
        // Ensure longword alignment after terminator
        if (this.position & 2) {
          this.position += 2;
        }
        break;
      }

      const targetSegment = this.readU16();
      for (let i = 0; i < numOffsets; i++) {
        output.push({
          offset: this.readU16(),
          targetSegment,
          isPcRelative,
        });
      }
    }
    // Final alignment check
    if (this.position & 2) {
      this.position += 2;
    }
  }

  /**
   * Skip HUNK_SYMBOL block.
   */
  private skipSymbolBlock(): void {
    while (true) {
      const nameLength = this.readLong();
      if (nameLength === 0) break;
      // Skip name (nameLength longwords) + offset (1 longword)
      this.position += (nameLength & 0xffffff) * 4 + 4;
    }
  }

  /**
   * Skip HUNK_DEBUG block.
   */
  private skipDebugBlock(): void {
    const numLongs = this.readLong();
    this.position += numLongs * 4;
  }

  /**
   * Skip overlay hunks.
   */
  private skipOverlayBlock(type: HunkType): void {
    if (type === HunkType.HUNK_OVERLAY) {
      const tableSize = this.readLong();
      this.position += tableSize * 4;
      // Skip overlay data longword
      this.readLong();
    }
    // HUNK_BREAK has no data
  }

  /**
   * Allocate segment addresses in emulator memory.
   */
  private allocateSegmentAddresses(
    segmentSizes: number[],
    memFlags: number[]
  ): { headerAddress: number; dataAddress: number; bptr: number }[] {
    const addresses: { headerAddress: number; dataAddress: number; bptr: number }[] = [];
    let currentAddress = 0x1000; // Start after exception vectors

    for (let i = 0; i < segmentSizes.length; i++) {
      const sizeBytes = segmentSizes[i] * 4;
      const headerAddress = currentAddress;
      const dataAddress = headerAddress + 8; // Skip size + next BPTR
      const bptr = headerAddress >>> 2;

      addresses.push({ headerAddress, dataAddress, bptr });

      // Advance to next segment, aligned to 256 bytes
      currentAddress += sizeBytes + 8;
      currentAddress = (currentAddress + 0xff) & ~0xff;
    }

    return addresses;
  }

  private assertSegmentIndex(index: number, max: number): void {
    if (index >= max) {
      throw new HunkLoaderError(
        `Segment index ${index} exceeds header count ${max}`
      );
    }
  }

  private getHunkName(type: HunkType): string {
    const names: Record<number, string> = {
      [HunkType.HUNK_UNIT]: "UNIT",
      [HunkType.HUNK_NAME]: "NAME",
      [HunkType.HUNK_CODE]: "CODE",
      [HunkType.HUNK_DATA]: "DATA",
      [HunkType.HUNK_BSS]: "BSS",
      [HunkType.HUNK_RELOC32]: "RELOC32",
      [HunkType.HUNK_RELOC16]: "RELOC16",
      [HunkType.HUNK_RELOC8]: "RELOC8",
      [HunkType.HUNK_EXT]: "EXT",
      [HunkType.HUNK_SYMBOL]: "SYMBOL",
      [HunkType.HUNK_DEBUG]: "DEBUG",
      [HunkType.HUNK_END]: "END",
      [HunkType.HUNK_HEADER]: "HEADER",
      [HunkType.HUNK_OVERLAY]: "OVERLAY",
      [HunkType.HUNK_BREAK]: "BREAK",
      [HunkType.HUNK_DREL32]: "DREL32",
      [HunkType.HUNK_DREL16]: "DREL16",
      [HunkType.HUNK_DREL8]: "DREL8",
      [HunkType.HUNK_LIB]: "LIB",
      [HunkType.HUNK_INDEX]: "INDEX",
      [HunkType.HUNK_RELOC32SHORT]: "RELOC32SHORT",
      [HunkType.HUNK_RELRELOC32]: "RELRELOC32",
      [HunkType.HUNK_ABSRELOC16]: "ABSRELOC16",
      [HunkType.HUNK_PPC_CODE]: "PPC_CODE",
      [HunkType.HUNK_RELRELOC26]: "RELRELOC26",
    };
    return names[type] || `0x${type.toString(16)}`;
  }

  private readLong(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new HunkLoaderError("Unexpected end of file");
    }
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  private readU16(): number {
    if (this.position + 2 > this.buffer.length) {
      throw new HunkLoaderError("Unexpected end of file");
    }
    const value = this.buffer.readUInt16BE(this.position);
    this.position += 2;
    return value;
  }

  private readBytes(length: number): Buffer {
    if (this.position + length > this.buffer.length) {
      throw new HunkLoaderError("Unexpected end of file");
    }
    const slice = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return slice;
  }
}
