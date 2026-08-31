/**
 * Amiga .info File Parser and Writer
 *
 * Handles Amiga Workbench icon files (.info). Preserves all binary data
 * (images, drawer data, secondary icon structures like NewIcons) by
 * identifying the tooltype array's byte range and writing only length-
 * prefixed entries back in place.
 *
 * File format reference (binary icons):
 *   [DiskObject struct (78 bytes, starts with magic 0xE310)]
 *   [Gadget Image 1 data]
 *   [Gadget Image 2 data (if SelectRender != NULL)]
 *   [DefaultTool string (4-byte BE length + data, if do_DefaultTool != NULL)]
 *   [ToolTypes array:
 *     4-byte BE count = (n + 1) * 4
 *     n entries of (4-byte BE length + null-terminated string)
 *   ]
 *   [DrawerData (if do_DrawerData != NULL)]
 *   [ToolWindow string (if do_ToolWindow != NULL)]
 *   [NewIcons extension chunks, etc.]
 */

import * as fs from 'fs';

export interface Tooltype {
  /**
   * How this entry was disabled in the file: Amiga parentheses or a bang.
   * Preserved so an edit does not rewrite every disabled tooltype into the
   * other syntax - the ACS files use parentheses, which is what express.e and
   * a real Amiga read.
   */
  commentStyle?: '()' | '!';
  key: string;
  value: string;
  commented: boolean;
  prefix: string;
  originalLine: string;
}

export interface InfoFile {
  filePath: string;
  isBinary: boolean;
  /**
   * The line ending a TEXT .info already uses.
   *
   * The writer joined with '\n' unconditionally, so editing one field of a
   * CRLF door icon rewrote every line in it. Harmless to a parser and not the
   * writer's business: a save should change what the sysop changed.
   */
  lineEnding?: '\n' | '\r\n';
  /**
   * Did the TEXT file end with a line ending?
   *
   * Two door icons on this board do not, and the writer appended one - so a
   * save that removed a tooltype also grew the file by a byte it had never
   * had. Same rule as lineEnding: change what was asked for.
   */
  trailingNewline?: boolean;
  diskObject: Buffer;   // Everything before the tooltype array's count field
  iconData: Buffer;     // Everything after the last tooltype entry
  tooltypes: Tooltype[];
  rawBuffer: Buffer;
}

const AMIGA_PREFIX_CHARS = new Set(['#', '+', '%', "'"]);

/**
 * Parse a single tooltype string (as stored in the .info file) into a
 * Tooltype record. Handles Amiga comment prefixes `(name)`, `!name`, and
 * the special prefix characters #, +, %, '.
 */
// Amiga tooltypes are effectively "KEY=VALUE" with keys drawn from a wide
// ASCII subset. Real .info files use characters like '/' and '-' in keys
// (e.g. WHO.info uses "Level_to_see_up/dl"), so we accept any printable
// non-'=' byte in the key. The uppercase conversion preserves the
// historical behavior callers expect for lookups.
const VALID_KEY_RE = /^[!-<>-~]+$/; // printable ASCII except '='

function parseTooltypeString(raw: string): Tooltype | null {
  let content = raw;
  let commented = false;
  let prefix = '';

  let commentStyle: '()' | '!' | undefined;
  if (content.startsWith('!')) {
    commented = true;
    commentStyle = '!';
    content = content.substring(1);
  } else if (content.startsWith('(') && content.endsWith(')')) {
    commented = true;
    commentStyle = '()';
    content = content.substring(1, content.length - 1);
  }

  if (content.length > 0 && AMIGA_PREFIX_CHARS.has(content[0])) {
    prefix = content.substring(0, 1);
    content = content.substring(1);
  }

  const eqIdx = content.indexOf('=');
  if (eqIdx !== -1) {
    const rawKey = content.substring(0, eqIdx).trim();
    const key = rawKey.toUpperCase();
    const value = content.substring(eqIdx + 1).trim();
    if (!VALID_KEY_RE.test(rawKey)) return null;
    return { key, value, commented, commentStyle, prefix, originalLine: raw };
  }
  const rawKey = content.trim();
  const key = rawKey.toUpperCase();
  if (!VALID_KEY_RE.test(rawKey)) return null;
  return { key, value: '', commented, commentStyle, prefix, originalLine: raw };
}

