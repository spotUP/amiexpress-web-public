/**
 * Screen Files API - the admin's view of every screen the board can display.
 *
 * Four rules run through every route here, and each was paid for by a bug
 * already in this repo's history:
 *
 *   1. Resolve a path ONCE, case-insensitively, and use that resolved path for
 *      the read, the backup and the write. info-editor-routes.ts tested
 *      existence case-insensitively and then read case-sensitively - invisible
 *      on macOS, broken on the Linux container.
 *   2. Bytes, never text. Content crosses as base64 both ways: a UTF-8 round
 *      trip turns an Amiga high-bit byte into U+FFFD.
 *   3. Never normalise a filename. The security level (LOGON20.TXT) and the
 *      type extension (flt.txt.gr) ARE the routing (express.e:6544-6640).
 *   4. Back up before every destructive write, and restore on failure.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { userFileManager } from '../services/UserFileManager';
import { getSystemTime } from '../utils/date-time.util';
import { screenSearchLocations } from '../screens/screen-resolution';
import { checkShare } from '../screens/share-preconditions';
import { applyTooltypes } from '../utils/info-file.util';
import {
  getScreenIndex, invalidateScreenIndex, invalidateScreenFacts, screenFileFacts,
  buildScreenIndex, listScreenDirectories, listBbsCommands,
} from '../screens/screen-index.service';
import { MCI_CATALOG, MCI_FAMILY_ORDER, MCI_ENABLED_KEY } from '../screens/mci-catalog';
import { repairOneFile } from '../screens/screen-repair';
import { planMciCarry, applyMciCarry, type MciPlacement } from '../screens/mci-carry';
import { setScreenFlag, readScreenFlags, type ScreenFlag } from '../screens/screen-flags';
import { saveRevision, listRevisions, readRevision, restoreRevision } from '../screens/screen-revisions';

export const screensRouter = express.Router();

/**
 * Resolve a path under the BBS root, the way the rest of this codebase does.
 *
 * Confinement is checked on the requested path AND on what it resolved to, so
 * a symlink cannot walk out of the board.
 */
/**
 * A path inside the board root, whether or not anything is there yet.
 *
 * resolveScreenPath() answers null for a path that does not exist, because it
 * resolves through the Amiga filesystem's case-insensitive lookup. That is
 * right for reading a file and wrong for naming a directory a sysop may be
 * about to choose or create: the two questions were the same call, so "there
 * is no Screens/Shared" was reported as "outside the board root".
 */
export function containedScreenPath(relativePath: string): string | null {
  const bbsRoot = path.resolve(config.get('dataDir'));
  const full = path.resolve(path.join(bbsRoot, relativePath));

  return full === bbsRoot || full.startsWith(`${bbsRoot}${path.sep}`) ? full : null;
}

export function resolveScreenPath(relativePath: string): string | null {
  const bbsRoot = config.get('dataDir');
  const fullPath = path.join(bbsRoot, relativePath);

  const resolvedRoot = path.resolve(bbsRoot);
  if (!path.resolve(fullPath).startsWith(resolvedRoot)) return null;

  const real = amigafs.resolvePath(fullPath);
  if (!real) return null;
  if (!path.resolve(real).startsWith(resolvedRoot)) return null;

  return real;
}

/**
 * A backslash has no legitimate use in a screen relative path on this board
 * (Amiga/POSIX paths here use `/`) - but `containedScreenPath`'s
 * `path.resolve` treats it as an ordinary character, not a separator, so
 * `..\..\..\..\proc\self\environ` resolves to a harmless-looking path
 * INSIDE the board root (a single, weird filename component) and passes
 * containment - while screen-revisions.ts's `revDirFor` collapses BOTH `/`
 * and `\` to `_`, so that same string sanitises to the IDENTICAL revision
 * directory the forward-slash traversal variant would have used. One
 * request string bypasses containment; the other (correctly rejected by
 * containedScreenPath) is the one that actually wrote there. Rejecting any
 * backslash outright, before containedScreenPath ever runs, closes that
 * gap for the three revision routes below.
 */
function hasBackslash(s: string): boolean {
  return s.includes('\\');
}

/** The envelope every admin page unwraps - `success`, `data`, `message`. */
function sendOk<T>(res: Response, data: T, message?: string): void {
  res.json({
    success: true,
    data,
    message,
    timestamp: getSystemTime().toISOString(),
  });
}

/**
 * GET /api/screens
 * Every screen, where it resolves per scope, the duplicate groups and the
 * files nothing reads.
 */
