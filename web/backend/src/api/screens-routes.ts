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

import express, { Request, Response, NextFunction } from 'express';
import { SCREEN_EXTENSIONS as SHARED_SCREEN_EXTENSIONS, getScreenFileName } from '../screens/screen-tables';

import type { AuthRequest } from '../middleware/auth.middleware';
import { requireSysop } from '../middleware/auth.middleware';
import { isSysop, mayWriteScreen, writableRoots } from '../screens/theme-sandbox';
import { screenDrawsNothing, screenIsProgram } from '../screens/screen-blankness';
import {
  LOGIN_SEQUENCE,
  readScreenProgram,
  applyLoginSelection,
  type LoginItem,
} from '../screens/login-sequence';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { userFileManager } from '../services/UserFileManager';
import { getSystemTime } from '../utils/date-time.util';
import { screenSearchLocations } from '../screens/screen-resolution';
import { createLoginSequenceRouter } from './login-sequence-routes';
import { findTheme, readThemeRegistry } from '../screens/theme-registry';
import { svgToRip } from '../screens/svg-to-rip';
import { resolveCallerTheme } from '../screens/caller-theme';
import { themeOfPath, validateThemeFile, type ThemeFinding } from '../screens/theme-validation';
import { checkShare } from '../screens/share-preconditions';
import { applyTooltypes } from '../utils/info-file.util';
import {
  getScreenIndex, invalidateScreenIndex, invalidateScreenFacts, screenFileFacts,
  buildScreenIndex, listScreenDirectories, listBbsCommands,
} from '../screens/screen-index.service';
import { MCI_CATALOG, MCI_FAMILY_ORDER, MCI_ENABLED_KEY } from '../screens/mci-catalog';
import { repairOneFile } from '../screens/screen-repair';
import { planMciCarry, applyMciCarry, splitScreenCodes, type MciPlacement } from '../screens/mci-carry';
import { setScreenFlag, readScreenFlags, type ScreenFlag } from '../screens/screen-flags';
import { saveRevision, listRevisions, readRevision, restoreRevision } from '../screens/screen-revisions';
import { findScreenReferences, removeScreenReferences } from '../screens/screen-references';
import { petsciiRuleRefusal } from '../screens/petscii-board-rules';

export const screensRouter = express.Router();

/**
 * Who may write what, applied to every mutating request before any route runs.
 *
 * The mount is `requireLevel(100)` (`routes-setup.ts:192`), and that level is
 * what an artist needs to reach the screen editor at all - so without this,
 * giving somebody an artist account gives them the live board. The rule comes
 * from OWNERSHIP in the registry rather than a new role: a sysop writes
 * anything, an artist writes their own theme directories, and an admin account
 * that owns no theme writes nothing.
 *
 * It runs as MIDDLEWARE rather than as a call inside each handler because
 * there are ten mutating routes here and the one that gets forgotten is the
 * hole. Every path-shaped field in the query and the body is checked; a
 * request naming no path at all is refused for a non-sysop rather than
 * assumed harmless, since a route that takes its target from somewhere this
 * does not read must not silently become the exception.
 */
function pathsInRequest(req: Request): string[] {
  const found: string[] = [];
  const take = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') found.push(value);
    else if (Array.isArray(value)) for (const item of value) take(item);
  };

  for (const key of ['path', 'rename', 'target', 'dir', 'to', 'from']) {
    take((req.query as Record<string, unknown>)[key]);
    take((req.body as Record<string, unknown> | undefined)?.[key]);
  }
  take((req.body as Record<string, unknown> | undefined)?.targets);
  take((req.body as Record<string, unknown> | undefined)?.paths);

  return found;
}

screensRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const writer = (req as AuthRequest).user;
  const bbsRoot = config.get('dataDir');
  const caller = { username: writer?.username, secLevel: writer?.secLevel };

  if (isSysop(caller)) return next();

  /*
   * SEVEN ROUTES DO NOT COME THROUGH HERE ANY MORE.
   *
   * This guard refuses by the PATHS a request names, and the board-wide
   * routes - /repair, /repair-all, /flag, /share, /shared-directories,
   * /import and /export - name none. `pathsInRequest` found nothing to
   * refuse on them, and the branch below then waved through any level-100
   * account owning no theme, so such an account could repair every screen on
   * the board, rewrite node tooltypes and import an archive over it.
   *
   * Each of those seven now carries `requireSysop()` of its own. Nothing
   * about the rule below changes: a helper account that owns no theme keeps
   * the path-bearing access it has always had, which is the case this
   * branch was written for.
   */
  const roots = writableRoots(bbsRoot, caller);
  if (roots.length === 0) {
    // Not an artist: an admin account that owns no theme keeps exactly the
    // access level 100 has always carried. The sandbox exists to CONSTRAIN AN
    // ARTIST, and taking board access away from every other admin account
    // would be a second, unasked-for change - one that breaks a board whose
    // helpers have been editing screens for years.
    return next();
  }

  const targets = pathsInRequest(req);
  if (targets.length === 0) {
    // An artist's request that names no path at all: refused rather than
    // assumed harmless, because a route taking its target from somewhere this
    // does not read must not quietly become the exception.
    return res.status(403).json({
      success: false,
      error: 'This request names no screen path, and an artist may only write inside their own theme',
    });
  }

  const refused = targets.filter(target => !mayWriteScreen(bbsRoot, caller, target));
  if (refused.length > 0) {
    return res.status(403).json({
      success: false,
      error: `Outside your theme: ${refused.join(', ')}`,
    });
  }

  return next();
});

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

/**
 * What the validator says about each board-relative path that lies inside a
 * theme. Paths outside every theme are simply absent from the answer.
 */
function themeFindingsFor(relativePaths: string[]): Array<{ path: string; theme: string; findings: ThemeFinding[] }> {
  const baseDir = config.get('dataDir');
  const themes = readThemeRegistry(baseDir).themes;
  if (themes.length === 0) return [];

  const reports: Array<{ path: string; theme: string; findings: ThemeFinding[] }> = [];
  for (const rel of relativePaths) {
    const owner = themeOfPath(baseDir, rel, themes);
    if (!owner) continue;
    reports.push({
      path: rel,
      theme: owner.theme.slug,
      findings: validateThemeFile(baseDir, owner.theme, owner.inTheme),
    });
  }
  return reports;
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
screensRouter.get('/', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  // ?theme=<slug>: the index as a caller wearing that theme sees it. `default`
  // and anything that is not a registered theme mean the board's own.
  const wanted = String(req.query.theme || '').trim().toLowerCase();
  const themeSlug = wanted && wanted !== 'default' && findTheme(baseDir, wanted) ? wanted : undefined;
  const index = getScreenIndex(baseDir, themeSlug);

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
 * POST /api/screens/svg-to-rip - an SVG, as RIP commands.
 *
 * Converts and ANSWERS; it writes nothing. The artist sees what the
 * projection made - and what it could not carry - before anything lands on
 * the board, because a `.rip` that turns out to be a blank screen is only
 * discoverable by looking, and the losses are the whole reason to look.
 *
 * The write is the existing `PUT /file`, which already asks the sandbox
 * whether this caller may write that path. Converting is not writing, so
 * this needs no second copy of that question.
 */
screensRouter.post('/svg-to-rip', (req: Request, res: Response) => {
  const svg = String((req.body || {}).svg ?? '');
  if (!svg.trim()) {
    return res.status(400).json({ success: false, error: 'Send an SVG to convert' });
  }
  // A megabyte of SVG is a drawing with an embedded photograph in it, which
  // this cannot carry anyway; refusing early beats flattening it first.
  if (svg.length > 2_000_000) {
    return res.status(413).json({
      success: false,
      error: 'That SVG is over 2 MB - RIP is a few hundred drawing commands, so something in it (an embedded image?) will not survive the conversion',
    });
  }

  let result;
  try {
    result = svgToRip(svg);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: `That SVG could not be read: ${(error as Error).message}`,
    });
  }

  sendOk(res, {
    content: Buffer.from(result.text, 'latin1').toString('base64'),
    commands: result.commands,
    losses: result.losses,
  }, result.commands > 0
    ? `Converted - ${result.commands} drawing command${result.commands === 1 ? '' : 's'}`
    : 'Nothing was drawn');
});

