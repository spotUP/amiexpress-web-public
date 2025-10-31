import { MoiraEmulator } from '../cpu/MoiraEmulator';

/**
 * Amiga Hunk File Format Loader
 *
 * The Hunk format is the Amiga's native executable format.
 * It consists of various "hunk" types containing code, data, BSS, and relocations.
 *
 * Hunk Types:
 * - HUNK_HEADER (0x3F3): File header with segment info
 * - HUNK_CODE (0x3E9): Code segment
 * - HUNK_DATA (0x3EA): Initialized data segment
 * - HUNK_BSS (0x3EB): Uninitialized data segment
 * - HUNK_RELOC32 (0x3EC): 32-bit relocations
 * - HUNK_END (0x3F2): End of hunk
 *
 * Reference: http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_3._guide/node0239.html
 */

enum HunkType {
  HUNK_UNIT = 0x3E7,
  HUNK_NAME = 0x3E8,
  HUNK_CODE = 0x3E9,
  HUNK_DATA = 0x3EA,
  HUNK_BSS = 0x3EB,
  HUNK_RELOC32 = 0x3EC,
  HUNK_RELOC16 = 0x3ED,
  HUNK_RELOC8 = 0x3EE,
  HUNK_EXT = 0x3EF,
  HUNK_SYMBOL = 0x3F0,
  HUNK_DEBUG = 0x3F1,
  HUNK_END = 0x3F2,
  HUNK_HEADER = 0x3F3,
  HUNK_OVERLAY = 0x3F5,
  HUNK_BREAK = 0x3F6,
  HUNK_DREL32 = 0x3F7,
  HUNK_DREL16 = 0x3F8,
  HUNK_DREL8 = 0x3F9,
  HUNK_LIB = 0x3FA,
  HUNK_INDEX = 0x3FB,
  HUNK_RELOC32SHORT = 0x3FC,
  HUNK_RELRELOC32 = 0x3FD,
  HUNK_ABSRELOC16 = 0x3FE
}

export enum SegmentType {
  CODE = 'code',
  DATA = 'data',
  BSS = 'bss'
}

export interface HunkSegment {
  type: SegmentType;
  data: Uint8Array;
  address: number;
  size: number;
}

export interface Relocation {
  offset: number;        // Offset within segment
  targetSegment: number; // Target segment index
}

export interface HunkFile {
  segments: HunkSegment[];
  relocations: Map<number, Relocation[]>; // segment index -> relocations
  entryPoint: number;
}

export class HunkLoader {
  private buffer: Buffer;
  private position: number = 0;

  /**
   * Parse a Hunk file from buffer
   */
  parse(buffer: Buffer): HunkFile {
    this.buffer = buffer;
    this.position = 0;

    const segments: HunkSegment[] = [];
    const relocations = new Map<number, Relocation[]>();

    // Read and validate header
    const header = this.readHeader();
    console.log(`[HunkLoader] Found ${header.numSegments} segments`);

    // Allocate memory addresses for segments
    let currentAddress = 0x1000; // Start at 4KB
    const segmentAddresses: number[] = [];

    for (let i = 0; i < header.numSegments; i++) {
      segmentAddresses.push(currentAddress);
      console.log(`[HunkLoader] Segment ${i} will be placed at 0x${currentAddress.toString(16)} (size: ${header.segmentSizes[i] * 4} bytes)`);
      currentAddress += header.segmentSizes[i] * 4; // Sizes are in longwords
      currentAddress = (currentAddress + 0xFF) & ~0xFF; // Align to 256 bytes
    }

    // Read segments
    let segmentIndex = 0;
    while (this.position < this.buffer.length) {
      const rawHunkType = this.readLong();
      // Mask to get hunk type only (bits 0-29), ignoring memory flags (bits 30-31)
      const hunkType = rawHunkType & 0x3FFFFFFF;

      if (hunkType === HunkType.HUNK_END) {
        segmentIndex++;
        continue;
      }

      switch (hunkType) {
        case HunkType.HUNK_CODE:
        case HunkType.HUNK_DATA: {
          const size = this.readLong() * 4; // Size in longwords -> bytes
          const data = this.readBytes(size);

          // Use segments.length as the index (since we're about to push)
          // NOT segmentIndex (which only increments at HUNK_END)
          const currentSegmentIndex = segments.length;

          const segment: HunkSegment = {
            type: hunkType === HunkType.HUNK_CODE ? SegmentType.CODE : SegmentType.DATA,
            data: new Uint8Array(data),
            address: segmentAddresses[currentSegmentIndex],
            size: size
          };

          segments.push(segment);
          console.log(`[HunkLoader] ${segment.type.toUpperCase()} segment: ${size} bytes at 0x${segment.address.toString(16)}`);
          break;
        }

        case HunkType.HUNK_BSS: {
          const size = this.readLong() * 4; // Size in longwords -> bytes

          // Use segments.length as the index (since we're about to push)
          const currentSegmentIndex = segments.length;

          const segment: HunkSegment = {
            type: SegmentType.BSS,
            data: new Uint8Array(size), // Zero-filled
            address: segmentAddresses[currentSegmentIndex],
            size: size
          };

          segments.push(segment);
          console.log(`[HunkLoader] BSS segment: ${size} bytes at 0x${segment.address.toString(16)}`);
          break;
        }

        case HunkType.HUNK_RELOC32: {
          const relocs: Relocation[] = [];

          while (true) {
            const numOffsets = this.readLong();
            if (numOffsets === 0) break; // End of relocations

            const targetSegment = this.readLong();

            for (let i = 0; i < numOffsets; i++) {
              const offset = this.readLong();
              relocs.push({ offset, targetSegment });
            }
          }

          relocations.set(segmentIndex, relocs);
          console.log(`[HunkLoader] Found ${relocs.length} relocations for segment ${segmentIndex}`);
          break;
        }

        case HunkType.HUNK_SYMBOL:
        case HunkType.HUNK_DEBUG:
          // Skip these for now
          this.skipToEnd();
          break;

        default:
          // Unknown hunk type - likely reached end of valid hunks and reading data
          // Don't warn excessively, just stop parsing
          if (hunkType > 0x400 || hunkType < 0x3E7) {
            // This doesn't look like a valid hunk type, probably reached data section
            console.log(`[HunkLoader] Reached invalid hunk type 0x${hunkType.toString(16)}, stopping parse`);
            // Exit the while loop by setting position to end
            this.position = this.buffer.length;
            break;
          }
          console.warn(`[HunkLoader] Unknown hunk type: 0x${hunkType.toString(16)}`);
          break;
      }
    }

    // Entry point is typically the start of the first code segment
    const entryPoint = segments.find(s => s.type === SegmentType.CODE)?.address || 0x1000;

    return {
      segments,
      relocations,
      entryPoint
    };
  }