/**
 * Render a Tooltype back to its on-disk string form (null terminator
 * added separately by the writer).
 */
function renderTooltype(tt: Tooltype): string {
  const body = `${tt.prefix || ''}${tt.key}`;
  const entry = tt.value ? `${body}=${tt.value}` : body;
  if (!tt.commented) return entry;
  // Parentheses when the file used them; a bang otherwise, which keeps the
  // previous behaviour for entries nobody parsed from a file.
  return tt.commentStyle === '()' ? `(${entry})` : `!${entry}`;
}

/**
 * Validate that a byte buffer slice looks like an Amiga tooltype string
 * (printable ASCII, optional trailing null).
 */
function looksLikeTooltypeBytes(buf: Buffer, start: number, len: number): boolean {
  if (len < 2 || len > 512) return false;
  if (start + len > buf.length) return false;
  // Allow up to one trailing null (the normal terminator)
  const endByte = buf[start + len - 1];
  const payloadEnd = endByte === 0 ? start + len - 1 : start + len;
  // Body must be printable (plus ESC 0x1b for ANSI in values).
  //
  // "Printable" includes the high half. A tooltype value is Amiga text, which
  // is Latin-1, and this repo's own .info files carry UTF-8 too - the DayDream
  // door descriptions contain an em dash. Rejecting anything above 0x7e made
  // those files fail to parse as structured icons.
  for (let i = start; i < payloadEnd; i++) {
    const c = buf[i];
    if (c === 0x1b) continue;
    if (c >= 0x80) continue;
    if (c < 0x20 || c === 0x7f) return false;
  }
  // Must contain at least one letter or digit (not all whitespace/punct)
  let hasAlpha = false;
  for (let i = start; i < payloadEnd; i++) {
    const c = buf[i];
    if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      hasAlpha = true;
      break;
    }
  }
  return hasAlpha;
}

/**
 * Locate the tooltype array within a binary .info buffer. Returns the
 * offset of the 4-byte count field (one word before the first entry's
 * length prefix) and the offset just past the last entry, or null if no
 * tooltype array is found.
 *
 * Strategy: scan forward from byte 78 (after minimum DiskObject header),
 * looking for a 4-byte value N where N-4 is a valid entry length and
 * the bytes at position+4 follow the `(len, string+\0)` pattern for at
 * least one entry.
 */
/**
 * Walk the DiskObject to the tooltype array's real offset.
 *
 * The scanner below hunts for the array by looking for a plausible count
 * word anywhere after byte 40. That guesses, and it guesses wrong in two
 * directions on this board's own files:
 *
 * It requires EVERY entry to carry a 4-byte length prefix. The board's own
 * Conf<N>.info and Node<N>.info carry a correct count and a prefix on the
 * FIRST entry only; the rest are bare NUL-terminated strings. Twenty-one
 * files in this checkout are written that way - Conf1..14, Node1..6 - so the
 * parse fell back to scraping ASCII out of the bytes, which marks the file
 * `_fallback`, and writeInfoFile then refused it outright. That is how
 * "tooltype array structure not recognised" reached the sysop the first time
 * he edited a conference.
 *
 * It does not need guessing. The offset is computable: DiskObject is 78
 * bytes, DrawerData another 56 when do_DrawerData is set, then the render
 * image and the select image when their Gadget pointers are set (an Image is
 * 20 bytes plus ((width+15)/16)*2*height*depth of planes), then the default
 * tool string when do_DefaultTool is set. What follows is the array.
 *
 * Field offsets are from the file layout, not from a struct on this machine:
 * ga_GadgetRender is at 22 and ga_SelectRender at 26 because Gadget starts at
 * byte 4 and its own GadgetRender is at +18.
 *
 * Measured over every .info in this repo before it was written: on the 1012
 * icons both approaches can read, they return the same offset and the same
 * strings; the structural walk reads 43 more (this checkout's 21 plus the
 * worktrees' copies) and there is no file the scanner reads that it cannot.
 * The scanner stays behind it for anything whose header does not describe its
 * own layout.
 */