/**
 * GET /api/screens/file?path=...[&download=1]
 * The bytes, base64 for the editor and raw for a download.
 */
screensRouter.get('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    /*
     * TWO DIFFERENT ANSWERS, and they used to share one.
     *
     * `resolveScreenPath` returns null both for a path that climbs out of the
     * board AND for one that is perfectly legitimate but does not exist yet -
     * it resolves through the case-insensitive Amiga layer, which answers null
     * for a missing file. Both came back as 400 "Path outside the board root",
     * so asking for a format a screen has not got yet - `Conf4/bull20.seq`,
     * while adding a PETSCII version to a bulletin that has only `.txt` -
     * read as a security refusal. The sysop reported it as an upload failure,
     * which it was not.
     */
    const contained = containedScreenPath(rel);
    if (contained) {
      return res.status(404).json({ success: false, error: `No screen file at ${rel}` });
    }
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
   *
   * THROUGH THE THEME THE CALLER IS LOOKING WITH. A theme's own file is read
   * by nothing in the BOARD's index - the board's walk never enters a theme
   * directory - so every screen an artist had redrawn said "No screen on this
   * board reads this file", about the very file callers wearing that theme are
   * served. Reported by the sysop on Themes/test/Conf/1/bull20.txt,
   * 2026-09-08, which the themed index credits to CONF_BULL in conference 1.
   */
  const requestedTheme = String(req.query.theme || '').trim().toLowerCase();
  const themeSlug = requestedTheme && requestedTheme !== 'default' ? requestedTheme : undefined;
  const indexed = getScreenIndex(baseDir, themeSlug).files[facts.relPath];

  /*
   * The codes, split off from the art, for an editor that must not let them be
   * typed over. A canvas editor loads rows as characters, so a code on its own
   * row is deletable like any other text - which is how a bulletin lost its
   * `~SP` and `~CC_ctop` to a few removed lines (the sysop, 2026-09-16).
   *
   * Sent for every format: the split is a property of the TEXT, and a `.seq`
   * or `.ttx` carrying codes has the same exposure as a `.ans`. An editor that
   * does not use it is unaffected - this adds fields, it changes none.
   */
  const codes = splitScreenCodes(buf.toString('latin1'));

  return sendOk(res, {
    ...facts,
    readBy: indexed?.readBy ?? facts.readBy,
    content: buf.toString('base64'),
    codeHead: codes.head,
    codeTail: codes.tail,
    artContent: Buffer.from(codes.art, 'latin1').toString('base64'),
  });
});


/**
 * Which file this screen resolves to for that node, conference AND THEME.
 *
 * The index knows the theme/node/conference shadowing, and it is the part
 * that bites: `Themes/<id>/Node/BULL.TXT` shadows `Node<N>/BULL.TXT` shadows
 * `Screens/BULL.TXT`, so an editor that writes the wrong rung changes nothing
 * on screen and reads as a broken feature.
 *
 * THE THEME HAS TO BE PASSED. `getScreenIndex(baseDir)` with no slug indexes
 * the board's own screens and never sees the overlay, so this answered
 * `Node1/logon20.txt` for a board that reads
 * `Themes/607080/Node/logon20.txt`. The sysop removed a logo from his logon
 * screen in the editor and the board went on drawing it (2026-09-14): the
 * edit landed in the shadowed copy, which nothing reads.
 */
