/**
 * LZX Archive Extractor
 * Pure TypeScript conversion of unlzx 2.16 by Oliver Gantert
 *
 * Original C source: unlzx.c (1,304 lines)
 * Based on unlzx 1.0 by David Tritscher
 * License: Public Domain
 *
 * Supports LZX compression methods used on Amiga
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const UNLZX_VERSION = "2.16-ts";
const UNLZX_VERDATE = "2025-10-25";
const PMATCH_MAXSTRLEN = 512;

// CRC32 lookup table
const CRC_TABLE: number[] = [
  0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F,
  0xE963A535, 0x9E6495A3, 0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988,
  0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91, 0x1DB71064, 0x6AB020F2,
  0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
  0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9,
  0xFA0F3D63, 0x8D080DF5, 0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172,
  0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 0x35B5A8FA, 0x42B2986C,
  0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
  0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423,
  0xCFBA9599, 0xB8BDA50F, 0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924,
  0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D, 0x76DC4190, 0x01DB7106,
  0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
  0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D,
  0x91646C97, 0xE6635C01, 0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E,
  0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 0x65B0D9C6, 0x12B7E950,
  0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
  0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7,
  0xA4D1C46D, 0xD3D6F4FB, 0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0,
  0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9, 0x5005713C, 0x270241AA,
  0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
  0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81,
  0xB7BD5C3B, 0xC0BA6CAD, 0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A,
  0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683, 0xE3630B12, 0x94643B84,
  0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
  0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB,
  0x196C3671, 0x6E6B06E7, 0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC,
  0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 0xD6D6A3E8, 0xA1D1937E,
  0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
  0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55,
  0x316E8EEF, 0x4669BE79, 0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236,
  0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F, 0xC5BA3BBE, 0xB2BD0B28,
  0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
  0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F,
  0x72076785, 0x05005713, 0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38,
  0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21, 0x86D3D2D4, 0xF1D4E242,
  0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
  0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69,
  0x616BFFD3, 0x166CCF45, 0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2,
  0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB, 0xAED16A4A, 0xD9D65ADC,
  0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
  0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693,
  0x54DE5729, 0x23D967BF, 0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94,
  0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D
];

const TABLE_ONE: number[] = [
  0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x02, 0x02,
  0x03, 0x03, 0x04, 0x04, 0x05, 0x05, 0x06, 0x06,
  0x07, 0x07, 0x08, 0x08, 0x09, 0x09, 0x0a, 0x0a,
  0x0b, 0x0b, 0x0c, 0x0c, 0x0d, 0x0d, 0x0e, 0x0e
];

const TABLE_TWO: number[] = [
  0,    1,    2,    3,    4,    6,    8,    12,
  16,   24,   32,   48,   64,   96,   128,  192,
  256,  384,  512,  768,  1024, 1536, 2048, 3072,
  4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152
];

const TABLE_THREE: number[] = [
  0,    1,    3,    7,    15,   31,   63,   127,
  255,  511,  1023, 2047, 4095, 8191, 16383, 32767
];

const TABLE_FOUR: number[] = [
  0,    1,    2,    3,    4,    5,    6,    7,
  8,    9,    10,   11,   12,   13,   14,   15,
  16,   0,    1,    2,    3,    4,    5,    6,
  7,    8,    9,    10,   11,   12,   13,   14,
  15,   16
];

interface FilenameNode {
  next: FilenameNode | null;
  length: number;
  crc: number;
  filename: string;
}

class UnLZX {
  matchPattern: Buffer;
  useOutdir: number;
  outputDir: Buffer;
  workBuffer: Buffer;

  mode: number;

  infoHeader: Buffer;
  archiveHeader: Buffer;
  headerFilename: Buffer;
  headerComment: Buffer;

  packSize: number;
  unpackSize: number;

  crc: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  attributes: number;
  packMode: number;

  filenameList: FilenameNode | null;

  readBuffer: Buffer;
  decrunchBuffer: Buffer;

  source: Buffer;
  destination: Buffer;
  sourceEnd: number;
  destinationEnd: number;
  sourcePos: number;
  destPos: number;

  decrunchMethod: number;
  decrunchLength: number;
  lastOffset: number;
  globalControl: number;
  globalShift: number;

  offsetLen: Uint8Array;
  offsetTable: Uint16Array;
  huffman20Len: Uint8Array;
  huffman20Table: Uint16Array;
  literalLen: Uint8Array;
  literalTable: Uint16Array;

  sum: number;

  constructor() {
    this.matchPattern = Buffer.alloc(256);
    this.matchPattern[0] = '*'.charCodeAt(0);
    this.useOutdir = 0;
    this.outputDir = Buffer.alloc(768);
    this.workBuffer = Buffer.alloc(1024);

    this.mode = 0;

    this.infoHeader = Buffer.alloc(10);
    this.archiveHeader = Buffer.alloc(32);
    this.headerFilename = Buffer.alloc(256);
    this.headerComment = Buffer.alloc(256);

    this.packSize = 0;
    this.unpackSize = 0;

    this.crc = 0;
    this.year = 0;
    this.month = 0;
    this.day = 0;
    this.hour = 0;
    this.minute = 0;
    this.second = 0;
    this.attributes = 0;
    this.packMode = 0;

    this.filenameList = null;

    this.readBuffer = Buffer.alloc(16384);
    this.decrunchBuffer = Buffer.alloc(66560);

    this.source = Buffer.alloc(0);
    this.destination = Buffer.alloc(0);
    this.sourceEnd = 0;
    this.destinationEnd = 0;
    this.sourcePos = 0;
    this.destPos = 0;

    this.decrunchMethod = 0;
    this.decrunchLength = 0;
    this.lastOffset = 0;
    this.globalControl = 0;
    this.globalShift = 0;

    this.offsetLen = new Uint8Array(8);
    this.offsetTable = new Uint16Array(128);
    this.huffman20Len = new Uint8Array(20);
    this.huffman20Table = new Uint16Array(96);
    this.literalLen = new Uint8Array(768);
    this.literalTable = new Uint16Array(5120);

    this.sum = 0;
  }

  /**
   * Pattern matching with wildcards
   * Supports * and ? wildcards
   */
  private pmatch(mask: string, name: string): boolean {
    let calls = 0;
    let wild = 0;
    let q = 0;
    let mi = 0; // mask index
    let ni = 0; // name index
    let ma = 0; // mask anchor
    let na = 0; // name anchor

    while (true) {
      if (++calls > PMATCH_MAXSTRLEN) return false;

      if (mask[mi] === '*') {
        while (mask[mi] === '*') mi++;
        wild = 1;
        ma = mi;
        na = ni;
      }

      if (!mask[mi] || mi >= mask.length) {
        if (!name[ni] || ni >= name.length) return true;
        for (let i = mi - 1; (i >= 0) && (mask[i] === '?'); i--);
        if ((mask[mi - 1] === '*') && (mi > 0) && (mask[mi - 2] !== '\\')) return true;
        if (!wild) return false;
        mi = ma;
      } else if (!name[ni] || ni >= name.length) {
        while (mask[mi] === '*') mi++;
        return !(mask[mi] !== undefined && mi < mask.length);
      }

      if ((mask[mi] === '\\') && ((mask[mi + 1] === '*') || (mask[mi + 1] === '?'))) {
        mi++;
        q = 1;
      } else {
        q = 0;
      }

      if ((mask[mi]?.toLowerCase() !== name[ni]?.toLowerCase()) && ((mask[mi] !== '?') || q)) {
        if (!wild) return false;
        mi = ma;
        ni = ++na;
      } else {
        if (mask[mi]) mi++;
        if (name[ni]) ni++;
      }
    }
  }

  /**
   * Calculate CRC32 for a buffer
   */
  private crcCalc(memory: Buffer, length: number): void {
    if (length) {
      let temp = ~this.sum >>> 0;
      for (let i = 0; i < length; i++) {
        temp = CRC_TABLE[(memory[i] ^ temp) & 255] ^ (temp >>> 8);
      }
      this.sum = (~temp) >>> 0;
    }
  }

  /**
   * Make Huffman decode table
   */
  private makeDecodeTable(
    numberSymbols: number,
    tableSize: number,
    length: Uint8Array,
    table: Uint16Array
  ): number {
    let bitNum = 0;
    let symbol: number;
    let abort = 0;
    let leaf: number, tableMask: number, bitMask: number, pos: number;
    let fill: number, nextSymbol: number, reverse: number;

    pos = 0;
    tableMask = 1 << tableSize;
    bitMask = tableMask >> 1;
    bitNum++;

    while (!abort && bitNum <= tableSize) {
      for (symbol = 0; symbol < numberSymbols; symbol++) {
        if (length[symbol] === bitNum) {
          reverse = pos;
          leaf = 0;
          fill = tableSize;
          do {
            leaf = (leaf << 1) + (reverse & 1);
            reverse >>>= 1;
          } while (--fill);

          if ((pos += bitMask) > tableMask) {
            abort = 1;
            break;
          }

          fill = bitMask;
          nextSymbol = 1 << bitNum;
          do {
            table[leaf] = symbol;
            leaf += nextSymbol;
          } while (--fill);
        }
      }
      bitMask >>>= 1;
      bitNum++;
    }

    if (pos !== tableMask) {
      for (symbol = 0; symbol < tableMask; symbol++) {
        if (!table[symbol]) {
          abort = 1;
        }
      }
    }

    return abort ? 1 : 0;
  }

  /**
   * Read a number of bits from source
   */
  private readBits(bits: number): number {
    let value = 0;

    for (let i = 0; i < bits; i++) {
      if (this.globalShift < 0) {
        this.globalControl = this.source[this.sourcePos++] || 0;
        this.globalShift = 7;
      }
      value = (value << 1) | ((this.globalControl >>> this.globalShift) & 1);
      this.globalShift--;
    }

    return value;
  }

  /**
   * Read literal table for decompression
   */
  private readLiteralTable(): number {
    let control: number;
    let shift: number;
    let temp: number;
    let symbol: number;
    let abort: number;
    let pos: number;
    let count: number;
    let i: number;

    control = this.globalControl;
    shift = this.globalShift;

    // Read offset table lengths
    for (pos = 0; pos < 8; pos++) {
      if (shift < 0) {
        control = this.source[this.sourcePos++] || 0;
        shift = 7;
      }
      this.offsetLen[pos] = (control >>> shift) & 1 ? 3 : 2;
      shift--;
    }

    this.globalControl = control;
    this.globalShift = shift;
    abort = this.makeDecodeTable(8, 7, this.offsetLen, this.offsetTable);

    if (abort) {
      return 1;
    }

    // Read Huffman20 table lengths
    for (pos = 0; pos < 20; pos++) {
      if (shift < 0) {
        control = this.source[this.sourcePos++] || 0;
        shift = 7;
      }
      this.huffman20Len[pos] = (control >>> shift) & 1 ?
        (((control >>> (shift - 1)) & 1) ? 3 : 4) : 2;
      shift -= ((control >>> shift) & 1) ? 2 : 1;
    }

    this.globalControl = control;
    this.globalShift = shift;
    abort = this.makeDecodeTable(20, 6, this.huffman20Len, this.huffman20Table);

    if (abort) {
      return 1;
    }

    // Read literal lengths
    for (pos = 0; pos < 768;) {
      symbol = 0;
      for (count = 6; count >= 0; count--) {
        if (shift < 0) {
          control = this.source[this.sourcePos++] || 0;
          shift = 7;
        }
        symbol = (symbol << 1) | ((control >>> shift) & 1);
        shift--;

        if (this.huffman20Table[symbol]) {
          break;
        }
      }

      symbol = this.huffman20Table[symbol];

      if (symbol < 16) {
        this.literalLen[pos++] = symbol;
      } else {
        if (symbol === 16) {
          count = this.readBits(2) + 3;
        } else if (symbol === 17) {
          count = this.readBits(3) + 3;
        } else {
          count = this.readBits(7) + 11;
        }

        while (count-- > 0) {
          this.literalLen[pos++] = 0;
        }
      }

      if (pos > 768) {
        return 1;
      }
    }

    this.globalControl = control;
    this.globalShift = shift;

    return this.makeDecodeTable(768, 12, this.literalLen, this.literalTable);
  }

  /**
   * Decompress LZX data (based on unlzx.c:510-605)
   */
  private decrunch(): void {
    let control = this.globalControl;
    let shift = this.globalShift;
    let symbol: number, temp: number, count: number;
    let string: Buffer;

    const dest = this.decrunchBuffer;
    const destEnd = this.destination;
    const src = this.source;
    const srcEnd = this.sourceEnd;

    do {
      // Read symbol from literal table
      symbol = this.literalTable[control & 4095];

      if (symbol >= 768) {
        control >>>= 12;
        shift -= 12;
        if (shift < 0) {
          shift += 16;
          control += (src[this.sourcePos++] || 0) << (8 + shift);
          control += (src[this.sourcePos++] || 0) << shift;
          control >>>= 0; // Ensure unsigned
        }

        do {
          symbol = this.literalTable[(control & 1) + (symbol << 1)];
          if (!shift--) {
            shift += 16;
            control += (src[this.sourcePos++] || 0) << 24;
            control += (src[this.sourcePos++] || 0) << 16;
            control >>>= 0;
          }
          control >>>= 1;
        } while (symbol >= 768);
      } else {
        temp = this.literalLen[symbol];
        control >>>= temp;
        shift -= temp;
        if (shift < 0) {
          shift += 16;
          control += (src[this.sourcePos++] || 0) << (8 + shift);
          control += (src[this.sourcePos++] || 0) << shift;
          control >>>= 0;
        }
      }

      if (symbol < 256) {
        // Literal byte
        dest[this.destPos++] = symbol;
      } else {
        // Match
        symbol -= 256;
        count = TABLE_TWO[temp = symbol & 31];
        temp = TABLE_ONE[temp];

        if ((temp >= 3) && (this.decrunchMethod === 3)) {
          temp -= 3;
          count += ((control & TABLE_THREE[temp]) << 3);
          control >>>= temp;
          shift -= temp;
          if (shift < 0) {
            shift += 16;
            control += (src[this.sourcePos++] || 0) << (8 + shift);
            control += (src[this.sourcePos++] || 0) << shift;
            control >>>= 0;
          }
          count += (temp = this.offsetTable[control & 127]);
          temp = this.offsetLen[temp];
        } else {
          count += control & TABLE_THREE[temp];
          if (!count) count = this.lastOffset;
        }

        control >>>= temp;
        shift -= temp;
        if (shift < 0) {
          shift += 16;
          control += (src[this.sourcePos++] || 0) << (8 + shift);
          control += (src[this.sourcePos++] || 0) << shift;
          control >>>= 0;
        }

        this.lastOffset = count;
        count = TABLE_TWO[temp = (symbol >> 5) & 15] + 3;
        temp = TABLE_ONE[temp];
        count += (control & TABLE_THREE[temp]);
        control >>>= temp;
        shift -= temp;
        if (shift < 0) {
          shift += 16;
          control += (src[this.sourcePos++] || 0) << (8 + shift);
          control += (src[this.sourcePos++] || 0) << shift;
          control >>>= 0;
        }

        // Copy match from back-reference
        const offset = this.destPos - this.lastOffset;
        if (offset >= 0) {
          // Normal copy
          for (let i = 0; i < count; i++) {
            dest[this.destPos++] = dest[offset + i];
          }
        } else {
          // Wraparound copy (circular buffer)
          const wrapOffset = this.destPos + 65536 - this.lastOffset;
          for (let i = 0; i < count; i++) {
            dest[this.destPos++] = dest[wrapOffset + i];
          }
        }
      }
    } while ((this.destPos < this.decrunchLength) && (this.sourcePos < srcEnd));

    this.globalControl = control;
    this.globalShift = shift;
  }

  /**
   * Read LZX archive and list all entries
   */
  async readArchive(file: fs.FileHandle): Promise<LzxEntry[]> {
    const entries: LzxEntry[] = [];

    while (true) {
      // Read archive header (31 bytes)
      const headerBuf = Buffer.alloc(31);
      const result = await file.read(headerBuf, 0, 31);

      if (result.bytesRead === 0) {
        // End of archive
        break;
      }

      if (result.bytesRead !== 31) {
        throw new Error('Incomplete archive header');
      }

      // Calculate header CRC
      this.sum = 0;
      const storedCrc = (headerBuf[29] << 24) | (headerBuf[28] << 16) |
                        (headerBuf[27] << 8) | headerBuf[26];

      // Zero out CRC bytes for calculation
      headerBuf[29] = headerBuf[28] = headerBuf[27] = headerBuf[26] = 0;
      this.crcCalc(headerBuf, 31);

      // Read filename
      const filenameLen = headerBuf[30];
      const filenameBuf = Buffer.alloc(filenameLen);
      await file.read(filenameBuf, 0, filenameLen);
      this.crcCalc(filenameBuf, filenameLen);

      // Read comment
      const commentLen = headerBuf[14];
      const commentBuf = Buffer.alloc(commentLen);
      await file.read(commentBuf, 0, commentLen);
      this.crcCalc(commentBuf, commentLen);

      // Verify CRC
      if (this.sum !== storedCrc) {
        throw new Error('Archive header CRC mismatch');
      }

      // Parse header
      const unpackSize = (headerBuf[5] << 24) | (headerBuf[4] << 16) |
                         (headerBuf[3] << 8) | headerBuf[2];
      const packSize = (headerBuf[9] << 24) | (headerBuf[8] << 16) |
                       (headerBuf[7] << 8) | headerBuf[6];
      const packMode = headerBuf[11];
      const crc = (headerBuf[25] << 24) | (headerBuf[24] << 16) |
                  (headerBuf[23] << 8) | headerBuf[22];

      const filename = filenameBuf.toString('utf-8');
      const comment = commentBuf.toString('utf-8');

      entries.push({
        filename,
        comment,
        unpackSize,
        packSize,
        packMode,
        crc,
        dataOffset: 0 // Will be set during extraction
      });

      // Skip packed data
      if (packSize > 0) {
        const stats = await file.stat();
        const currentPos = (await file.read(Buffer.alloc(0), 0, 0)).bytesRead;
        // Seek forward by packSize
        const skipBuf = Buffer.alloc(Math.min(packSize, 16384));
        let remaining = packSize;
        while (remaining > 0) {
          const toRead = Math.min(remaining, 16384);
          await file.read(skipBuf, 0, toRead);
          remaining -= toRead;
        }
      }
    }

    return entries;
  }

  /**
   * Extract stored (uncompressed) file
   */
  async extractStored(
    file: fs.FileHandle,
    entry: LzxEntry,
    outputPath: string
  ): Promise<boolean> {
    this.sum = 0;
    let remaining = entry.unpackSize;

    const outFile = await fs.open(outputPath, 'w');

    try {
      while (remaining > 0) {
        const chunkSize = Math.min(remaining, 16384);
        const chunk = Buffer.alloc(chunkSize);
        const result = await file.read(chunk, 0, chunkSize);

        if (result.bytesRead !== chunkSize) {
          throw new Error('Unexpected EOF reading stored data');
        }

        this.crcCalc(chunk, chunkSize);
        await outFile.write(chunk, 0, chunkSize);
        remaining -= chunkSize;
      }

      if (this.sum !== entry.crc) {
        console.log(`[LZX] CRC mismatch (expected ${entry.crc}, got ${this.sum})`);
        return false;
      }

      return true;
    } finally {
      await outFile.close();
    }
  }

  /**
   * Extract compressed file
   */
  async extractNormal(
    file: fs.FileHandle,
    entry: LzxEntry,
    outputPath: string
  ): Promise<boolean> {
    this.globalControl = 0;
    this.globalShift = -16;
    this.lastOffset = 1;
    this.decrunchLength = 0;
    this.sum = 0;

    // Initialize tables
    this.offsetLen.fill(0);
    this.literalLen.fill(0);

    // Read entire packed data into buffer
    const packedData = Buffer.alloc(entry.packSize);
    const result = await file.read(packedData, 0, entry.packSize);

    if (result.bytesRead !== entry.packSize) {
      throw new Error('Unexpected EOF reading packed data');
    }

    this.source = packedData;
    this.sourcePos = 0;
    this.sourceEnd = entry.packSize;

    // Decompress
    this.destPos = 0;
    this.decrunchLength = entry.unpackSize;
    this.decrunchMethod = 2; // Normal compression

    try {
      this.decrunch();
    } catch (error: any) {
      console.error(`[LZX] Decompression failed: ${error.message}`);
      return false;
    }

    // Verify size
    if (this.destPos !== entry.unpackSize) {
      console.log(`[LZX] Size mismatch (expected ${entry.unpackSize}, got ${this.destPos})`);
      return false;
    }

    // Calculate CRC
    this.crcCalc(this.decrunchBuffer, this.destPos);

    if (this.sum !== entry.crc) {
      console.log(`[LZX] CRC mismatch (expected ${entry.crc}, got ${this.sum})`);
      return false;
    }

    // Write to output file
    await fs.writeFile(outputPath, this.decrunchBuffer.subarray(0, this.destPos));
    return true;
  }
}

