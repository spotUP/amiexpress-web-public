/**
 * A RIP screen as a document that can be read, edited in one place, and
 * written back.
 *
 * WHY THIS SHAPE, and not "parse to typed commands and print them again".
 *
 * A .rip file is a program, and its extension is routing: `screen-security.util.ts`
 * decides which caller is served by the type extension, so the manager may not
 * normalise a RIP screen it merely opened. Measured on this board's 149 .rip
 * files on 2026-09-07, the obvious approach fails hard: `RIPParser`
 * (packages/terminal/src/rip/RIPParser.ts) parsed to typed commands and
 * printed back reproduces ZERO of the 149 files and loses roughly two thirds
 * of a typical file's bytes. It drops commands it cannot parse (RIPscrip 2.0
 * residue lives in the gallery art), drops the physical line layout and the
 * backslash continuations nine files use, and its field widths for the two
 * commands an authoring UI must rewrite - 1M mouse fields and 1U buttons -
 * disagree with the RIPtermJS renderer that actually draws the board.
 *
 * So the model is layered:
 *
 *  - the DOCUMENT layer keeps every line's exact bytes plus the spans of the
 *    instructions on it. Serializing an untouched document is the identity;
 *    the corpus test proves that for all 149 files.
 *  - the TYPED layer decodes and re-encodes the arguments of one instruction
 *    at a time, using the same field widths RIPtermJS's own command table
 *    uses (its `parseRIPargs2` format strings, transcribed below). Editing a
 *    mouse field rewrites that instruction's bytes and nothing else: an
 *    unknown v2 command sitting on the next line survives untouched.
 *
 * Reference for the format: the RIPscrip 1.54 specification, and
 * github.com/cwensley/pablodraw, which reads and writes RIPscrip.
 *
 * Pure: no fs, no path, no Node built-ins. The admin bundles it through the
 * `@bbs/screens` alias, the same way it already bundles the MCI parser, so
 * the browser and the board cannot disagree about what a RIP file says.
 */

// ---------------------------------------------------------------------------
// MegaNum: RIP's base-36 fixed-width integers.
// ---------------------------------------------------------------------------

const MEGANUM_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Decode a fixed-width MegaNum. Case-insensitive, as the renderer's parseInt is. */
export function decodeMegaNum(text: string): number {
  return parseInt(text, 36);
}

/**
 * Encode a MegaNum into exactly `width` digits.
 *
 * Throws rather than truncating: RIP arguments are positional and
 * fixed-width, so a value that overruns its field silently eats the next
 * one - a mouse region whose y1 has become part of its "invert" flag.
 */
export function encodeMegaNum(value: number, width: number): string {
  if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    throw new Error(`${value} is not a RIP argument (whole, not negative)`);
  }
  let out = '';
  let v = value;
  do {
    out = MEGANUM_DIGITS[v % 36] + out;
    v = Math.floor(v / 36);
  } while (v > 0);
  if (out.length > width) {
    throw new Error(`${value} does not fit in ${width} MegaNum digit${width === 1 ? '' : 's'}`);
  }
  return out.padStart(width, '0');
}

// ---------------------------------------------------------------------------
// Escaping, mirroring the renderer's byte reader.
// ---------------------------------------------------------------------------

/**
 * Undo RIP's escapes.
 *
 * RIPtermJS's stream reader drops a backslash and takes the next byte
 * literally (ST_BSLASH), which is what makes `\|` a pipe inside a host
 * command rather than the end of the instruction. A backslash before the
 * line ending is a continuation and both bytes vanish.
 */
export function unescapeRipText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') {
      out += text[i];
      continue;
    }
    const next = text[i + 1];
    if (next === '\r') {
      i += text[i + 2] === '\n' ? 2 : 1; // continuation: nothing is emitted
      continue;
    }
    if (next === '\n') {
      i += 1;
      continue;
    }
    if (next === undefined) continue;
    out += next;
    i += 1;
  }
  return out;
}

/**
 * Escape what would otherwise end an instruction, and nothing else.
 *
 * `|` and `\` always need it. `!` only does when it would form `!|` - the
 * renderer's ST_RIPBANG treats a bare `!` followed by anything else as an
 * ordinary character, and this board's own art relies on that: "Help !!" and
 * "Instant Logoff<>!^M" are written unescaped in 20 gallery screens. A `!`
 * at the very end is escaped too, because the separator that follows it would
 * complete the sequence.
 *
 * A handful of files DO escape a `!` that needs no escape (the conference
 * BBSTITLE set, from whichever art program wrote them). Both spellings mean the same
 * character, so the writers below keep an argument's original bytes whenever
 * its value has not changed rather than picking a winner.
 */
