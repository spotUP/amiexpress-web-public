/**
 * Telesoftware: programs broadcast on teletext pages, decoded back to files.
 *
 * Ceefax carried real BBC Micro software on pages 700+ between 1983 and
 * 1989. You needed a teletext adapter, which pulled the pages out of the
 * broadcast signal and handed the program to the machine. This does the
 * same job from a recovered tape.
 *
 * Two layers, per the BBC's "Teletext Telesoftware Transmissions" spec:
 *
 *  - A PAGE BLOCK is 1024 bytes: the centre 24 bytes of packet 0, then 40
 *    bytes from each of packets 1 to 25. Packets that were never
 *    transmitted count as 40 spaces, which is how 1985 Ceefax used it -
 *    those pages carry packets 1 to 23 and nothing above.
 *  - The bytes are then coded in the REDEFINABLE TELESOFTWARE FORMAT, a
 *    table-driven scheme with a lone table and an escape table of 256
 *    entries each. A byte either decodes to itself, decodes to a string, or
 *    calls a command - and commands can rewrite the tables as they go,
 *    which is where the compression comes from.
 *
 * The spec also defines a 16-bit CRC on packet 27. These 1985 transmissions
 * do not carry it - the document is explicitly a PROPOSAL "being considered
 * for national and international adoption", and Ceefax predates it - so
 * there is no checksum to verify against and correctness has to be argued
 * from the decode itself: sequential block numbers, a known datatype, and a
 * byte stream that looks like what it claims to be.
 */
import type { TeletextLine } from './packet27';

/** A page block is always this big, whatever was actually transmitted. */
export const PAGE_BLOCK_BYTES = 1024;

/** The escape codes, from the default lone table (1/11, 9/11, 7/12, 15/12). */
const ESCAPE_CODES = new Set([0x1b, 0x9b, 0x7c, 0xfc]);

/**
 * The raising and lowering operators.
 *
 * The 7-bit overlay ADDS these two subroutines to the tables, and the
 * specification extract never says at which codes - its worked example
 * shows the lowering operator only as a glyph. Both were settled against
 * the 1985 Ceefax corpus instead: with raise=0x60 and lower=0x7E every
 * decoded byte is printable and the stream carries carriage returns, while
 * the opposite assignment yields printable bytes and NO line endings at
 * all, which is not a source file.
 *
 * Raising adds 88 to the parity-stripped byte, lowering subtracts it, both
 * modulo 255 (spec s.10.3.2).
 */
export const RAISE_CODE = 0x60;
export const LOWER_CODE = 0x7e;
const RAISE_LOWER_OFFSET = 88;

/** Escape-table commands, by their code. Table 4 of the specification. */
const COMMANDS: Record<number, string> = {
  0x61: 'DTL', // title, version and date
  0x62: 'UER', // error
  0x63: 'DEB', // end block
  0x64: 'DET', // end of file
  0x65: 'DSL', // start logical record
  0x68: 'DST', // subtitle
  0x69: 'DDT', // datatype and hardware
  0x6a: 'DCO', // comment
  0x6b: 'DIG', // ignore data
  0x6c: 'DLA', // load at absolute address
  0x6d: 'DLR', // load at relative address
  0x6e: 'DXA', // execute from absolute address
  0x6f: 'DXR', // execute from relative address
  0x70: 'DIR', // inhibit run when loaded
  0x71: 'DES', // set string in escape table
  0x72: 'DEC', // set command in escape table
  0x73: 'DLS', // set string in lone table
  0x74: 'DLC', // set command in lone table
  0x77: 'ESC', // set to escape status
  [RAISE_CODE]: 'URB', // next byte raised by 88 - an 8-bit value in 7-bit data
  [LOWER_CODE]: 'ULB', // next byte lowered by 88
  0x42: 'TXO', // 7-bit teletext overlay, disordered
  0x46: 'TXT', // 7-bit teletext overlay, ordered
  0x43: 'TX8', // 8-bit teletext overlay
};

export interface TelesoftwareBlock {
  /** Block number within the program, from one. */
  blockNumber: number | null;
  /** How many blocks the program has, when the page says. */
  blockCount: number | null;
  title: string | null;
  version: string | null;
  datatype: string | null;
  /** The program bytes this page contributed. */
  data: Uint8Array;
  /** Escape codes met that this decoder does not implement. */
  unknown: number[];
  errors: string[];
  endOfFile: boolean;
}