function resolutionFor(
  baseDir: string,
  screen: string,
  nodeId: number,
  confId?: number,
  themeSlug?: string,
) {
  const index = getScreenIndex(baseDir, themeSlug);
  const entry = index.screens.find(s => s.screen === screen);
  return entry?.resolutions.find(r =>
    r.scope === 'conf' ? r.id === confId : r.scope === 'node' ? r.id === nodeId : true);
}

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

  const resolution = resolutionFor(baseDir, screen, nodeId, confId);

  sendOk(res, {
    screen,
    searched,
    chosen: resolution?.file ?? null,
    variants: resolution?.variants ?? [],
  });
});


/**
 * The theme a caller is actually wearing, which is the board this edits.
 *
 * An explicit `theme` wins (and `default` means the board's own screens, the
 * ABSENCE of a theme, so it is honoured rather than looked up); otherwise the
 * board's own default is what a caller gets, and therefore what the editor
 * must show and save into.
 */
function themeInPlay(baseDir: string, requested: unknown): string | undefined {
  const wanted = String(requested ?? '').trim().toLowerCase();
  if (wanted === 'default') return undefined;
  if (wanted) return findTheme(baseDir, wanted) ? wanted : undefined;
  const slug = resolveCallerTheme(baseDir, { secLevel: 255 });
  return slug && slug !== 'default' ? slug : undefined;
}

// The login sequence lives in its own module; it is mounted here so the
// sandbox middleware above still guards every write it makes.
screensRouter.use(createLoginSequenceRouter({
  resolutionFor, themeInPlay, writeToTargets, sendOk,
}));

/**
 * GET /api/screens/preview?screen=&theme=&node=&conf=&sec=&term=ansi|c64|rip
 *
 * What a caller in that theme, at that level, on that node, would be shown.
 *
 * It drives `loadScreenFile` and `parseMciCodes` - the board's own two
 * functions - against a synthetic session. Nothing is re-implemented, because
 * a preview that re-implemented the resolver would be a second copy of the one
 * rule `screen-resolution.ts` exists to keep single, and the sysop would be
 * shown something the board never draws.
 *
 * Three things make it safe to expose:
 *
 * - The session carries NO socket, so `parseMciCodes` runs in its
 *   string-building mode: `~CC_` is COLLECTED and never executed. A preview
 *   must not run a door.
 * - Includes are capped at one level. A preview walks paths the requester
 *   chose, and the board's own include chain has no cycle guard.
 * - `sec` is clamped to the requester's own level. A security variant is
 *   content, and content the board withholds from an account stays withheld.
 *
 * Which theme answers is decided by `resolveCallerTheme` with the REQUESTER's
 * real identity - the same judge the loader and the picker ask - so an artist
 * cannot preview somebody else's unpublished work, and a sysop previewing at
 * level 20 still sees the draft they asked for rather than the board's art.
 */
