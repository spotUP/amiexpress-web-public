/**
 * Turning somebody else's archive into a pack this board can browse.
 *
 * The recovery community publishes its work as zips of `Pmpp-ssss.t42`
 * files or as git repositories full of them. Either way the job is the
 * same: take the page files, leave everything else, check each one actually
 * parses, and write a manifest that says where it all came from.
 *
 * Downloading is NOT here. This module takes a local directory or a local
 * zip, so every path through it is testable without a network, and the CLI
 * (dev/scripts/teletext/import-archive.ts) is the only thing that fetches.
 *
 * Nothing here deletes. An import adds pages to a pack and rewrites its
 * manifest; a pack that already exists is refused unless the caller says
 * otherwise, and even then the existing pages stay where they are.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { NationalSubset } from './marco/model/types';
import {
  PAGE_EXTENSIONS,
  parsePageFile,
  readManifest,
  teletextRoot,
  clearServiceCache,
  type ServiceManifest,
} from './library';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

export interface ImportOptions {
  /** The pack's directory name and id. */
  id: string;
  title?: string;
  /** Where the archive came from. Written into the manifest verbatim. */
  source?: string;
  credit?: string;
  licence?: string;
  homePage?: string;
  subset?: NationalSubset;
  notes?: string;
  /** The Teletext directory. Defaults to the board's. */
  root?: string;
  /** Add to a pack that already exists instead of refusing. */
  force?: boolean;
}

export interface ImportResult {
  dir: string;
  manifestPath: string;
  /** Files written into pages/, by their new name. */
  imported: string[];
  /** Files left behind, and why. */
  skipped: { file: string; reason: string }[];
  /**
   * Pages the restoration team marked as uncertain.
   *
   * The teletext-restoration project names a page it is not sure about
   * `...-maybe` and one the broadcast carried no checksum for `...-nocrc`.
   * That is the recovery's own statement about its confidence, and losing
   * it at the import would be presenting a guess as a record.
   */
  uncertain: string[];
  /** The recovery's notes file, when the archive shipped one. */
  notesFile: string | null;
}

/** What kind of thing the caller pointed at. */
export function sourceKind(sourcePath: string): 'directory' | 'zip' | 'file' {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) return 'directory';
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === '.zip') return 'zip';
  // A single page is a legitimate import: the archives publish individual
  // .t42 files as often as they publish collections of them.
  if (PAGE_EXTENSIONS.has(extension)) return 'file';
  throw new Error(`${sourcePath} is not a directory, a .zip or a page file`);
}

/**
 * Import a local directory or zip into a pack under the Teletext root.
 *
 * Every candidate file is parsed before it is kept: an archive carries
 * READMEs, thumbnails and half-recovered files, and a page that will not
 * parse is better refused at the door than reported on every load.
 */