screensRouter.get('/', (_req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const index = getScreenIndex(baseDir);

  // How many accounts sit at each security level.
  //
  // Not part of the index: that is built from the screen directories and
  // cached on their mtimes, while user.data changes every time somebody logs
  // on. Counted here so a variant can say "95 callers" rather than "levels
  // 30 and above", which is the fact a sysop is actually asking for.
  const callersByLevel: Record<number, number> = {};
  try {
    for (const user of userFileManager.readAllUsers() ?? []) {
      const level = Number((user as { secLevel?: number }).secLevel ?? 0);
      if (!Number.isFinite(level)) continue;
      callersByLevel[level] = (callersByLevel[level] ?? 0) + 1;
    }
  } catch (error) {
    console.error('[Screens] could not count callers by level:', error);
  }

  sendOk(res, { ...index, callersByLevel });
});

/**
 * GET /api/screens/file?path=...[&download=1]
 * The bytes, base64 for the editor and raw for a download.
 */
screensRouter.get('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  let buf: Buffer;
  try {
    buf = fs.readFileSync(full);
  } catch (error) {
    return res.status(404).json({ success: false, error: (error as Error).message });
  }

  if (req.query.download) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
    return res.end(buf);
  }

  const baseDir = config.get('dataDir');
  const facts = screenFileFacts(baseDir, full);

  /*
   * `readBy` is filled in by buildScreenIndex, not by screenFileFacts - only
   * the index knows which nodes and conferences exist and what each one reads.
   * Answering with the bare facts meant this route reported EVERY file as read
   * by nothing, and the panel said so in as many words: "No screen on this
   * board reads this file." Reported by the sysop looking at Conf2/bull20.txt,
   * which the index knows is CONF_BULL in conference 2 at level 20 and above.
   */
  const indexed = getScreenIndex(baseDir).files[facts.relPath];

  return sendOk(res, {
    ...facts,
    readBy: indexed?.readBy ?? facts.readBy,
    content: buf.toString('base64'),
  });
});

/**
 * GET /api/screens/resolve?screen=&node=&conf=
 * Which directories express.e would search, in order, and which file won.
 *
 * This is the question nobody could answer before: "what does node 7 actually
 * display for BBSTITLE, and why".
 */
screensRouter.get('/resolve', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const screen = String(req.query.screen || '').toUpperCase();
  const nodeId = parseInt(String(req.query.node ?? '1'), 10);
  const confId = req.query.conf ? parseInt(String(req.query.conf), 10) : undefined;

  const searched = screenSearchLocations(baseDir, screen, { nodeId, confId })
    .map(l => ({ dir: path.relative(baseDir, l.dir) || '.', desc: l.desc }));

  const index = getScreenIndex(baseDir);
  const entry = index.screens.find(s => s.screen === screen);
  const resolution = entry?.resolutions.find(r =>
    r.scope === 'conf' ? r.id === confId : r.scope === 'node' ? r.id === nodeId : true);

  sendOk(res, {
    screen,
    searched,
    chosen: resolution?.file ?? null,
    variants: resolution?.variants ?? [],
  });
});

/**
 * Resolve a path that may not exist yet: the parent has to be real, the
 * basename does not.
 */
function resolveScreenPathAllowingNew(relativePath: string): string | null {
  const existing = resolveScreenPath(relativePath);
  if (existing) return existing;

  const parent = resolveScreenPath(path.dirname(relativePath));
  if (!parent) return null;
  return path.join(parent, path.basename(relativePath));
}

/**
 * Write one buffer to many targets, atomically enough to undo.
 *
 * Each target is backed up before it is touched, and a failure anywhere
 * restores every file already written - a replace across forty nodes is
 * all-or-nothing rather than half-applied.
 */
/**
 * `bytes` may differ PER TARGET - the MCI carry keeps each node's own codes,
 * so node 1 and node 7 receive different files from one upload. Passing a
 * function keeps that inside the all-or-nothing loop; writing each target with
 * its own call would give up the rollback.
 */
function writeToTargets(targets: string[], bytes: Buffer | ((rel: string) => Buffer)): string[] {
  const done: { full: string; backup: string | null }[] = [];

  try {
    for (const rel of targets) {
      const full = resolveScreenPathAllowingNew(rel);
      if (!full) throw new Error(`Path outside the board root: ${rel}`);

      let backup: string | null = null;
      if (fs.existsSync(full)) {
        // Snapshot to .Revisions before overwriting. The `.backup` beside the
        // file is ONE undo, overwritten by the next write; the revision store
        // keeps the last ten, which is what the admin's history panel lists.
        saveRevision(rel);
        backup = `${full}.backup`;
        fs.copyFileSync(full, backup);
      }
      fs.writeFileSync(full, typeof bytes === 'function' ? bytes(rel) : bytes);
      done.push({ full, backup });
    }
  } catch (error) {
    for (const d of done) {
      if (d.backup) fs.copyFileSync(d.backup, d.full);
      else fs.unlinkSync(d.full);
    }
    throw error;
  }

  invalidateScreenIndex();
  return done.map(d => d.full);
}

