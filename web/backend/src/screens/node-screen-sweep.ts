/**
 * The screen files a node keeps but can no longer read.
 *
 * A node reads ONE directory: `Node<n>/`, or whatever its `SCREENS` tooltype
 * names (express.e ACP.e:2666-2673, ported in `resolveNodeScreenDir`). When a
 * board is collapsed onto a shared directory the tooltype moves, and every
 * screen still sitting in `Node<n>/` becomes unreachable - the loader never
 * looks there again.
 *
 * Measured on the live board, 2026-09-08: 249 of 256 nodes read
 * `Screens/Node`, and their own directories still hold 238 files identical to
 * the shared copy and 264 that DIFFER from it. All 502 are invisible to every
 * caller, and that is the trap: they look like art in the admin, a sysop can
 * open one and edit it, and nothing will ever serve what he drew. An evening
 * went into exactly that - "i uploaded a petscii bbs title now but it doesnt
 * display".
 *
 * THE TWO HALVES ARE NOT THE SAME QUESTION, so this reports them apart:
 *
 * - IDENTICAL to what the node now reads: nothing is lost by deleting it, and
 *   leaving it is what makes the gallery show a screen forty-seven times.
 * - DIFFERENT: it may be the only copy of art nobody shared. Deleting it is a
 *   decision, not a tidy-up, so this never proposes it - it names it.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { isScreenFile } from './screen-tables';
import { resolveNodeScreenDir } from './screen-resolution';

export interface StrandedScreen {
  /** Board-relative path of the file nothing reads. */
  relPath: string;
  node: number;
  /** The file this node reads instead, board-relative. */
  readsInstead: string;
  /** Byte-identical to what it reads, or different art nobody shared. */
  identical: boolean;
  bytes: number;
}

/**
 * Orphans that are the SAME file, counted once.
 *
 * On the live board the 64 stranded `BBSTITLE.txt` copies are byte-identical
 * to each other - one old 13,894-byte version left behind when the shared copy
 * moved on to 14,023 - and 34 each of four more screens are the same story.
 * Listed one by one that reads as 200 unknown files a sysop dare not touch;
 * grouped, it reads as five stale generations he can recognise and clear.
 */
export interface OrphanGroup {
  sha256: string;
  /** The screen's file name, as every copy spells it. */
  name: string;
  copies: number;
  bytes: number;
  /** One of them, so a sysop can open it and look. */
  sample: string;
  /** Every node holding this exact file. */
  nodes: number[];
}

export interface NodeSweepPlan {
  /** Nodes whose SCREENS tooltype points somewhere other than their own directory. */
  pointedNodes: number[];
  /** Safe to delete: the node reads a byte-identical file elsewhere. */
  redundant: StrandedScreen[];
  /** NOT safe: different bytes, and only the sysop knows whether they matter. */
  orphaned: StrandedScreen[];
  /** The orphans by content, so identical leftovers are one decision. */
  orphanGroups: OrphanGroup[];
}

/** `Node12` -> 12, and nothing else is a node directory. */
function nodeNumber(name: string): number | null {
  const match = /^Node(\d+)$/i.exec(name);
  return match ? Number(match[1]) : null;
}

function readOrNull(file: string): Buffer | null {
  try {
    return fs.statSync(file).isFile() ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

/**
 * What each node keeps that it cannot read, split by whether losing it costs
 * anything. Reads only; nothing here writes.
 */
export function planNodeScreenSweep(baseDir: string): NodeSweepPlan {
  const plan: NodeSweepPlan = { pointedNodes: [], redundant: [], orphaned: [], orphanGroups: [] };
  /** sha256 -> the group being built, so identical orphans count once. */
  const groups = new Map<string, OrphanGroup>();

  let entries: string[];
  try {
    entries = fs.readdirSync(baseDir);
  } catch {
    return plan;
  }

  for (const entry of entries) {
    const node = nodeNumber(entry);
    if (node === null) continue;

    const ownDir = path.resolve(baseDir, entry);
    const readsDir = path.resolve(resolveNodeScreenDir(baseDir, node));
    // A node that still reads its own directory has nothing stranded: every
    // screen in there is a screen it serves.
    if (readsDir === ownDir) continue;
    plan.pointedNodes.push(node);

    let names: string[];
    try {
      names = fs.readdirSync(ownDir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (!isScreenFile(name)) continue;
      const stranded = path.join(ownDir, name);
      const mine = readOrNull(stranded);
      if (!mine) continue;

      // Case-insensitively, the way the loader finds a screen.
      const servedName = (() => {
        try {
          return fs.readdirSync(readsDir).find(n => n.toLowerCase() === name.toLowerCase());
        } catch {
          return undefined;
        }
      })();
      const served = servedName ? readOrNull(path.join(readsDir, servedName)) : null;

      const record: StrandedScreen = {
        relPath: path.relative(baseDir, stranded),
        node,
        readsInstead: servedName
          ? path.relative(baseDir, path.join(readsDir, servedName))
          : path.join(path.relative(baseDir, readsDir), name),
        identical: !!served && served.equals(mine),
        bytes: mine.length,
      };

      // No file of that name where the node now reads: this is art that would
      // simply vanish, so it is never redundant.
      if (record.identical) {
        plan.redundant.push(record);
      } else {
        plan.orphaned.push(record);
        const sha256 = crypto.createHash('sha256').update(mine).digest('hex');
        const group = groups.get(sha256);
        if (group) {
          group.copies += 1;
          group.nodes.push(node);
        } else {
          groups.set(sha256, {
            sha256, name, copies: 1, bytes: mine.length, sample: record.relPath, nodes: [node],
          });
        }
      }
    }
  }

  plan.pointedNodes.sort((a, b) => a - b);
  plan.orphanGroups = [...groups.values()].sort((a, b) => b.copies - a.copies);
  for (const group of plan.orphanGroups) group.nodes.sort((a, b) => a - b);
  return plan;
}

/**
 * Delete the redundant copies, and only those.
 *
 * Returns what went. `orphaned` is never touched here, whatever a caller asks:
 * this function cannot be the way somebody loses the only copy of a screen.
 */
export function sweepRedundantNodeScreens(baseDir: string, plan: NodeSweepPlan): string[] {
  const removed: string[] = [];
  for (const file of plan.redundant) {
    try {
      fs.unlinkSync(path.resolve(baseDir, file.relPath));
      removed.push(file.relPath);
    } catch {
      // A file that vanished under us is the wanted end state.
    }
  }
  return removed;
}
