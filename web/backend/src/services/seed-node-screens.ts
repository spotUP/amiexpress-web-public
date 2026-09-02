/**
 * The board a sysop installs ships ONE copy of each node screen.
 *
 * The image builds `/app/default-data` by copying whole directories out of
 * this repo, and this repo is a running 41-node board: measured 2026-09-02 on
 * `origin/main`, the template carried 544 node screen files that are 16
 * distinct screens. A sysop who wanted to change the logon art had 41 files to
 * edit, found 41 files that had already drifted apart, and had no way to tell
 * which one their board reads.
 *
 * AmiExpress already solved this and this uses that solution rather than
 * inventing one: `SCREENS=<dir>` on `Node<n>.info` is the node's screen
 * directory, and a node whose icon does not declare one reads `Node<n>/`
 * (ACP.e:2666-2673, ported in `screens/screen-resolution.ts`). Point the nodes
 * at one directory and the screens are shared - by the board's own mechanism,
 * with no symlinks, and readable by a real Amiga. This project's own live
 * board has run this way since 2026-08: 215 nodes, 13 shared files.
 *
 * The decision about WHICH copies may share is not made here. It is
 * `planScreenCollapse` (services/screen-collapse.ts), the same rule the
 * importer applies to a board arriving from an Amiga: byte-identical copies
 * collapse, and a node that differs about any screen keeps its own directory.
 * A default board and an imported one then have the same shape, and there is
 * one place where "may these two screens become one" is decided.
 *
 * Only the files the loader actually reads move. `Node<n>/Screens/` is not a
 * node's screen directory in this port (express.e:6544-6640 builds ONE path
 * and has no fallback), and its contents are an older generation of the same
 * names - 182 of them differ from the file beside them - so feeding those in
 * would make every node a dissenter and collapse nothing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isScreenFile } from '../screens/screen-resolution';
import { applyTooltypes, parseInfoFile } from '../utils/info-file.util';
import { planScreenCollapse, type CollapsibleScreen } from './screen-collapse';

export interface SeedCollapseReport {
  /** Screens that now exist once, and how many nodes read that one copy. */
  shared: { name: string; copies: number }[];
  /** Nodes whose icon now declares SCREENS. */
  pointed: number[];
  /** Screens left in a node's own directory because that node differs. */
  kept: string[];
  /** Nodes that had no icon at all and were given one. */
  iconsCreated: number[];
}

/** `Node12` -> 12. Anything else is not a node directory. */
function nodeNumber(name: string): number | null {
  const match = /^Node(\d+)$/i.exec(name);
  return match ? Number(match[1]) : null;
}

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * The icon a node that has none is given.
 *
 * A node with no `Node<n>.info` reads `Node<n>/` and cannot be pointed
 * anywhere - SCREENS is a tooltype, so a node without an icon has nowhere to
 * declare it. The template ships icons for nodes 0 to 6 only, so nodes 7 and
 * up need one before they can share anything.
 *
 * It is copied from a node icon the template already has, so the new file is
 * a real Amiga icon with a real image rather than the plain-text `.info` this
 * port can read and Workbench cannot. Every tooltype comes back off it: a
 * node that had no icon had no settings either, and inheriting node 2's
 * TELNET or its chat colours would be this step quietly changing a board's
 * configuration while it tidied its screens.
 */
function iconTemplate(templateDir: string): string | null {
  for (let n = 0; n <= 255; n++) {
    const candidate = path.join(templateDir, `Node${n}.info`);
    if (!fs.existsSync(candidate)) continue;
    try {
      if (parseInfoFile(candidate).isBinary) return candidate;
    } catch {
      // A file this port cannot parse is not a template for 34 new ones.
    }
  }
  return null;
}

/**
 * Collapse the node screens of a seeded board template in place.
 *
 * Safe to run twice: the second run finds nothing left to share and changes
 * nothing, which matters because the image build is not the only thing that
 * may ever call it.
 */
