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

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isScreenFile, resolveNodeScreenDir } from '../screens/screen-resolution';
import { applyTooltypes, parseInfoFile } from '../utils/info-file.util';
import { planScreenCollapse, type CollapsePlan, type CollapsibleScreen } from './screen-collapse';

export interface SeedCollapseReport {
  /** Screens that now exist once, and how many nodes read that one copy. */
  shared: { name: string; copies: number }[];
  /** Nodes whose icon now declares SCREENS. */
  pointed: number[];
  /** Screens left in a node's own directory because that node differs. */
  kept: string[];
  /** Nodes that had no icon at all and were given one. */
  iconsCreated: number[];
  /**
   * Shared copies that already existed and were left as they were, with the
   * nodes' bytes kept beside them as `.pre-collapse` (existingSharedWins).
   */
  sharedKept: string[];
  /**
   * Screens in a node that keeps its own directory, refreshed from the
   * shared copy because the node agreed with the majority about them
   * (existingSharedWins). Old bytes kept beside each as `.pre-collapse`.
   */
  refreshed: string[];
}

export interface SeedCollapseOptions {
  sharedDir?: string;
  /**
   * The mode for a board that is already running, as opposed to the template
   * the image is built from.
   *
   * On a deployed board `Screens/Node/` is deploy-managed: the entrypoint
   * refreshes it from the image on every deploy (docker-entrypoint.sh
   * `list_tracked_screens`). The 41 `Node<n>/` copies are not - they were
   * seeded once and never touched again - so by the time this runs they are
   * the OLDER generation of the very screen the shared directory already
   * holds fresh. Writing them over it would undo the deploy that just
   * happened. So in this mode a shared copy that already exists wins, and
   * the nodes' bytes are kept beside it as `.pre-collapse` rather than lost.
   *
   * The same reasoning reaches into a node that keeps its own directory. It
   * keeps it because it differs about SOME screen (ACP.e:2666-2673 - SCREENS
   * is per node, not per screen); for every screen it agreed with the
   * majority about, its copy is the same stale duplicate the pointed nodes
   * just shed, and it follows the shared copy the same way. A screen the
   * node differs about is never touched: whose art is the real one is not
   * this code's decision.
   */
  existingSharedWins?: boolean;
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
  opts: SeedCollapseOptions = {},
): SeedCollapseReport {
  const sharedDir = opts.sharedDir ?? path.join('Screens', 'Node');
  const existingSharedWins = opts.existingSharedWins === true;

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

  const sharedAbs = path.resolve(templateDir, sharedDir);
  /** What the shared directory already holds, by lowercased name. */
  const existingShared = new Map<string, { name: string; content: Buffer }>();
  /**
   * Nodes whose icon already points at the shared directory. Their `Node<n>/`
   * directory usually still exists - it is the node's runtime state, drop
   * files and all - and whatever screen file is left in it is one the loader
   * no longer reads, so it is not a vote either.
   */
  const alreadyPointed: number[] = [];

  if (existingSharedWins) {
    for (const name of listFiles(sharedAbs)) {
      if (!isScreenFile(name)) continue;
      existingShared.set(name.toLowerCase(), { name, content: fs.readFileSync(path.join(sharedAbs, name)) });
    }
    for (const n of iconNodes(templateDir)) {
      if (path.resolve(resolveNodeScreenDir(templateDir, n)) === sharedAbs) alreadyPointed.push(n);
    }
    /**
     * The shared copy votes with the weight of every node that already reads
     * it. Without this, the second run sees only the nodes that kept their
     * own directories, and four of six agreeing about a screen the other
     * thirty-five never had is a "majority" that would point those four at
     * the shared directory and take their own screen away.
     *
     * These go FIRST: the plan breaks a tie towards the copy it saw first,
     * and in this mode a tie goes to what the board already shares.
     */
    for (const n of alreadyPointed) {
      for (const { name, content } of existingShared.values()) {
        screens.push({ relPath: path.join(`Node${n}`, name), content });
      }
    }
  }

  for (const node of nodes) {
    if (alreadyPointed.includes(node)) continue;
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
    sharedKept: [],
    refreshed: [],
  };

  if (plan.collapsed.length === 0) {
    if (existingSharedWins) refreshKeptNodes(sharedAbs, plan, sources, existingShared, report);
    return report;
  }

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
    // A vote cast on behalf of a node that already reads the shared directory
    // is not a file to write into that node's directory.
    const voter = /^Node(\d+)[\\/]/i.exec(file.relPath);
    if (voter && alreadyPointed.includes(Number(voter[1]))) continue;
    const target = path.join(templateDir, file.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (existingSharedWins && fs.existsSync(target)) {
      // The deploy already put the current generation here; the nodes'
      // bytes are the older one. Kept beside it, never written over it.
      if (!fs.readFileSync(target).equals(file.content)) {
        fs.writeFileSync(`${target}.pre-collapse`, file.content);
      }
      report.sharedKept.push(path.basename(file.relPath));
      continue;
    }
    fs.writeFileSync(target, file.content);
  }

  const template = iconTemplate(templateDir);
  for (const { node, screens: declared } of pointAt) {
    if (alreadyPointed.includes(node)) continue;
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

  if (existingSharedWins) refreshKeptNodes(sharedAbs, plan, sources, existingShared, report);

  return report;
}

/** Every node number that has an icon in the board directory. */
function iconNodes(boardDir: string): number[] {
  const found: number[] = [];
  for (const name of listFiles(boardDir)) {
    const match = /^Node(\d+)\.info$/i.exec(name);
    if (match) found.push(Number(match[1]));
  }
  return found;
}

/**
 * The shared bytes the kept nodes were last aligned to, by lowercased name.
 *
 * Written by `refreshKeptNodes` after every run. A kept node's copy that still
 * matches this is the previous generation of the shared screen - not that
 * node's own art - and follows the shared copy again on the next run. The
 * first run has no record and uses the plan's majority instead: a copy that
 * forty nodes share is the generation everyone was seeded with.
 */
const SHARED_MANIFEST = '.collapse-manifest';

function readSharedManifest(sharedAbs: string): Map<string, string> {
  const manifest = new Map<string, string>();
  try {
    for (const line of fs.readFileSync(path.join(sharedAbs, SHARED_MANIFEST), 'utf8').split('\n')) {
      const space = line.indexOf(' ');
      if (space > 0) manifest.set(line.slice(space + 1).trim().toLowerCase(), line.slice(0, space));
    }
  } catch {
    // No record yet: the first run.
  }
  return manifest;
}

const sha256 = (buffer: Buffer): string => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * A node that keeps its own directory still follows the shared copy for
 * every screen it never disagreed about.
 *
 * It keeps the directory because it differs about SOME screen and SCREENS is
 * per node, not per screen. For the rest, its copy is the same stale
 * duplicate the pointed nodes just shed - the majority's bytes on the first
 * run, the previous shared bytes on every run after - and it is brought up to
 * the shared copy, old bytes kept beside it as `.pre-collapse`. A copy that
 * matches neither is the node's own and is not touched.
 */
function refreshKeptNodes(
  sharedAbs: string,
  plan: CollapsePlan,
  sources: Map<string, string>,
  existingShared: Map<string, { name: string; content: Buffer }>,
  report: SeedCollapseReport,
): void {
  const previous = readSharedManifest(sharedAbs);
  /**
   * The majority is evidence only on the first run, when nothing else is.
   * Once a record exists it is the record that says what a kept node was
   * aligned to: on a board where the nodes that kept their directories
   * outnumber the ones that share, their common screen IS the majority, and
   * is their own art, not a stale copy of the shared one.
   */
  const useMajority = previous.size === 0;
  const chosen = new Map<string, Buffer>();
  for (const file of plan.write) {
    if (/^Node\d+[\\/]/i.test(file.relPath)) continue;
    chosen.set(path.basename(file.relPath).toLowerCase(), file.content);
  }

  for (const relPath of plan.kept) {
    const source = sources.get(relPath);
    if (!source || !fs.existsSync(source)) continue;
    const key = path.basename(relPath).toLowerCase();
    const shared = existingShared.get(key);
    if (!shared) continue;
    const mine = fs.readFileSync(source);
    if (mine.equals(shared.content)) continue;
    const majority = chosen.get(key);
    const stale = useMajority
      ? majority !== undefined && mine.equals(majority)
      : previous.get(key) === sha256(mine);
    if (!stale) continue;
    fs.writeFileSync(`${source}.pre-collapse`, mine);
    fs.writeFileSync(source, shared.content);
    report.refreshed.push(relPath);
  }

  // The record for next time: what the shared directory holds now. Re-read
  // rather than taken from memory, so a copy the plan wrote this run is in it.
  const lines: string[] = [];
  for (const name of listFiles(sharedAbs)) {
    if (!isScreenFile(name)) continue;
    lines.push(`${sha256(fs.readFileSync(path.join(sharedAbs, name)))} ${name}`);
  }
  if (lines.length > 0) {
    fs.mkdirSync(sharedAbs, { recursive: true });
    fs.writeFileSync(path.join(sharedAbs, SHARED_MANIFEST), `${lines.sort().join('\n')}\n`);
  }
}