interface LzxEntry {
  filename: string;
  comment: string;
  unpackSize: number;
  packSize: number;
  packMode: number;
  crc: number;
  dataOffset: number;
}

/**
 * Extract a specific file from LZX archive
 */
export async function extractFileFromLzx(
  lzxPath: string,
  filename: string,
  outputPath: string
): Promise<boolean> {
  let file: fs.FileHandle | null = null;

  try {
    console.log(`[LZX] Extracting ${filename} from ${path.basename(lzxPath)}`);

    // Open archive
    file = await fs.open(lzxPath, 'r');

    // Read and verify info header (10 bytes: "LZX" + version info)
    const infoHeader = Buffer.alloc(10);
    const headerResult = await file.read(infoHeader, 0, 10);

    if (headerResult.bytesRead !== 10) {
      throw new Error('Invalid LZX archive: incomplete header');
    }

    // Check LZX signature
    if (infoHeader[0] !== 76 || infoHeader[1] !== 90 || infoHeader[2] !== 88) {
      throw new Error('Invalid LZX archive: bad signature');
    }

    console.log(`[LZX] Archive signature OK`);

    // Create UnLZX instance
    const unlzx = new UnLZX();

    // Close and reopen file to rewind
    await file.close();
    file = await fs.open(lzxPath, 'r');

    // Skip info header
    const skipBuf = Buffer.alloc(10);
    await file.read(skipBuf, 0, 10);

    // Read all archive entries
    const entries = await unlzx.readArchive(file);
    console.log(`[LZX] Found ${entries.length} entries in archive`);

    // Find target file (case-insensitive)
    const lowerFilename = filename.toLowerCase();
    const entry = entries.find(e => e.filename.toLowerCase() === lowerFilename);

    if (!entry) {
      console.log(`[LZX] File not found: ${filename}`);
      return false;
    }

    console.log(`[LZX] Found: ${entry.filename} (mode ${entry.packMode}, ${entry.packSize} → ${entry.unpackSize} bytes)`);

    // Reopen and position at file data
    await file.close();
    file = await fs.open(lzxPath, 'r');

    // Skip to target file's data
    let skipBytes = 10; // Info header
    for (const e of entries) {
      const headerSize = 31 + e.filename.length + e.comment.length;

      if (e === entry) {
        // Position at data start
        skipBytes += headerSize;
        break;
      }

      skipBytes += headerSize + e.packSize;
    }

    // Skip to position
    const skipBuffer = Buffer.alloc(Math.min(skipBytes, 16384));
    while (skipBytes > 0) {
      const toSkip = Math.min(skipBytes, 16384);
      await file.read(skipBuffer, 0, toSkip);
      skipBytes -= toSkip;
    }

    // Extract based on pack mode
    let success = false;

    switch (entry.packMode) {
      case 0: // Stored (uncompressed)
        console.log(`[LZX] Extracting stored file...`);
        success = await unlzx.extractStored(file, entry, outputPath);
        break;

      case 2: // Normal (compressed)
        console.log(`[LZX] Decompressing file...`);
        success = await unlzx.extractNormal(file, entry, outputPath);
        break;

      default:
        console.log(`[LZX] Unsupported pack mode: ${entry.packMode}`);
        return false;
    }

    if (success) {
      console.log(`[LZX] ✓ Extracted to ${outputPath}`);
    }

    return success;
  } catch (error: any) {
    console.error(`[LZX] Error: ${error.message}`);
    return false;
  } finally {
    if (file !== null) {
      await file.close();
    }
  }
}