function locateTooltypeArrayStructural(
  buf: Buffer
): { countOffset: number; entriesEnd: number; strings: string[] } | null {
  if (buf.length < 78) return null;

  const gadgetRender = buf.readUInt32BE(22);
  const selectRender = buf.readUInt32BE(26);
  const defaultTool = buf.readUInt32BE(50);
  const toolTypes = buf.readUInt32BE(54);
  const drawerData = buf.readUInt32BE(66);

  // A NULL do_ToolTypes means the icon genuinely carries none.
  if (toolTypes === 0) return null;

  let pos = 78;
  if (drawerData !== 0) pos += 56;

  const skipImage = (at: number): number => {
    if (at + 20 > buf.length) return -1;
    const width = buf.readUInt16BE(at + 4);
    const height = buf.readUInt16BE(at + 6);
    const depth = buf.readUInt16BE(at + 8);
    if (width === 0 || height === 0 || depth === 0 || depth > 8) return -1;
    const rowBytes = Math.ceil(width / 16) * 2;
    return at + 20 + rowBytes * height * depth;
  };

  if (gadgetRender !== 0) {
    pos = skipImage(pos);
    if (pos < 0) return null;
  }
  if (selectRender !== 0) {
    pos = skipImage(pos);
    if (pos < 0) return null;
  }
  if (defaultTool !== 0) {
    if (pos + 4 > buf.length) return null;
    const len = buf.readUInt32BE(pos);
    if (len > 4096) return null;
    pos += 4 + len;
  }

  if (pos + 4 > buf.length) return null;
  const count = buf.readUInt32BE(pos);
  if (count < 8 || count > 804 || count % 4 !== 0) return null;

  const countOffset = pos;
  const numEntries = count / 4 - 1;
  const strings: string[] = [];
  pos += 4;

  for (let i = 0; i < numEntries; i++) {
    if (pos + 4 > buf.length) return null;

    // The standard form: a 4-byte length, then the string and its NUL.
    const entryLen = buf.readUInt32BE(pos);
    if (
      entryLen >= 2 &&
      entryLen <= 512 &&
      pos + 4 + entryLen <= buf.length &&
      buf[pos + 4 + entryLen - 1] === 0 &&
      looksLikeTooltypeBytes(buf, pos + 4, entryLen)
    ) {
      strings.push(buf.toString('latin1', pos + 4, pos + 4 + entryLen - 1));
      pos += 4 + entryLen;
      continue;
    }

    // The form this board's files actually use for entries 2..n: no length,
    // just the string and its NUL.
    const end = buf.indexOf(0, pos);
    if (end < 0 || end - pos < 1 || end - pos > 512) return null;
    if (!looksLikeTooltypeBytes(buf, pos, end - pos + 1)) return null;
    strings.push(buf.toString('latin1', pos, end));
    pos = end + 1;
  }

  if (strings.length === 0) return null;
  return { countOffset, entriesEnd: pos, strings };
}

