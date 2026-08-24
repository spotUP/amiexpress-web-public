/**
 * REXX file I/O builtins for the AREXX interpreter.
 *
 * Implements the rexxsupport.library functions that AmiExpress AREXX
 * doors use for persistent state (high scores, configuration, log
 * files): open / close / readln / writeln / readch / writech / eof /
 * exists / pragma / statef / compress.
 *
 * Sources of truth:
 *   - rexxsupport.library autodocs (RKRM Devices Volume — "ARexx
 *     Support Library")
 *   - AmiExpress AREXX doors in the wild (STNG.Rexx for trivia hi-
 *     scores, CARDS.REXX for card-rack persistence)
 *
 * Path resolution:
 *   Amiga assigns ("BBS:", "DOORS:", "RAM:") are mapped to host
 *   directories. The current working directory is tracked via
 *   `pragma('directory', dir)`; relative paths join against it.
 *   See resolveAmigaPath() below for the full mapping.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * A line terminator: CRLF, LF, or a bare CR. Matched against the RAW
 * content string, which is decoded latin1 so each JS character index is
 * exactly one on-disk byte.
 */
const LINE_TERMINATOR = /\r\n|\n|\r/;

/**
 * State for a single open REXX file handle.
 *
 * `content` + `pos` is ONE byte-accurate cursor shared by readln, readch
 * AND seek — not a pre-split line array. rexxsupport.library's Seek()
 * and ReadCh() are byte-offset operations against arbitrary binary
 * content (AmiExpress doors use them on fixed-record files like a
 * legacy UserData database: `Seek(h,-234,'C')` walks backward one
 * 234-byte record at a time). A previous version of this file stored
 * pre-split TEXT LINES and had Seek/ReadCh operate in LINE units — every
 * negative-byte-offset Seek against binary content was silently wrong,
 * and once a Seek clamped to a boundary, ReadCh could settle into
 * returning the SAME bytes forever. That is exactly what hung the
 * ACCV103 door script in production: `Do Until NrUsers > 0` around
 * Seek/ReadCh on a handle that had failed to open never made progress
 * and never terminated (see arexx.service.ts's runaway-watchdog comment
 * for the process-wide fallout of an interpreter loop that never
 * terminates).
 *
 * readln() still needs to match the OLD line-splitting behaviour byte
 * for byte (including its one quirk: a trailing terminator yields one
 * extra empty final read, for symmetry with writeln — see readln()).
 * It gets that by scanning for the next terminator from `pos` on every
 * call rather than from a precomputed array, which is exactly as fast
 * for how these doors use it (small config/log files) and never
 * disagrees with a byte-accurate seek() on the same handle.
 */
interface RexxFileHandle {
  /** Original filename / path the script asked for. */
  name: string;
  /** Resolved host filesystem path. */
  resolvedPath: string;
  /** Open mode: 'R' = read, 'W' = write/truncate, 'A' = append. */
  mode: 'R' | 'W' | 'A';
  /** Full content for 'R' mode, latin1-decoded (1 JS char = 1 byte). */
  content: string;
  /** Byte offset of the read cursor into `content`. */
  pos: number;
  /** True when the read cursor has hit end-of-file. */
  atEof: boolean;
  /** Pending output buffer for 'W' / 'A' mode (flushed on close). */
  writeBuffer: string[];
}

/**
 * Per-interpreter file-IO context. Owns the open-handle registry and
 * the pragma-directory state. AREXXInterpreter creates one of these
 * in its constructor and wires it into the function-call dispatch.
 */