/**
 * Extract FILE_ID.DIZ from LZX archive
 */
export async function extractFileDizFromLzx(
  lzxPath: string,
  outputPath: string
): Promise<boolean> {
  return extractFileFromLzx(lzxPath, 'file_id.diz', outputPath);
}

/**
 * List files in LZX archive
 */
export async function listLzxFiles(lzxPath: string): Promise<string[]> {
  let file: fs.FileHandle | null = null;

  try {
    console.log(`[LZX] Listing files in ${path.basename(lzxPath)}`);

    // Open archive
    file = await fs.open(lzxPath, 'r');

    // Read info header
    const infoHeader = Buffer.alloc(10);
    const headerResult = await file.read(infoHeader, 0, 10);

    if (headerResult.bytesRead !== 10) {
      throw new Error('Invalid LZX archive');
    }

    // Check signature
    if (infoHeader[0] !== 76 || infoHeader[1] !== 90 || infoHeader[2] !== 88) {
      throw new Error('Invalid LZX archive: bad signature');
    }

    // Read entries
    const unlzx = new UnLZX();
    const entries = await unlzx.readArchive(file);

    return entries.map(e => e.filename);
  } catch (error: any) {
    console.error(`[LZX] Error: ${error.message}`);
    return [];
  } finally {
    if (file !== null) {
      await file.close();
    }
  }
}