function locateTooltypeArray(buf: Buffer): { countOffset: number; entriesEnd: number; strings: string[] } | null {
  for (let scan = 40; scan < buf.length - 8; scan++) {
    // Candidate count field at `scan`. Skip misaligned candidates early.
    if (buf.readUInt32BE(scan) === 0) continue;
    const count = buf.readUInt32BE(scan);
    // Count must be (n+1)*4 with 1 <= n <= 200, so valid values are 8..804
    if (count < 8 || count > 804 || count % 4 !== 0) continue;

    const numEntries = count / 4 - 1;
    let pos = scan + 4;
    const strings: string[] = [];
    let ok = true;

    for (let i = 0; i < numEntries; i++) {
      if (pos + 4 > buf.length) { ok = false; break; }
      const entryLen = buf.readUInt32BE(pos);
      if (entryLen < 2 || entryLen > 512) { ok = false; break; }
      pos += 4;
      if (pos + entryLen > buf.length) { ok = false; break; }
      if (!looksLikeTooltypeBytes(buf, pos, entryLen)) { ok = false; break; }
      // Require null terminator in the last byte (standard Amiga format)
      if (buf[pos + entryLen - 1] !== 0) { ok = false; break; }
      strings.push(buf.toString('latin1', pos, pos + entryLen - 1));
      pos += entryLen;
    }

    if (ok && strings.length > 0) {
      return { countOffset: scan, entriesEnd: pos, strings };
    }
  }
  return null;
}

/**
 * The trailing IFF payload of a text .info, if it genuinely has one.
 *
 * This used to be `buffer.indexOf('FORM')` and everything after it, on the
 * theory that a text .info might carry an icon image on the end. The theory
 * does not survive the files: `Commands/BBSCmd/TC.info` is plain text whose
 * FIRST LINE is the word FORM, so the match landed at offset 0 and the whole
 * file became "icon data" - and since the writer emits the tooltypes AND
 * then the icon data, saving that door through the admin would have written
 * the file out twice over.
 *
 * A real FORM chunk carries its size: four bytes of big-endian length that
 * account for everything after them. Requiring that is the difference
 * between finding an IFF payload and finding the word.
 */
function locateIffPayload(buffer: Buffer): Buffer {
  let at = buffer.indexOf('FORM');
  while (at !== -1) {
    if (at + 8 <= buffer.length) {
      const declared = buffer.readUInt32BE(at + 4);
      if (declared === buffer.length - at - 8) return buffer.slice(at);
    }
    at = buffer.indexOf('FORM', at + 1);
  }
  return Buffer.alloc(0);
}

/**
 * Fallback extraction: scan the whole file for ASCII blobs that look
 * like tooltypes. Used for non-binary .info files or as a last resort
 * when the structured parse fails.
 */
function extractTooltypesFallback(buffer: Buffer): Tooltype[] {
  const tooltypes: Tooltype[] = [];
  const extracted: string[] = [];
  let current = '';
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    // Anything above 0x7e is text, not a delimiter: a tooltype VALUE is Amiga
    // Latin-1, and these files carry UTF-8 as well. Cutting the string at the
    // first high byte truncated every DayDream door's DESCRIPTION at its em
    // dash - and because the writer emits what the parser produced, saving
    // any other field on that door wrote the truncation to disk. Keys stay
    // ASCII: VALID_KEY_RE rejects a key with a high byte, so the extra bytes
    // can only ever land in a value.
    if (c >= 0x20 && c !== 0x7f) {
      current += String.fromCharCode(c);
    } else {
      if (current.length >= 2) extracted.push(current);
      current = '';
    }
  }
  if (current.length >= 2) extracted.push(current);

  for (const raw of extracted) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^[^a-zA-Z0-9+(%#'!]+/, '');
    const tt = parseTooltypeString(cleaned);
    if (tt) {
      tt.originalLine = raw;
      tooltypes.push(tt);
    }
  }
  return tooltypes;
}

