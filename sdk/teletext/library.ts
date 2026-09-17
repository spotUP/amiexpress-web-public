/**
 * Teletext service packs, off the disk.
 *
 * A pack is a directory the sysop installs on the board:
 *
 *   Teletext/<service-id>/
 *     service.json          manifest: title, source, credit, licence, home page
 *     pages/P1a0-0000.t42   community naming, verbatim from the archives
 *     pages/*.tti           hand-authored or converted pages
 *
 * The community's recoveries come off home VHS tapes and are lossy by
 * construction: a page can be half dropout, a header can be unreadable, a
 * whole file can be junk. So loading reports per-file errors and keeps
 * going - one bad page must never cost the caller the other four hundred.
 *
 * This is the ONLY module in sdk/teletext that touches a disk, which is why
 * it is not re-exported from the barrel: everything else there has to stay
 * importable from a browser bundle.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { TelesoftwareMap } from './telesoftware';
import type { TeletextService, TeletextPage, NationalSubset } from './marco/model/types';
import { importTti, importT42, extractTeletextLines } from './marco/tti/index';
import { fastextByPage, type TeletextLine } from './packet27';
import { resolveBbsRoot } from '../core/settings';
import {
  buildServiceIndex,
  parsePageNumber,
  isRealPage,
  type ServiceIndex,
} from './store';

/** The board directory teletext packs are installed into. */
export const TELETEXT_DIR = 'Teletext';

/** What service.json may declare. Everything but the title is optional. */
export interface ServiceManifest {
  id?: string;
  title?: string;
  /** Where the pack came from, so the recovery keeps its attribution. */
  source?: string;
  credit?: string;
  licence?: string;
  /** The page a caller lands on, as typed: "100", "1A0". */
  homePage?: string;
  /** The G0 national option sub-set the service is written in. */
  subset?: NationalSubset;
  notes?: string;
}

export interface PageLoadError {
  /** The file, relative to the pack directory. */
  file: string;
  message: string;
}

export interface LoadedService {
  dir: string;
  manifest: ServiceManifest;
  service: TeletextService;
  index: ServiceIndex;
  /** Files that would not parse. The service still holds everything else. */
  errors: PageLoadError[];
  /**
   * The programs this service broadcast, when its telesoftware has been
   * decoded to a disc. Null for a pack that carries none - which is most of
   * them, and not an error.
   */
  telesoftware: TelesoftwareMap | null;
}

export interface ServiceSummary {
  id: string;
  title: string;
  dir: string;
  /** How many page files the pack holds. Cheap: no parsing. */
  fileCount: number;
}

/**
 * The sidecar naming the programs a pack's pages carried.
 *
 * Written beside the pages by the extractor rather than worked out here:
 * decoding sixteen programs out of six hundred pages takes seconds, and a
 * browser opening a service must not.
 */
export const TELESOFTWARE_FILE = 'telesoftware.json';

/**
 * Read that sidecar, or null.
 *
 * Tolerant on purpose. A pack without one is the normal case, and a
 * malformed one must not stop a service from being browsed - the pages are
 * the point, and the programs are an extra.
 */