/**
 * Whether a rename would move a screen off its route.
 *
 * The security level and the type extension are not decoration:
 * findSecurityScreen picks LOGON20.TXT for a level-20 caller and LOGON.TXT for
 * everyone below, and ScreenTypes.info decides which extension an ANSI caller
 * is served. Renaming either silently unroutes the screen.
 */
function renameChangesRouting(from: string, to: string): boolean {
  const stem = (n: string) => n.toLowerCase().replace(/\.[^.]*$/, '');
  const securityLevel = (n: string) => (stem(n).match(/(\d+)$/) || ['', ''])[1];
  const extension = (n: string) => {
    const lower = n.toLowerCase();
    const dot = lower.indexOf('.');
    return dot === -1 ? '' : lower.slice(dot);
  };
  return securityLevel(from) !== securityLevel(to) || extension(from) !== extension(to);
}

/** Which `screen scope=id` pairs lose their file when these paths go away. */
function resolutionsLost(baseDir: string, before: ReturnType<typeof buildScreenIndex>): string[] {
  const after = buildScreenIndex(baseDir);
  const lost: string[] = [];

  for (const entry of before.screens) {
    const now = after.screens.find(s => s.screen === entry.screen);
    for (const res of entry.resolutions) {
      if (!res.file) continue;
      const stillThere = now?.resolutions.find(r => r.scope === res.scope && r.id === res.id)?.file;
      if (!stillThere) lost.push(`${entry.screen} ${res.scope}=${res.id}`);
    }
  }

  return lost;
}

/**
 * PUT /api/screens/file?path=...[&rename=...]
 * Body: { content: base64, targets?: string[] }
 */
screensRouter.put('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const rename = req.query.rename ? String(req.query.rename) : null;

  if (rename && renameChangesRouting(path.basename(rel), rename)) {
    return res.status(400).json({
      success: false,
      error: 'That rename changes the routing - the security level and the type extension decide which caller sees this screen',
    });
  }

  const content = String((req.body || {}).content ?? '');
  const targets: string[] = Array.isArray(req.body?.targets) && req.body.targets.length
    ? req.body.targets
    : [rename ? path.join(path.dirname(rel), rename) : rel];

  const placement = readPlacement((req.body || {}).carryCodes);
  if (!placement) {
    return res.status(400).json({ success: false, error: 'carryCodes must be none, above or below' });
  }

  // Latin1 both ways: a screen carries Amiga high-bit bytes, and a UTF-8 round
  // trip turns one into U+FFFD.
  const uploaded = Buffer.from(content, 'base64').toString('latin1');
  const plans = planCarryForTargets(targets, uploaded, placement);

  // A dry run answers 200 with the verdicts and writes nothing, so the dialog
  // can say what a replace would lose before the sysop chooses.
  if ((req.body || {}).dryRun === true) {
    return sendOk(res, {
      dryRun: true,
      targets: plans.map(({ path: target, carried, lost, uploadHasCodes }) =>
        ({ path: target, carried, lost, uploadHasCodes })),
    });
  }

  const byTarget = new Map(plans.map(entry => [entry.path, entry.plan]));

  // Snapshot whatever is there NOW, before it is overwritten. This is the
  // only call site: screen-revisions.ts's own writer (saveRevision) existed
  // with nothing calling it, so every earlier "revision" was recorded
  // nowhere and GET /revisions always answered empty.
  //
  // MUST go through resolveScreenPath first, never a raw `target` string:
  // a `targets` entry naming `../../../../proc/self/environ` used to reach
  // saveRevision's own bare `path.resolve(baseDir, relPath)` directly,
  // walking straight out of the board root — an arbitrary file read gated
  // by nothing but this route's normal level-100 auth. resolveScreenPath
  // does the same double containment check (before AND after the Amiga
  // case-insensitive lookup) every OTHER read in this file already relies
  // on; a target that fails it has nothing safe to snapshot, matching
  // saveRevision's own pre-existing no-op for "nothing there yet".
  for (const target of targets) {
    const resolved = resolveScreenPath(target);
    if (!resolved) continue;
    try { saveRevision(path.relative(config.get('dataDir'), resolved)); } catch { /* best effort */ }
  }

  try {
    const written = writeToTargets(targets, target => {
      const plan = byTarget.get(target);
      return Buffer.from(plan ? applyMciCarry(uploaded, plan, placement) : uploaded, 'latin1');
    });
    return sendOk(res, {
      written: written.map(w => path.relative(config.get('dataDir'), w)),
      carried: plans.map(({ path: target, carried, lost }) => ({ path: target, carried, lost }))
        .filter(t => t.carried.length || t.lost.length),
    }, `Wrote ${written.length} file${written.length === 1 ? '' : 's'}`);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/screens/file?path=...
 * Backs up, removes, and reports which scopes stop resolving because of it.
 */
/**
 * POST /api/screens/flag   Body: { path, flag: 'backup' | 'runtime' | 'art' | null }
 *
 * The sysop's own answer about a file, over the manager's guess.
 *
 * Today's classification is by name and by the signature of the tool that
 * writes a file. Both are heuristics, and this board has been told once
 * already that its live screens were read by nothing. `art` is the override
 * that says the guess is wrong and a designer does edit this one; `null`
 * removes the override so the heuristic applies again.
 */
screensRouter.post('/flag', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.body?.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  const raw = req.body?.flag;
  const flag: ScreenFlag | null = raw === null || raw === undefined || raw === ''
    ? null
    : ['backup', 'runtime', 'art'].includes(String(raw)) ? String(raw) as ScreenFlag : null;

  if (raw && flag === null) {
    return res.status(400).json({
      success: false,
      error: 'flag must be backup, runtime, art, or null to clear it',
    });
  }

  // Store it under the path the index reports, so a lookup by relPath finds
  // it whatever casing the sysop typed.
  const relPath = path.relative(baseDir, full);
  setScreenFlag(baseDir, relPath, flag);
  // The bytes did not move, so the per-file cache would answer with the old
  // classification: the flag has to clear the FACTS, not just the index.
  invalidateScreenFacts();

  return sendOk(res, { path: relPath, flag, flags: readScreenFlags(baseDir) },
    flag ? `Marked ${relPath} as ${flag}` : `Cleared the mark on ${relPath}`);
});

/**
 * POST /api/screens/repair   Body: { path }
 *
 * Puts the escape byte back in front of a screen's colour codes. The repair
 * itself lives in screens/screen-repair.ts, because the health page offers the
 * same one.
 */
screensRouter.post('/repair', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.body?.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  const outcome = repairOneFile(full);
  if ('refused' in outcome) {
    const missing = outcome.refused.includes('ENOENT');
    return res.status(missing ? 404 : 400).json({ success: false, error: outcome.refused });
  }

  invalidateScreenIndex();

  return sendOk(res, {
    path: path.relative(baseDir, full),
    backup: `${path.relative(baseDir, full)}.backup`,
    repaired: outcome.repaired,
  }, `Put the escape byte back in front of ${outcome.repaired} code${outcome.repaired === 1 ? '' : 's'}`);
});