/**
 * Does this buffer carry the placeholder "icon" the old
 * `InfoFileParser.write()` produced?
 *
 * That writer emitted 256 zero bytes with 0xE3100001 at the front, followed
 * by raw `KEY=VALUE\0` strings - no DiskObject, no gadget, no length-prefixed
 * tooltype array. `GetDiskObject` returns NIL on it (or a NULL do_ToolTypes),
 * so `FindToolType` finds nothing (tooltypes.e:215-218) and the settings the
 * admin saved simply went silent.
 *
 * A real DiskObject opens with the same four bytes - magic 0xE310 then
 * do_Version 1 - so the magic alone cannot tell them apart. What separates
 * them is the Gadget: a real icon carries a non-zero Width and Height at
 * offsets 12 and 14, while the placeholder is zero all the way to 256.
 *
 * Recognising it lets a file the admin already damaged be healed on the next
 * save instead of throwing InfoFileWriteError forever.
 */
function isPlaceholderIconHeader(buf: Buffer): boolean {
  if (buf.length < 256) return false;
  if (buf.readUInt32BE(0) !== 0xe3100001) return false;
  for (let i = 4; i < 256; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

/**
 * Parse an .info file into an InfoFile record. Supports both binary
 * Amiga DiskObject icons and plain-text variants.
 */
export function parseInfoFile(filePath: string): InfoFile {
  return parseInfoBuffer(fs.readFileSync(filePath), filePath);
}

/**
 * The same parse, over bytes that are already in hand.
 *
 * Callers that read through a cache (the file-checker list reads fifteen
 * icons on every page load) must not be forced to choose between the cache
 * and the real parser.
 */
export function parseInfoBuffer(buffer: Buffer, filePath = ''): InfoFile {
  const isBinary = buffer.length > 2 && buffer[0] === 0xe3 && buffer[1] === 0x10;

  if (!isBinary) {
    const iconData = locateIffPayload(buffer);
    const tooltypes = extractTooltypesFallback(buffer);
    return {
      filePath,
      isBinary: false,
      lineEnding: buffer.includes('\r\n') ? '\r\n' : '\n',
      trailingNewline: buffer.length === 0 || buffer[buffer.length - 1] === 0x0a,
      diskObject: Buffer.alloc(0),
      iconData,
      tooltypes,
      rawBuffer: buffer,
    };
  }

  if (isPlaceholderIconHeader(buffer)) {
    // Not an icon at all - see isPlaceholderIconHeader. Read it as the text
    // it effectively is, and drop the dead header so the next write produces
    // something the BBS can read. The icon it replaced is already gone; that
    // is not recoverable here, only stoppable, which Phase 1.1 does.
    return {
      filePath,
      isBinary: false,
      diskObject: Buffer.alloc(0),
      iconData: Buffer.alloc(0),
      tooltypes: extractTooltypesFallback(buffer.slice(256)),
      rawBuffer: buffer,
    };
  }

  // Structural first: it reads the offset out of the DiskObject instead of
  // hunting for it, so it finds the arrays the scanner cannot parse and does
  // not land in the middle of a bitmap. The scanner stays as the fallback for
  // anything whose header does not describe its own layout.
  const located = locateTooltypeArrayStructural(buffer) ?? locateTooltypeArray(buffer);
  if (located) {
    const tooltypes: Tooltype[] = [];
    for (const s of located.strings) {
      const tt = parseTooltypeString(s);
      if (tt) {
        tooltypes.push(tt);
      }
    }
    return {
      filePath,
      isBinary: true,
      diskObject: buffer.slice(0, located.countOffset),
      iconData: buffer.slice(located.entriesEnd),
      tooltypes,
      rawBuffer: buffer,
    };
  }

  // Binary file with no parseable tooltype array: preserve everything
  // and expose the heuristic extraction for read-only access. Marked
  // fallback so writeInfoFile knows not to corrupt the original
  // structure.
  const fallbackTooltypes = extractTooltypesFallback(buffer);
  const info: InfoFile = {
    filePath,
    isBinary: true,
    diskObject: buffer,
    iconData: Buffer.alloc(0),
    tooltypes: fallbackTooltypes,
    rawBuffer: buffer,
  };
  (info as InfoFileInternal)._fallback = true;
  return info;
}

/**
 * Internal marker for files that didn't yield a parseable tooltype
 * array. The writer treats these as read-only binary and refuses to
 * re-serialize them (to avoid appending junk to structures it doesn't
 * understand).
 */
interface InfoFileInternal extends InfoFile {
  _fallback?: boolean;
}

/**
 * Thrown when writeInfoFile cannot safely persist mutations because the
 * file's tooltype array structure isn't recognised (i.e. parseInfoFile
 * tagged it `_fallback`). Surfacing this as a real error prevents the
 * silent-[OK] bug where set/delete/enable/disable claimed success but
 * left the file unchanged.
 */
export class InfoFileWriteError extends Error {
  constructor(public readonly filePath: string, message: string) {
    super(message);
    this.name = 'InfoFileWriteError';
  }
}

/**
 * Write an InfoFile back to disk. For binary files the tooltype array
 * is serialized as a 4-byte BE count followed by length-prefixed,
 * null-terminated entries — preserving the surrounding DiskObject
 * structure, image data, and any trailing NewIcons chunks.
 *
 * Throws InfoFileWriteError if `info` was parsed in `_fallback` mode
 * (tooltype array structure not recognised). The previous behaviour
 * silently wrote the original bytes back, so set/delete looked like
 * they succeeded while the on-disk file was unchanged.
 */
export function writeInfoFile(info: InfoFile): void {
  if (info.isBinary) {
    if ((info as InfoFileInternal)._fallback) {
      throw new InfoFileWriteError(
        info.filePath,
        `Cannot write ${info.filePath}: tooltype array structure not recognised. ` +
        `This .info file uses a non-standard or corrupted layout — the in-memory ` +
        `tooltype list was extracted heuristically and changes cannot be safely ` +
        `re-serialised. Re-create the .info via Workbench/IconEdit, or fix the ` +
        `binary structure manually.`
      );
    }

    if (info.tooltypes.length === 0 && info.iconData.length === 0) {
      // Opaque binary without a recognized tooltype section.
      fs.writeFileSync(info.filePath, info.rawBuffer);
      return;
    }

    const entryBuffers: Buffer[] = [];
    for (const tt of info.tooltypes) {
      // Preserve original on-disk bytes for untouched tooltypes
      // (updateTooltype/removeTooltype re-write originalLine to a fresh
      // render, so modified entries still round-trip through
      // renderTooltype).
      const str = tt.originalLine || renderTooltype(tt);
      const strBuf = Buffer.from(str + '\0', 'latin1');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(strBuf.length, 0);
      entryBuffers.push(lenBuf, strBuf);
    }

    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32BE((info.tooltypes.length + 1) * 4, 0);

    fs.writeFileSync(
      info.filePath,
      Buffer.concat([info.diskObject, countBuf, ...entryBuffers, info.iconData])
    );
    return;
  }

  // Text mode: emit each tooltype on its own line, then any trailing FORM data.
  //
  // An untouched entry keeps its exact on-disk text, the same rule the binary
  // branch above follows. Re-rendering every line from key and value looks
  // equivalent and is not: the parser trims, so a description written
  // "DESCRIPTION=Absolute Pool file-listing door (untested " came back a byte
  // shorter every time the sysop saved anything else on that door.
  const eol = info.lineEnding ?? '\n';
  const lines = info.tooltypes.map(tt => tt.originalLine || renderTooltype(tt)).join(eol);
  // latin1, not utf8. The parser builds these strings with
  // String.fromCharCode over the raw bytes, so each char IS a byte; encoding
  // them back as UTF-8 turned every byte above 0x7e into two and corrupted
  // the file. The binary branch above has always used latin1 for the same
  // reason.
  const ends = info.trailingNewline ?? true;
  const textBuf = Buffer.from(lines + (lines && ends ? eol : ''), 'latin1');
  fs.writeFileSync(info.filePath, Buffer.concat([textBuf, info.iconData]));
}

/**
 * Parse an .info file, or hand back an empty text-mode record when it does
 * not exist yet.
 *
 * A caller that has to create the file cannot use `parseInfoFile` - it reads
 * from disk - and every one of them used to reach for a private writer
 * instead. Text is what the new-door path already writes
 * (`door-config.service.ts`), and `parseInfoFile` reads it back, so a created
 * file round-trips through the same code an existing one does.
 */
export function parseOrCreateInfoFile(filePath: string): InfoFile {
  if (fs.existsSync(filePath)) return parseInfoFile(filePath);
  return {
    filePath,
    isBinary: false,
    lineEnding: '\n',
    trailingNewline: true,
    diskObject: Buffer.alloc(0),
    iconData: Buffer.alloc(0),
    tooltypes: [],
    rawBuffer: Buffer.alloc(0),
  };
}

/**
 * Read a .info file as the map its callers want: uppercase key to value.
 *
 * Mirrors `FindToolType` (tooltypes.e:215-218): a commented-out tooltype is
 * not set, and where a key appears twice the FIRST one wins. Reading through
 * this means one parser owns the format - `InfoFileParser.parse` is a second,
 * weaker one that splits the file on NUL bytes and therefore cannot read a
 * plain-text .info at all, which is how a file written by one half of this
 * codebase became unreadable to the other.
 */
export function tooltypeMap(info: InfoFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const tt of info.tooltypes) {
    if (tt.commented) continue;
    if (out.has(tt.key)) continue;
    out.set(tt.key, tt.value);
  }
  return out;
}

/** `tooltypeMap` over a file on disk. */
export function readTooltypeMap(filePath: string): Map<string, string> {
  return tooltypeMap(parseInfoFile(filePath));
}

/**
 * Write a set of tooltypes into a .info file, in place.
 *
 * This is the one writer for the admin's lookup-table files
 * (ComputerList.info, XprTypes.info, Drives.info, ScreenTypes.info,
 * Node<N>.info, a language's or file checker's icon, a conference's).
 * Each of those used to build a complete `Map` and hand it to
 * `InfoFileParser.write()`, which destroyed the icon and produced a file
 * AmiExpress could not read.
 *
 * The icon image, the DiskObject and every tooltype the caller does not name
 * survive. `removeKeys` names the keys the caller OWNS - the ones it is
 * allowed to drop before writing its own set, which is how a flag written by
 * presence gets switched off, and how an entry removed from a numbered series
 * (`DRIVE.3`, `LIBRARY.7`) actually disappears.
 *
 * @param filePath    - the .info to write
 * @param assignments - key/value pairs to set, in order
 * @param opts.removeKeys - predicate over EXISTING uppercase keys: true drops
 */
export function applyTooltypes(
  filePath: string,
  assignments: Iterable<readonly [string, string]>,
  opts: { removeKeys?: (key: string) => boolean } = {}
): void {
  const info = parseOrCreateInfoFile(filePath);

  if (opts.removeKeys) {
    const drop = opts.removeKeys;
    info.tooltypes = info.tooltypes.filter(tt => !drop(tt.key));
  }

  for (const [key, value] of assignments) {
    // An entry that already says this keeps its exact on-disk bytes. Nothing
    // is gained by re-rendering it, and re-rendering costs its prefix and its
    // spacing. A COMMENTED entry is still asserted: the caller is saying the
    // setting must be live, and a parenthesised tooltype is not.
    const existing = info.tooltypes.find(tt => tt.key === key.toUpperCase());
    if (existing && !existing.commented && existing.value === value) continue;
    updateTooltype(info, key, value, false);
  }

  writeInfoFile(info);
}

/**
 * Editor class — thin wrapper so callers can chain mutations.
 */
export class TooltypeEditor {
  private info: InfoFile;

  constructor(filePath: string) {
    this.info = parseInfoFile(filePath);
  }

  public getTooltypes(): Tooltype[] {
    return this.info.tooltypes;
  }

  public set(key: string, value: string, commented = false, prefix = ''): this {
    this.info = updateTooltype(this.info, key, value, commented, prefix);
    return this;
  }

  public add(key: string, value: string, commented = false, prefix = ''): this {
    return this.set(key, value, commented, prefix);
  }

  public remove(key: string): this {
    this.info = removeTooltype(this.info, key);
    return this;
  }

  public toggle(key: string): this {
    this.info = toggleTooltypeComment(this.info, key);
    return this;
  }

  public save(): void {
    writeInfoFile(this.info);
  }

  public getInfo(): InfoFile {
    return this.info;
  }
}

export function updateTooltype(
  info: InfoFile,
  key: string,
  value: string,
  commented: boolean,
  prefix = ''
): InfoFile {
  const upperKey = key.toUpperCase();
  const existingIndex = info.tooltypes.findIndex(tt => tt.key === upperKey);
  const effectivePrefix = prefix || (existingIndex !== -1 ? info.tooltypes[existingIndex].prefix : '');

  const newTt: Tooltype = {
    key: upperKey,
    value,
    commented,
    prefix: effectivePrefix,
    originalLine: '',
  };
  newTt.originalLine = renderTooltype(newTt);

  if (existingIndex !== -1) {
    info.tooltypes[existingIndex] = newTt;
  } else {
    info.tooltypes.push(newTt);
  }
  return info;
}

export function addTooltype(
  info: InfoFile,
  key: string,
  value: string,
  commented = false,
  prefix = ''
): InfoFile {
  const upperKey = key.toUpperCase();
  if (info.tooltypes.some(tt => tt.key === upperKey)) {
    throw new Error(`Tooltype ${upperKey} already exists`);
  }
  return updateTooltype(info, key, value, commented, prefix);
}

export function toggleTooltypeComment(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  const tt = info.tooltypes.find(t => t.key === upperKey);
  if (tt) {
    tt.commented = !tt.commented;
    tt.originalLine = renderTooltype(tt);
  }
  return info;
}

export function removeTooltype(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  info.tooltypes = info.tooltypes.filter(tt => tt.key !== upperKey);
  return info;
}

/**
 * Check whether a tooltype key exists with a specific value (case-
 * insensitive value comparison). Mirrors AmigaOS `MatchToolValue()`
 * (tooltypes.e:152-174) which is the canonical helper express.e uses
 * to test "is this tooltype set to X?".
 *
 * Audit H-TTV flagged that callers were doing manual case-insensitive
 * comparisons inline, sometimes inconsistently (e.g. comparing the raw
 * Tooltype.value against `value.toUpperCase()` instead of normalising
 * both sides). This helper centralises the contract.
 *
 * Returns true if a tooltype with the given key exists and its value
 * (case-insensitively) equals the supplied value. Commented-out
 * tooltypes are ignored — they don't count as "set".
 *
 * @param info  - Parsed InfoFile (from parseInfoFile)
 * @param key   - Tooltype name (case-insensitive — keys are normalised
 *                to uppercase by the parser)
 * @param value - Expected value (case-insensitive comparison)
 */
export function checkToolTypeValue(info: InfoFile, key: string, value: string): boolean {
  const upperKey = key.toUpperCase();
  const expected = value.toLowerCase();
  for (const tt of info.tooltypes) {
    if (tt.commented) continue;
    if (tt.key !== upperKey) continue;
    if (tt.value.toLowerCase() === expected) return true;
  }
  return false;
}

/**
 * Test seams for the two pure string functions above. They are the whole of
 * the disabled-tooltype round trip and deserve direct coverage without
 * writing a binary .info to disk.
 */
export const parseTooltypeStringForTest = parseTooltypeString;
export const renderTooltypeForTest = renderTooltype;
