/**
 * THE LOGIN SEQUENCE, over the wire the admin page uses.
 *
 * Split out of `screens-routes.ts` when that file passed the repo's 2000-line
 * gate (2026-09-16). Nothing changed on the way: these are the same four
 * routes, and the helpers they alone use.
 *
 * The four shared pieces they need from the screens router - how a screen
 * resolves, which theme is in play, the one writer, and the envelope - arrive
 * as arguments rather than as an import, because `screens-routes.ts` mounts
 * this router and importing back the other way would be a cycle.
 */
import express, { Request, Response, Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { screenSearchLocations } from '../screens/screen-resolution';
import { getScreenFileName } from '../screens/screen-tables';
import { screenDrawsNothing, screenIsProgram } from '../screens/screen-blankness';
import { readThemeRegistry } from '../screens/theme-registry';
import {
  LOGIN_SEQUENCE,
  applyLoginSelection,
  readScreenProgram,
  type LoginItem,
} from '../screens/login-sequence';

/** What a step resolves to, as the screen index answers it. */
type Resolution = { file: string | null } | undefined;

export interface LoginSequenceDeps {
  resolutionFor: (
    baseDir: string, screen: string, nodeId: number, confId?: number, themeSlug?: string,
  ) => Resolution;
  themeInPlay: (baseDir: string, requested: unknown) => string | undefined;
  writeToTargets: (targets: string[], bytes: Buffer) => string[];
  sendOk: <T>(res: Response, data: T, message?: string) => void;
}

export function createLoginSequenceRouter(deps: LoginSequenceDeps): Router {
  const { resolutionFor, themeInPlay, writeToTargets, sendOk } = deps;
  const screensRouter = express.Router();

/**
 * WHERE AN INCLUDE POINTS, as a path relative to the board root.
 *
 * `~SS_BBS:Bulletins/bull6.txt`, `~SS_BBS:screens/uprough.txt`,
 * `~SR_WORK:bbs/Screens/flt/flt` - the loader hands these to the board's own
 * assign resolver and then looks the name up case-insensitively, because a
 * screen written on an Amiga is `BULL.TXT` and written here is `bull.txt`.
 * This follows that, and nothing else: a target with no assign and no slash
 * is a screen name, which belongs to the loader's search and not here.
 *
 * Returns null when the target names nothing that exists.
 */
function includeFile(baseDir: string, target: string, nodeId: number): string | null {
  const wanted = (target || '').trim();
  if (!wanted || !wanted.includes(':') && !wanted.includes('/')) return null;

  let full: string;
  if (wanted.includes(':')) {
    const { BBSPaths } = require('../utils/bbs-paths.util');
    full = new BBSPaths(baseDir).resolveAmigaPath(wanted, nodeId);
    // The resolver answers `<root>/bbs/...` for a `BBS:` assign on a board
    // whose root is already the data directory; the loader strips it, so this
    // does too, or nothing is ever found.
    full = full.replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
  } else {
    full = path.join(baseDir, ...wanted.split('/'));
  }

  const found = amigafs.findCaseInsensitive(path.dirname(full), path.basename(full)) || full;
  if (!fs.existsSync(found)) return null;

  const rel = path.relative(baseDir, found);
  return rel.startsWith('..') ? null : rel;
}

/**
 * The includes of an included screen, one level down.
 *
 * A step's rows say which screens it shows; some of those screens are
 * programs themselves - the board's `BULL.TXT` is two lines, a form feed and
 * `~SS_BBS:Bulletins/bull6.txt` - and until now the page stopped at the
 * first. The sysop, 2026-09-16: "there are more stuff that launches stuff
 * during login bulletins etc".
 *
 * One level only, and only when there is something to show.
 */
function nestedFor(
  baseDir: string,
  target: string,
  nodeId: number,
): { file: string; items: LoginItem[] } | null {
  const rel = includeFile(baseDir, target, nodeId);
  if (!rel) return null;

  let content: string;
  try {
    content = fs.readFileSync(path.join(baseDir, rel)).toString('latin1');
  } catch {
    return null;
  }

  const items = readScreenProgram(content).items;
  return items.length > 0 ? { file: rel, items } : null;
}

/**
 * The OTHER rung's copy of a screen, when this one has no includes and that
 * one does.
 *
 * With a theme in play the board's own copy is the other rung; with no theme
 * the board default's is already what was read, so there is nothing to
 * offer. Reported as `{ theme, file, items }` so the page can name it and
 * switch to it in one click.
 */
function otherCopyFor(
  baseDir: string,
  screen: string,
  nodeId: number,
  confId: number | undefined,
  themeSlug: string | undefined,
  itemsHere: number,
): { theme: string; file: string; items: number } | null {
  if (itemsHere > 0) return null;

  // Only one direction is worth offering: a theme hides the board's copy.
  if (!themeSlug) return null;

  const board = resolutionFor(baseDir, screen, nodeId, confId, undefined);
  const file = board?.file ?? null;
  if (!file) return null;

  const full = path.join(baseDir, file);
  if (!fs.existsSync(full)) return null;

  const items = readScreenProgram(fs.readFileSync(full).toString('latin1')).items.length;
  return items > 0 ? { theme: 'default', file, items } : null;
}

/**
 * GET /api/screens/login-sequence?node=&conf=
 *
 * THE WALK A CALLER MAKES ON THE WAY IN, and what each step is made of.
 *
 * "can we build an editor for all bulls etc that shows during login so i can
 * pick what i want and dont want in the admin ui?" (sysop, 2026-09-14). His
 * board shows five MultiTop-II bulletins because `Themes/607080/Node/BULL.TXT`
 * lists them; until now the only way to see that, let alone change it, was to
 * read a file on a volume he cannot reach.
 *
 * Each step reports the file it ACTUALLY resolves to - see `resolutionFor` -
 * and the items that file carries. `available` is what else is on the board to
 * add, so the picker can offer a bulletin the file has never mentioned.
 */
screensRouter.get('/login-sequence', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const nodeId = parseInt(String(req.query.node ?? '1'), 10);
  const confId = req.query.conf ? parseInt(String(req.query.conf), 10) : undefined;
  const themeSlug = themeInPlay(baseDir, req.query.theme);

  const steps = LOGIN_SEQUENCE.map(step => {
    const resolution = resolutionFor(baseDir, step.screen, nodeId, confId, themeSlug);
    const file = resolution?.file ?? null;
    const full = file ? path.join(baseDir, file) : null;

    /** A row, and the rows of the screen it shows when that screen is a program too. */
    let items: Array<LoginItem & { nested?: { file: string; items: LoginItem[] } }> = [];
    let bytes = 0;
    let program = false;
    if (full && fs.existsSync(full)) {
      // Latin1: a screen carries Amiga high-bit bytes and a UTF-8 round trip
      // turns one into U+FFFD.
      const content = fs.readFileSync(full).toString('latin1');
      bytes = Buffer.byteLength(content, 'latin1');
      items = readScreenProgram(content).items.map(item => {
        // One level down: the screen this row shows may be a program too.
        const nested = nestedFor(baseDir, item.target, nodeId);
        return nested ? { ...item, nested } : item;
      });
      // Whether a THEME could change this step, or only the board can.
      program = screenIsProgram(content);
    }

    return {
      screen: step.screen,
      label: step.label,
      note: step.note,
      skippedByQuickFlag: step.skippedByQuickFlag,
      file,
      exists: Boolean(full && fs.existsSync(full)),
      bytes,
      items,
      /*
       * A step that RUNS something is the board's, whatever theme is picked
       * above - the loader reads programs from the board. Said here so the
       * page can stop a sysop believing a theme selection will change it,
       * which is the mistake that started this whole thread: he removed a
       * logo from a themed copy and the board went on drawing it.
       */
      program,
      /*
       * A file that OPENS earns its pause, even with nothing in it
       * (express.e:6773) - so an empty step costs the caller a keypress on a
       * blank screen. The picker says so rather than leaving him to find out.
       */
      blankPause: Boolean(full && fs.existsSync(full)) && items.length === 0 && bytes < 8,
      /*
       * THE RUNG THE SYSOP IS NOT LOOKING AT, when it is the one with the
       * content.
       *
       * A theme's copy shadows the board's, and a theme is usually pure art:
       * every step then reads "Nothing included" while the board's own copy
       * of that screen carries the whole login script. The sysop met exactly
       * that and read the page as broken - a screenshot of six empty steps,
       * 2026-09-16, with `Node1/logon20.txt` and its five includes one
       * selection away. So a step that has nothing says where the something
       * is, and the page offers the switch.
       */
      otherCopy: otherCopyFor(baseDir, step.screen, nodeId, confId, themeSlug, items.length),
      /*
       * WHERE A SCREEN WOULD GO, for a step that has none. The page cannot
       * guess it - the loader's search order decides, and a file written
       * anywhere else is one nothing reads - so the board says it, and the
       * POST above checks the answer it gets back against this same sum.
       */
      home: file ? null : homeForNewScreen(baseDir, step.screen, nodeId, confId, themeSlug),
    };
  });

  /*
   * WHICH BOARD THIS IS, because there is more than one.
   *
   * A theme shadows the board's own screens, and a caller wearing one is
   * served ITS copy - so "the logon screen" is a different file for different
   * callers. The sysop wears `607080`, a DRAFT theme only he and other sysops
   * can see, while everyone else gets the board default; an editor that did
   * not say so let him remove a logo from a file nothing reads.
   */
  const registry = readThemeRegistry(baseDir);
  sendOk(res, {
    node: nodeId,
    conf: confId ?? null,
    theme: themeSlug ?? 'default',
    themes: [
      { slug: 'default', title: 'Board default screens', status: 'live', isDefault: !registry.defaultSlug },
      ...registry.themes.map(t => ({
        slug: t.slug,
        title: t.title || t.slug,
        status: t.status,
        isDefault: t.slug === registry.defaultSlug,
      })),
    ],
    steps,
    available: availableIncludes(baseDir),
  });
});

/**
 * The screens on this board a login step could include.
 *
 * Bulletins first, because that is what the picker is for; each with its size,
 * so a sysop can tell a real bulletin from an empty placeholder before he
 * ticks it.
 */
function availableIncludes(baseDir: string): Array<{ target: string; bytes: number }> {
  const out: Array<{ target: string; bytes: number }> = [];
  for (const dir of ['Bulletins', 'Screens']) {
    const full = path.join(baseDir, dir);
    let names: string[];
    try { names = fs.readdirSync(full); } catch { continue; }
    for (const name of names.sort()) {
      if (!/\.(txt|ttx)$/i.test(name)) continue;
      let bytes = 0;
      try { bytes = fs.statSync(path.join(full, name)).size; } catch { continue; }
      out.push({ target: `BBS:${dir}/${name}`, bytes });
    }
  }
  return out;
}

/**
 * PUT /api/screens/login-sequence
 * Body: { screen, path, items: [{ code, target, pause }] }
 *
 * The items the sysop ticked, in the order he left them.
 *
 * `path` is REQUIRED and is the file the GET said this step resolves to. It is
 * not a convenience: the sandbox middleware above reads `path` out of the body
 * to decide whether an artist may write there, and a route that took its
 * target from somewhere the sandbox does not look would be a hole in it. It is
 * checked against the step's own resolution as well, so this cannot be used as
 * a general-purpose writer for any file on the board.
 *
 * The bytes go out through `writeToTargets` - backup, revision, rollback,
 * index invalidation - like every other screen edit. There is one writer.
 */
screensRouter.put('/login-sequence', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const screen = String(req.body?.screen || '').toUpperCase();
  const rel = String(req.body?.path || '');
  const nodeId = parseInt(String(req.body?.node ?? '1'), 10);
  const confId = req.body?.conf ? parseInt(String(req.body.conf), 10) : undefined;

  const step = LOGIN_SEQUENCE.find(s => s.screen === screen);
  if (!step) {
    return res.status(400).json({
      success: false,
      error: `Not a step of the login sequence: ${screen || '(none given)'}`,
    });
  }
  if (!rel) {
    return res.status(400).json({ success: false, error: 'No path - send the file the step resolves to' });
  }

  const resolved = resolutionFor(baseDir, screen, nodeId, confId, themeInPlay(baseDir, req.body?.theme))?.file ?? null;
  /*
   * A STEP THAT RESOLVES TO NOTHING IS NOT A PLACE TO PUT A FILE.
   *
   * The check below only fired when there WAS a resolution, so an unresolved
   * step fell straight past it and the write ran against whatever path the
   * body carried - CREATING a screen where the board had none, at whatever
   * name the caller chose. A page whose Save sent `path: null` would have
   * written a file called `null` into the board root.
   *
   * This route edits what a step already shows. Giving a step a screen it does
   * not have is a different act - a new file, chosen and named deliberately -
   * and it belongs to the screen manager, which asks about type extensions,
   * security variants and which nodes should receive it.
   */
  if (!resolved) {
    return res.status(409).json({
      success: false,
      error: `${screen} resolves to no file on this board - create the screen in the screen manager before editing what it shows`,
    });
  }
  if (path.normalize(resolved) !== path.normalize(rel)) {
    return res.status(409).json({
      success: false,
      error: `${screen} resolves to ${resolved}, not ${rel} - reload the sequence before saving`,
    });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) {
    return res.status(400).json({ success: false, error: 'items must be an array' });
  }
  const bad = items.find((i: LoginItem) =>
    !i || !['SS', 'CC', 'SR'].includes(i.code) || typeof i.target !== 'string' || !i.target);
  if (bad) {
    return res.status(400).json({ success: false, error: 'Each item needs a code of SS, CC or SR and a target' });
  }

  const full = path.join(baseDir, rel);
  const before = fs.existsSync(full) ? fs.readFileSync(full).toString('latin1') : '';
  const after = applyLoginSelection(before, items as LoginItem[]);

  /*
   * A SCREEN THAT DRAWS NOTHING IS NOT SOMETHING THIS ROUTE MAY CREATE.
   *
   * `displayScreen` answers true for any file that OPENS (express.e:6773), so
   * an empty screen costs the caller a keypress on a blank screen - the exact
   * defect 93e12958a removed 161 tracked instances of. Unticking the last item
   * is therefore a request to REMOVE the step, not to empty it, and removing a
   * file is a destructive decision that belongs to the caller who asked for
   * it: `DELETE /api/screens/file`.
   *
   * An include or a door counts as drawing (a `BULL.TXT` of nothing but `~SS_`
   * lines is a real screen), which is why this asks about ITEMS and not about
   * the byte count.
   */
  if (screenDrawsNothing(after)) {
    return res.status(409).json({
      success: false,
      error: `Nothing would be left to draw. An empty ${screen} still opens, and a screen that opens costs the caller a keypress on a blank screen - remove ${rel} instead of emptying it.`,
      remove: rel,
    });
  }

  try {
    writeToTargets([rel], Buffer.from(after, 'latin1'));
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  sendOk(res, { screen, file: rel, items: readScreenProgram(after).items });
});


/**
 * The rows of a screen, checked and written, for the two routes below.
 *
 * Everything after "which file" is the same for a step, a screen being
 * created and an included screen: the rows must be rows, the result must
 * still draw something, and the bytes go out through the one writer that
 * backs up, records a revision and invalidates the index.
 */
function writeProgramTo(
  res: Response,
  baseDir: string,
  rel: string,
  rawItems: unknown,
  what: string,
  opts: { trailingPause?: boolean } = {},
): boolean {
  const items = Array.isArray(rawItems) ? rawItems : null;
  if (!items) {
    res.status(400).json({ success: false, error: 'items must be an array' });
    return false;
  }
  const bad = items.find((i: LoginItem) =>
    !i || !['SS', 'CC', 'SR'].includes(i.code) || typeof i.target !== 'string' || !i.target);
  if (bad) {
    res.status(400).json({ success: false, error: 'Each item needs a code of SS, CC or SR and a target' });
    return false;
  }

  const full = path.join(baseDir, rel);
  const before = fs.existsSync(full) ? fs.readFileSync(full).toString('latin1') : '';
  const after = applyLoginSelection(before, items as LoginItem[], opts);

  if (screenDrawsNothing(after)) {
    res.status(409).json({
      success: false,
      error: `Nothing would be left to draw. An empty ${what} still opens, and a screen that opens costs the caller a keypress on a blank screen - remove ${rel} instead of emptying it.`,
      remove: rel,
    });
    return false;
  }

  try {
    writeToTargets([rel], Buffer.from(after, 'latin1'));
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  sendOk(res, { file: rel, items: readScreenProgram(after).items });
  return true;
}

/**
 * Where a step's screen WOULD live if the board had one.
 *
 * The first place the loader looks for it, which is the only place a new file
 * changes what a caller sees: writing `Screens/BULL.TXT` while the theme in
 * play has its own `BULL.TXT` would create a file nothing reads.
 */
function homeForNewScreen(
  baseDir: string,
  screen: string,
  nodeId: number,
  confId: number | undefined,
  themeSlug: string | undefined,
): string | null {
  const locations = screenSearchLocations(baseDir, screen, { nodeId, confId, themeSlug });
  if (locations.length === 0) return null;

  /*
   * The board ROOT is a search location - `BULL.txt` beside `user.data` is
   * found - but it is not where this board keeps screens, and a sysop opening
   * the screen manager would not find it there. So: the first location that
   * is a directory of its own, and the root only if there is nothing else.
   * Live's own copy of this screen is `Screens/BULL.TXT`.
   */
  const chosen = locations.find(l => path.normalize(l.dir) !== path.normalize(baseDir)) ?? locations[0];
  const rel = path.relative(baseDir, path.join(chosen.dir, `${getScreenFileName(screen)}.txt`));
  return rel.startsWith('..') ? null : rel;
}

/**
 * POST /api/screens/login-sequence
 * Body: { screen, path, items, node?, conf?, theme? }
 *
 * GIVE A STEP THE SCREEN IT DOES NOT HAVE.
 *
 * "there are more stuff that launches stuff during login bulletins etc"
 * (sysop, 2026-09-16), looking at a sequence where five of six steps read
 * "[no file on this board - the step is skipped in silence]" and offered him
 * nothing to do about it. The PUT above deliberately refuses to create a
 * file, because a step that resolves to nothing is not a place to guess a
 * path - so the place is computed here instead, from the loader's own search
 * order, and the caller is told what it will be before anything is written.
 *
 * `path` is still required and still checked, because the sandbox middleware
 * reads it out of the body to decide whether this caller may write there.
 */
screensRouter.post('/login-sequence', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const screen = String(req.body?.screen || '').toUpperCase();
  const rel = String(req.body?.path || '');
  const nodeId = parseInt(String(req.body?.node ?? '1'), 10);
  const confId = req.body?.conf ? parseInt(String(req.body.conf), 10) : undefined;
  const themeSlug = themeInPlay(baseDir, req.body?.theme);

  const step = LOGIN_SEQUENCE.find(s => s.screen === screen);
  if (!step) {
    return res.status(400).json({
      success: false,
      error: `Not a step of the login sequence: ${screen || '(none given)'}`,
    });
  }

  const already = resolutionFor(baseDir, screen, nodeId, confId, themeSlug)?.file ?? null;
  if (already) {
    return res.status(409).json({
      success: false,
      error: `${screen} already resolves to ${already} - edit that, rather than creating a second one`,
    });
  }

  const home = homeForNewScreen(baseDir, screen, nodeId, confId, themeSlug);
  if (!home) {
    return res.status(409).json({
      success: false,
      error: `There is nowhere on this board for ${screen} to live`,
    });
  }
  if (!rel || path.normalize(rel) !== path.normalize(home)) {
    return res.status(409).json({
      success: false,
      error: `${screen} would be created at ${home}, not ${rel || '(nothing given)'} - reload the sequence before creating it`,
      home,
    });
  }

  /*
   * The directory may not exist yet - a board that has never had a `BULL.TXT`
   * may have no `Screens/` either - and the writer only accepts a path whose
   * PARENT resolves. Creating it is part of giving the step a screen; the
   * containment check above is what makes that safe, and only this route does
   * it (an edit must never invent a directory).
   */
  const full = path.join(baseDir, rel);
  if (!path.normalize(full).startsWith(path.normalize(baseDir) + path.sep)) {
    return res.status(409).json({ success: false, error: `Path outside the board root: ${rel}` });
  }
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  writeProgramTo(res, baseDir, rel, req.body?.items, screen);
});

/**
 * PUT /api/screens/login-sequence/include
 * Body: { path, items, node?, conf?, theme? }
 *
 * THE ROWS OF A SCREEN A STEP INCLUDES, one level down.
 *
 * The board's `BULL.TXT` is a form feed and `~SS_BBS:Bulletins/bull6.txt`;
 * the bulletin screens that list five MultiTop pages are the same shape. The
 * page shows those rows now, so they have to be writable - and this is the
 * only route that writes them.
 *
 * It is not a general writer: `path` must be a file the CURRENT sequence
 * actually includes, recomputed here rather than trusted from the body, so
 * this cannot be pointed at `user.data` by editing a request.
 */
screensRouter.put('/login-sequence/include', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.body?.path || '');
  const nodeId = parseInt(String(req.body?.node ?? '1'), 10);
  const confId = req.body?.conf ? parseInt(String(req.body.conf), 10) : undefined;
  const themeSlug = themeInPlay(baseDir, req.body?.theme);

  if (!rel) {
    return res.status(400).json({ success: false, error: 'No path - send the included file' });
  }

  const included = new Set<string>();
  for (const step of LOGIN_SEQUENCE) {
    const file = resolutionFor(baseDir, step.screen, nodeId, confId, themeSlug)?.file ?? null;
    if (!file) continue;
    const full = path.join(baseDir, file);
    if (!fs.existsSync(full)) continue;
    for (const item of readScreenProgram(fs.readFileSync(full).toString('latin1')).items) {
      const target = includeFile(baseDir, item.target, nodeId);
      if (target) included.add(path.normalize(target));
    }
  }

  if (!included.has(path.normalize(rel))) {
    return res.status(409).json({
      success: false,
      error: `${rel} is not a screen this login sequence includes - reload the sequence before saving`,
    });
  }

  writeProgramTo(res, baseDir, rel, req.body?.items, rel, { trailingPause: true });
});


  return screensRouter;
}