export function escapeRipText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' || ch === '|') out += '\\';
    else if (ch === '!' && (i === text.length - 1 || text[i + 1] === '|')) out += '\\';
    out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The argument table.
// ---------------------------------------------------------------------------

/**
 * How many MegaNum digits each argument of each command takes.
 *
 * Transcribed from the `parseRIPargs2` format strings in the vendored
 * RIPtermJS command table (packages/terminal/src/rip/vendor/ripterm.js), so
 * the editor and the renderer read a file the same way. A digit is a field of
 * that many characters, `*` is the rest of the instruction as text, and
 * `POLY` is the variable form npoints:2 followed by npoints x,y pairs.
 *
 * Deliberately NOT taken from `RIPParser.ts`: measured on 2026-09-07 its
 * widths for 1M and 1U disagree with the renderer.
 */
export const RIP_ARG_FORMATS: Record<string, string> = {
  // Level 0
  w: '222211',            // text window
  v: '2222',              // viewport
  '*': '',                // reset windows
  e: '',                  // erase window
  E: '',                  // erase view
  g: '22',                // goto xy
  H: '',                  // home
  '>': '',                // erase to end of line
  c: '2',                 // colour
  Q: '2222222222222222',  // set palette - sixteen EGA hardware indices
  a: '22',                // one palette entry
  W: '2',                 // write mode
  m: '22',                // move
  T: '*',                 // text at the cursor
  '@': '22*',             // text at x,y
  Y: '2222',              // font style
  X: '22',                // pixel
  L: '2222',              // line
  R: '2222',              // rectangle
  B: '2222',              // bar
  C: '222',               // circle
  O: '222222',            // oval (the renderer runs it as an oval arc)
  o: '2222',              // filled oval
  A: '22222',             // arc
  V: '222222',            // oval arc
  I: '22222',             // pie slice
  i: '222222',            // oval pie slice
  Z: '222222222',         // bezier
  P: 'POLY',              // polygon
  p: 'POLY',              // filled polygon
  l: 'POLY',              // polyline
  F: '222',               // flood fill
  '=': '242',             // line style
  S: '22',                // fill style
  s: '222222222',         // fill pattern
  h: '242',               // header
  '#': '',                // no more - end of scene
  // Level 1
  '1M': '22222115*',      // mouse field: num x0 y0 x1 y1 invert clear reserved command
  '1K': '',               // kill mouse fields
  '1C': '22221',          // get image
  '1P': '2221',           // put image
  '1I': '22212*',         // load icon
  '1B': '22242222222222', // button style
  '1U': '2222211*',       // button: x0 y0 x1 y1 hotkey flags reserved text
  '1\x1b': '13*',         // query
};

export type RipArgValue = number | string;

/**
 * Decode an instruction's arguments into numbers and trailing text.
 *
 * `args` must already be unescaped (see `unescapeRipText`). Returns null for
 * a command the table does not describe - a RIPscrip 2.0 opcode, say - which
 * is a fact about the command, not a failure: the document keeps its bytes
 * either way.
 */
export function decodeRipArgs(opcode: string, args: string): RipArgValue[] | null {
  const fmt = RIP_ARG_FORMATS[opcode];
  if (fmt === undefined) return null;
  if (fmt === 'POLY') {
    const npoints = decodeMegaNum(args.slice(0, 2));
    const out: RipArgValue[] = [npoints];
    if (!Number.isFinite(npoints) || npoints > 512) return null;
    for (let n = 0; n < npoints * 2; n++) {
      out.push(decodeMegaNum(args.substr(n * 2 + 2, 2)));
    }
    return out;
  }
  const out: RipArgValue[] = [];
  let pos = 0;
  for (const field of fmt) {
    if (field === '*') {
      out.push(args.slice(pos));
      pos = args.length;
      continue;
    }
    const width = Number(field);
    out.push(decodeMegaNum(args.substr(pos, width)));
    pos += width;
  }
  return out;
}

/**
 * The inverse of `decodeRipArgs`. The result is escaped, ready for a file.
 *
 * `rawTail` writes the trailing text argument verbatim instead of escaping
 * it. That is how an edit that changes only a coordinate leaves a label's
 * own bytes - including an escape this writer would not have chosen - exactly
 * as the art program wrote them.
 */