/**
 * POST /api/screens/repair-all   Body: { dryRun?: boolean }
 *
 * Every file the index flags as damaged, repaired in one pass.
 *
 * 41 of this board's 47 damaged screens are copies of ONE NODE_BULL.TXT, so
 * repairing them one at a time is forty clicks for one decision. The decision
 * is still the sysop's: a dry run lists exactly which files would be written,
 * and each one goes through the same `repairOneFile` - a file that has any
 * escape byte in it is refused here as loudly as it is on its own.
 *
 * Reported per file rather than as a count, because "40 repaired, 7 refused"
 * with no names is a report a sysop cannot act on.
 */
screensRouter.post('/repair-all', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const index = getScreenIndex(baseDir);
  const dryRun = req.body?.dryRun === true;

  const damaged = Object.values(index.files)
    .filter(f => f.problems.includes('colour-codes-without-escape'))
    .map(f => f.relPath)
    .sort((a, b) => a.localeCompare(b));

  if (dryRun) {
    return sendOk(res, { dryRun: true, damaged }, `${damaged.length} file${damaged.length === 1 ? '' : 's'} would be repaired`);
  }

  const repaired: { path: string; codes: number }[] = [];
  const refused: { path: string; reason: string }[] = [];

  for (const rel of damaged) {
    const full = resolveScreenPath(rel);
    if (!full) {
      refused.push({ path: rel, reason: 'Path outside the board root' });
      continue;
    }
    const outcome = repairOneFile(full);
    if ('refused' in outcome) refused.push({ path: rel, reason: outcome.refused });
    else repaired.push({ path: rel, codes: outcome.repaired });
  }

  if (repaired.length) invalidateScreenIndex();

  return sendOk(res, { repaired, refused },
    `Repaired ${repaired.length} file${repaired.length === 1 ? '' : 's'}`
    + (refused.length ? `, refused ${refused.length}` : ''));
});

screensRouter.delete('/file', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  const before = buildScreenIndex(baseDir);

  try {
    fs.copyFileSync(full, `${full}.backup`);
    fs.unlinkSync(full);
    invalidateScreenIndex();
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, {
    deleted: path.relative(baseDir, full),
    backup: `${path.relative(baseDir, full)}.backup`,
    stopsResolving: resolutionsLost(baseDir, before),
  });
});

/**
 * GET /api/screens/revisions?path=...
 *
 * Every snapshot PUT /file has kept for this screen, newest first. `path`
 * must be the exact string the caller also uses for GET/PUT/DELETE /file -
 * screen-revisions.ts keys a revision directory off that raw string, not a
 * re-resolved canonical form, so passing a different casing here than what
 * was written with finds nothing.
 */
screensRouter.get('/revisions', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  if (hasBackslash(rel) || !containedScreenPath(rel)) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }
  return sendOk(res, { revisions: listRevisions(rel) });
});

