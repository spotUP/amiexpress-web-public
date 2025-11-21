import { MoiraEmulator } from "../cpu/MoiraEmulator";

enum HunkType {
  HUNK_UNIT = 0x3e7,
  HUNK_NAME = 0x3e8,
  HUNK_CODE = 0x3e9,
  HUNK_DATA = 0x3ea,
  HUNK_BSS = 0x3eb,
  HUNK_RELOC32 = 0x3ec,
  HUNK_RELOC16 = 0x3ed,
  HUNK_RELOC8 = 0x3ee,
  HUNK_EXT = 0x3ef,
  HUNK_SYMBOL = 0x3f0,
  HUNK_DEBUG = 0x3f1,
  HUNK_END = 0x3f2,
  HUNK_HEADER = 0x3f3,
  HUNK_OVERLAY = 0x3f5,
  HUNK_BREAK = 0x3f6,
  HUNK_DREL32 = 0x3f7,
  HUNK_DREL16 = 0x3f8,
  HUNK_DREL8 = 0x3f9,
  HUNK_LIB = 0x3fa,
  HUNK_INDEX = 0x3fb,
  HUNK_RELOC32SHORT = 0x3fc,
  HUNK_RELRELOC32 = 0x3fd,
  HUNK_ABSRELOC16 = 0x3fe,
}

export enum SegmentType {
  CODE = "code",
  DATA = "data",
  BSS = "bss",
}

export interface HunkSegment {
  type: SegmentType;
  data: Uint8Array;
  address: number;
  size: number;
}

export interface Relocation {
  offset: number;
  targetSegment: number;
}

export interface HunkFile {
  segments: HunkSegment[];
  relocations: Map<number, Relocation[]>;
  entryPoint: number;
}

export class HunkLoader {
  private buffer!: Buffer;
  private position: number = 0;

  parse(buffer: Buffer): HunkFile {
    this.buffer = buffer;
    this.position = 0;

    const header = this.readHeader();
    const segmentAddresses = this.allocateSegmentAddresses(header.segmentSizes);
    const segments: HunkSegment[] = [];
    const relocations = new Map<number, Relocation[]>();
    let activeSegmentIndex = -1;

    while (this.position < this.buffer.length) {
      const rawType = this.readLong();
      const hunkType = rawType & 0x3fffffff;

      if (hunkType === HunkType.HUNK_END) {
        activeSegmentIndex = -1;
        continue;
      }

      switch (hunkType) {
        case HunkType.HUNK_CODE:
        case HunkType.HUNK_DATA: {
          activeSegmentIndex = segments.length;
          this.assertSegmentIndex(activeSegmentIndex, header.segmentSizes.length);
          const dataLongs = this.readLong();
          const dataSize = dataLongs * 4;
          const dataBuffer = this.readBytes(dataSize);
          const declaredSize = this.getSegmentSizeBytes(header.segmentSizes, activeSegmentIndex);
          const segmentData = new Uint8Array(declaredSize);
          segmentData.set(dataBuffer, 0);

          segments.push({
            type: hunkType === HunkType.HUNK_CODE ? SegmentType.CODE : SegmentType.DATA,
            data: segmentData,
            address: segmentAddresses[activeSegmentIndex],
            size: declaredSize,
          });
          break;
        }
        case HunkType.HUNK_BSS: {
          activeSegmentIndex = segments.length;
          this.assertSegmentIndex(activeSegmentIndex, header.segmentSizes.length);
          const bssLongs = this.readLong();
          const bssBytes = bssLongs * 4;
          const declaredSize = this.getSegmentSizeBytes(header.segmentSizes, activeSegmentIndex);

          segments.push({
            type: SegmentType.BSS,
            data: new Uint8Array(declaredSize),
            address: segmentAddresses[activeSegmentIndex],
            size: declaredSize,
          });

          if (bssBytes !== declaredSize) {
            console.warn(
              `[HunkLoader] BSS size mismatch for segment ${activeSegmentIndex}: header=${declaredSize} bytes, file=${bssBytes} bytes`
            );
          }
          break;
        }
        case HunkType.HUNK_RELOC32: {
          if (activeSegmentIndex < 0) {
            throw new Error("HUNK_RELOC32 block without an active segment");
          }

          const existingRelocs = relocations.get(activeSegmentIndex) ?? [];
          this.readRelocationBlock(existingRelocs);
          relocations.set(activeSegmentIndex, existingRelocs);
          break;
        }
        case HunkType.HUNK_SYMBOL:
        case HunkType.HUNK_DEBUG:
          this.skipToEnd();
          activeSegmentIndex = -1;
          break;
        default:
          console.warn(`[HunkLoader] Skipping unsupported hunk type 0x${hunkType.toString(16)}`);
          break;
      }
    }

    const entryPoint =
      segments.find((segment) => segment.type === SegmentType.CODE)?.address ||
      segmentAddresses[0] ||
      0x1000;

    return {
      segments,
      relocations,
      entryPoint,
    };
  }

