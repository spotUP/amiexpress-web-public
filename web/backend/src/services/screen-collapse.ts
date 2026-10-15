/**
 * Turning a board's per-node screen copies into one shared directory.
 *
 * Original AmiExpress addressed 32 nodes (axcommon.e:28 MAX_NODES=32); this
 * port addresses 255. At 32 a copy of every screen per node is an annoyance;
 * at 255 it is thousands of files that have to be edited together and drift
 * apart instead. Measured on this project's own board: 1,155 screen files, 34
 * of them unique - `guestlogon.txt` exists 80 times in one version.
 *
 * AmiExpress already solved it, and this uses that solution rather than
 * inventing one: `SCREENS=<dir>` on `Node<n>.info` points a node at a
 * directory of its own choosing, and with no such tooltype a node reads
 * `Node<n>/` (ACP.e:2666-2673). Point every node at one directory and the
 * screens are shared - by the board's own mechanism, with no symlinks and
 * nothing a real AmiExpress could not read.
 *
 * Only byte-identical copies are collapsed. A node that was deliberately
 * different stays different, and keeps its own directory.
 */

import * as crypto from 'crypto';
import * as path from 'path';

/** A screen as the importer carries it: where it was, and what is in it. */
export interface CollapsibleScreen {
  relPath: string;
  content: Buffer;
}

export interface CollapsePlan {
  /** Files to write, by their new path relative to the board root. */
  write: { relPath: string; content: Buffer }[];
  /** Nodes that should be pointed at the shared directory. */
  pointNodesAt: { node: number; screens: string }[];
  /** What was collapsed, for the report a sysop reads. */
  collapsed: { name: string; copies: number }[];
  /** Screens left exactly where they were, because they are not identical. */
  kept: string[];
}

/** `Node12/LOGON.TXT` -> 12. Anything else is not a node screen. */
function nodeOf(relPath: string): number | null {
  const match = /^Node(\d+)[\\/]/i.exec(relPath);
  return match ? Number(match[1]) : null;
}

/** The file name a node screen would have in the shared directory. */
function screenName(relPath: string): string {
  return relPath.split(/[\\/]/).pop() as string;
}

const hash = (buffer: Buffer): string =>
  crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * What an import should write, given the screens it found.
 *
 * `sharedDir` is the directory every node will be pointed at - `Screens/Node`
 * is what this project's own board uses.
 *
 * A screen is collapsed only when EVERY node that has it has the same bytes.
 * One node with its own version means the whole name stays per-node: the
 * alternative is deciding which node's art is the real one, and that is not a
 * decision an importer gets to make.
 */
export function planScreenCollapse(
  screens: CollapsibleScreen[],
  sharedDir = path.join('Screens', 'Node'),
): CollapsePlan {
  const plan: CollapsePlan = { write: [], pointNodesAt: [], collapsed: [], kept: [] };

  /** Node screens by file name, lowercased - the Amiga's filesystem is too. */
  const byName = new Map<string, CollapsibleScreen[]>();
  const nodes = new Set<number>();

  for (const screen of screens) {
    const node = nodeOf(screen.relPath);
    if (node === null) {
      // Not a node screen - a conference's or the board's own. Untouched.
      plan.write.push(screen);
      continue;
    }

    nodes.add(node);
    const key = screenName(screen.relPath).toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), screen]);
  }

  /**
   * The version of each screen the shared directory would hold: the one the
   * most nodes already have.
   *
   * Ties go to the first seen, which is the lowest node number - arbitrary,
   * but stable, and every node that disagrees keeps its own copy anyway.
   */
  const chosen = new Map<string, CollapsibleScreen>();
  for (const [key, copies] of byName) {
    const counts = new Map<string, { screen: CollapsibleScreen; n: number }>();
    for (const copy of copies) {
      const digest = hash(copy.content);
      const seen = counts.get(digest);
      if (seen) seen.n += 1;
      else counts.set(digest, { screen: copy, n: 1 });
    }

    let best = { screen: copies[0], n: 0 };
    for (const entry of counts.values()) if (entry.n > best.n) best = entry;
    chosen.set(key, best.screen);
  }

  /**
   * A node can be pointed at the shared directory only if EVERY screen it has
   * matches the version that directory would hold.
   *
   * SCREENS points a node at ONE directory (ACP.e:2666-2673) - it is per node,
   * not per screen - so a node that disagrees about any single screen has to
   * go on reading its own, and needs its whole set there.
   */
  const keptNodes = new Set<number>();
  for (const [key, copies] of byName) {
    const want = hash(chosen.get(key)!.content);
    for (const copy of copies) {
      const node = nodeOf(copy.relPath);
      if (node !== null && hash(copy.content) !== want) keptNodes.add(node);
    }
  }

  /*
   * Keeping one screen can force a node to keep another, so this settles
   * rather than deciding in one pass.
   *
   * A screen only ONE sharing node has cannot go in the shared directory -
   * there is nothing to share it with - so it stays in that node's own
   * directory, and the node therefore has to go on reading that directory,
   * and therefore keeps every OTHER screen it has too. Which can leave the
   * next screen with only one sharer, and so on.
   *
   * Without this a node was pointed at the shared directory and simply
   * stopped seeing the screen only it had. Found by review, not by a test -
   * the board this was written against has no screen rarer than four copies,
   * so nothing here would have caught it.
   */
  for (;;) {
    let changed = false;

    for (const [key, copies] of byName) {
      const want = hash(chosen.get(key)!.content);
      const sharers = copies
        .map(c => nodeOf(c.relPath))
        .filter((n): n is number => n !== null && !keptNodes.has(n)
          && hash(copies.find(c => nodeOf(c.relPath) === n)!.content) === want);

      if (sharers.length === 1 && !keptNodes.has(sharers[0])) {
        keptNodes.add(sharers[0]);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const shareableNodes = [...nodes].filter(n => !keptNodes.has(n)).sort((a, b) => a - b);

  for (const [key, copies] of byName) {
    const lead = chosen.get(key)!;
    const sharedCopies = copies.filter(c => {
      const node = nodeOf(c.relPath);
      return node !== null && !keptNodes.has(node);
    });

    // Worth sharing only when more than one node ends up reading it; a screen
    // one node has is not duplication.
    if (sharedCopies.length >= 2) {
      plan.write.push({
        relPath: path.join(sharedDir, screenName(lead.relPath)),
        content: lead.content,
      });
      plan.collapsed.push({ name: screenName(lead.relPath), copies: sharedCopies.length });
    } else {
      for (const copy of sharedCopies) {
        plan.write.push(copy);
        plan.kept.push(copy.relPath);
      }
    }

    // Every node staying on its own directory keeps its own copy of
    // everything it had, or sharing would take screens away from it.
    for (const copy of copies) {
      const node = nodeOf(copy.relPath);
      if (node !== null && keptNodes.has(node)) {
        plan.write.push(copy);
        plan.kept.push(copy.relPath);
      }
    }
  }

  if (plan.collapsed.length > 0) {
    for (const node of shareableNodes) {
      plan.pointNodesAt.push({ node, screens: `BBS:${sharedDir.split(path.sep).join('/')}/` });
    }
  }

  return plan;
}