/**
 * GET /api/screens/revision?path=...&file=...
 *
 * One snapshot's content, base64 - same encoding GET /file uses, so the same
 * viewer decodes either.
 */
screensRouter.get('/revision', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const file = String(req.query.file || '');
  if (hasBackslash(rel) || hasBackslash(file) || !containedScreenPath(rel)) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }
  const buf = readRevision(rel, file);
  if (!buf) {
    return res.status(404).json({ success: false, error: `Revision ${file} not found for ${rel}` });
  }
  return sendOk(res, { content: buf.toString('base64'), bytes: buf.length });
});

/**
 * POST /api/screens/restore   Body: { path, file }
 *
 * Copies one revision back over the live file, snapshotting the current
 * content first - a bad restore is itself one revision away from undo.
 */
screensRouter.post('/restore', (req: Request, res: Response) => {
  const rel = String(req.body?.path || '');
  const file = String(req.body?.file || '');
  if (hasBackslash(rel) || hasBackslash(file) || !containedScreenPath(rel)) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }
  const ok = restoreRevision(rel, file);
  if (!ok) {
    return res.status(404).json({ success: false, error: `Revision ${file} not found for ${rel}` });
  }
  invalidateScreenIndex();
  invalidateScreenFacts();
  return sendOk(res, { restored: rel }, `Restored ${rel} from ${file}`);
});

/**
 * GET /api/screens/mci/catalog
 *
 * Every MCI code, with how many times THIS board uses it.
 *
 * The usage count is the difference between a reference page and a wall of a
 * hundred codes: `~SP` reads as "179 files" and `~TR` as "never used here",
 * and a designer can tell at a glance which half of the list is the board's
 * habit and which half is unexplored. Counts come from the index's cached file
 * facts, so this costs a walk of a map, not a re-read of 1,145 files.
 */
screensRouter.get('/mci/catalog', (_req: Request, res: Response) => {
  const index = getScreenIndex(config.get('dataDir'));

  const uses: Record<string, number> = {};
  const files: Record<string, number> = {};
  for (const facts of Object.values(index.files)) {
    for (const [code, count] of Object.entries(facts.mciCodes ?? {})) {
      uses[code] = (uses[code] || 0) + count;
      files[code] = (files[code] || 0) + 1;
    }
  }

  return sendOk(res, {
    families: MCI_FAMILY_ORDER,
    codes: MCI_CATALOG.map(entry => ({
      ...entry,
      uses: uses[entry.code] || 0,
      files: files[entry.code] || 0,
    })),
    // The bare leading tilde is not a code; it is the switch that makes every
    // other one run (screen.handler.ts:1943), so the page has to say so.
    enablingTilde: { uses: uses[MCI_ENABLED_KEY] || 0, files: files[MCI_ENABLED_KEY] || 0 },
  });
});

/** The argument kinds a code can ask for, and where each one's choices live. */
const MCI_TARGET_KINDS = ['command', 'screen', 'door', 'menu'] as const;
type MciTargetKind = typeof MCI_TARGET_KINDS[number];

/**
 * GET /api/screens/mci/targets?kind=command|screen|door|menu
 *
 * What a picker offers for one argument kind. Every list is the board's own
 * files - the command icons, the screen index, the Doors directory - so a door
 * that is not installed cannot be offered, and one that is cannot be missed.
 *
 * An unknown kind is a 400 and not an empty array: "no doors installed" is a
 * sentence a sysop would believe.
 */
screensRouter.get('/mci/targets', (req: Request, res: Response) => {
  const kind = String(req.query.kind || '');
  if (!MCI_TARGET_KINDS.includes(kind as MciTargetKind)) {
    return res.status(400).json({
      success: false,
      error: `kind must be one of ${MCI_TARGET_KINDS.join(', ')}`,
    });
  }

  const baseDir = config.get('dataDir');

  if (kind === 'command') {
    return sendOk(res, {
      kind,
      targets: listBbsCommands(baseDir).map(c => ({
        value: c.command,
        label: c.name || c.command,
        detail: c.access ? `access ${c.access}` : undefined,
      })),
    });
  }

  if (kind === 'door') {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(baseDir, 'Doors'), { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== 'archives' && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      names = [];
    }
    return sendOk(res, { kind, targets: names.map(n => ({ value: n, label: n })) });
  }

  const index = getScreenIndex(baseDir);

  if (kind === 'menu') {
    // `~SM_` names the menu a screen belongs to, and a board's menus ARE
    // screens - the ones the loader reaches as MENU.
    const menus = index.screens
      .map(s => s.screen)
      .filter(name => name.toUpperCase().startsWith('MENU'))
      .sort((a, b) => a.localeCompare(b));
    return sendOk(res, { kind, targets: menus.map(m => ({ value: m, label: m })) });
  }

  // kind === 'screen' - every file the loader could be pointed at, by the path
  // a `~SS_` would carry.
  const screens = Object.keys(index.files).sort((a, b) => a.localeCompare(b));
  return sendOk(res, {
    kind,
    targets: screens.map(relPath => ({
      value: `BBS:${relPath.split(path.sep).join('/')}`,
      label: relPath,
      detail: index.files[relPath].generated ? 'the board writes this one' : undefined,
    })),
  });
});