export function importIntoPack(sourcePath: string, options: ImportOptions): ImportResult {
  const id = options.id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error(`"${id}" is not a usable service id (letters, digits, dot, dash, underscore)`);
  }

  const root = options.root ?? teletextRoot();
  const dir = path.join(root, id);
  const pages = path.join(dir, 'pages');
  const existed = fs.existsSync(dir);
  if (existed && !options.force) {
    throw new Error(`${dir} already exists - pass force to add to it`);
  }

  const kind = sourceKind(sourcePath);
  const candidates =
    kind === 'zip'
      ? readZipCandidates(sourcePath)
      : kind === 'file'
        ? [{ name: path.basename(sourcePath), read: () => fs.readFileSync(sourcePath) }]
        : readDirectoryCandidates(sourcePath);

  fs.mkdirSync(pages, { recursive: true });

  const imported: string[] = [];
  const skipped: { file: string; reason: string }[] = [];
  const uncertain: string[] = [];
  const notes: string[] = [];
  let notesFile: string | null = null;

  for (const candidate of candidates) {
    // Only ever the basename: an archive entry is free to say
    // "../../etc/passwd", and a pack is a flat folder of pages anyway.
    const name = path.basename(candidate.name);
    if (!PAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      // A recovery usually travels with a notes file crediting whoever made
      // it and describing the tape. That belongs in the pack.
      if (isNotes(name)) {
        // A recovery has one notes file per recording session, each with
        // its own credit. Keeping only the first would drop the rest of
        // the people who did the work.
        notes.push(`--- ${name} ---\n${candidate.read().toString('utf8').trim()}\n`);
        continue;
      }
      skipped.push({ file: candidate.name, reason: 'not a page file' });
      continue;
    }

    const target = freeName(pages, name);
    fs.writeFileSync(target, candidate.read());

    try {
      const found = parsePageFile(target);
      if (found.length === 0) {
        fs.unlinkSync(target);
        skipped.push({ file: candidate.name, reason: 'no readable page in it' });
        continue;
      }
    } catch (error) {
      fs.unlinkSync(target);
      skipped.push({ file: candidate.name, reason: (error as Error).message });
      continue;
    }

    const written = path.basename(target);
    imported.push(written);
    if (/-(maybe|nocrc)\b/i.test(written)) uncertain.push(written);
  }

  if (notes.length > 0) {
    notesFile = 'RECOVERY-NOTES.txt';
    fs.writeFileSync(path.join(dir, notesFile), notes.join('\n'), 'utf8');
  }

  const manifestPath = path.join(dir, 'service.json');
  writeManifest(manifestPath, options, id, existed, notesFile);

  // A pack that was already loaded this process must be re-read.
  clearServiceCache();

  return { dir, manifestPath, imported, skipped, uncertain, notesFile };
}

interface Candidate {
  name: string;
  read(): Buffer;
}

function readDirectoryCandidates(from: string): Candidate[] {
  const found: Candidate[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      found.push({ name: entry.name, read: () => fs.readFileSync(full) });
    }
  };
  walk(from, 0);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function readZipCandidates(from: string): Candidate[] {
  const zip = new AdmZip(from);
  const entries = zip.getEntries() as Array<{
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }>;
  return entries
    .filter(entry => !entry.isDirectory)
    .map(entry => ({ name: entry.entryName, read: () => entry.getData() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A name nothing is using yet.
 *
 * Two tapes of the same magazine really do carry the same page numbers, and
 * the second recovery of page 100 is not worthless - it is often the half
 * the first one lost.
 */
function freeName(dir: string, name: string): string {
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  let attempt = path.join(dir, name);
  let counter = 2;
  while (fs.existsSync(attempt)) {
    attempt = path.join(dir, `${stem}~${counter}${extension}`);
    counter++;
  }
  return attempt;
}

/** Notes, readmes and credits that travel with a recovery. */
function isNotes(name: string): boolean {
  return /\.(txt|md|nfo|notes)$/i.test(name) || /notes|readme|credit/i.test(name);
}

function writeManifest(
  manifestPath: string,
  options: ImportOptions,
  id: string,
  existed: boolean,
  notesFile?: string | null,
): void {
  // Adding to a pack keeps what the sysop already wrote in its manifest;
  // only the fields this import was given are replaced.
  const current: ServiceManifest = (existed && readManifest(path.dirname(manifestPath))) || {};

  const manifest: ServiceManifest & { importedAt?: string; notesFile?: string } = {
    ...current,
    id,
    title: options.title ?? current.title ?? id,
    source: options.source ?? current.source,
    credit: options.credit ?? current.credit,
    licence: options.licence ?? current.licence,
    homePage: options.homePage ?? current.homePage ?? '100',
    subset: options.subset ?? current.subset ?? 'english',
    notes: options.notes ?? current.notes,
    notesFile: notesFile ?? (current as { notesFile?: string }).notesFile,
    importedAt: new Date().toISOString(),
  };

  for (const key of Object.keys(manifest) as (keyof typeof manifest)[]) {
    if (manifest[key] === undefined) delete manifest[key];
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
