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
 * Raising adds 88 to the parity-stripped byte and lowering subtracts it.
 *
 * THE MODULUS IS 256, NOT THE 255 THE SPECIFICATION EXTRACT STATES. It
 * only shows below 88, where the two differ by one, and the corpus settles
 * it: every tokenised program ends with `7E 57`, which is 87 lowered. Under
 * 255 that is 0xFE and under 256 it is 0xFF - and the byte before it is
 * 0x0D, so the pair is BASIC's end-of-program marker. Decoded as 0xFE the
 * chain walks straight past the end of the program into the padding.
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
   * One byte of the stream, with the operators and the escape resolved.
   *
   * AN OPERATOR'S OPERAND IS NOT A RAW BYTE. It is read through the same
   * tables as everything else, so it may itself be escaped - and it has to
   * be, whenever the value to raise or lower is one the stream cannot say
   * plainly: the escape character, or either operator.
   *
   * GOMOKU sends BASIC line 440 as `60 7C 60 31`. That is: raise, whose
   * operand is the escaped literal 0x60, giving 0x60 + 88 = 0xB8 - the low
   * byte of 440 - followed by the length byte 0x31. Taking the operand
   * with a plain read raises the ESCAPE character instead, yielding 0xD4
   * for the line number and then swallowing the length byte into a second
   * operator, so the record claims line 468 and 137 bytes and the chain
   * walks off into the middle of a string.
   *
   * Nesting is in the specification for the same reason (s.10.1.6), which
   * is why this recurses rather than reading one byte.
   */
  const operand = (): number | null => {
    const byte = nextByte();
    if (byte === null) return null;
    if (ESCAPE_CODES.has(byte)) return nextByte();
    if (sevenBitMode && byte === RAISE_CODE) {
      const next = operand();
      return next === null ? null : (sevenBit(next) + RAISE_LOWER_OFFSET) % 256;
    }
    if (sevenBitMode && byte === LOWER_CODE) {
      const next = operand();
      return next === null ? null : (sevenBit(next) - RAISE_LOWER_OFFSET + 256) % 256;
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
      const next = operand();
      if (next === null) break;
      out.push(byte === RAISE_CODE
        ? (sevenBit(next) + RAISE_LOWER_OFFSET) % 256
        : (sevenBit(next) - RAISE_LOWER_OFFSET + 256) % 256);
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

    /*
     * IN 7-BIT MODE THE OPERATORS ARE NOT ESCAPE-TABLE COMMANDS.
     *
     * The 7-bit overlay adds the raising and lowering subroutines to the
     * LONE table (s.10.3.1), which is where this decoder already honours
     * them - a bare 0x60 or 0x7E. Their ESCAPE-table entries therefore
     * keep the default meaning, identity, and that is precisely how the
     * transmission sends those two bytes AS DATA: it cannot send them
     * bare, because bare means operator.
     *
     * SNAKE builds a string with STRING$(33,"`") and sends the backquote
     * as `7C 60`. Read as escape-plus-URB that swallows the closing quote
     * as an operand, and the line is one byte short of what its length
     * byte claims.
     */
    const operatorAsCommand: boolean = sevenBitMode && (codeByte === RAISE_CODE || codeByte === LOWER_CODE);
    const command: string | undefined = operatorAsCommand
      ? undefined
      : COMMANDS[codeByte] ?? COMMANDS[sevenBit(codeByte)];

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
          ? (sevenBit(next) + RAISE_LOWER_OFFSET) % 256
          : (sevenBit(next) - RAISE_LOWER_OFFSET + 256) % 256;
        if (inBlock) out.push(raised);
        break;
      }
      default:
        /*
         * THE ESCAPE TABLE HAS 256 ENTRIES AND THE DEFAULT ONE IS IDENTITY.
         *
         * An escaped code that names no command is not an error - it is the
         * byte itself, which is the only way the stream can carry a value
         * whose LONE-table entry has been redefined into something else.
         * The escape character is the clearest case: 0x7C is this
         * transmission's escape AND the low byte of BASIC line number 380,
         * so GOMOKU block 2 sends `7C 7C` for it.
         *
         * Emitting nothing here cost each tokenised program ONE byte at
         * every such code. A BASIC program is a linked list of line
         * lengths, so a single lost byte desynchronises the chain from
         * that point to the end of the file: the machine answered `Bad
         * program` for all eleven games while the first thirty-nine lines
         * of GOMOKU had in fact decoded perfectly.
         *
         * Codes inside the documented command block (Table 4) are still
         * reported, because one of those arriving here means a command
         * this decoder does not implement rather than data.
         */
        if (codeByte >= 0x61 && codeByte <= 0x77) unknown.add(codeByte);
        if (inBlock) out.push(codeByte);
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
  /**
   * The teletext pages this program was broadcast on, in order.
   *
   * Ceefax gave a program a page number and put its blocks on the subpages
   * of it - GOMOKU was page 717 - so this is what a caller browsing the
   * service is actually looking at when they reach it.
   */
  pages: number[];
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
  pages: ReadonlyArray<{ lines: readonly TeletextLine[]; page?: number }>,
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
      blockCount: null, complete: false, data: new Uint8Array(), pages: [],
    };
    // `entry.page` is the source page, whose own `page` is its number.
    const pageNumber = entry.page.page;
    if (pageNumber !== undefined && !program.pages.includes(pageNumber)) {
      program.pages.push(pageNumber);
    }
    if (block.blockNumber !== null) program.blocks.set(block.blockNumber, block.data);
    if (block.blockCount !== null) program.blockCount = block.blockCount;
    program.datatype = program.datatype ?? block.datatype;
    found.set(key, program);
  }

  for (const program of found.values()) {
    program.pages.sort((a, b) => a - b);
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

// --- What a decoded program actually is -----------------------------------

/**
 * Telesoftware carried three different things and said so only by
 * convention, so the shape has to be read off the bytes.
 *
 *  - `tokenised` - a BBC BASIC program as the machine stores it, a linked
 *    list of records `0x0D <line high> <line low> <length>` ending at
 *    `0x0D 0xFF`. Loaded with CHAIN, and NOT with *EXEC or *RUN.
 *  - `source` - the same program as text, numbered lines of ASCII. Typed
 *    back in with *EXEC, then RUN.
 *  - `text` - prose. The 1985 transmissions carried documentation
 *    alongside the programs; nothing loads these, they are read.
 *
 * Getting this wrong is not cosmetic. *EXEC on a tokenised program feeds
 * token bytes to the command line, and CHAIN on a text file answers `Bad
 * program`.
 */
export type ProgramKind = 'tokenised' | 'source' | 'text';

export interface ProgramShape {
  kind: ProgramKind;
  /** BASIC line records walked, for a tokenised program. */
  lines: number;
  /** Whether the line chain reached BASIC's `0x0D 0xFF` end marker. */
  terminated: boolean;
  /** Where the chain stopped making sense, when it did. */
  brokeAt: number | null;
}

/**
 * The fewest line records worth calling a program.
 *
 * A prose file can open with a carriage return and read as one plausible
 * record by chance; four in a row, each with a line number greater than
 * the last, does not happen by accident.
 */
const TOKENISED_MIN_LINES = 4;

/** How much of a text file must be numbered lines before it is BASIC source. */
const SOURCE_MIN_NUMBERED = 0.6;

/**
 * The highest line number BBC BASIC will accept.
 *
 * Without this bound the walk reads a CORRUPTED record as a real one and
 * sails past the true end of the program - SNAKE's damaged terminator
 * became "line 32902", and the break was then reported 114 bytes late, in
 * the middle of the machine code the program carries after itself.
 */
const MAX_BASIC_LINE = 32767;

/**
 * Walk the tokenised line chain, and report where it stops.
 *
 * This is the only honest test of a telesoftware decode. A BASIC program is
 * a linked list of byte lengths, so ONE byte lost or invented anywhere
 * desynchronises every record after it - which is why a decoder can be
 * ninety-five percent right and still produce nothing but `Bad program`.
 */
export function inspectProgram(data: Uint8Array): ProgramShape {
  let at = 0;
  let lines = 0;
  let previous = -1;

  while (at + 1 < data.length && data[at] === 0x0d) {
    if (data[at + 1] === 0xff) {
      return finish(lines, true, null, data);
    }
    if (at + 3 >= data.length) break;
    const number = (data[at + 1] << 8) | data[at + 2];
    const length = data[at + 3];
    if (length < 4 || at + length > data.length || number <= previous) break;
    if (number > MAX_BASIC_LINE) break;
    previous = number;
    lines++;
    at += length;
  }

  return finish(lines, false, at, data);
}

function finish(
  lines: number,
  terminated: boolean,
  brokeAt: number | null,
  data: Uint8Array,
): ProgramShape {
  if (lines >= TOKENISED_MIN_LINES) {
    return { kind: 'tokenised', lines, terminated, brokeAt: terminated ? null : brokeAt };
  }
  return { kind: numberedLineShare(data) >= SOURCE_MIN_NUMBERED ? 'source' : 'text', lines: 0, terminated: false, brokeAt: null };
}

/** The share of carriage-return-separated lines that open with a line number. */
function numberedLineShare(data: Uint8Array): number {
  const text = String.fromCharCode(...data.subarray(0, 4096));
  const rows = text.split(/[\r\n]+/).filter(row => row.trim().length > 0);
  if (rows.length === 0) return 0;
  return rows.filter(row => /^\s*\d+\s*\S/.test(row)).length / rows.length;
}


// --- What a service says it carries ---------------------------------------

/**
 * What a caller types to get one file going.
 *
 * Shared rather than restated where the disc is written, because the page
 * that offers a program and the catalogue entry beside it have to say the
 * same thing - and "*RUN SNAKE", which is neither, is what a reasonable
 * person tries first.
 */
export function loadCommandFor(name: string, kind: ProgramKind): string {
  if (kind === 'tokenised') return `CHAIN "${name}"`;
  if (kind === 'source') return `*EXEC ${name}`;
  return `*TYPE ${name}`;
}

/** One recovered program, as the pack records it. */
export interface TelesoftwareListing {
  /** The name it was broadcast under. */
  title: string;
  /** Its name on the disc, which is what the load command uses. */
  file: string;
  kind: ProgramKind;
  /** Exactly what to type on the Beeb. */
  command: string;
  /** The teletext pages it was broadcast on. */
  pages: number[];
  blocks: number;
  /** Every block of the transmission was recovered. */
  complete: boolean;
  /**
   * For a tokenised program, whether its line chain reaches BASIC's end
   * marker. A program that is complete but not intact was recovered whole
   * from a damaged tape, and will not load.
   */
  intact: boolean;
  /** Its end-of-program marker was destroyed on the tape and put back. */
  repaired?: boolean;
}

/**
 * The sidecar a pack carries beside its pages.
 *
 * Written when the disc is built, by the one process that knows all of it
 * at once: which pages held which program, what the program turned out to
 * be, and which disc it was written to.
 */
export interface TelesoftwareMap {
  /** The disc image, as it sits in the board's Beeb/software folder. */
  disc: string;
  programs: TelesoftwareListing[];
}

/** The program broadcast on a page, if any. */
export function programOnPage(
  map: TelesoftwareMap | null | undefined,
  page: number,
): TelesoftwareListing | null {
  if (!map) return null;
  return map.programs.find(entry => entry.pages.includes(page)) ?? null;
}

// --- Repairing a damaged terminator ---------------------------------------

/**
 * How many further records a resync must find before the program is judged
 * to continue rather than to have ended.
 *
 * BREAKOU finds ten; SNAKE and GALAXY find none. Three is a wide margin
 * between those, and erring high is the safe direction: a program wrongly
 * judged to have ended would be silently TRUNCATED, which is worse than
 * one left honestly marked as damaged.
 */
const CONTINUES_AFTER = 3;

/** How far past the break to look for the program picking up again. */
const RESYNC_WINDOW = 400;

/**
 * Valid ascending records starting at `from`, counted only when they
 * CONTINUE the program - that is, when the first of them carries a line
 * number greater than the last line already read.
 *
 * BASIC line numbers ascend strictly within one program, so records that
 * restart LOWER are a different thing entirely: another program, or data
 * that happens to look like records. BREAKOUT is exactly that - 112 clean
 * lines, 10 to 1120 in tens, ending in ENDPROC, and then a second run of
 * records beginning again at 1020. Reading those as a continuation made
 * this file look unrepairable when its only fault was the same single
 * destroyed end marker as the others.
 */
function recordsFrom(data: Uint8Array, from: number, after = -1): number {
  let at = from;
  let found = 0;
  let previous = after;
  while (at + 3 < data.length && data[at] === 0x0d) {
    if (data[at + 1] === 0xff) break;
    const number = (data[at + 1] << 8) | data[at + 2];
    const length = data[at + 3];
    if (length < 4 || at + length > data.length) break;
    if (number <= previous || number > MAX_BASIC_LINE) break;
    previous = number;
    found++;
    at += length;
  }
  return found;
}

/**
 * Put back an end-of-program marker the tape destroyed.
 *
 * These programs are a BASIC program, then `0x0D 0xFF`, then a blob the
 * program copies to &7C00 - MODE 7 screen memory - to draw its title. The
 * BASIC half decodes perfectly in SNAKE and GALAXY; a single byte, the one
 * BASIC's own format says must be 0xFF, came off the tape as 0x80 and 0xCC.
 * Without it the machine answers `Bad program` for a program that is
 * entirely there.
 *
 * ONLY that one byte is written, and only when the program has demonstrably
 * ENDED: the line chain must be perfect up to the break, and no run of
 * further records may follow it. BREAKOU fails that second test - ten more
 * records follow its break, so its damage is a corrupted line HEADER with
 * real code after it, and repairing it would truncate the game. It stays
 * marked damaged, which is the honest answer.
 */
/** The line number of the last record before `end`. */
function lastLineNumber(data: Uint8Array, end: number): number {
  let at = 0;
  let previous = -1;
  while (at + 3 < data.length && at < end && data[at] === 0x0d) {
    if (data[at + 1] === 0xff) break;
    const number = (data[at + 1] << 8) | data[at + 2];
    const length = data[at + 3];
    if (length < 4 || at + length > data.length || number <= previous || number > MAX_BASIC_LINE) break;
    previous = number;
    at += length;
  }
  return previous;
}

export function repairTerminator(data: Uint8Array): { data: Uint8Array; repaired: boolean } {
  const shape = inspectProgram(data);
  if (shape.kind !== 'tokenised' || shape.terminated) return { data, repaired: false };

  const at = shape.brokeAt;
  if (at === null || at + 1 >= data.length || data[at] !== 0x0d) return { data, repaired: false };

  // The last line actually read, which anything claiming to continue the
  // program has to come after.
  const lastLine = lastLineNumber(data, at);
  for (let i = at + 1; i < Math.min(data.length, at + 1 + RESYNC_WINDOW); i++) {
    if (data[i] !== 0x0d) continue;
    if (recordsFrom(data, i, lastLine) >= CONTINUES_AFTER) return { data, repaired: false };
  }

  const mended = Uint8Array.from(data);
  mended[at + 1] = 0xff;
  // Only a repair if it actually produced a program that ends.
  if (!inspectProgram(mended).terminated) return { data, repaired: false };
  return { data: mended, repaired: true };
}