  /**
   * Load parsed Hunk file into emulator memory
   */
  load(emulator: MoiraEmulator, hunkFile: HunkFile): void {
    console.log('[HunkLoader] Loading segments into memory...');

    // Load all segments
    for (const segment of hunkFile.segments) {
      console.log(`[HunkLoader] Loading ${segment.type} segment at 0x${segment.address.toString(16)}, data.length=${segment.data.length}`);

      // DEBUG: Check if this segment contains the critical address 0x10f2
      const segmentEnd = segment.address + segment.data.length;
      const contains10f2 = (segment.address <= 0x10f2) && (segmentEnd > 0x10f2);
      console.log(`[HunkLoader]   Segment range: 0x${segment.address.toString(16)} - 0x${segmentEnd.toString(16)}, contains 0x10f2? ${contains10f2}`);

      if (contains10f2) {
        const offset = 0x10f2 - segment.address;
        const byte0 = segment.data[offset];
        const byte1 = segment.data[offset + 1];
        console.log(`[HunkLoader] *** This segment contains 0x10f2! ***`);
        console.log(`[HunkLoader]   Segment type: ${segment.type}`);
        console.log(`[HunkLoader]   Segment base: 0x${segment.address.toString(16)}`);
        console.log(`[HunkLoader]   Segment size: ${segment.data.length} bytes`);
        console.log(`[HunkLoader]   Offset in segment data: 0x${offset.toString(16)}`);
        console.log(`[HunkLoader]   Bytes in segment.data[${offset}/${offset+1}]: 0x${byte0.toString(16).padStart(2, '0')} 0x${byte1.toString(16).padStart(2, '0')}`);
        console.log(`[HunkLoader]   As word: 0x${((byte0 << 8) | byte1).toString(16).padStart(4, '0')}`);
        console.log(`[HunkLoader]   Expected: 0x670c (BEQ.S +12)`);
        if (((byte0 << 8) | byte1) !== 0x670c) {
          console.log(`[HunkLoader]   *** SEGMENT DATA IS ALREADY CORRUPTED! ***`);
        }
      }

      // Copy segment data to emulator memory
      for (let i = 0; i < segment.data.length; i++) {
        emulator.writeMemory(segment.address + i, segment.data[i]);
      }
    }

    // DEBUG: Check memory at critical address BEFORE relocations
    console.log('[HunkLoader] === MEMORY CHECK BEFORE RELOCATIONS ===');
    const check10f2_before = (emulator.readMemory(0x10f2) << 8) | emulator.readMemory(0x10f3);
    console.log(`[HunkLoader] Memory at 0x10f2 BEFORE relocations: 0x${check10f2_before.toString(16).padStart(4, '0')}`);
    console.log(`[HunkLoader] Expected: 0x670c (BEQ.S +12)`);
    if (check10f2_before !== 0x670c) {
      console.log(`[HunkLoader] *** ALREADY CORRUPTED BEFORE RELOCATIONS! ***`);
    }

    // Apply relocations
    for (const [segmentIndex, relocs] of hunkFile.relocations.entries()) {
      const segment = hunkFile.segments[segmentIndex];

      console.log(`[HunkLoader] Applying ${relocs.length} relocations to segment ${segmentIndex}`);

      for (const reloc of relocs) {
        // Validate target segment exists
        if (reloc.targetSegment >= hunkFile.segments.length) {
          console.warn(`[HunkLoader] Skipping invalid relocation: target segment ${reloc.targetSegment} doesn't exist (only ${hunkFile.segments.length} segments)`);
          continue;
        }

        const targetSegment = hunkFile.segments[reloc.targetSegment];
        const relocAddress = segment.address + reloc.offset;

        // CRITICAL: Check if this relocation affects the corrupted instruction at 0x10f2
        const isCriticalRange = relocAddress >= 0x10f0 && relocAddress <= 0x10f4;

        if (isCriticalRange) {
          console.log(`[HunkLoader] *** CRITICAL RELOCATION DETECTED ***`);
          console.log(`[HunkLoader]   Segment ${segmentIndex} (base 0x${segment.address.toString(16)})`);
          console.log(`[HunkLoader]   Relocation offset: 0x${reloc.offset.toString(16)}`);
          console.log(`[HunkLoader]   Absolute address: 0x${relocAddress.toString(16)}`);
          console.log(`[HunkLoader]   Target segment: ${reloc.targetSegment} (base 0x${targetSegment.address.toString(16)})`);
        }

        // Read the current value at the relocation point
        const byte0 = emulator.readMemory(relocAddress);
        const byte1 = emulator.readMemory(relocAddress + 1);
        const byte2 = emulator.readMemory(relocAddress + 2);
        const byte3 = emulator.readMemory(relocAddress + 3);

        const currentValue = (byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3;

        if (isCriticalRange) {
          console.log(`[HunkLoader]   BEFORE: Memory at 0x${relocAddress.toString(16)} = 0x${currentValue.toString(16).padStart(8, '0')}`);
          console.log(`[HunkLoader]   BEFORE: Bytes = ${byte0.toString(16).padStart(2, '0')} ${byte1.toString(16).padStart(2, '0')} ${byte2.toString(16).padStart(2, '0')} ${byte3.toString(16).padStart(2, '0')}`);
        }

        // Add the target segment's base address
        const newValue = currentValue + targetSegment.address;

        if (isCriticalRange) {
          console.log(`[HunkLoader]   AFTER:  New value = 0x${newValue.toString(16).padStart(8, '0')}`);
          console.log(`[HunkLoader]   This will OVERWRITE the BEQ instruction at 0x10f2!`);
        }

        // Write back the relocated address (big-endian)
        emulator.writeMemory(relocAddress, (newValue >> 24) & 0xFF);
        emulator.writeMemory(relocAddress + 1, (newValue >> 16) & 0xFF);
        emulator.writeMemory(relocAddress + 2, (newValue >> 8) & 0xFF);
        emulator.writeMemory(relocAddress + 3, newValue & 0xFF);

        if (isCriticalRange) {
          // Verify what was written
          const verify0 = emulator.readMemory(relocAddress);
          const verify1 = emulator.readMemory(relocAddress + 1);
          const verify2 = emulator.readMemory(relocAddress + 2);
          const verify3 = emulator.readMemory(relocAddress + 3);
          console.log(`[HunkLoader]   VERIFY: Bytes = ${verify0.toString(16).padStart(2, '0')} ${verify1.toString(16).padStart(2, '0')} ${verify2.toString(16).padStart(2, '0')} ${verify3.toString(16).padStart(2, '0')}`);
          console.log(`[HunkLoader] *** END CRITICAL RELOCATION ***`);
        }
      }
    }

    console.log(`[HunkLoader] Load complete. Entry point: 0x${hunkFile.entryPoint.toString(16)}`);
  }

  /**
   * Read Hunk header
   */
  private readHeader(): { numSegments: number; segmentSizes: number[] } {
    const hunkType = this.readLong();

    if (hunkType !== HunkType.HUNK_HEADER) {
      throw new Error(`Expected HUNK_HEADER (0x3F3), got 0x${hunkType.toString(16)}`);
    }

    // Skip resident library names (if any)
    while (true) {
      const nameLength = this.readLong();
      if (nameLength === 0) break;
      this.position += nameLength * 4; // Skip name
    }

    const numSegments = this.readLong();
    const firstSegment = this.readLong();
    const lastSegment = this.readLong();

    // Read segment sizes
    const segmentSizes: number[] = [];
    for (let i = firstSegment; i <= lastSegment; i++) {
      const size = this.readLong() & 0x3FFFFFFF; // Clear flags
      segmentSizes.push(size);
    }

    return { numSegments, segmentSizes };
  }

  /**
   * Read 32-bit big-endian long
   */
  private readLong(): number {
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  /**
   * Read bytes
   */
  private readBytes(length: number): Buffer {
    const bytes = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  /**
   * Skip to next HUNK_END
   */
  private skipToEnd(): void {
    while (this.position < this.buffer.length) {
      const hunkType = this.readLong();
      if (hunkType === HunkType.HUNK_END) {
        break;
      }
    }
  }
}
