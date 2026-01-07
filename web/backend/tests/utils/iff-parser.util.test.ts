/**
 * Unit tests for iff-parser.util.ts
 * Tests IFF (Interchange File Format) parsing for Amiga files
 *
 * IFF is the Amiga's standard file format, used for icons (.info),
 * images (ILBM), sounds (8SVX), and other data structures.
 *
 * Format: FORM container with chunks (each has 4-byte ID + 4-byte size + data)
 * Chunks are word-aligned (padded to even byte boundaries)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseIFFFile,
  getChunkData,
  getChunks,
  writeIFFFile,
  createChunk,
  readBE32,
  writeBE32,
  readBE16,
  writeBE16,
} from '../../src/utils/iff-parser.util';

describe('IFF Parser Utility (Amiga IFF Format)', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iff-test-'));
    testFile = path.join(testDir, 'test.iff');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Big-endian I/O (Amiga byte order)', () => {
    describe('readBE32', () => {
      it('should read 32-bit big-endian integer', () => {
        const buffer = Buffer.from([0x12, 0x34, 0x56, 0x78]);
        expect(readBE32(buffer, 0)).toBe(0x12345678);
      });

      it('should read from offset', () => {
        const buffer = Buffer.from([0x00, 0x00, 0xAB, 0xCD, 0xEF, 0x01]);
        expect(readBE32(buffer, 2)).toBe(0xABCDEF01);
      });

      it('should handle zero value', () => {
        const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
        expect(readBE32(buffer, 0)).toBe(0);
      });

      it('should handle max value', () => {
        const buffer = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
        expect(readBE32(buffer, 0)).toBe(0xFFFFFFFF);
      });
    });

    describe('writeBE32', () => {
      it('should write 32-bit big-endian integer', () => {
        const buffer = Buffer.alloc(4);
        writeBE32(buffer, 0, 0x12345678);
        expect(buffer).toEqual(Buffer.from([0x12, 0x34, 0x56, 0x78]));
      });

      it('should write at offset', () => {
        const buffer = Buffer.alloc(6);
        writeBE32(buffer, 2, 0xABCDEF01);
        expect(buffer[2]).toBe(0xAB);
        expect(buffer[3]).toBe(0xCD);
        expect(buffer[4]).toBe(0xEF);
        expect(buffer[5]).toBe(0x01);
      });

      it('should handle zero value', () => {
        const buffer = Buffer.alloc(4);
        writeBE32(buffer, 0, 0);
        expect(buffer).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00]));
      });

      it('should handle max value', () => {
        const buffer = Buffer.alloc(4);
        writeBE32(buffer, 0, 0xFFFFFFFF);
        expect(buffer).toEqual(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      });
    });

    describe('readBE16', () => {
      it('should read 16-bit big-endian integer', () => {
        const buffer = Buffer.from([0x12, 0x34]);
        expect(readBE16(buffer, 0)).toBe(0x1234);
      });

      it('should read from offset', () => {
        const buffer = Buffer.from([0x00, 0x00, 0xAB, 0xCD]);
        expect(readBE16(buffer, 2)).toBe(0xABCD);
      });

      it('should handle zero value', () => {
        const buffer = Buffer.from([0x00, 0x00]);
        expect(readBE16(buffer, 0)).toBe(0);
      });

      it('should handle max value', () => {
        const buffer = Buffer.from([0xFF, 0xFF]);
        expect(readBE16(buffer, 0)).toBe(0xFFFF);
      });
    });

    describe('writeBE16', () => {
      it('should write 16-bit big-endian integer', () => {
        const buffer = Buffer.alloc(2);
        writeBE16(buffer, 0, 0x1234);
        expect(buffer).toEqual(Buffer.from([0x12, 0x34]));
      });

      it('should write at offset', () => {
        const buffer = Buffer.alloc(4);
        writeBE16(buffer, 2, 0xABCD);
        expect(buffer[2]).toBe(0xAB);
        expect(buffer[3]).toBe(0xCD);
      });

      it('should handle zero value', () => {
        const buffer = Buffer.alloc(2);
        writeBE16(buffer, 0, 0);
        expect(buffer).toEqual(Buffer.from([0x00, 0x00]));
      });

      it('should handle max value', () => {
        const buffer = Buffer.alloc(2);
        writeBE16(buffer, 0, 0xFFFF);
        expect(buffer).toEqual(Buffer.from([0xFF, 0xFF]));
      });
    });

    describe('read/write round-trip', () => {
      it('should round-trip 32-bit values', () => {
        const buffer = Buffer.alloc(4);
        const value = 0x12345678;
        writeBE32(buffer, 0, value);
        expect(readBE32(buffer, 0)).toBe(value);
      });

      it('should round-trip 16-bit values', () => {
        const buffer = Buffer.alloc(2);
        const value = 0x1234;
        writeBE16(buffer, 0, value);
        expect(readBE16(buffer, 0)).toBe(value);
      });
    });
  });

  describe('createChunk', () => {
    it('should create chunk with even-sized data', () => {
      const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const chunk = createChunk('TEST', data);

      // Check header
      expect(chunk.toString('ascii', 0, 4)).toBe('TEST');
      expect(readBE32(chunk, 4)).toBe(4);

      // Check data
      expect(chunk.slice(8, 12)).toEqual(data);

      // Total size: 8 (header) + 4 (data) = 12
      expect(chunk.length).toBe(12);
    });

    it('should create chunk with odd-sized data and padding', () => {
      const data = Buffer.from([0x01, 0x02, 0x03]);
      const chunk = createChunk('TEST', data);

      // Check header
      expect(chunk.toString('ascii', 0, 4)).toBe('TEST');
      expect(readBE32(chunk, 4)).toBe(3);

      // Check data
      expect(chunk.slice(8, 11)).toEqual(data);

      // Check padding byte
      expect(chunk[11]).toBe(0x00);

      // Total size: 8 (header) + 3 (data) + 1 (pad) = 12
      expect(chunk.length).toBe(12);
    });

    it('should create chunk with empty data', () => {
      const data = Buffer.alloc(0);
      const chunk = createChunk('ZERO', data);

      expect(chunk.toString('ascii', 0, 4)).toBe('ZERO');
      expect(readBE32(chunk, 4)).toBe(0);
      expect(chunk.length).toBe(8);
    });

    it('should handle various chunk IDs', () => {
      const data = Buffer.from([0x01]);

      expect(createChunk('FORM', data).toString('ascii', 0, 4)).toBe('FORM');
      expect(createChunk('ILBM', data).toString('ascii', 0, 4)).toBe('ILBM');
      expect(createChunk('BMHD', data).toString('ascii', 0, 4)).toBe('BMHD');
      expect(createChunk('CMAP', data).toString('ascii', 0, 4)).toBe('CMAP');
    });

    it('should handle single-byte data with padding', () => {
      const data = Buffer.from([0xFF]);
      const chunk = createChunk('BYTE', data);

      expect(readBE32(chunk, 4)).toBe(1);
      expect(chunk[8]).toBe(0xFF);
      expect(chunk[9]).toBe(0x00); // Padding
      expect(chunk.length).toBe(10);
    });

    it('should handle large data', () => {
      const data = Buffer.alloc(1000, 0xAB);
      const chunk = createChunk('HUGE', data);

      expect(readBE32(chunk, 4)).toBe(1000);
      expect(chunk.slice(8, 1008)).toEqual(data);
      expect(chunk.length).toBe(1008); // 8 + 1000 (no padding, even size)
    });
  });

  describe('parseIFFFile', () => {
    it('should parse file with single chunk', () => {
      const chunk = createChunk('TEST', Buffer.from([0x01, 0x02, 0x03, 0x04]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].id).toBe('TEST');
      expect(iff.chunks[0].size).toBe(4);
      expect(iff.chunks[0].offset).toBe(8);
    });

    it('should parse file with multiple chunks', () => {
      const chunk1 = createChunk('CHK1', Buffer.from([0x01, 0x02]));
      const chunk2 = createChunk('CHK2', Buffer.from([0x03, 0x04, 0x05]));
      const chunk3 = createChunk('CHK3', Buffer.from([0x06]));
      const combined = Buffer.concat([chunk1, chunk2, chunk3]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(3);
      expect(iff.chunks[0].id).toBe('CHK1');
      expect(iff.chunks[1].id).toBe('CHK2');
      expect(iff.chunks[2].id).toBe('CHK3');
    });

    it('should handle chunks with padding correctly', () => {
      // Odd-sized chunk (3 bytes) + padding = 4 bytes aligned
      const chunk = createChunk('ODD ', Buffer.from([0x01, 0x02, 0x03]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].size).toBe(3); // Size doesn't include padding
      expect(iff.chunks[0].offset).toBe(8);
    });

    it('should parse empty IFF file', () => {
      fs.writeFileSync(testFile, Buffer.alloc(0));

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(0);
    });

    it('should parse IFF file with zero-length chunks', () => {
      const chunk = createChunk('EMPT', Buffer.alloc(0));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].size).toBe(0);
    });

    it('should store buffer reference', () => {
      const chunk = createChunk('DATA', Buffer.from([0xAB, 0xCD]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.buffer).toBeInstanceOf(Buffer);
      expect(iff.buffer.length).toBeGreaterThan(0);
    });
  });

  describe('getChunkData', () => {
    it('should retrieve chunk data by ID', () => {
      const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const chunk = createChunk('DATA', data);
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const retrieved = getChunkData(iff, 'DATA');

      expect(retrieved).not.toBeNull();
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent chunk', () => {
      const chunk = createChunk('TEST', Buffer.from([0x01]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const retrieved = getChunkData(iff, 'NONE');

      expect(retrieved).toBeNull();
    });

    it('should retrieve first chunk when multiple have same ID', () => {
      const chunk1 = createChunk('SAME', Buffer.from([0x01, 0x02]));
      const chunk2 = createChunk('SAME', Buffer.from([0x03, 0x04]));
      const combined = Buffer.concat([chunk1, chunk2]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);
      const retrieved = getChunkData(iff, 'SAME');

      expect(retrieved).toEqual(Buffer.from([0x01, 0x02]));
    });

    it('should handle empty chunk data', () => {
      const chunk = createChunk('ZERO', Buffer.alloc(0));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const retrieved = getChunkData(iff, 'ZERO');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(0);
    });
  });

  describe('getChunks', () => {
    it('should get all chunks with specific ID', () => {
      const chunk1 = createChunk('SAME', Buffer.from([0x01]));
      const chunk2 = createChunk('SAME', Buffer.from([0x02]));
      const chunk3 = createChunk('OTHR', Buffer.from([0x03]));
      const combined = Buffer.concat([chunk1, chunk2, chunk3]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);
      const chunks = getChunks(iff, 'SAME');

      expect(chunks).toHaveLength(2);
      expect(chunks[0].id).toBe('SAME');
      expect(chunks[1].id).toBe('SAME');
    });

    it('should return empty array for non-existent chunk ID', () => {
      const chunk = createChunk('TEST', Buffer.from([0x01]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const chunks = getChunks(iff, 'NONE');

      expect(chunks).toHaveLength(0);
    });

    it('should return single chunk in array', () => {
      const chunk = createChunk('ONE ', Buffer.from([0x01]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const chunks = getChunks(iff, 'ONE ');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].id).toBe('ONE ');
    });
  });

  describe('writeIFFFile', () => {
    it('should write IFF file back to disk', () => {
      const chunk = createChunk('TEST', Buffer.from([0x01, 0x02, 0x03, 0x04]));
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);
      const outputFile = path.join(testDir, 'output.iff');
      writeIFFFile(outputFile, iff);

      expect(fs.existsSync(outputFile)).toBe(true);

      const written = fs.readFileSync(outputFile);
      expect(written).toEqual(chunk);
    });

    it('should preserve multiple chunks', () => {
      const chunk1 = createChunk('CHK1', Buffer.from([0x01]));
      const chunk2 = createChunk('CHK2', Buffer.from([0x02, 0x03]));
      const combined = Buffer.concat([chunk1, chunk2]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);
      const outputFile = path.join(testDir, 'output.iff');
      writeIFFFile(outputFile, iff);

      const written = fs.readFileSync(outputFile);
      expect(written).toEqual(combined);
    });
  });

  describe('Real-world Amiga file scenarios', () => {
    it('should parse typical .info file structure (FORM + ICON)', () => {
      // Simplified .info file: FORM container with ICON chunk
      const iconData = Buffer.from([
        0x00, 0x01,  // Version
        0x00, 0x00, 0x00, 0x00,  // Gadget
        0x00, 0x00,  // Type
      ]);
      const iconChunk = createChunk('ICON', iconData);
      fs.writeFileSync(testFile, iconChunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].id).toBe('ICON');

      const data = getChunkData(iff, 'ICON');
      expect(data).not.toBeNull();
      expect(data!.length).toBe(iconData.length);
    });

    it('should handle ILBM image chunks (BMHD + CMAP + BODY)', () => {
      // Bitmap Header
      const bmhd = createChunk('BMHD', Buffer.from([
        0x00, 0x20,  // Width: 32
        0x00, 0x20,  // Height: 32
        0x00, 0x00,  // X position
        0x00, 0x00,  // Y position
        0x04,        // Planes: 4 (16 colors)
        0x00,        // Masking
        0x00,        // Compression
        0x00,        // Pad
        0x00, 0x00,  // Transparent color
        0x01, 0x01,  // X aspect
        0x00, 0x20,  // Page width
        0x00, 0x20,  // Page height
      ]));

      // Color map (16 colors, 3 bytes each RGB)
      const cmap = createChunk('CMAP', Buffer.alloc(48, 0xFF));

      // Body (image data)
      const body = createChunk('BODY', Buffer.alloc(128, 0xAB));

      const combined = Buffer.concat([bmhd, cmap, body]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(3);
      expect(getChunkData(iff, 'BMHD')).not.toBeNull();
      expect(getChunkData(iff, 'CMAP')).not.toBeNull();
      expect(getChunkData(iff, 'BODY')).not.toBeNull();
    });

    it('should handle multiple tooltype chunks in .info file', () => {
      const tt1 = createChunk('TOOL', Buffer.from('STACK=8192\0', 'ascii'));
      const tt2 = createChunk('TOOL', Buffer.from('DONOTWAIT\0', 'ascii'));
      const combined = Buffer.concat([tt1, tt2]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);
      const tooltypes = getChunks(iff, 'TOOL');

      expect(tooltypes).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle file with only header (incomplete chunk)', () => {
      // Only 6 bytes (less than 8 needed for header)
      fs.writeFileSync(testFile, Buffer.from([0x54, 0x45, 0x53, 0x54, 0x00, 0x00]));

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(0);
    });

    it('should handle corrupted chunk size (larger than file)', () => {
      const buffer = Buffer.alloc(12);
      buffer.write('TEST', 0, 4, 'ascii');
      writeBE32(buffer, 4, 10000); // Size way larger than actual data
      fs.writeFileSync(testFile, buffer);

      const iff = parseIFFFile(testFile);

      // Should parse the chunk but size will be wrong
      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].size).toBe(10000);
    });

    it('should handle chunk IDs with non-ASCII characters', () => {
      const data = Buffer.from([0x01, 0x02]);
      const chunk = Buffer.alloc(12);
      chunk.writeUInt8(0xFF, 0);
      chunk.writeUInt8(0xFE, 1);
      chunk.writeUInt8(0xFD, 2);
      chunk.writeUInt8(0xFC, 3);
      writeBE32(chunk, 4, 2);
      data.copy(chunk, 8);
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      // ID will be garbled but should still parse
      expect(iff.chunks[0].size).toBe(2);
    });

    it('should handle very large chunk', () => {
      const largeData = Buffer.alloc(10000, 0xAB);
      const chunk = createChunk('HUGE', largeData);
      fs.writeFileSync(testFile, chunk);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(1);
      expect(iff.chunks[0].size).toBe(10000);

      const data = getChunkData(iff, 'HUGE');
      expect(data!.length).toBe(10000);
    });

    it('should handle adjacent chunks without extra spacing', () => {
      const chunk1 = createChunk('AA  ', Buffer.from([0x01]));
      const chunk2 = createChunk('BB  ', Buffer.from([0x02]));
      const chunk3 = createChunk('CC  ', Buffer.from([0x03]));
      const combined = Buffer.concat([chunk1, chunk2, chunk3]);
      fs.writeFileSync(testFile, combined);

      const iff = parseIFFFile(testFile);

      expect(iff.chunks).toHaveLength(3);
      expect(getChunkData(iff, 'AA  ')).toEqual(Buffer.from([0x01]));
      expect(getChunkData(iff, 'BB  ')).toEqual(Buffer.from([0x02]));
      expect(getChunkData(iff, 'CC  ')).toEqual(Buffer.from([0x03]));
    });
  });
});
