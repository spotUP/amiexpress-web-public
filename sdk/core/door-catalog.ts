/**
 * Door catalog: one registry reader for every door.
 *
 * `Commands/BBSCmd` star `.info` is the registry (one file per installed
 * door), `Doors` star `package.json` carries the descriptions. Three readers
 * grew in parallel and disagreed on the hard parts — binary `.info`
 * files (a `TYPE=TS` buried behind a 0x08 byte), mid-word keys
 * (`XTYPES=` is not `TYPE=`), missing manifests — so this module owns
 * all three answers once, dependency-free, with injectable I/O for
 * tests. Transports (sqlite, HTTP, the server bundle) stay with their
 * owners; this is files in, entries out.
 *
 * Root resolution lives in `./settings` (`resolveBbsRoot`) and is NOT
 * duplicated here.
 */

/**
 * One spelling for one kind of door.
 *
 * The registry carries both `TYPE=TS` and `TYPE=typescript` - 44 of one and
 * one of the other on this board, and the odd one out is TIP, whose own
 * spotlight picker then left TIP off the list. The launcher takes either
 * (`door.handler.ts:1406` tests 'TS' || 'typescript'), so a door spelled
 * the long way RUNS while every reader that compares against 'TS' - this
 * catalog's `types` filter, `amigaDoorManager.ts:1040` - decides it is
 * something else.
 *
 * The board is the authority on what runs, so the reader follows it rather
 * than the other way round: both spellings mean TS here. Anything else is
 * upper-cased and passed through, because an unknown type is not this
 * function's to invent.
 */
export function normaliseDoorType(raw: string | undefined): string {
  const upper = (raw ?? '').toUpperCase();
  return upper === 'TYPESCRIPT' ? 'TS' : upper;
}

export interface CatalogEntry {
  /** Directory under Doors/, e.g. "whip". */
  name: string;
  /** The command a caller types, e.g. "WHIP". */
  command: string;
  description: string;
  author: string;
  /** Upper-cased TYPE tooltype, e.g. "TS", "XIM". */
  doorType: string;
  /** LOCATION tooltype verbatim, e.g. "Doors/whip". */
  location: string;
  /** True for the board's own originals (caller-supplied test decides). */
  inHouse: boolean;
  /** Every tooltype parsed, for gates (MIN_COLUMNS, C64_ADAPT, ACCESS). */
  tooltypes: Record<string, string>;
}

export interface CatalogIO {
  readDir(dir: string): string[];
  readFile(filePath: string): Uint8Array | null;
  readText(filePath: string): string | null;
}

/**
 * Tooltypes from `.info` bytes, text or Amiga icon.
 *
 * Binary icons carry NUL-padded `KEY=value` strings mid-line, so keys
 * match after any non-identifier byte (a 0x08 led into LINKWALL's
 * TYPE) and values end at the first NUL/ESC/newline. First wins,
 * like FindToolType. Latin-1 throughout: high-bit description bytes
 * are board text, not mojibake.
 */
export function parseTooltypes(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const latin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const re = /(?:^|[^A-Za-z0-9_])([A-Za-z0-9_]+)=([^\n\r\0\x1b]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const key = m[1].toUpperCase();
    if (!(key in out)) out[key] = m[2].trim();
  }
  return out;
}

/** `join` without node:path, so the pure core stays portable. */
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

/** `.info` filenames in the registry; the caller parses what it needs. */
export function scanRegistry(boardRoot: string, io: CatalogIO): string[] {
  try {
    return io
      .readDir(joinPath(boardRoot, 'Commands', 'BBSCmd'))
      .filter((f) => f.toLowerCase().endsWith('.info'));
  } catch {
    return [];
  }
}

export interface RawRegistryEntry {
  command: string;
  tooltypes: Record<string, string>;
}