export function loadTelesoftwareMap(dir: string): TelesoftwareMap | null {
  const full = path.join(dir, TELESOFTWARE_FILE);
  try {
    if (!fs.existsSync(full)) return null;
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as TelesoftwareMap;
    if (!parsed || typeof parsed.disc !== 'string' || !Array.isArray(parsed.programs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The file extensions a pack's pages are allowed to have. */
export const PAGE_EXTENSIONS = new Set(['.t42', '.tti']);

/** `<bbsRoot>/Teletext`, found the way every other board path is found. */
export function teletextRoot(startDir: string = __dirname): string {
  return path.join(resolveBbsRoot(startDir), TELETEXT_DIR);
}

/**
 * Every pack installed on the board, cheapest question first.
 *
 * A pack is a directory holding a service.json. Directories without one are
 * skipped rather than guessed at - the manifest is how a sysop says "this is
 * a service", and half-copied archives are a normal thing to find on a
 * volume.
 */
export function listServices(root: string = teletextRoot()): ServiceSummary[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: ServiceSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifest = readManifest(dir);
    if (!manifest) continue;
    summaries.push({
      id: manifest.id || entry.name,
      title: manifest.title || entry.name,
      dir,
      fileCount: listPageFiles(dir).length,
    });
  }
  return summaries.sort((a, b) => a.title.localeCompare(b.title));
}

/** The pack's manifest, or null when the directory is not a pack. */
export function readManifest(dir: string): ServiceManifest | null {
  try {
    const raw = fs.readFileSync(path.join(dir, 'service.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ServiceManifest) : null;
  } catch {
    return null;
  }
}

/**
 * Where the pages live: `pages/` when the pack has one, else the pack
 * directory itself. An archive unpacked straight into the service folder is
 * a normal shape and does not deserve a manual move.
 */
function pagesDir(dir: string): string {
  const nested = path.join(dir, 'pages');
  try {
    if (fs.statSync(nested).isDirectory()) return nested;
  } catch {
    // no pages/ subdirectory
  }
  return dir;
}

function listPageFiles(dir: string): string[] {
  const from = pagesDir(dir);
  try {
    return fs
      .readdirSync(from)
      .filter(name => PAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort();
  } catch {
    return [];
  }
}

/**
 * A page number encoded in a recovery's filename: `P1a0-0000.t42` is page
 * 0x1A0, subpage 0. Only used to say WHICH page a file failed to parse -
 * the page number a decoder uses always comes from the header packet.
 */
export function pageNumberFromFilename(file: string): number | null {
  const match = /^P([1-8][0-9A-Fa-f]{2})(?:-([0-9A-Fa-f]{1,4}))?/.exec(path.basename(file));
  return match ? parsePageNumber(match[1]) : null;
}

/**
 * Load one pack into a service plus its page index.
 *
 * Throws only when the directory is not a pack at all. Everything a caller
 * can still browse around - a corrupt file, an empty file, a t42 whose
 * header never decoded - comes back in `errors`.
 */
export function loadService(dir: string): LoadedService {
  const manifest = readManifest(dir);
  if (!manifest) {
    throw new Error(`${dir} has no service.json - not a teletext pack`);
  }

  const from = pagesDir(dir);
  const errors: PageLoadError[] = [];
  const pages: TeletextPage[] = [];

  for (const file of listPageFiles(dir)) {
    const full = path.join(from, file);
    try {
      const found = parsePageFile(full);
      if (found.length === 0) {
        const named = pageNumberFromFilename(file);
        errors.push({
          file,
          message: named
            ? `no readable page in the file (the name says ${named.toString(16).toUpperCase()})`
            : 'no readable page in the file',
        });
        continue;
      }
      pages.push(...found);
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const telesoftware = loadTelesoftwareMap(dir);
  const subset: NationalSubset = manifest.subset ?? 'english';
  const service: TeletextService = {
    id: manifest.id || path.basename(dir),
    title: manifest.title || path.basename(dir),
    pages,
    defaultLanguageSubset: subset,
    metadata: {
      source: manifest.source,
      credit: manifest.credit,
      licence: manifest.licence,
      notes: manifest.notes,
    },
  };

  // A pack whose pages never named a sub-set still knows which one it is,
  // because the manifest said. Without this a Swedish pack prints {|} where
  // the letters belong.
  if (subset !== 'english') {
    for (const page of pages) {
      for (const subpage of page.subpages ?? []) {
        if (!subpage.languageSubset || subpage.languageSubset === 'english') {
          subpage.languageSubset = subset;
        }
      }
    }
  }

  const homePage = manifest.homePage ? parsePageNumber(manifest.homePage) : null;
  const index = buildServiceIndex(service, homePage ? { homePage } : {});

  return { dir, manifest, service, index, errors, telesoftware };
}

/**
 * Parse one page file into pages. Throws when the file is not readable as
 * teletext at all; an empty array means it parsed but held no real page.
 *
 * Exported because the importer validates a file before it copies it into a
 * pack, and a second parser would be a second answer to "is this a page".
 */
export function parsePageFile(full: string): TeletextPage[] {
  const extension = path.extname(full).toLowerCase();
  if (extension === '.t42') {
    const bytes = new Uint8Array(fs.readFileSync(full));
    const result = importT42(bytes);
    if (result.pages.length === 0 && result.errors.length > 0) {
      throw new Error(result.errors[0]);
    }

    // The vendored importer reads packet 27 as raw little-endian bytes
    // rather than the Hamming 8/4 the standard uses, so every coloured key
    // it reports points somewhere invented. Re-derive them from the same
    // file and let the real ones win - see packet27.ts.
    const links = fastextByPage(extractTeletextLines(bytes) as unknown as TeletextLine[]);
    const pages = result.pages.filter(page => isRealPage(page.pageNumber));
    for (const page of pages) {
      const decoded = links.get(page.pageNumber);
      if (decoded) page.fastext = decoded;
    }
    return pages;
  }
  // .tti is text, and 7-bit by construction: the lexer decodes its own
  // hex escapes, so latin1 keeps every byte as written.
  const text = fs.readFileSync(full, 'latin1');
  const service = importTti(text);
  return (service.pages ?? []).filter(page => isRealPage(page.pageNumber));
}

// --- Cache ---------------------------------------------------------------

/**
 * Parsed services, keyed by directory.
 *
 * A full service can be a few hundred pages of tokens, and a caller walking
 * a magazine asks for the same one on every keypress. Eight is enough for
 * any one caller and small enough that a board with forty packs installed
 * does not hold them all.
 *
 * The entry carries the pack's newest mtime, so a sysop who drops files in
 * does not have to restart the board to see them.
 */
const CACHE_LIMIT = 8;
const cache = new Map<string, { loaded: LoadedService; stamp: number }>();

function packStamp(dir: string): number {
  let newest = 0;
  for (const at of [dir, pagesDir(dir)]) {
    try {
      newest = Math.max(newest, fs.statSync(at).mtimeMs);
    } catch {
      // missing directory: stamp stays where it is, load will report it
    }
  }
  return newest;
}

/** Load a pack, reusing the parse when nothing in it has changed. */
export function getService(dir: string): LoadedService {
  const stamp = packStamp(dir);
  const hit = cache.get(dir);
  if (hit && hit.stamp === stamp) {
    // Refresh recency: Map keeps insertion order, so re-set moves it last.
    cache.delete(dir);
    cache.set(dir, hit);
    return hit.loaded;
  }

  const loaded = loadService(dir);
  cache.set(dir, { loaded, stamp });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return loaded;
}

/** Find an installed pack by its id. Null when the board has no such pack. */
export function findService(id: string, root: string = teletextRoot()): LoadedService | null {
  const summary = listServices(root).find(s => s.id === id);
  if (!summary) return null;
  try {
    return getService(summary.dir);
  } catch {
    return null;
  }
}

export function clearServiceCache(): void {
  cache.clear();
}