export class AREXXFileIO {
  private handles: Map<string, RexxFileHandle> = new Map();
  /**
   * Current working directory for relative file paths. Defaults to
   * the door's bbsRoot (set by RexxFileIO.setBbsRoot). pragma()
   * mutates this; readers see it via cwd().
   */
  private currentDir: string;
  private bbsRoot: string;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
    this.currentDir = bbsRoot;
  }

  cwd(): string { return this.currentDir; }
  getBbsRoot(): string { return this.bbsRoot; }

  /**
   * Resolve an Amiga-style path to a host filesystem path. Mirrors
   * the rules the door dispatcher uses elsewhere:
   *
   *   "BBS:foo"          → <bbsRoot>/foo
   *   "DOORS:bar"        → <bbsRoot>/Doors/bar (case-insensitive)
   *   "doors:bar"        → <bbsRoot>/Doors/bar (Amiga is CI)
   *   "RAM:T/x"          → <os tmpdir>/aex-rexx/x
   *   "RAM:x"            → <os tmpdir>/aex-rexx/x
   *   "T:x"              → <os tmpdir>/aex-rexx/x
   *   "<no colon, abs>"  → as-is
   *   "<no colon, rel>"  → join against currentDir (set by pragma)
   *
   * The colons-to-slashes conversion (Amiga uses `:` after the
   * volume / assign name) is the same pattern we apply when
   * normalising the LOCATION tooltype in amiga-command-parser.util.
   */
  resolveAmigaPath(input: string): string {
    if (!input) return '';
    const colon = input.indexOf(':');
    if (colon < 0) {
      // No assign → absolute or relative.
      if (path.isAbsolute(input)) return input;
      return path.join(this.currentDir, input);
    }
    const assign = input.slice(0, colon).toLowerCase();
    const rest = input.slice(colon + 1).replace(/:/g, '/');
    switch (assign) {
      case 'bbs':
        return path.join(this.bbsRoot, rest);
      case 'doors':
        return path.join(this.bbsRoot, 'Doors', rest);
      case 'system':
        return path.join(this.bbsRoot, 'System', rest);
      case 'libs':
        return path.join(this.bbsRoot, 'Libs', rest);
      case 'ram':
      case 't':
        // Map to a per-process scratch dir. Doors that use RAM:T/foo
        // or T:foo expect a fast scratch area; we give them an os-
        // tmpdir-rooted equivalent that survives within a single
        // door run but doesn't pollute the bbs tree.
        {
          const scratch = path.join(os.tmpdir(), 'aex-rexx');
          try { fs.mkdirSync(scratch, { recursive: true }); } catch {}
          return path.join(scratch, rest.replace(/^t\//i, ''));
        }
      default:
        // Unknown assign — fall through to a bbsRoot-rooted resolve
        // so the door at least gets a deterministic path it can
        // create. Better than throwing.
        return path.join(this.bbsRoot, assign, rest);
    }
  }

  /**
   * pragma('directory', dir) — change the current working directory
   * for relative path resolution. Returns the previous directory
   * (per rexxsupport.library autodoc).
   *
   * pragma('id', ...) and other forms are no-ops here; we only need
   * 'directory'. Unknown sub-commands return ''.
   */
  pragma(subcmd: string, value?: string): string {
    const sub = (subcmd || '').toLowerCase();
    if (sub === 'directory' || sub === 'd') {
      const prev = this.currentDir;
      if (value !== undefined && value !== null && value !== '') {
        this.currentDir = this.resolveAmigaPath(String(value));
      }
      return prev;
    }
    return '';
  }

  /**
   * exists(filename) — returns the resolved path if the file exists,
   * empty string otherwise. (Stock rexxsupport returns the path; our
   * scripts that do `if exists(...)` only test for truthiness, so
   * either form works downstream.)
   */
  exists(filename: string): string {
    if (!filename) return '';
    const resolved = this.resolveAmigaPath(String(filename));
    try {
      return fs.existsSync(resolved) ? resolved : '';
    } catch {
      return '';
    }
  }

  /**
   * statef(filename) — returns a space-separated info string per
   * rexxsupport autodoc: `<type> <size> <blocks> <bits> <day>
   * <minute> <tick> <comment>`. Doors typically only parse the size,
   * so we populate type/size/blocks honestly and zero out the
   * Amiga-specific fields. Returns '' if the file doesn't exist.
   */
  statef(filename: string): string {
    if (!filename) return '';
    const resolved = this.resolveAmigaPath(String(filename));
    try {
      const st = fs.statSync(resolved);
      const type = st.isDirectory() ? 'DIR' : 'FILE';
      const blocks = Math.ceil(st.size / 512);
      const bits = 0;
      const day = 0, min = 0, tick = 0;
      const comment = '';
      return `${type} ${st.size} ${blocks} ${bits} ${day} ${min} ${tick} ${comment}`.trimEnd();
    } catch {
      return '';
    }
  }

  /**
   * open(handle, filename, mode) — open a file, register under the
   * given symbol name. Returns 1 on success, 0 on failure. For 'R'
   * mode we slurp the file into memory split on newlines so
   * subsequent readln() / eof() are simple array indexing; for 'W' /
   * 'A' we buffer writes and flush on close.
   *
   * Mode normalisation per rexxsupport: 'R' / 'READ' = read;
   * 'W' / 'WRITE' = truncate-write; 'A' / 'APPEND' = append.
   * Anything else falls back to read.
   */
  open(handle: string, filename: string, mode: string): number {
    if (!handle || !filename) return 0;
    const h = String(handle).toUpperCase();
    if (this.handles.has(h)) {
      // Per autodoc, opening over an already-open handle is an error.
      return 0;
    }
    const m = String(mode || 'R').toUpperCase().charAt(0) as 'R' | 'W' | 'A';
    const finalMode: 'R' | 'W' | 'A' = (m === 'W' || m === 'A') ? m : 'R';
    const resolved = this.resolveAmigaPath(String(filename));

    if (finalMode === 'R') {
      try {
        const buf = fs.readFileSync(resolved, 'latin1');
        this.handles.set(h, {
          name: filename, resolvedPath: resolved, mode: finalMode,
          content: buf, pos: 0, atEof: false,
          writeBuffer: [],
        });
        return 1;
      } catch {
        return 0;
      }
    }

    // For W/A make sure the directory exists. Truncate by opening
    // with mkdirSync first; we keep an empty buffer and write on
    // close so multi-clause writeln calls flush atomically.
    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      // For W: pre-truncate so partial writes don't leave stale
      // bytes if close() is never called (door crashed).
      if (finalMode === 'W') fs.writeFileSync(resolved, '', 'latin1');
    } catch {
      return 0;
    }
    this.handles.set(h, {
      name: filename, resolvedPath: resolved, mode: finalMode,
      content: '', pos: 0, atEof: false, writeBuffer: [],
    });
    return 1;
  }

  /**
   * close(handle) — close the file. Flushes pending writes for W/A
   * mode. Returns 0 on success, 1 on failure (rexxsupport convention
   * is opposite of POSIX: 0 = OK).
   */
  close(handle: string): number {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh) return 1;
    try {
      if (fh.mode === 'W') {
        fs.writeFileSync(fh.resolvedPath, fh.writeBuffer.join(''), 'latin1');
      } else if (fh.mode === 'A') {
        fs.appendFileSync(fh.resolvedPath, fh.writeBuffer.join(''), 'latin1');
      }
    } catch {
      this.handles.delete(h);
      return 1;
    }
    this.handles.delete(h);
    return 0;
  }

  /**
   * readln(handle) — read the next line from a 'R'-mode handle.
   * Sets atEof when the cursor reaches past the last line. Returns
   * '' for the final read (REXX semantics). Reading from a non-open
   * or non-read handle returns ''.
   *
   * Scans for the next terminator from the byte cursor `pos` on every
   * call, rather than indexing a precomputed array — the SAME cursor
   * seek()/readch() advance, so a script that mixes readln with seek on
   * one handle never disagrees with itself about where it is.
   *
   * Matches `content.split(/\r\n|\n|\r/)`'s behaviour exactly,
   * including its one quirk: content ending on a terminator produces
   * ONE trailing empty read before atEof (kept for symmetry with
   * writeln — a file written with N writeln calls reads back as N
   * non-empty lines plus that one trailing empty read, matching what a
   * door that round-trips a file through writeln then readln expects).
   */
  readln(handle: string): string {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh || fh.mode !== 'R') return '';
    if (fh.atEof) return '';

    const rest = fh.content.slice(fh.pos);
    const m = LINE_TERMINATOR.exec(rest);
    if (m) {
      const line = rest.slice(0, m.index);
      fh.pos += m.index + m[0].length;
      // More elements may follow (split()'s semantics), including a
      // trailing '' if this terminator was the last thing in the
      // file — don't set atEof yet, the NEXT call delivers that.
      return line;
    }
    // No terminator in what's left: this is split()'s FINAL element,
    // whether that's genuine trailing content or the empty string left
    // after consuming a trailing terminator on the previous call.
    fh.pos = fh.content.length;
    fh.atEof = true;
    return rest;
  }

  /**
   * writeln(handle, text) — write text + newline. Returns the number
   * of characters written (text + 1 for the newline). 0 on error.
   *
   * AmiExpress doors expect rexxsupport's behaviour where writeln
   * works on R-mode handles too if the file was opened with
   * O_RDWR — we don't model that, so writeln on a R handle is a
   * no-op (returns 0).
   */
  writeln(handle: string, text: string): number {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh || fh.mode === 'R') return 0;
    const s = String(text ?? '');
    fh.writeBuffer.push(s + '\n');
    return s.length + 1;
  }

  /**
   * writech(handle, text) — write without trailing newline.
   */
  writech(handle: string, text: string): number {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh || fh.mode === 'R') return 0;
    const s = String(text ?? '');
    fh.writeBuffer.push(s);
    return s.length;
  }

  /**
   * readch(handle, n) — read up to n BYTES from the cursor. Byte-
   * accurate: `content` is latin1-decoded (1 char = 1 byte) and this
   * slices it directly — no line splitting/rejoining, so embedded
   * `\n`/`\r` bytes in binary content (a fixed-record UserData file,
   * a packed high-score table) are read back exactly as written, and
   * this stays in lockstep with seek() on the same cursor.
   */
  readch(handle: string, n: number): string {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh || fh.mode !== 'R') return '';
    const remaining = fh.content.length - fh.pos;
    if (remaining <= 0) { fh.atEof = true; return ''; }
    const take = Math.max(0, Math.min(Number(n) || 0, remaining));
    const slice = fh.content.slice(fh.pos, fh.pos + take);
    fh.pos += take;
    if (fh.pos >= fh.content.length) fh.atEof = true;
    return slice;
  }

  /**
   * eof(handle) — returns 1 at end-of-file, 0 otherwise. Returns 1
   * for non-open handles to break out of any DO WHILE ~eof() loop
   * the door might run against a bad handle.
   */
  eof(handle: string): number {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh) return 1;
    return fh.atEof ? 1 : 0;
  }

  /**
   * seek(handle, offset, anchor) — set the read position, in BYTES.
   * Anchor: 'B' = from beginning, 'C' = from current, 'E' = from end.
   *
   * Per rexxsupport.library: a position beyond either end is clamped
   * to that end, not an error. That clamping is exactly what let
   * ACCV103's `Seek(h,-234,'C')` pin at 0 forever once it first
   * underflowed — clamping itself isn't the bug (it's the documented,
   * correct behaviour); operating in LINE units instead of BYTE units
   * against binary content was.
   */
  seek(handle: string, offset: number, anchor: string): number {
    const h = String(handle || '').toUpperCase();
    const fh = this.handles.get(h);
    if (!fh || fh.mode !== 'R') return 0;
    const off = Number(offset) || 0;
    const a = String(anchor || 'B').toUpperCase().charAt(0);
    let target = 0;
    if (a === 'C') target = fh.pos + off;
    else if (a === 'E') target = fh.content.length + off;
    else target = off;
    fh.pos = Math.max(0, Math.min(fh.content.length, target));
    fh.atEof = fh.pos >= fh.content.length;
    return fh.pos;
  }

  /** Close ALL open handles — called when the interpreter exits. */
  closeAll(): void {
    for (const h of Array.from(this.handles.keys())) {
      try { this.close(h); } catch {}
    }
  }
}