export function encodeRipArgs(opcode: string, values: RipArgValue[], rawTail?: string): string {
  const fmt = RIP_ARG_FORMATS[opcode];
  if (fmt === undefined) throw new Error(`No argument format for RIP command ${JSON.stringify(opcode)}`);
  if (fmt === 'POLY') {
    const npoints = Number(values[0]);
    let out = encodeMegaNum(npoints, 2);
    for (let n = 0; n < npoints * 2; n++) out += encodeMegaNum(Number(values[n + 1]), 2);
    return out;
  }
  let out = '';
  let index = 0;
  for (const field of fmt) {
    const value = values[index++];
    if (field === '*') {
      out += rawTail !== undefined ? rawTail : escapeRipText(String(value ?? ''));
      continue;
    }
    out += encodeMegaNum(Number(value), Number(field));
  }
  return out;
}

/** How many characters of an instruction's arguments come before its text. */
export function ripFixedArgLength(opcode: string): number {
  const fmt = RIP_ARG_FORMATS[opcode];
  if (!fmt || fmt === 'POLY') return 0;
  let total = 0;
  for (const field of fmt) if (field !== '*') total += Number(field);
  return total;
}

/**
 * The raw bytes of the text argument, escapes and continuations intact.
 *
 * Counted in UNESCAPED characters, because that is what the field widths
 * measure: a `\|` in the fixed part would be one character to the renderer
 * and two on disk.
 */
export function ripRawTail(opcode: string, rawArgs: string): string | undefined {
  const wanted = ripFixedArgLength(opcode);
  let plain = 0;
  let i = 0;
  while (i < rawArgs.length && plain < wanted) {
    if (rawArgs[i] === '\\') {
      const width = escapeLength(rawArgs, i);
      i += width;
      if (width === 2) plain += 1; // an escaped character; a continuation is nothing
      continue;
    }
    i += 1;
    plain += 1;
  }
  return plain === wanted ? rawArgs.slice(i) : undefined;
}

// ---------------------------------------------------------------------------
// The document layer.
// ---------------------------------------------------------------------------

export interface RipInstruction {
  /** The opcode exactly as written: `c`, `@`, `1M`, `1` + ESC for a query. */
  opcode: string;
  /** Everything after the opcode, raw - escapes and continuations intact. */
  args: string;
  /** What ended it: `|`, `!|`, or empty at the end of the line. */
  terminator: string;
  /** Where it sits in the line's `raw`, terminator included. */
  start: number;
  end: number;
}

export interface RipLine {
  /** The logical line's exact bytes, continuations included, EOL excluded. */
  raw: string;
  /** The line ending as written: `\r\n`, `\n`, `\r`, or empty at end of file. */
  eol: string;
  /** Whether the line opened with `!|` - only those carry instructions. */
  rip: boolean;
  instructions: RipInstruction[];
}

export interface RipDocument {
  lines: RipLine[];
}

/**
 * How far a continuation or an escape reaches from a backslash at `i`.
 * Returns 0 when the backslash is the last byte of the text.
 */
function escapeLength(text: string, i: number): number {
  const next = text[i + 1];
  if (next === undefined) return 1;
  if (next === '\r') return text[i + 2] === '\n' ? 3 : 2;
  return 2;
}

function splitInstructions(raw: string): RipInstruction[] {
  const out: RipInstruction[] = [];
  let start = 2; // past the '!|'
  let p = 2;
  const emit = (end: number, terminator: string) => {
    const body = raw.slice(start, end - terminator.length);
    const opcode = readOpcode(body);
    out.push({
      opcode,
      args: body.slice(opcode.length),
      terminator,
      start,
      end,
    });
    start = end;
  };
  while (p < raw.length) {
    const ch = raw[p];
    if (ch === '\\') {
      p += escapeLength(raw, p);
      continue;
    }
    if (ch === '|') {
      emit(p + 1, '|');
      p += 1;
      continue;
    }
    // An unescaped '!|' inside arguments starts the next command; the
    // renderer's ST_RIPBANG does the same thing.
    if (ch === '!' && raw[p + 1] === '|') {
      emit(p + 2, '!|');
      p += 2;
      continue;
    }
    p += 1;
  }
  emit(raw.length, '');
  return out;
}

/**
 * The opcode of an instruction body: any leading digits (the level) plus one
 * character. `/^[0-9]*./` is exactly what RIPtermJS's `parseRIPcmd` uses.
 */
function readOpcode(body: string): string {
  const match = /^[0-9]*[\s\S]/.exec(body);
  return match ? match[0] : '';
}

/**
 * Read a .rip file into lines and instructions.
 *
 * `text` is the file's bytes widened one byte per character (latin1) - never
 * a UTF-8 decode, which would fold an Amiga high-bit byte into U+FFFD.
 */