export function collapseSeedNodeScreens(
  templateDir: string,
  opts: { sharedDir?: string } = {},
): SeedCollapseReport {
  const sharedDir = opts.sharedDir ?? path.join('Screens', 'Node');

  const nodes: number[] = [];
  for (const entry of fs.readdirSync(templateDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const node = nodeNumber(entry.name);
    if (node !== null) nodes.push(node);
  }
  nodes.sort((a, b) => a - b);

  /** Where each screen came from, so the originals can be taken away after. */
  const sources = new Map<string, string>();
  const screens: CollapsibleScreen[] = [];

  for (const node of nodes) {
    const dir = path.join(templateDir, `Node${node}`);
    for (const name of listFiles(dir)) {
      if (!isScreenFile(name)) continue;
      const relPath = path.join(`Node${node}`, name);
      sources.set(relPath, path.join(dir, name));
      // Bytes, never text: these are ANSI art full of high-bit Amiga
      // characters, and reading them as UTF-8 replaces every one of them
      // with U+FFFD without raising anything.
      screens.push({ relPath, content: fs.readFileSync(path.join(dir, name)) });
    }
  }

  const plan = planScreenCollapse(screens, sharedDir);
  const report: SeedCollapseReport = {
    shared: plan.collapsed,
    pointed: [],
    kept: plan.kept,
    iconsCreated: [],
  };

  if (plan.collapsed.length === 0) return report;

  /**
   * A node that still has a screen of its own must go on reading its own
   * directory.
   *
   * SCREENS points a node at ONE directory, so a node whose plan leaves any
   * file behind in `Node<n>/` - a screen no other node has, which is not
   * duplication and so is never shared - would be pointed away from it and
   * lose the screen. Nothing in the current template hits this; the check is
   * here because the failure is a screen that silently stops displaying.
   */
  const stillHasOwn = new Set(
    plan.kept.map(rel => Number(/^Node(\d+)[\\/]/i.exec(rel)?.[1] ?? NaN)),
  );
  const pointAt = plan.pointNodesAt.filter(entry => !stillHasOwn.has(entry.node));

  /** The screens the plan leaves exactly where they are, by original path. */
  const stays = new Set(plan.write.map(file => file.relPath).filter(rel => sources.has(rel)));

  // The originals go first: a screen that moved must not be left behind for
  // the loader to find in the directory the node no longer reads.
  for (const [relPath, source] of sources) {
    // A screen the plan writes back to its own node is not touched at all -
    // not rewritten, and not stripped of its icon.
    if (stays.has(relPath)) continue;

    fs.rmSync(source, { force: true });

    // An Amiga file's icon is `<file>.info` beside it. Left behind, it is an
    // icon for a file that is not there any more; it belongs with the screen
    // in the directory the nodes now read.
    const sidecar = `${source}.info`;
    if (!fs.existsSync(sidecar)) continue;
    const sidecarTarget = path.join(templateDir, sharedDir, `${path.basename(relPath)}.info`);
    fs.mkdirSync(path.dirname(sidecarTarget), { recursive: true });
    if (!fs.existsSync(sidecarTarget)) fs.copyFileSync(sidecar, sidecarTarget);
    fs.rmSync(sidecar, { force: true });
  }

  for (const file of plan.write) {
    if (stays.has(file.relPath)) continue;
    const target = path.join(templateDir, file.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }

  const template = iconTemplate(templateDir);
  for (const { node, screens: declared } of pointAt) {
    const icon = path.join(templateDir, `Node${node}.info`);
    const created = !fs.existsSync(icon);
    if (created) {
      if (template) fs.copyFileSync(template, icon);
      report.iconsCreated.push(node);
    }
    // A copied icon arrives carrying the settings of the node it was copied
    // from; `removeKeys` takes them all off again so the only thing the new
    // icon asserts is where its screens are.
    applyTooltypes(icon, [['SCREENS', declared]], created ? { removeKeys: () => true } : {});
    report.pointed.push(node);
  }

  return report;
}