/**
 * The 1024-byte page block.
 *
 * Bytes are taken RAW - parity is not stripped. Data bytes that are not
 * teletext characters are 8-bit values without parity (spec s.5.3), so
 * masking here would corrupt the program.
 */
export function pageBlock(lines: readonly TeletextLine[]): Uint8Array {
  const block = new Uint8Array(PAGE_BLOCK_BYTES).fill(0x20);
  const header = lines.find(line => line.packetNumber === 0);
  if (header) {
    for (let i = 0; i < 24 && i + 8 < header.data.length; i++) block[i] = header.data[8 + i];
  }
  for (let packet = 1; packet <= 25; packet++) {
    const line = lines.find(l => l.packetNumber === packet);
    if (!line) continue;
    const at = 24 + (packet - 1) * 40;
    for (let i = 0; i < 40 && i < line.data.length; i++) block[at + i] = line.data[i];
  }
  return block;
}

/** Strip the odd-parity bit teletext text bytes carry. */
function sevenBit(byte: number): number {
  return byte & 0x7f;
}

/**
 * Decode one page's block.
 *
 * Deliberately tolerant: a recovered page is lossy, and a decoder that
 * threw on the first surprise would report nothing about the ninety
 * percent that read cleanly. Anything unhandled is collected and returned.
 */