export function parseRipDocument(text: string): RipDocument {
  const lines: RipLine[] = [];
  let i = 0;
  while (i < text.length) {
    const lineStart = i;
    const rip = text.startsWith('!|', lineStart);
    let eol = '';
    while (i < text.length) {
      const ch = text[i];
      // Continuations and escapes only exist inside a RIP instruction; on a
      // plain text line a backslash is just a byte.
      if (rip && ch === '\\') {
        i += escapeLength(text, i);
        continue;
      }
      if (ch === '\r') {
        eol = text[i + 1] === '\n' ? '\r\n' : '\r';
        break;
      }
      if (ch === '\n') {
        eol = '\n';
        break;
      }
      i += 1;
    }
    const raw = text.slice(lineStart, i);
    lines.push({ raw, eol, rip, instructions: rip ? splitInstructions(raw) : [] });
    i += eol.length;
  }
  return { lines };
}

/** Write the document back out. For an untouched document this is the identity. */
export function serializeRipDocument(doc: RipDocument): string {
  let out = '';
  for (const line of doc.lines) out += line.raw + line.eol;
  return out;
}

/** The line ending this file is written with, for lines we add ourselves. */
export function documentEol(doc: RipDocument): string {
  for (const line of doc.lines) if (line.eol) return line.eol;
  return '\r\n';
}

/**
 * Replace one instruction's bytes, leaving every other byte of the file
 * alone. The line is re-parsed so the spans stay true.
 */
function replaceInstruction(
  doc: RipDocument,
  lineIndex: number,
  instIndex: number,
  body: string,
): RipDocument {
  const lines = doc.lines.slice();
  const line = lines[lineIndex];
  const inst = line.instructions[instIndex];
  const raw =
    line.raw.slice(0, inst.start) + body + inst.terminator + line.raw.slice(inst.end);
  lines[lineIndex] = { ...line, raw, instructions: splitInstructions(raw) };
  return { lines };
}

// ---------------------------------------------------------------------------
// The authoring layer: the interactive parts of a scene.
// ---------------------------------------------------------------------------

export type RipHotspotKind = 'mouse' | 'button';

/**
 * A clickable region of a RIP scene: a mouse field (`1M`) or a button (`1U`).
 *
 * These, and not the drawing, are what a sysop needs to change when a
 * conference moves or a door is renamed - the picture says "Files" and the
 * region behind it still sends the old command.
 */
export interface RipHotspot {
  kind: RipHotspotKind;
  /** Where the instruction lives, so an edit can address it. */
  line: number;
  index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The text sent to the BBS when the caller clicks it. */
  command: string;
  /** Mouse fields: the field number, and the two display flags. */
  num?: number;
  invert?: boolean;
  clear?: boolean;
  /** Buttons: the hotkey byte and the style flags. */
  hotkey?: number;
  flags?: number;
  /** Buttons: RIP packs `icon<>label<>command` into one text argument. */
  icon?: string;
  label?: string;
}

/** RIP splits a button's text argument into icon, label and host command. */
function splitButtonText(text: string): { icon: string; label: string; command: string } {
  const [icon = '', label = '', command = ''] = text.split('<>');
  return { icon, label, command };
}

function joinButtonText(spot: RipHotspot): string {
  return `${spot.icon ?? ''}<>${spot.label ?? ''}<>${spot.command}`;
}

/** Every mouse field and button in the scene, in the order it is drawn. */
export function readRipHotspots(doc: RipDocument): RipHotspot[] {
  const out: RipHotspot[] = [];
  doc.lines.forEach((line, lineIndex) => {
    line.instructions.forEach((inst, index) => {
      if (inst.opcode !== '1M' && inst.opcode !== '1U') return;
      const values = decodeRipArgs(inst.opcode, unescapeRipText(inst.args));
      if (!values || values.some(v => typeof v === 'number' && !Number.isFinite(v))) return;
      if (inst.opcode === '1M') {
        const [num, x0, y0, x1, y1, invert, clear, , command] = values as
          [number, number, number, number, number, number, number, number, string];
        out.push({
          kind: 'mouse', line: lineIndex, index,
          num, x0, y0, x1, y1,
          invert: invert !== 0, clear: clear !== 0,
          command,
        });
      } else {
        const [x0, y0, x1, y1, hotkey, flags, , text] = values as
          [number, number, number, number, number, number, number, string];
        const parts = splitButtonText(text);
        out.push({
          kind: 'button', line: lineIndex, index,
          x0, y0, x1, y1, hotkey, flags,
          icon: parts.icon, label: parts.label, command: parts.command,
        });
      }
    });
  });
  return out;
}