/**
 * What a write would carry across, per target, and the bytes each one gets.
 *
 * Shared by the two routes that replace a screen - `PUT /file`, which is what
 * the admin's replace and the editor's Save use, and `POST /upload`. One
 * implementation, because "does this upload have codes of its own" is a
 * question with one right answer and two callers.
 */
function planCarryForTargets(targets: string[], uploaded: string, placement: MciPlacement) {
  return targets.map(target => {
    const full = resolveScreenPath(target);
    const before = full && fs.existsSync(full) ? fs.readFileSync(full).toString('latin1') : '';
    const plan = planMciCarry(before, uploaded);

    return {
      path: target,
      carried: placement === 'none' ? [] : [...plan.head, ...plan.tail],
      lost: placement === 'none' ? [] : plan.lost,
      uploadHasCodes: plan.uploadHasCodes,
      plan,
    };
  });
}

/** `carryCodes` off the request, or an error naming what it may be. */
function readPlacement(raw: unknown): MciPlacement | null {
  const placement = String(raw || 'none');
  return ['none', 'above', 'below'].includes(placement) ? placement as MciPlacement : null;
}

/** Uploads are held in memory: a screen is kilobytes, and the bytes go straight to disk. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * POST /api/screens/upload
 * multipart: `file`, plus `path` and optional `targets` (JSON array).
 *
 * Refuses a file whose bytes disagree with the target's extension - RIP bytes
 * under a .txt name would render as garbage to every caller, and the extension
 * is what the loader routes on.
 */
screensRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  const rel = String((req.body || {}).path || '');
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const looksRip = file.buffer.subarray(0, 2).toString('latin1') === '!|';
  const namedRip = rel.toLowerCase().endsWith('.rip');
  if (looksRip !== namedRip) {
    return res.status(400).json({
      success: false,
      error: looksRip
        ? 'These are RIP bytes; the target name is not a .rip, and the extension is what the loader routes on'
        : 'The target is a .rip but these bytes are not RIP',
    });
  }

  let targets: string[] = [rel];
  try {
    const raw = (req.body || {}).targets;
    if (raw) targets = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return res.status(400).json({ success: false, error: 'targets must be a JSON array of paths' });
  }

  const placement = readPlacement((req.body || {}).carryCodes);
  if (!placement) {
    return res.status(400).json({
      success: false,
      error: 'carryCodes must be none, above or below',
    });
  }
  const dryRun = String((req.body || {}).dryRun || '') === 'true';

  const uploaded = file.buffer.toString('latin1');

  // PER TARGET. Node 1's copy of a screen says `~SS_BBS:Node1/...` and node
  // 7's says Node7; one plan taken from the first target would hand every node
  // node 1's screen.
  const plans = planCarryForTargets(targets, uploaded, placement);

  // A dry run answers 200 with the verdicts. The share endpoint learned the
  // same lesson: a 409 for "here is what would happen" is logged by the
  // browser as an error the sysop did not cause.
  if (dryRun) {
    return sendOk(res, {
      dryRun: true,
      targets: plans.map(({ path: target, carried, lost, uploadHasCodes }) =>
        ({ path: target, carried, lost, uploadHasCodes })),
    });
  }

  const byTarget = new Map(plans.map(entry => [entry.path, entry.plan]));

  try {
    const written = writeToTargets(targets, rel2 => {
      const plan = byTarget.get(rel2);
      return Buffer.from(plan ? applyMciCarry(uploaded, plan, placement) : uploaded, 'latin1');
    });
    return sendOk(res, {
      written: written.map(w => path.relative(config.get('dataDir'), w)),
      carried: plans.map(({ path: target, carried, lost }) => ({ path: target, carried, lost }))
        .filter(t => t.carried.length || t.lost.length),
    }, `Uploaded to ${written.length} file${written.length === 1 ? '' : 's'}`);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/screens/share
 * Body: { nodes: number[], sharedDir: string, dryRun?: boolean }
 *
 * Points nodes at one screen directory - express.e's own answer to a board
 * with more nodes than screen sets (ACP.e:2666-2673). Nothing is deleted: the
 * node's own files stay where they are and simply stop being read, so undoing
 * this is clearing one tooltype rather than restoring from a backup.
 *
 * Every node is checked BEFORE any is written. A share that half-applies
 * leaves the board in two states, and the sysop cannot see which node is in
 * which.
 */
/**
 * GET /api/screens/shared-directories
 *
 * Directories a node's SCREENS tooltype can point at: they exist, they hold
 * screen files, and they belong to no single node or conference. This board's
 * is `Screens/Node`, where 215 nodes already read from - the admin used to
 * offer a hardcoded `Screens/Shared`, which does not exist here, and the share
 * failed with a message about the board root.
 */
screensRouter.get('/shared-directories', (_req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const found: { dir: string; files: number }[] = [];

  const countScreens = (dir: string): number => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && isScreenFileName(entry.name))
        .length;
    } catch {
      return 0;
    }
  };

  const consider = (rel: string) => {
    // A node's or a conference's own directory is not a shared one.
    if (/^(Node|Conf)\d+(\/|$)/i.test(rel)) return;
    const files = countScreens(path.join(baseDir, rel));
    if (files > 0) found.push({ dir: rel, files });
  };

  consider('Screens');
  try {
    for (const entry of fs.readdirSync(path.join(baseDir, 'Screens'), { withFileTypes: true })) {
      if (entry.isDirectory()) consider(`Screens/${entry.name}`);
    }
  } catch { /* a board with no Screens directory simply has none to offer */ }

  return sendOk(res, { directories: found.sort((a, b) => b.files - a.files) });
});

