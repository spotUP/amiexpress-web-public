/**
 * A release group's logo, for the surfaces that show one.
 *
 * The pack is three kinds of file in `Screens/groups/` on the data volume:
 *
 *   <KEY>.seq     40-column PETSCII art, raw C64 bytes
 *   <KEY>.txt     80-column ANSI art (for consumers that are not the file view)
 *   GROUPS.MAP    sysop corrections, one rule per line
 *
 * ADDING A LOGO IS DROPPING A FILE IN. No code, no tooltype, no restart - the
 * listing is cached behind an mtime guard, the pattern `Commands/` already
 * uses. The art itself is a Petmate SEQ export; there is no importer in this
 * design and none is needed (see Screens/groups/README.md).
 *
 * THE RESOLVER NEVER RETURNS NOTHING. An unknown group with no file still gets
 * its name on one line, which is why no caller needs a branch for "no logo".
 *
 * NOT USED BY A LIST ROW, deliberately. A `.seq` is raw PETSCII: arriving
 * mid-stream it drops the adapter's frame-diff baseline and forces a full
 * repaint, and one repaint per record makes a listing unusable. Six rows of
 * art per record would also leave room for three records on a 25-row screen.
 * The logo belongs to the SINGLE-record view, which is where a caller is
 * actually asking "what is this release".
 */
import * as fs from 'fs';
import * as path from 'path';

export type GroupLogo =
  | { kind: 'seq'; bytes: Buffer }
  | { kind: 'ansi'; text: string }
  | { kind: 'name'; line: string };

/** A logo taller than this is refused - it would eat the screen. */
export const MAX_LOGO_ROWS = 10;

/** Keys are clipped here so they stay comfortable AmigaDOS filenames. */
const MAX_KEY_LENGTH = 20;

/**
 * Latin-1 letters folded to the ASCII base letter, so `Möbius` and `Mobius`
 * reach the same file. Composed characters are normalised first; this table
 * catches the ones NFD leaves alone.
 */
const FOLD_EXTRA: Record<string, string> = {
  'Æ': 'AE', 'æ': 'ae', 'Ø': 'O', 'ø': 'o', 'Å': 'A', 'å': 'a',
  'Ð': 'D', 'ð': 'd', 'Þ': 'TH', 'þ': 'th', 'ß': 'ss',
};

/**
 * The filename key for a group name.
 *
 * Spaces and punctuation are DELETED rather than replaced, so a key is always
 * a legal AmigaDOS filename needing no quoting. Two different groups can
 * normalise onto one key (`The Company` and `Thecompany`); that is accepted,
 * and `GROUPS.MAP` is the fix if it ever bites.
 *
 * @returns the key, or '' when nothing survives - and no key means no logo.
 */
export function normaliseGroupKey(name: string): string {
  if (!name) return '';
  let folded = '';
  for (const ch of name) folded += FOLD_EXTRA[ch] ?? ch;
  return folded
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_KEY_LENGTH);
}

/**
 * How many rows a `.seq` paints.
 *
 * A row ends at a PETSCII return, which Petmate writes as `$0D` or - when the
 * cell before it was reversed - `$8D`. Both are returns to the machine.
 */
export function seqRowCount(bytes: Buffer): number {
  let rows = 1;
  let trailingReturn = false;
  for (const byte of bytes) {
    if (byte === 0x0d || byte === 0x8d) {
      rows++;
      trailingReturn = true;
    } else {
      trailingReturn = false;
    }
  }
  // A file that ends with a return has not started an eleventh row.
  return trailingReturn ? rows - 1 : rows;
}

// ---------------------------------------------------------------------------
// The directory, behind an mtime guard
// ---------------------------------------------------------------------------

interface GroupsDirCache {
  stamp: string;
  /** lowercase filename -> real filename, as `amigafs` resolution would give */
  files: Map<string, string>;
  rules: GroupRule[];
}

export interface GroupRule {
  /** The glob as the sysop wrote it, for diagnostics. */
  readonly glob: string;
  /** The group name the rule assigns. */
  readonly group: string;
  readonly test: (filename: string) => boolean;
}

let cache: GroupsDirCache | undefined;
let cachedRoot = '';
const loggedTallLogos = new Set<string>();

export function groupsDir(bbsRoot: string): string {
  return path.join(bbsRoot, 'Screens', 'groups');
}