/** One registry file parsed; null when unreadable. Never throws. */
export function readRegistryEntry(
  boardRoot: string,
  infoFile: string,
  io: CatalogIO,
): RawRegistryEntry | null {
  const bytes = io.readFile(joinPath(boardRoot, 'Commands', 'BBSCmd', infoFile));
  if (!bytes) return null;
  const command = infoFile.replace(/\.[^.]*$/, '').toUpperCase();
  try {
    return { command, tooltypes: parseTooltypes(bytes) };
  } catch {
    return null;
  }
}

function readManifest(
  doorsDir: string,
  name: string,
  io: CatalogIO,
): { description: string; author: string } {
  try {
    const text = io.readText(joinPath(doorsDir, name, 'package.json'));
    if (!text) return { description: '', author: '' };
    const pkg = JSON.parse(text);
    return { description: String(pkg.description ?? ''), author: String(pkg.author ?? '') };
  } catch {
    return { description: '', author: '' };
  }
}

/** Default port markers: matched against description + author, lowercased. */
export const PORT_MARKERS = ['port', 'rebel', 'qtx', 'ported', 'bbslink', 'based on'];

export interface JoinOptions {
  /** Only these TYPEs survive (upper-cased compare); absent means all. */
  types?: string[];
  /** Decides in-house; defaults to the marker list above. */
  isPort?: (description: string, author: string) => boolean;
}

/**
 * Registry entries joined to their manifests. A door with no manifest
 * still lists (command + name survive); a LOCATION outside Doors/ is
 * skipped (classic binaries live elsewhere and catalog as doors
 * through their own path). Sorted in-house first, then by command.
 */
export function joinCatalog(
  boardRoot: string,
  entries: RawRegistryEntry[],
  io: CatalogIO,
  opts: JoinOptions = {},
): CatalogEntry[] {
  const types = opts.types?.map((t) => t.toUpperCase());
  const isPort =
    opts.isPort ??
    ((description: string, author: string) => {
      const hay = `${description} ${author}`.toLowerCase();
      return PORT_MARKERS.some((marker) => hay.includes(marker));
    });
  const out: CatalogEntry[] = [];
  for (const entry of entries) {
    const doorType = normaliseDoorType(entry.tooltypes['TYPE']);
    if (types && !types.includes(doorType)) continue;
    const location = (entry.tooltypes['LOCATION'] ?? '').trim();
    const m = /^Doors\/([^/]+)\/?$/.exec(location);
    if (!m) continue;
    const manifest = readManifest(joinPath(boardRoot, 'Doors'), m[1], io);
    out.push({
      name: m[1],
      command: entry.command,
      description: manifest.description,
      author: manifest.author,
      doorType,
      location,
      inHouse: !isPort(manifest.description, manifest.author),
      tooltypes: entry.tooltypes,
    });
  }
  out.sort((a, b) => Number(b.inHouse) - Number(a.inHouse) || a.command.localeCompare(b.command));
  return out;
}

/**
 * The whole read in one call: scan, parse, join. Empty list when the
 * root has no registry — a missing catalog is fewer tips, never a
 * throw, so login doors call this bare.
 */
export function loadDoorCatalog(
  boardRoot: string | null,
  io: CatalogIO,
  opts: JoinOptions = {},
): CatalogEntry[] {
  if (!boardRoot) return [];
  const entries: RawRegistryEntry[] = [];
  for (const file of scanRegistry(boardRoot, io)) {
    const entry = readRegistryEntry(boardRoot, file, io);
    if (entry) entries.push(entry);
  }
  return joinCatalog(boardRoot, entries, io, opts);
}

/** Node I/O for doors: fs-backed. TextDecoder (not Buffer) so this
 *  module stays portable past node. */
export function nodeCatalogIO(fs: {
  readdirSync(dir: string): string[];
  readFileSync(path: string): Uint8Array;
}): CatalogIO {
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  return {
    readDir: (dir) => fs.readdirSync(dir),
    readFile: (filePath) => {
      try {
        return fs.readFileSync(filePath);
      } catch {
        return null;
      }
    },
    readText: (filePath) => {
      try {
        return utf8.decode(fs.readFileSync(filePath));
      } catch {
        return null;
      }
    },
  };
}
