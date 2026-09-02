/**
 * The board as PIECES OF ART rather than as files.
 *
 * Measured on this board: 1,155 screen files, and 1,121 of them are in a
 * name-group of two or more. Thirty-four files are unique. `logoff.txt` exists
 * 93 times in 5 versions; `guestlogon.txt` 80 times in one. Editing that
 * board one file at a time is what PRODUCED the five versions - somebody fixed
 * a few nodes and the rest drifted.
 *
 * So the unit here is a VERSION - one distinct content, however many paths
 * hold it - and the answer to "how many copies" is a number, never a list of
 * eighty rows.
 *
 * The readership is the other half, and it is the half that decides whether an
 * edit matters. On this board 215 nodes carry `SCREENS=BBS:Screens/Node/` on
 * their icon (express.e reads it in ACP.e:2666; with no tooltype a node reads
 * `Node<n>/`), so ONE file in `Screens/Node/` is what those 215 nodes display
 * and the per-node copies beside it are read by nobody. A bulk edit that
 * ignored that would write eighty files and change nothing a caller sees.
 */

import type { ScreenIndexShape, ScreenFileShape, ScreenReaderShape } from './screen-index-view';

export interface ScreenVersion {
  sha256: string;
  /** Every path holding these exact bytes, the ones that are READ first. */
  paths: string[];
  /** The file to edit for this version: one that something actually reads. */
  editPath: string;
  /** How many scopes display this version. */
  readerCount: number;
  /** "215 nodes", "node 3 only", "read by nothing" - never a list of eighty. */
  readership: string;
  bytes: number;
}

export interface DuplicateGroup {
  /** The file name, in the spelling of the copy that leads. */
  name: string;
  /** How many files carry this name, across every scope. */
  fileCount: number;
  versions: ScreenVersion[];
  /** Every copy is byte-identical - the safe case for one edit. */
  uniform: boolean;
  /** Something displays at least one of these. */
  anyRead: boolean;
  /**
   * The screen name the board reaches these files by, when anything does.
   *
   * Carried so that opening a group can offer the deep fix - pointing the
   * nodes at one directory - which needs the screen, not just the file. A
   * group nothing reads has no screen name, and nothing to share.
   */
  screen?: string;
}

/** Whether a reader actually DISPLAYS the file, rather than merely naming it. */
function isDisplayed(reader: ScreenReaderShape): boolean {
  return reader.via === 'resolved' || reader.via === 'variant';
}

function readersOf(file: ScreenFileShape): ScreenReaderShape[] {
  return (file.readBy ?? []).filter(isDisplayed);
}

/**
 * Who displays this version, said in one line.
 *
 * Counted over SCOPES rather than files: eighty nodes reading one shared file
 * is "80 nodes", and it is the number that tells a designer the edit is worth
 * making.
 */
export function describeReadership(readers: ScreenReaderShape[]): string {
  if (readers.length === 0) return 'read by nothing';

  const nodes = new Set(readers.filter(r => r.scope === 'node').map(r => r.id));
  const confs = new Set(readers.filter(r => r.scope === 'conf').map(r => r.id));
  const board = readers.some(r => r.scope === 'board');

  const parts: string[] = [];
  if (nodes.size === 1) parts.push(`node ${[...nodes][0]}`);
  else if (nodes.size > 1) parts.push(`${nodes.size} nodes`);
  if (confs.size === 1) parts.push(`1 conference`);
  else if (confs.size > 1) parts.push(`${confs.size} conferences`);
  if (board) parts.push('the whole board');

  return parts.length ? `read by ${parts.join(' and ')}` : 'read by nothing';
}

/**
 * Every screen name that exists more than once, grouped by content.
 *
 * Names are matched case-insensitively because the Amiga's filesystem is:
 * `Logoff.txt` and `LOGOFF.TXT` are one screen, and treating them as two is
 * how this repo has been bitten twice today already.
 */
export function duplicateGroups(index: ScreenIndexShape): DuplicateGroup[] {
  const byName = new Map<string, ScreenFileShape[]>();

  for (const file of Object.values(index.files)) {
    const name = (file.relPath.split(/[\\/]/).pop() ?? file.relPath).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }

  const groups: DuplicateGroup[] = [];

  for (const [, files] of byName) {
    if (files.length < 2) continue;

    const byContent = new Map<string, ScreenFileShape[]>();
    for (const file of files) {
      byContent.set(file.sha256, [...(byContent.get(file.sha256) ?? []), file]);
    }

    const versions: ScreenVersion[] = [...byContent.entries()]
      .map(([sha256, copies]) => {
        // The copy something READS leads, so "edit this one" means the file a
        // caller actually sees rather than whichever the index listed first.
        const sorted = [...copies].sort((a, b) => readersOf(b).length - readersOf(a).length);
        const readers = sorted.flatMap(readersOf);

        return {
          sha256,
          paths: sorted.map(c => c.relPath),
          editPath: sorted[0].relPath,
          readerCount: new Set(readers.map(r => `${r.scope}:${r.id}`)).size,
          readership: describeReadership(readers),
          bytes: sorted[0].bytes,
        };
      })
      .sort((a, b) => b.readerCount - a.readerCount || b.paths.length - a.paths.length);

    // The name in the spelling of the version that leads, not lowercased.
    const lead = versions[0].editPath.split(/[\\/]/).pop() as string;

    const displayed = files.flatMap(readersOf);

    groups.push({
      name: lead,
      fileCount: files.length,
      versions,
      uniform: versions.length === 1,
      anyRead: versions.some(v => v.readerCount > 0),
      screen: displayed[0]?.screen,
    });
  }

  // Worst first: the screens that cost the most to maintain lead the list.
  return groups.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}

/**
 * One line about a group, for a row a sysop reads rather than counts.
 *
 * "93 copies in 5 versions" is the maintenance problem stated; "80 copies, all
 * identical" is the one that can be edited in a single write.
 */
export function describeGroup(group: DuplicateGroup): string {
  const copies = `${group.fileCount} copies`;
  if (group.uniform) return `${copies}, all identical`;
  return `${copies} in ${group.versions.length} versions`;
}