export function decodeBlock(
  block: Uint8Array,
  sharedLoneTable?: Map<number, number[]>,
): TelesoftwareBlock {
  const out: number[] = [];
  const unknown = new Set<number>();
  const errors: string[] = [];
  const result: TelesoftwareBlock = {
    blockNumber: null, blockCount: null, title: null, version: null,
    datatype: null, data: new Uint8Array(), unknown: [], errors, endOfFile: false,
  };

  /**
   * The lone table, holding only what this transmission redefined.
   *
   * This is where the compression lives AND where the line endings come
   * from: a BASIC line ends with an alpha-white control code on the page,
   * and the transmission redefines that code to decode to a carriage
   * return. Skip these commands and the program comes out as one
   * enormous line.
   */
  const loneTable = sharedLoneTable ?? new Map<number, number[]>();

  let at = 0;
  let inBlock = false;
  /** 7-bit mode: field counts and lengths are hex DIGITS, not binary. */
  let sevenBitMode = true;

  const nextByte = (): number | null => (at < block.length ? block[at++] : null);

  /** A field count or length: a hex digit, or X then two hex digits. */
  const number = (): number | null => {
    const byte = nextByte();
    if (byte === null) return null;
    if (!sevenBitMode) return byte;
    const ch = String.fromCharCode(sevenBit(byte));
    if (ch === 'X') {
      const a = nextByte(), b = nextByte();
      if (a === null || b === null) return null;
      const value = parseInt(String.fromCharCode(sevenBit(a), sevenBit(b)), 16);
      return Number.isNaN(value) ? null : value;
    }
    const value = parseInt(ch, 16);
    return Number.isNaN(value) ? null : value;
  };

  /**
   * One byte of a command argument, after the raising and lowering
   * operators. These may be nested inside other commands' arguments
   * (spec s.10.1.6), which is the only reason they are a function.
   */
  const operand = (): number | null => {
    const byte = nextByte();
    if (byte === null) return null;
    if (byte === RAISE_CODE) {
      const next = nextByte();
      return next === null ? null : (sevenBit(next) + RAISE_LOWER_OFFSET) % 255;
    }
    if (byte === LOWER_CODE) {
      const next = nextByte();
      return next === null ? null : (sevenBit(next) - RAISE_LOWER_OFFSET + 255) % 255;
    }
    return byte;
  };

  /** A field: a length, then that many bytes. */
  const field = (): number[] | null => {
    const length = number();
    if (length === null) return null;
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      const byte = nextByte();
      if (byte === null) return null;
      bytes.push(byte);
    }
    return bytes;
  };

  const text = (bytes: number[] | null): string | null =>
    bytes ? bytes.map(b => String.fromCharCode(sevenBit(b))).join('').trim() : null;

  while (at < block.length) {
    const byte = block[at++];

    /*
     * THE OPERATORS LIVE IN THE LONE TABLE, NOT ONLY THE ESCAPE TABLE.
     *
     * The 7-bit overlay "adds the raising and lowering command
     * subroutines" (s.10.3.1) - to the tables the stream is decoded
     * through, so in 7-bit mode a BARE 0x7E is the lowering command with
     * no escape in front of it. Honour them only after an escape and they
     * survive into the output as literal '~' and '`' characters: SNAKE
     * came out with 1,276 tildes, 262 backquotes and not one control code,
     * because every 8-bit byte in it had been left encoded.
     */
    if (sevenBitMode && inBlock && (byte === RAISE_CODE || byte === LOWER_CODE)) {
      const next = nextByte();
      if (next === null) break;
      out.push(byte === RAISE_CODE
        ? (sevenBit(next) + RAISE_LOWER_OFFSET) % 255
        : (sevenBit(next) - RAISE_LOWER_OFFSET + 255) % 255);
      continue;
    }

    if (!ESCAPE_CODES.has(byte)) {
      // Lone table: an entry decodes to itself unless redefined.
      if (!inBlock) continue;
      const replacement = loneTable.get(byte);
      if (replacement) out.push(...replacement);
      else out.push(byte);
      continue;
    }

    const codeByte = nextByte();
    if (codeByte === null) break;
    const command = COMMANDS[codeByte] ?? COMMANDS[sevenBit(codeByte)];

    switch (command) {
      case 'TXO':
      case 'TXT':
      case 'TX8': {
        // Start of block, with an optional block number and total.
        sevenBitMode = command !== 'TX8';
        const count = number() ?? 0;
        const fields: number[][] = [];
        for (let i = 0; i < count; i++) {
          const value = field();
          if (value) fields.push(value);
        }
        if (fields[0]?.length) result.blockNumber = digits(fields[0], sevenBitMode);
        if (fields[1]?.length) result.blockCount = digits(fields[1], sevenBitMode);
        inBlock = true;
        break;
      }
      case 'DTL': {
        const count = number() ?? 0;
        const parts: (string | null)[] = [];
        for (let i = 0; i < count; i++) parts.push(text(field()));
        result.title = parts[0] ?? result.title;
        result.version = parts[1] ?? result.version;
        break;
      }
      case 'DDT': {
        const count = number() ?? 0;
        const parts: (string | null)[] = [];
        for (let i = 0; i < count; i++) parts.push(text(field()));
        result.datatype = parts[0] ?? result.datatype;
        break;
      }
      case 'DEB':
        inBlock = false;
        break;
      case 'DET':
        result.endOfFile = true;
        at = block.length;
        break;
      case 'DIR':
      case 'ESC':
      case 'DSL':
        break;
      case 'DST':
      case 'DIG':
      case 'DCO': {
        const count = command === 'DST' ? 1 : (number() ?? 1);
        for (let i = 0; i < count; i++) field();
        break;
      }
      case 'DLS': case 'DES': {
        // Set a string in the lone (DLS) or escape (DES) table. Both the
        // code and the string may arrive raised or lowered, which is how
        // 8-bit values travel through a 7-bit transmission.
        const code = operand();
        const length = number();
        if (code === null || length === null) break;
        const replacement: number[] = [];
        for (let i = 0; i < length; i++) {
          const value = operand();
          if (value === null) break;
          replacement.push(value);
        }
        if (command === 'DLS') loneTable.set(code, replacement);
        break;
      }
      case 'DEC': case 'DLC': {
        // Set a COMMAND in a table: the code, then a three byte command
        // name. Read and skipped - nothing in this corpus redefines one.
        operand();
        for (let i = 0; i < 3; i++) nextByte();
        break;
      }
      case 'DLA': case 'DXA': case 'DLR': case 'DXR':
        field();
        break;
      case 'UER':
        errors.push(`transmission error marked at byte ${at}`);
        break;
      case 'URB': case 'ULB': {
        /*
         * AN 8-BIT BYTE, ARRIVING THROUGH A 7-BIT TRANSMISSION.
         *
         * These are not only for command arguments - they are how the
         * payload carries any value the 7-bit character set cannot hold.
         * The specification's own worked example spells it out: the byte
         * 101 lowered by 88 gives 13, a carriage return, and there is one
         * at the end of every BASIC line.
         *
         * Dropping them looked like success: the output was 100% printable
         * text, because everything that was NOT printable had been thrown
         * away, and whole programs decoded to a single line with no endings
         * in them at all.
         */
        const next = nextByte();
        if (next === null) break;
        const raised = command === 'URB'
          ? (sevenBit(next) + RAISE_LOWER_OFFSET) % 255
          : (sevenBit(next) - RAISE_LOWER_OFFSET + 255) % 255;
        if (inBlock) out.push(raised);
        break;
      }
      default:
        unknown.add(codeByte);
        break;
    }
  }

  result.data = Uint8Array.from(out);
  result.unknown = [...unknown];
  return result;
}

