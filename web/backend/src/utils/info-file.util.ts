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
  // Body must be printable ASCII (plus ESC 0x1b for ANSI in values)
  for (let i = start; i < payloadEnd; i++) {
    const c = buf[i];
    if (c === 0x1b) continue;
    if (c < 0x20 || c > 0x7e) return false;
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
    if (c >= 0x20 && c <= 0x7e) {
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
 * Parse an .info file into an InfoFile record. Supports both binary
 * Amiga DiskObject icons and plain-text variants.
 */
export function parseInfoFile(filePath: string): InfoFile {
  const buffer = fs.readFileSync(filePath);
  const isBinary = buffer.length > 2 && buffer[0] === 0xe3 && buffer[1] === 0x10;

  if (!isBinary) {
    const formIdx = buffer.indexOf('FORM');
    const iconData = formIdx !== -1 ? buffer.slice(formIdx) : Buffer.alloc(0);
    const tooltypes = extractTooltypesFallback(buffer);
    return {
      filePath,
      isBinary: false,
      diskObject: Buffer.alloc(0),
      iconData,
      tooltypes,
      rawBuffer: buffer,
    };
  }

  const located = locateTooltypeArray(buffer);
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
  const lines = info.tooltypes.map(renderTooltype).join('\n');
  const textBuf = Buffer.from(lines + (lines ? '\n' : ''), 'utf8');
  fs.writeFileSync(info.filePath, Buffer.concat([textBuf, info.iconData]));
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