function stampOf(dir: string): string {
  try {
    const st = fs.statSync(dir);
    let stamp = `${st.mtimeMs}`;
    const map = path.join(dir, 'GROUPS.MAP');
    try {
      const mapStat = fs.statSync(map);
      stamp += `:${mapStat.mtimeMs}:${mapStat.size}`;
    } catch { /* no map is a valid state */ }
    return stamp;
  } catch {
    return 'absent';
  }
}

/**
 * `GROUPS.MAP` - the sysop's corrections. One rule per line, FIRST MATCH WINS,
 * top to bottom:
 *
 *     # filename glob = group name
 *     OTL-*    = Outlaws
 *     PDX*     = Paradox
 *
 * A rule beats every derived source, so a release whose DIZ names no group
 * still gets its logo. `#` starts a comment - a filename glob can never begin
 * with one, which is why this file uses `#` where `Prompts/FILEVIEW.40` uses
 * `;` (there, `#` is real content: it is the header row's first character).
 */
export function parseGroupsMap(source: string): GroupRule[] {
  const rules: GroupRule[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const glob = line.slice(0, eq).trim();
    const group = line.slice(eq + 1).trim();
    if (!glob || !group) continue;
    const pattern = new RegExp(
      '^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i',
    );
    rules.push({ glob, group, test: (filename: string) => pattern.test(filename) });
  }
  return rules;
}

function loadDir(bbsRoot: string): GroupsDirCache {
  const dir = groupsDir(bbsRoot);
  const stamp = stampOf(dir);
  if (cache && cachedRoot === bbsRoot && cache.stamp === stamp) return cache;

  const files = new Map<string, string>();
  let rules: GroupRule[] = [];
  try {
    for (const entry of fs.readdirSync(dir)) files.set(entry.toLowerCase(), entry);
    const mapName = files.get('groups.map');
    if (mapName) rules = parseGroupsMap(fs.readFileSync(path.join(dir, mapName), 'utf8'));
  } catch {
    // No groups directory at all: every group resolves to its name.
  }

  cache = { stamp, files, rules };
  cachedRoot = bbsRoot;
  return cache;
}

/** The group a filename is corrected to, or undefined when no rule matches. */
export function groupForFilename(bbsRoot: string, filename: string): string | undefined {
  for (const rule of loadDir(bbsRoot).rules) {
    if (rule.test(filename)) return rule.group;
  }
  return undefined;
}

/**
 * The logo for a group, in the width the caller is painting.
 *
 * Falls back through the pack in one direction only: the art for this width,
 * then the group's name on one line. There is no cross-width fallback - an
 * 80-column `.txt` is never shown to a C64 and raw C64 bytes are never sent to
 * an ANSI terminal.
 */
export function resolveGroupLogo(
  bbsRoot: string,
  group: string,
  opts: { columns: 40 | 80 },
): GroupLogo {
  const key = normaliseGroupKey(group);
  const nameLine = (group || '').toUpperCase().slice(0, opts.columns);

  if (!key) return { kind: 'name', line: nameLine };

  const { files } = loadDir(bbsRoot);
  const wanted = opts.columns === 40 ? `${key.toLowerCase()}.seq` : `${key.toLowerCase()}.txt`;
  const actual = files.get(wanted);
  if (!actual) return { kind: 'name', line: nameLine };

  const file = path.join(groupsDir(bbsRoot), actual);
  try {
    if (opts.columns === 40) {
      const bytes = fs.readFileSync(file);
      const rows = seqRowCount(bytes);
      if (rows > MAX_LOGO_ROWS) {
        // Refused, not truncated: silently cutting art is the thing the whole
        // file view exists to stop. Once per group per boot.
        if (!loggedTallLogos.has(key)) {
          loggedTallLogos.add(key);
          console.warn(
            `[GroupLogo] ${actual} is ${rows} rows, the cap is ${MAX_LOGO_ROWS}; ` +
            `showing the name for "${group}" instead.`
          );
        }
        return { kind: 'name', line: nameLine };
      }
      return { kind: 'seq', bytes };
    }
    return { kind: 'ansi', text: fs.readFileSync(file, 'latin1') };
  } catch {
    return { kind: 'name', line: nameLine };
  }
}

/** Drop the cache. Tests, and any path that knows the volume moved. */
export function resetGroupLogoCache(): void {
  cache = undefined;
  cachedRoot = '';
  loggedTallLogos.clear();
}