screensRouter.get('/preview', async (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const requester = (req as AuthRequest).user;

  const screen = String(req.query.screen || '').trim();
  if (screen === '') {
    return res.status(400).json({ success: false, error: 'Name a screen to preview' });
  }
  if (hasBackslash(screen)) {
    return res.status(400).json({ success: false, error: 'A screen name carries no backslash' });
  }

  const nodeId = Number.parseInt(String(req.query.node ?? '1'), 10) || 1;
  const confId = req.query.conf ? Number.parseInt(String(req.query.conf), 10) : 1;
  const term = String(req.query.term || 'ansi').toLowerCase();

  const ownLevel = Number(requester?.secLevel ?? 0);
  const askedLevel = Number.parseInt(String(req.query.sec ?? ownLevel), 10);
  const secLevel = Math.max(0, Math.min(Number.isFinite(askedLevel) ? askedLevel : ownLevel, ownLevel));

  const requestedTheme = String(req.query.theme || '').trim().toLowerCase();
  const themeSlug = resolveCallerTheme(baseDir, {
    username: requester?.username,
    secLevel: ownLevel,
    screenTheme: requestedTheme || null,
  });

  // `petscii80` previews the web terminal's WIDE PETSCII screen. Without it
  // there was no way to see what a P8 caller is served: the preview answered
  // 40 for every PETSCII request, so an 80-column screen could only be judged
  // by logging in as one.
  const petscii = term === 'c64' || term === 'petscii' || term === 'petscii80';
  const petsciiColumns = term === 'petscii80' ? 80 : 40;
  const session = {
    // Judged already, by the line above. The loader prefers this over asking
    // again, so the clamped level below cannot change which theme answers.
    screenThemeResolved: themeSlug,
    nodeId,
    currentConf: confId,
    relConfNum: confId,
    terminalType: term === 'c64' ? 'c64' : 'web',
    petsciiMode: petscii,
    petsciiColumns: petscii ? petsciiColumns : undefined,
    ripMode: term === 'rip',
    screenWidth: petscii ? petsciiColumns : 80,
    screenHeight: 25,
    user: {
      username: requester?.username,
      name: requester?.username,
      secLevel,
      screenTheme: requestedTheme || null,
    },
  } as unknown as import('../index').BBSSession;

  const { loadScreenFile, parseMciCodes } = require('../handlers/screen.handler');

  const loaded = loadScreenFile(screen, confId, nodeId, session);
  if (!loaded) {
    return res.status(404).json({
      success: false,
      error: `Nothing resolves for "${screen}" at level ${secLevel} on node ${nodeId}`,
    });
  }

  /*
   * A `.seq` is BYTES, not text.
   *
   * The loader hands back `content` as the PetMe64 Unicode conversion for the
   * legacy display path and the original buffer beside it. MCI-parsing the
   * conversion would be parsing a rendering, so a PETSCII screen is answered
   * with its own bytes and drawn on a real 40x25 C64 surface in the browser.
   */
  if (loaded.isPetscii && loaded.petsciiBuffer) {
    return sendOk(res, {
      screen,
      theme: themeSlug,
      requestedTheme: requestedTheme || null,
      secLevel,
      nodeId,
      confId,
      terminalType: term,
      filePath: path.relative(baseDir, loaded.filePath),
      isPetscii: true,
      isRip: false,
      content: (loaded.petsciiBuffer as Buffer).toString('base64'),
      commands: [],
      searched: screenSearchLocations(baseDir, screen, { nodeId, confId, themeSlug })
        .map(l => ({ dir: path.relative(baseDir, l.dir) || '.', desc: l.desc })),
    });
  }

  let parsed: string = loaded.content;
  let commands: string[] = [];
  try {
    const result = await parseMciCodes(loaded.content, session, undefined, undefined, undefined, undefined, { includeDepth: 1 });
    parsed = result.parsed;
    commands = result.commands ?? [];
  } catch (error) {
    // A screen whose codes cannot be expanded is still worth looking at: the
    // bytes are the art, and refusing to show them would hide the file the
    // sysop is trying to diagnose.
    console.error(`[Screens] preview could not parse MCI in ${loaded.filePath}: ${(error as Error).message}`);
  }

  return sendOk(res, {
    screen,
    /** The theme that ANSWERED, which is not always the one asked for. */
    theme: themeSlug,
    requestedTheme: requestedTheme || null,
    secLevel,
    nodeId,
    confId,
    terminalType: term,
    filePath: path.relative(baseDir, loaded.filePath),
    isPetscii: !!loaded.isPetscii,
    isRip: !!loaded.isRip,
    /** Bytes, base64. A UTF-8 round trip would eat every high-bit byte of art. */
    content: Buffer.from(parsed, 'latin1').toString('base64'),
    /** The commands a caller's screen WOULD have run. Named, never executed. */
    commands,
    searched: screenSearchLocations(baseDir, screen, { nodeId, confId, themeSlug })
      .map(l => ({ dir: path.relative(baseDir, l.dir) || '.', desc: l.desc })),
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

      /*
       * THE BOARD NEVER HOLDS AN EMPTY SCREEN FILE. The sysop's rule,
       * 2026-09-14, after a night spent chasing what one costs.
       *
       * express.e:6773 shows any file that OPENS, so a file with nothing in
       * it clears the terminal, prints nothing and leaves the caller pausing
       * for a key - and it does it silently, because the file is not corrupt
       * and nothing logs a problem. The loader tolerates one now
       * (screens/screen-blankness.ts) because a file can arrive by hand or by
       * FTP, but nothing the BOARD writes is allowed to create one.
       *
       * Refused rather than deleted: a save is not a delete, and the sysop
       * who wants the screen gone has DELETE /api/screens/file, which backs
       * the file up and reports which scopes stop resolving without it.
       *
       * This sits in the shared writer so every route inherits it - the file
       * editor, the login sequence, the upload and the archive import. Put it
       * in one route and the next route is the one that lets an empty file
       * through, which is the shape of the three-times-in-one-day RIP fix
       * recorded on PUT /file.
       */
      const payload = typeof bytes === 'function' ? bytes(rel) : bytes;
      if (screenDrawsNothing(payload)) {
        throw new Error(
          `${rel}: a screen file cannot be empty - it would clear the caller's screen and pause for a key. ` +
          `Put something in it, or delete the file.`,
        );
      }

      let backup: string | null = null;
      if (fs.existsSync(full)) {
        // Snapshot to .Revisions before overwriting. The `.backup` beside the
        // file is ONE undo, overwritten by the next write; the revision store
        // keeps the last ten, which is what the admin's history panel lists.
        saveRevision(rel);
        backup = `${full}.backup`;
        fs.copyFileSync(full, backup);
      }
      fs.writeFileSync(full, payload);
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
/**
 * RIP bytes under a name the loader will not route as RIP, or the reverse.
 *
 * The extension decides which caller gets the file (screen.handler adds
 * `<stem>.rip` for a RIP caller and nothing else), so `.rip` holding ANSI
 * renders as garbage to every RIP caller and RIP under `.txt` to every ANSI
 * one. One check for every route that writes screen bytes - the upload had
 * it, the editor's PUT did not, and the PUT is what the "add a RIP version"
 * button goes through.
 */
/**
 * Bytes that are an SVG document, whatever the picker called the file.
 *
 * Sniffed rather than trusted from a filename: the refusal these bytes used
 * to earn came from the TARGET's extension, and the source's name never
 * reached the board at all. A leading XML declaration or comment is normal,
 * so the check is "an `<svg` element starts the document".
 */
export function looksSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 1024).toString('utf8').trimStart();
  if (head.startsWith('<svg')) return true;
  if (!head.startsWith('<?xml') && !head.startsWith('<!--') && !head.startsWith('<!DOCTYPE')) return false;
  return /<svg[\s>]/i.test(bytes.subarray(0, 4096).toString('utf8'));
}

export function ripMismatch(rel: string, bytes: Buffer): string | null {
  const looksRip = bytes.subarray(0, 2).toString('latin1') === '!|';
  const namedRip = rel.toLowerCase().endsWith('.rip');
  if (looksRip === namedRip) return null;
  return looksRip
    ? 'These are RIP bytes; the target name is not a .rip, and the extension is what the loader routes on'
    : 'The target is a .rip but these bytes are not RIP';
}

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
  const raw = Buffer.from(content, 'base64');
  let uploaded = raw.toString('latin1');

  /*
   * AN SVG HEADED FOR A `.rip` IS CONVERTED, wherever it came from.
   *
   * This rule was written into the artist dialog's file pickers, which is
   * the wrong place for it: the dialog has three pickers, the screen manager
   * has two more, and each one that was missed answered the sysop with
   * "Node0/BBSTITLE.rip: The target is a .rip but these bytes are not RIP".
   * It was fixed three times in one day, once per door, and the fourth door
   * was still shut (2026-09-14).
   *
   * "An SVG written to a .rip slot becomes RIP" is a property of THIS
   * ENDPOINT - the one thing every picker, present and future, already goes
   * through - so it lives here and the dialogs keep their own conversion
   * only for the progress and the loss report.
   */
  if (looksSvg(raw) && targets.some(target => target.toLowerCase().endsWith('.rip'))) {
    try {
      // UTF-8: an SVG is XML, and its text is not Amiga bytes.
      uploaded = svgToRip(raw.toString('utf8')).text;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `That SVG could not be read: ${(error as Error).message}`,
      });
    }
  }

  for (const target of targets) {
    const mismatch = ripMismatch(target, Buffer.from(uploaded, 'latin1'));
    if (mismatch) return res.status(400).json({ success: false, error: `${target}: ${mismatch}` });
    /*
     * THE C64 RULES ARE REFUSED HERE, not corrected here.
     *
     * "only lowercase characters are allowed and only black background ...
     * this should apply bbs wide" (sysop, 2026-09-14). A save that breaks
     * either is turned away with the reason - the editor holds its own
     * surface to the rules already, so what reaches this is an IMPORT, and
     * silently rewriting an artist's file on the way in is the failure
     * nobody can debug later.
     */
    const refusal = petsciiRuleRefusal(target, Buffer.from(uploaded, 'latin1'));
    if (refusal) return res.status(400).json({ success: false, error: `${target}: ${refusal}` });
  }
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
    const relWritten = written.map(w => path.relative(config.get('dataDir'), w));
    return sendOk(res, {
      written: relWritten,
      carried: plans.map(({ path: target, carried, lost }) => ({ path: target, carried, lost }))
        .filter(t => t.carried.length || t.lost.length),
      /*
       * What is wrong with what was just saved, when it was saved into a theme.
       *
       * Reported, never enforced: an artist saves a half-drawn screen, and a
       * save that refused would make the validator a nuisance rather than a
       * guard. The gate is publication - `PUT /api/themes/:slug` to `live`
       * runs the same rules and does refuse.
       */
      themeFindings: themeFindingsFor(relWritten),
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
screensRouter.post('/flag', requireSysop(), (req: Request, res: Response) => {
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
screensRouter.post('/repair', requireSysop(), (req: Request, res: Response) => {
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
screensRouter.post('/repair-all', requireSysop(), (req: Request, res: Response) => {
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

/**
 * GET /api/screens/references?path=...
 *
 * What would break if this screen went: the screens that pull it in, the line
 * each does it on, and whether that line can be removed on its own.
 *
 * Its own route because the DELETE answer arrives too late to decide with. A
 * sysop is asked to confirm a delete BEFORE it happens, and "three screens
 * include this, two of those lines can be tidied and one is inside a drawing"
 * is the whole of what makes that a decision rather than a guess.
 */
screensRouter.get('/references', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const full = resolveScreenPath(String(req.query.path || ''));
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }
  const references = findScreenReferences(baseDir, path.relative(baseDir, full));
  return sendOk(res, {
    references,
    removable: references.filter(r => r.removable).length,
  });
});

screensRouter.delete('/file', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  const before = buildScreenIndex(baseDir);
  const relPath = path.relative(baseDir, full);

  /*
   * WHAT POINTS AT IT.
   *
   * A screen is pulled into another by `~SS_BBS:screens/<name>`; delete the
   * target and the including screen draws nothing where the logo was, without
   * a word anywhere - the hollow-screen class this board spent a night on.
   *
   * Found BEFORE the unlink, because the file has to exist for the references
   * to mean anything to whoever reads this answer.
   */
  const references = findScreenReferences(baseDir, relPath);

  try {
    fs.copyFileSync(full, `${full}.backup`);
    fs.unlinkSync(full);
    invalidateScreenIndex();
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  /*
   * MENDING THEM IS OPT-IN, and only ever the unambiguous ones.
   *
   * `?fixReferences=1` drops the lines that exist ONLY to make the include.
   * A sentinel sharing its line with art is never rewritten: that line is part
   * of a composition and nothing here can tell what the rest of it is holding
   * up (the sysop's rule, 2026-09-15). Every screen rewritten gets a revision
   * first, so the admin's own panel can put it back.
   */
  const fixed = String(req.query.fixReferences ?? '') === '1'
    ? removeScreenReferences(baseDir, references, saveRevision)
    : [];
  if (fixed.length > 0) invalidateScreenIndex();

  return sendOk(res, {
    deleted: relPath,
    backup: `${relPath}.backup`,
    stopsResolving: resolutionsLost(baseDir, before),
    referencedBy: references,
    fixed,
  });
});

/**
 * GET /api/screens/revisions?path=...
 *
 * Every snapshot PUT /file has kept for this screen, newest first. `path`
 * identifies the same screen as GET/PUT/DELETE /file - screen-revisions.ts's
 * revDirFor() lowercases the raw request string before keying a revision
 * directory off it, so a differently-cased `path` here than the one PUT was
 * called with still finds the same revisions.
 */
screensRouter.get('/revisions', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  /* ASKED FOR NOTHING IS NOT ASKED FOR EVERYTHING.
   *
   * Containment and presence are different questions, and only the first was
   * asked: an empty path IS inside the board root, so a call with no `path`
   * listed the revisions of `''` with a 200 rather than saying what was
   * missing. Same reasoning for `file` on the two routes below - a request
   * that names no revision is malformed (400), not a request for a revision
   * that happens not to exist (404). */
  if (!rel) {
    return res.status(400).json({ success: false, error: 'path is required' });
  }
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
  if (!rel || !file) {
    return res.status(400).json({ success: false, error: 'path and file are required' });
  }
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
  if (!rel || !file) {
    return res.status(400).json({ success: false, error: 'path and file are required' });
  }
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

  const mismatch = ripMismatch(rel, file.buffer);
  if (mismatch) return res.status(400).json({ success: false, error: mismatch });


  let targets: string[] = [rel];
  try {
    const raw = (req.body || {}).targets;
    if (raw) targets = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return res.status(400).json({ success: false, error: 'targets must be a JSON array of paths' });
  }

  // The C64 rules, on the way in - see the note in PUT /file. Per target: an
  // upload writes the same bytes to several paths and only the `.seq` ones
  // are judged.
  for (const target of targets) {
    const refusal = petsciiRuleRefusal(target, file.buffer);
    if (refusal) return res.status(400).json({ success: false, error: `${target}: ${refusal}` });
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
screensRouter.get('/shared-directories', requireSysop(), (_req: Request, res: Response) => {
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

screensRouter.post('/share', requireSysop(), (req: Request, res: Response) => {
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

// THE list, from the table that owns it: four copies of this array meant
// four answers to "is this a screen", and the `.Header`/`.Tailer` art was a
// screen to one of them and not to the others.
const SCREEN_EXTENSIONS = SHARED_SCREEN_EXTENSIONS;

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
screensRouter.get('/export', requireSysop(), (req: Request, res: Response) => {
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
screensRouter.post('/import', requireSysop(), upload.single('archive'), (req: Request, res: Response) => {
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
/*
 * The revisions routes are ABOVE, near the other screen-file routes.
 *
 * A second copy of GET /revisions, GET /revision and POST /restore lived
 * here and answered nothing: Express takes the FIRST matching handler, so
 * these three were shadowed from the day they were written - and they were
 * the ones without the containment guard, which is the only reason that
 * never mattered. Deleted rather than kept as a warning: a route nothing
 * reaches is a route that drifts from the one that does.
 */