screensRouter.post('/share', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const nodes: number[] = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
  const sharedDirRel = String(req.body?.sharedDir || '');
  const dryRun = !!req.body?.dryRun;

  if (!nodes.length || !sharedDirRel) {
    return res.status(400).json({ success: false, error: 'nodes and sharedDir are required' });
  }
  // Containment and existence are different answers and the sysop needs the
  // right one. resolveScreenPath() resolves THROUGH the Amiga filesystem, which
  // returns null for a path that is simply not there - so asking to share
  // `Screens/Shared` on a board that has no such directory was reported as an
  // attempt to escape the board root. Reported live, 2026-09-02.
  const sharedDirFull = containedScreenPath(sharedDirRel);
  if (!sharedDirFull) {
    return res.status(400).json({ success: false, error: 'The shared directory is outside the board root' });
  }
  if (!fs.existsSync(sharedDirFull) || !fs.statSync(sharedDirFull).isDirectory()) {
    return res.status(400).json({
      success: false,
      error: `No such directory: ${sharedDirRel}. Choose one that exists - the board reports them at /api/screens/shared-directories.`,
    });
  }

  const checks = nodes.map(id => ({ id, check: checkShare(baseDir, id, sharedDirRel) }));
  const blocked = checks.filter(c => !c.check.ok).map(c => ({
    id: c.id,
    reasons: [
      ...c.check.reasons,
      ...c.check.losing.map(name => `would lose ${name}`),
      ...c.check.gaining.map(name => `would gain ${name}`),
    ],
    losing: c.check.losing,
    gaining: c.check.gaining,
  }));

  const canShare = checks.filter(c => c.check.ok).map(c => c.id);

  if (blocked.length) {
    // A DRY RUN that finds blockers has answered the question it was asked:
    // "which of these nodes could share this directory?". Answering 409 made
    // the browser log it as a failed request and forced the page to read its
    // own answer out of an exception. A real share keeps the 409 - that one is
    // a refusal, and nothing was written.
    if (dryRun) {
      return sendOk(
        res,
        { blocked, canShare, wouldWrite: [], tooltype: null },
        `${blocked.length} node${blocked.length === 1 ? '' : 's'} cannot share this directory`,
      );
    }

    return res.status(409).json({
      success: false,
      error: `${blocked.length} node${blocked.length === 1 ? '' : 's'} cannot share this directory`,
      data: { blocked, canShare },
    });
  }

  // ACP.e:2668 runs checkPathSlash over the value, so a real board's tooltype
  // carries the trailing slash. Write the same thing.
  const amigaPath = `BBS:${sharedDirRel.split(path.sep).join('/')}/`;
  const wouldWrite = nodes.map(id => `Node${id}.info`);

  if (dryRun) {
    return sendOk(res, { wouldWrite, tooltype: amigaPath, canShare: nodes, blocked: [] },
      'Nothing written - this was a dry run');
  }

  try {
    for (const id of nodes) {
      // applyTooltypes preserves the icon and every tooltype it does not name;
      // SCREENS is the only key this owns.
      applyTooltypes(path.join(baseDir, `Node${id}.info`), [['SCREENS', amigaPath]]);
    }
    invalidateScreenIndex();
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, { written: wouldWrite, tooltype: amigaPath },
    `${nodes.length} node${nodes.length === 1 ? '' : 's'} now read ${sharedDirRel}`);
});

const SCREEN_EXTENSIONS = ['.txt', '.gr', '.ibm', '.seq', '.rip', '.ans', '.asc'];

function isScreenFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return !lower.endsWith('.backup') && SCREEN_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * GET /api/screens/export?scope=all|Screens|Node<N>|Conf<N>
 *
 * A sysop on a release package has no git and no shell on the volume; an
 * archive is how screens are backed up and carried between hosts.
 */