  load(emulator: MoiraEmulator, hunkFile: HunkFile): void {
    for (const segment of hunkFile.segments) {
      for (let i = 0; i < segment.data.length; i++) {
        emulator.writeMemory(segment.address + i, segment.data[i]);
      }
    }

    this.applyRelocationsToMemory(emulator, hunkFile);
  }

  private applyRelocationsToMemory(emulator: MoiraEmulator, hunkFile: HunkFile): void {
    for (const [segmentIndex, relocs] of hunkFile.relocations.entries()) {
      const segment = hunkFile.segments[segmentIndex];
      if (!segment) {
        continue;
      }

      for (const reloc of relocs) {
        const targetSegment = hunkFile.segments[reloc.targetSegment];
        if (!targetSegment) {
          continue;
        }

        const offset = reloc.offset;
        if (offset < 0 || offset + 4 > segment.data.length) {
          throw new Error(
            `Relocation offset 0x${offset.toString(16)} is out of bounds for segment ${segmentIndex}`
          );
        }

        const address = segment.address + offset;
        const currentValue =
          (emulator.readMemory(address) << 24) |
          (emulator.readMemory(address + 1) << 16) |
          (emulator.readMemory(address + 2) << 8) |
          emulator.readMemory(address + 3);

        const relocatedValue = (currentValue + targetSegment.address) >>> 0;

        emulator.writeMemory(address, (relocatedValue >> 24) & 0xff);
        emulator.writeMemory(address + 1, (relocatedValue >> 16) & 0xff);
        emulator.writeMemory(address + 2, (relocatedValue >> 8) & 0xff);
        emulator.writeMemory(address + 3, relocatedValue & 0xff);
      }
    }
  }

  private readRelocationBlock(output: Relocation[]): void {
    while (true) {
      const numOffsets = this.readLong();
      if (numOffsets === 0) {
        break;
      }
      const targetSegment = this.readLong() & 0x3fffffff;
      for (let i = 0; i < numOffsets; i++) {
        const offset = this.readLong();
        output.push({
          offset,
          targetSegment,
        });
      }
    }
  }

  private readHeader(): { numSegments: number; segmentSizes: number[] } {
    const headerType = this.readLong();
    if (headerType !== HunkType.HUNK_HEADER) {
      throw new Error(`Expected HUNK_HEADER (0x3f3), got 0x${headerType.toString(16)}`);
    }

    while (true) {
      const nameLength = this.readLong();
      if (nameLength === 0) {
        break;
      }
      this.position += nameLength * 4;
    }

    const numSegments = this.readLong();
    const firstSegment = this.readLong();
    const lastSegment = this.readLong();
    const segmentSizes: number[] = [];

    for (let i = firstSegment; i <= lastSegment; i++) {
      const size = this.readLong() & 0x3fffffff;
      segmentSizes.push(size);
    }

    return {
      numSegments,
      segmentSizes,
    };
  }

  private allocateSegmentAddresses(segmentSizes: number[]): number[] {
    const addresses: number[] = [];
    let currentAddress = 0x1000;

    for (const sizeWords of segmentSizes) {
      addresses.push(currentAddress);
      const sizeBytes = sizeWords * 4;
      currentAddress += sizeBytes;
      currentAddress = this.align(currentAddress, 0x100);
    }

    return addresses;
  }

  private align(value: number, alignment: number): number {
    return (value + alignment - 1) & ~(alignment - 1);
  }

  private getSegmentSizeBytes(segmentSizes: number[], index: number): number {
    if (index < 0 || index >= segmentSizes.length) {
      throw new Error(`Segment index ${index} out of bounds (max ${segmentSizes.length - 1})`);
    }
    return segmentSizes[index] * 4;
  }

  private assertSegmentIndex(index: number, max: number): void {
    if (index >= max) {
      throw new Error(`Segment index ${index} exceeds header segment count ${max}`);
    }
  }

  private readLong(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new Error(`Unexpected end of buffer at position ${this.position}`);
    }
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  private readBytes(length: number): Buffer {
    if (this.position + length > this.buffer.length) {
      throw new Error(`Unexpected end of buffer while reading ${length} bytes`);
    }
    const slice = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return slice;
  }

  private skipToEnd(): void {
    while (this.position < this.buffer.length) {
      const hunkType = this.readLong() & 0x3fffffff;
      if (hunkType === HunkType.HUNK_END) {
        break;
      }
    }
  }
}