/**
 * The bytes one hotspot serializes to, opcode included.
 *
 * `original` is the instruction it replaces, if any: when the text argument
 * has not changed, its bytes are carried over rather than re-escaped, so an
 * edit that moves a region cannot also rewrite its label.
 */
function hotspotBody(spot: RipHotspot, original?: RipInstruction): string {
  const opcode = spot.kind === 'mouse' ? '1M' : '1U';
  const text = spot.kind === 'mouse' ? spot.command : joinButtonText(spot);

  let rawTail: string | undefined;
  if (original && original.opcode === opcode) {
    const tail = ripRawTail(opcode, original.args);
    if (tail !== undefined && unescapeRipText(tail) === text) rawTail = tail;
  }

  const values: RipArgValue[] = spot.kind === 'mouse'
    ? [spot.num ?? 1, spot.x0, spot.y0, spot.x1, spot.y1,
       spot.invert ? 1 : 0, spot.clear ? 1 : 0, 0, text]
    : [spot.x0, spot.y0, spot.x1, spot.y1,
       spot.hotkey ?? 0, spot.flags ?? 0, 0, text];

  return opcode + encodeRipArgs(opcode, values, rawTail);
}

/**
 * Write a changed hotspot back. Returns a new document; the caller's is
 * untouched, and every byte outside this one instruction is preserved.
 */
export function writeRipHotspot(doc: RipDocument, spot: RipHotspot): RipDocument {
  const inst = doc.lines[spot.line]?.instructions[spot.index];
  if (!inst || (inst.opcode !== '1M' && inst.opcode !== '1U')) {
    throw new Error(`No RIP mouse field or button at line ${spot.line}, instruction ${spot.index}`);
  }
  return replaceInstruction(doc, spot.line, spot.index, hotspotBody(spot, inst));
}

/**
 * Delete a hotspot. If it was the only instruction on its line, the line goes
 * too - an empty `!|` line is not something a RIP file contains.
 */
export function removeRipHotspot(doc: RipDocument, spot: { line: number; index: number }): RipDocument {
  const lines = doc.lines.slice();
  const line = lines[spot.line];
  if (!line) throw new Error(`No line ${spot.line} in this RIP screen`);
  const inst = line.instructions[spot.index];
  if (!inst) throw new Error(`No instruction ${spot.index} on line ${spot.line}`);

  const kept = line.instructions
    .filter((_, i) => i !== spot.index)
    .filter(i => i.opcode !== '');
  if (kept.length === 0) {
    lines.splice(spot.line, 1);
    return { lines };
  }
  // Each survivor keeps its own bytes and its own separator; only the last
  // loses its terminator, because the line ending is what ends it.
  const raw = '!|' + kept
    .map((i, n) => i.opcode + i.args + (n === kept.length - 1 ? '' : i.terminator || '|'))
    .join('');
  lines[spot.line] = { ...line, raw, instructions: splitInstructions(raw) };
  return { lines };
}

export interface NewRipMouseField {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  command: string;
  invert?: boolean;
  clear?: boolean;
}

/**
 * Add a mouse field to a scene, on a line of its own.
 *
 * Placed before RIP_NO_MORE (`#`) when the file has one: `#` ends the scene,
 * and a field written after it never runs. Numbered after the fields already
 * there, because the number is how the terminal tells regions apart.
 */
export function addRipMouseField(doc: RipDocument, field: NewRipMouseField): RipDocument {
  const highest = readRipHotspots(doc)
    .filter(s => s.kind === 'mouse')
    .reduce((max, s) => Math.max(max, s.num ?? 0), 0);

  const body = hotspotBody({
    kind: 'mouse', line: 0, index: 0,
    num: highest + 1,
    x0: field.x0, y0: field.y0, x1: field.x1, y1: field.y1,
    invert: field.invert ?? true,
    clear: field.clear ?? false,
    command: field.command,
  });

  const raw = '!|' + body;
  const eol = documentEol(doc);
  const lines = doc.lines.slice();
  const line: RipLine = { raw, eol, rip: true, instructions: splitInstructions(raw) };

  const endOfScene = lines.findIndex(l => l.instructions.some(i => i.opcode === '#'));
  if (endOfScene >= 0) {
    lines.splice(endOfScene, 0, line);
    return { lines };
  }

  // No end marker: append, taking care that the last line may have had no
  // line ending of its own.
  const last = lines[lines.length - 1];
  if (last && !last.eol) lines[lines.length - 1] = { ...last, eol };
  lines.push(line);
  return { lines };
}
