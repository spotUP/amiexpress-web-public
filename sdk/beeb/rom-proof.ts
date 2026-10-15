/**
 * Proving that a caller owns the BBC ROMs.
 *
 * The board keeps ONE copy of the ROMs and ships none: Acorn's ROMs are not
 * ours to distribute. So every caller who wants to use the BBC Micro shows
 * their own copy once - the sysop included - and what the board keeps
 * afterwards is the fact that they showed it, not the file.
 *
 * The upload is read, checked, and deleted. Nothing a caller sends is ever
 * served to anybody.
 *
 * THIS IS AN HONOUR-SYSTEM CHECK AND IT IS DELIBERATELY LOOSE. There were
 * many BBC machines, many OS revisions and a great many filing-system ROMs,
 * and somebody's legitimately-owned set will not be byte-identical to the
 * board's - or to anyone else's. Matching on content would turn "show me
 * you own this" into "show me you own MY copy", which is a different and
 * much less reasonable demand, and would refuse honest people. So the check
 * is: does the archive carry files named like the ROMs, of a size a ROM
 * could be. It is a gate against helping yourself, not a proof of purchase.
 */
import * as fs from 'fs';
import * as path from 'path';
import { REQUIRED_ROMS, romIdentityOf, type RomIdentity } from './roms';

/* eslint-disable @typescript-eslint/no-var-requires */
const AdmZip = require('adm-zip');

/**
 * The most a ROM archive may be.
 *
 * A handful of ROMs is well under this. A generous ceiling still refuses an
 * archive that is somebody's disc-image collection, or a bomb.
 */
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;

/** The most entries worth walking in one archive. */
const MAX_ENTRIES = 500;

/**
 * What a ROM image can be.
 *
 * Sideways ROMs are 16K and the OS is 16K, but 8K parts were common and
 * some dumps are padded. The range only has to rule out a text file that
 * somebody renamed.
 */
const SMALLEST_ROM = 2 * 1024;
const LARGEST_ROM = 32 * 1024;

/**
 * The three kinds a Model B needs, and the names they go by.
 *
 * Matched loosely on purpose: `os.rom`, `OS12.ROM`, `os_1.20.rom` and
 * `Acorn OS 1.2.rom` are all the same thing to a person, and refusing the
 * ones that do not match a single spelling would only teach people to
 * rename files until the board shut up.
 */
const KINDS: { kind: string; required: string; matches: RegExp }[] = [
  { kind: 'OS', required: 'os.rom', matches: /(^|[^a-z])os[^a-z]*\d*\.?\d*\.rom$/i },
  { kind: 'BASIC', required: 'BASIC.ROM', matches: /basic\d*\.?\d*\.rom$/i },
  { kind: 'DFS', required: 'b/DFS-1.2.rom', matches: /dfs[^/]*\.rom$/i },
];

export interface RomMatch {
  /** Which of the three this satisfies: OS, BASIC or DFS. */
  kind: string;
  /** What the archive called it. */
  suppliedAs: string;
  bytes: number;
  /** What the ROM says it is, when it carries a header. */
  identity: RomIdentity | null;
}

export interface ProofResult {
  /** All three kinds were found. */
  proven: boolean;
  matched: RomMatch[];
  /** Kinds the archive did not contain. */
  missing: string[];
  /** Why the archive could not be read at all. */
  problems: string[];
  /** The board had no ROMs and this archive became its copy. */
  seeded: boolean;
}

/** Which kind, if any, an entry name looks like. */
function kindOf(entryName: string): { kind: string; required: string } | null {
  const base = path.posix.basename(entryName);
  for (const candidate of KINDS) {
    if (candidate.matches.test(base)) return { kind: candidate.kind, required: candidate.required };
  }
  return null;
}

/**
 * Read the ROM-shaped entries out of an archive.
 *
 * ENTRY NAMES ARE NEVER USED AS PATHS. Nothing is extracted to disk under
 * the name the archive chose, so an entry called `../../etc/something` is
 * only ever a string that fails to look like a ROM - the classic zip-slip
 * has nowhere to go, because nothing is written where the archive asks.
 */
function candidatesIn(archivePath: string): { name: string; bytes: Uint8Array; kind: string; required: string }[] {
  const size = fs.statSync(archivePath).size;
  if (size > MAX_ARCHIVE_BYTES) {
    throw new Error(`that archive is ${Math.round(size / 1024)}K; the limit is ${MAX_ARCHIVE_BYTES / 1024}K`);
  }

  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries() as Array<{
    entryName: string;
    isDirectory: boolean;
    header: { size: number };
    getData(): Buffer;
  }>;

  const found: { name: string; bytes: Uint8Array; kind: string; required: string }[] = [];
  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    if (entry.isDirectory) continue;
    // Checked BEFORE the data is read, so a bomb is refused unexpanded.
    if (entry.header.size < SMALLEST_ROM || entry.header.size > LARGEST_ROM) continue;
    const kind = kindOf(entry.entryName);
    if (!kind) continue;
    found.push({
      name: entry.entryName,
      bytes: new Uint8Array(entry.getData()),
      kind: kind.kind,
      required: kind.required,
    });
  }
  return found;
}

/** Does the board already hold a full set? */
function boardHasRoms(romsDir: string): boolean {
  return REQUIRED_ROMS.every(required => {
    try {
      return fs.statSync(path.join(romsDir, required)).size > 0;
    } catch {
      return false;
    }
  });
}

/**
 * Check an uploaded archive.
 *
 * Proven when the archive carries all three kinds. When the board holds no
 * ROMs at all - a new board, nobody has proved anything yet - the first
 * archive to manage that also becomes the board's copy.
 */
export function verifyRomArchive(archivePath: string, romsDir: string): ProofResult {
  const result: ProofResult = { proven: false, matched: [], missing: [], problems: [], seeded: false };

  let candidates: { name: string; bytes: Uint8Array; kind: string; required: string }[];
  try {
    candidates = candidatesIn(archivePath);
  } catch (error) {
    result.problems.push((error as Error).message);
    result.missing = KINDS.map(k => k.kind);
    return result;
  }

  const byKind = new Map<string, { name: string; bytes: Uint8Array; kind: string; required: string }>();
  for (const candidate of candidates) {
    if (!byKind.has(candidate.kind)) byKind.set(candidate.kind, candidate);
  }

  for (const { kind } of KINDS) {
    const mine = byKind.get(kind);
    if (!mine) {
      result.missing.push(kind);
      continue;
    }
    result.matched.push({
      kind,
      suppliedAs: mine.name,
      bytes: mine.bytes.length,
      identity: romIdentityOf(mine.bytes),
    });
  }

  result.proven = result.missing.length === 0;

  // A board with no ROMs takes its copy from the first set anyone proves.
  if (result.proven && !boardHasRoms(romsDir)) {
    for (const { kind } of KINDS) {
      const mine = byKind.get(kind);
      if (!mine) continue;
      const to = path.join(romsDir, mine.required);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, Buffer.from(mine.bytes));
    }
    result.seeded = true;
  }

  return result;
}