/** A field holding a number: hex digits in 7-bit mode, raw bytes in 8-bit. */
function digits(bytes: number[], sevenBitMode: boolean): number | null {
  if (!sevenBitMode) return bytes.reduce((total, b) => (total << 8) | b, 0);
  const value = parseInt(bytes.map(b => String.fromCharCode(sevenBit(b))).join(''), 16);
  return Number.isNaN(value) ? null : value;
}

// --- Whole programs -------------------------------------------------------

export interface TelesoftwareProgram {
  title: string;
  datatype: string | null;
  /** Blocks that were recovered, by number. */
  blocks: Map<number, Uint8Array>;
  /** How many the transmission says there are. */
  blockCount: number | null;
  /** Every block present, in order. */
  complete: boolean;
  /** The program, assembled. Only meaningful when complete. */
  data: Uint8Array;
}

/**
 * Decode a chain of pages into the programs they carry.
 *
 * THE DECODING TABLES BELONG TO THE CHAIN, NOT THE PAGE. The specification
 * resets them "before beginning to decode a byte-stream", and a byte-stream
 * is the whole chain of pages, not one of them. That matters more than it
 * sounds: a BASIC line ends with an alpha-white code on the page, and the
 * transmission redefines that code to a carriage return ONCE. Reset the
 * tables per page and every block after the first loses its line endings -
 * the program decodes to printable text with no lines in it at all, which
 * looks like a success and will not load.
 *
 * Blocks are fed in order for the same reason.
 */
export function decodeChain(
  pages: ReadonlyArray<{ lines: readonly TeletextLine[] }>,
): TelesoftwareProgram[] {
  const found = new Map<string, TelesoftwareProgram>();
  const tables = new Map<string, Map<number, number[]>>();

  // In block order, so a redefinition is in place before the blocks that
  // rely on it. Pages arriving out of order is normal on a carousel.
  const decoded = pages
    .map(page => ({ page, peek: decodeBlock(pageBlock(page.lines)) }))
    .filter(entry => entry.peek.title || entry.peek.blockNumber !== null)
    .sort((a, b) => (a.peek.blockNumber ?? 0) - (b.peek.blockNumber ?? 0));

  for (const entry of decoded) {
    const title = entry.peek.title ?? '(untitled)';
    if (!tables.has(title)) tables.set(title, new Map());
    // Decoded a second time, now with the chain's tables in hand.
    const block = decodeBlock(pageBlock(entry.page.lines), tables.get(title));
    const key = block.title ?? title;

    const program = found.get(key) ?? {
      title: key, datatype: null, blocks: new Map<number, Uint8Array>(),
      blockCount: null, complete: false, data: new Uint8Array(),
    };
    if (block.blockNumber !== null) program.blocks.set(block.blockNumber, block.data);
    if (block.blockCount !== null) program.blockCount = block.blockCount;
    program.datatype = program.datatype ?? block.datatype;
    found.set(key, program);
  }

  for (const program of found.values()) {
    const total = program.blockCount ?? program.blocks.size;
    program.complete = total > 0 && [...Array(total)].every((_, i) => program.blocks.has(i + 1));
    const parts: number[] = [];
    for (let i = 1; i <= total; i++) {
      const block = program.blocks.get(i);
      if (block) parts.push(...block);
    }
    program.data = Uint8Array.from(parts);
  }

  return [...found.values()].sort((a, b) => b.blocks.size - a.blocks.size);
}