screensRouter.get('/export', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const scope = String(req.query.scope || 'all');

  const dirs = listScreenDirectories(baseDir).filter(dir => {
    if (scope === 'all') return true;
    const rel = path.relative(baseDir, dir);
    return rel === scope || rel.startsWith(`${scope}${path.sep}`);
  });

  if (!dirs.length) {
    return res.status(404).json({ success: false, error: `Nothing to export for scope ${scope}` });
  }

  const zip = new AdmZip();
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (!fs.statSync(full).isFile() || !isScreenFileName(name)) continue;
      } catch {
        continue;
      }
      // Zip paths are always forward-slashed, whatever this host uses.
      zip.addFile(path.relative(baseDir, full).split(path.sep).join('/'), fs.readFileSync(full));
    }
  }

  const stamp = getSystemTime().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="screens-${scope}-${stamp}.zip"`);
  return res.end(zip.toBuffer());
});

/**
 * POST /api/screens/import
 * multipart: `archive`, optional `dryRun`.
 *
 * The whole archive is validated before ANY of it is written: an archive that
 * half-applies is worse than one that is rejected, because the sysop cannot
 * see which half landed.
 */
screensRouter.post('/import', upload.single('archive'), (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) return res.status(400).json({ success: false, error: 'No archive uploaded' });

  let entries: { entryName: string; getData: () => Buffer; isDirectory: boolean }[];
  try {
    entries = new AdmZip(file.buffer).getEntries() as never;
  } catch (error) {
    return res.status(400).json({ success: false, error: `Not a readable archive: ${(error as Error).message}` });
  }

  const plan: { path: string; action: 'create' | 'replace'; bytes: number }[] = [];
  const payloads: { rel: string; buf: Buffer }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = entry.entryName.split('/').join(path.sep);

    if (!isScreenFileName(path.basename(rel))) {
      return res.status(400).json({
        success: false,
        error: `${entry.entryName} is not a screen file - the extension is what the loader routes on`,
      });
    }

    const full = resolveScreenPathAllowingNew(rel);
    if (!full) {
      return res.status(400).json({
        success: false,
        error: `${entry.entryName} would land outside the board root; nothing was written`,
      });
    }

    const buf = entry.getData();
    payloads.push({ rel, buf });
    plan.push({
      path: path.relative(baseDir, full),
      action: fs.existsSync(full) ? 'replace' : 'create',
      bytes: buf.length,
    });
  }

  if (req.body?.dryRun === 'true' || req.body?.dryRun === true) {
    return sendOk(res, { plan }, 'Nothing written - this was a dry run');
  }

  try {
    for (const { rel, buf } of payloads) writeToTargets([rel], buf);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, { plan }, `Imported ${plan.length} file${plan.length === 1 ? '' : 's'}`);
});

// ===== Revision API =====

/*
 * A screen's last ten versions, and a way back to one of them.
 *
 * Restored here after 08be9a627: that commit redid the three-way merge
 * a636a00ad never performed and took main's pre-merge screens-routes.ts,
 * which is a superset of the branch's - except for these three routes and
 * the saveRevision call above, which had landed on top of the branch-side
 * file the day AFTER the merge (e29dd5698) and so were in neither side of
 * the merge it replayed.
 *
 * Nothing failed loudly: screen-revisions.ts sat in src with no importer,
 * config-app's ScreenRevisionsPanel and its three client methods stayed in
 * the bundle, and the sysop's Revisions button answered 404.
 */

/**
 * GET /api/screens/revisions?path=...
 * List all stored revisions for a screen file.
 */
screensRouter.get('/revisions', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  if (!rel) return res.status(400).json({ success: false, error: 'path required' });
  const revisions = listRevisions(rel);
  return sendOk(res, { revisions });
});

/**
 * GET /api/screens/revision?path=&file=
 * View a specific revision's content as base64.
 */
screensRouter.get('/revision', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const file = String(req.query.file || '');
  if (!rel || !file) return res.status(400).json({ success: false, error: 'path and file required' });
  const buf = readRevision(rel, file);
  if (!buf) return res.status(404).json({ success: false, error: 'Revision not found' });
  return sendOk(res, { content: buf.toString('base64'), bytes: buf.length });
});

/**
 * POST /api/screens/restore
 * Body: { path, file }
 * Restore a revision, snapshotting the current file first.
 */
screensRouter.post('/restore', (req: Request, res: Response) => {
  const rel = String(req.body?.path || '');
  const file = String(req.body?.file || '');
  if (!rel || !file) return res.status(400).json({ success: false, error: 'path and file required' });
  const ok = restoreRevision(rel, file);
  if (!ok) return res.status(404).json({ success: false, error: 'Revision not found' });
  invalidateScreenIndex();
  return sendOk(res, { restored: rel }, `Restored ${file}`);
});
