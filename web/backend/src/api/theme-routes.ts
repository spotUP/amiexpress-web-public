/**
 * The sysop's and the artist's view of screen themes.
 *
 * SP6's backend half. Mounted beside the screen editor and behind the same
 * gate, because a theme IS a set of screens: the editor writes the files, this
 * decides which sets exist, who owns each and which callers may wear them.
 *
 * Who may do what is not re-decided here. `theme-sandbox` answers "may this
 * account write this theme" and `caller-theme` answers "may this account wear
 * it" - the same functions the loader and the picker use, so the admin cannot
 * offer something the board would then refuse.
 */

import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import type { AuthRequest } from '../middleware/auth.middleware';
import { selectableThemes } from '../screens/caller-theme';
import { isSysop, ownedThemes } from '../screens/theme-sandbox';
import { validateTheme } from '../screens/theme-validation';
// The scope translator moved to screens/theme-target-path so the SEEDER can use
// it without importing this router - re-exported because tests and callers name
// it here.
import { themeTargetFor, themeTargetForBoardFile } from '../screens/theme-target-path';
import { copyScreenIntoTheme, seedThemeFromBoard } from '../screens/theme-seeding';
import { userFileManager } from '../services/UserFileManager';
export { themeTargetFor, themeTargetForBoardFile };
import { liveThemeRegressions } from '../screens/theme-live-check';
import { getScreenIndex } from '../screens/screen-index.service';
import {
  DEFAULT_SLUG,
  THEMES_DIR,
  isValidSlug,
  readThemeRegistry,
  setDefaultTheme,
  themeDirectory,
  writeTheme,
  type ThemeEntry,
  type ThemeStatus,
} from '../screens/theme-registry';

export const themesRouter = express.Router();

/** The scope directories every theme has, created with it so an artist sees the shape. */
const SCOPES = ['Node', 'Board', 'Conf', 'Files'];

const STATUSES: ThemeStatus[] = ['draft', 'review', 'live'];

function caller(req: Request): { username?: string; secLevel?: number } {
  const user = (req as AuthRequest).user;
  return { username: user?.username, secLevel: user?.secLevel };
}

function ok<T>(res: Response, data: T, message?: string): void {
  res.json({ success: true, data, ...(message ? { message } : {}) });
}

function refuse(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

/** How many screen files a theme actually carries - what makes a list worth reading. */
function screenCount(root: string): number {
  let total = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.isFile() && !entry.name.startsWith('.')) total++;
    }
  };
  walk(root);
  return total;
}

/**
 * GET /api/themes - every theme, with what this account may do to each.
 *
 * `mine` and `wearable` are answered here rather than in the client, because a
 * page that decides for itself which buttons to show is a second copy of the
 * permission rules and it will drift from the one the server enforces.
 */
/**
 * The BBS accounts a theme may be owned by.
 *
 * Ownership is not a label: `theme-sandbox` lets the account named here write
 * that directory, so a typo hands the theme to nobody and the artist cannot
 * open their own screens. Read from DISK - user.data is the board's truth,
 * the SQL mirror is a mirror.
 */
export function boardUsernames(): string[] {
  try {
    return userFileManager.readAllUsers()
      .map(user => String((user as { username?: string }).username ?? '').trim())
      .filter(name => name.length > 0);
  } catch {
    return [];
  }
}

/**
 * The account as the board spells it, or null when the board CONTRADICTS it.
 *
 * A board whose user.data cannot be read yields no opinion, and no opinion is
 * not a refusal: a fresh board, or one whose files are momentarily unreadable,
 * must still let a sysop hand a theme to somebody. The check exists to catch a
 * typo against a list we actually have - it is not a gate that fails closed.
 */
export function resolveOwner(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return '';
  const known = boardUsernames();
  if (known.length === 0) return name.trim();
  return known.find(user => user.toLowerCase() === wanted) ?? null;
}

themesRouter.get('/', (req: Request, res: Response) => {
  const bbsRoot = config.get('dataDir');
  const who = caller(req);
  const registry = readThemeRegistry(bbsRoot);
  const owned = new Set(ownedThemes(bbsRoot, who).map(theme => theme.slug));
  const wearable = new Set(selectableThemes(bbsRoot, who).map(theme => theme.slug));

  /*
   * A live theme is checked against the board AS IT IS NOW, not as it was the
   * day it was published. A sysop who adds a security variant afterwards
   * re-opens the shadowing hole the publish gate exists to close, and until
   * this the only sign was callers of one level being served the wrong screen.
   *
   * Keyed on the index's builtAt, so it is computed when the screens change
   * and read from cache otherwise.
   */
  const regressions = new Map(
    liveThemeRegressions(bbsRoot, getScreenIndex(bbsRoot).builtAt, registry.themes)
      .map(report => [report.slug, report] as const)
  );

  ok(res, {
    defaultSlug: registry.defaultSlug,
    canCreate: isSysop(who),
    themes: registry.themes.map(theme => {
      const dir = themeDirectory(bbsRoot, theme);
      return {
        ...theme,
        screens: dir ? screenCount(dir) : null,
        exists: dir ? fs.existsSync(dir) : true,
        mine: owned.has(theme.slug),
        wearable: wearable.has(theme.slug),
        writable: isSysop(who) || owned.has(theme.slug),
        // Present only for a LIVE theme that has stopped passing its rules.
        regressed: regressions.has(theme.slug)
          ? {
              blocking: regressions.get(theme.slug)!.blocking.length,
              advisory: regressions.get(theme.slug)!.advisory.length,
              first: regressions.get(theme.slug)!.blocking[0]?.message
                ?? regressions.get(theme.slug)!.advisory[0]?.message ?? '',
            }
          : null,
      };
    }),
  });
});

/**
 * POST /api/themes - create one. Sysop only.
 *
 * Creating a theme means naming an owner, and an account that could name
 * itself the owner of a new theme could grant itself write access to a
 * directory - which is the whole of the sandbox, handed out by the sandboxed.
 */
/**
 * How many themes one artist may own.
 *
 * A cap, not a permission: creating a theme makes a directory an account may
 * write, so an uncapped account could make them until the volume filled. Five
 * is well past what an artist redrawing a board needs and well short of a
 * problem; a sysop is not capped.
 */
const THEMES_PER_ARTIST = 5;

themesRouter.post('/', (req: Request, res: Response) => {
  const who = caller(req);
  const bbsRoot = config.get('dataDir');

  // An ARTIST may create their own theme. The danger was never creation - it
  // is naming SOMEBODY ELSE as the owner, which would hand out write access to
  // a directory, so a non-sysop's theme is owned by the account that made it
  // and by nobody else. Their own sandbox is exactly what the feature is for,
  // and requiring a sysop for it made an artist wait on one to start drawing.
  const sysop = isSysop(who);
  const requester = String(who.username ?? '').trim();
  if (!sysop && requester === '') {
    return refuse(res, 403, 'An account with no name may not create a theme');
  }
  if (!sysop && ownedThemes(bbsRoot, who).length >= THEMES_PER_ARTIST) {
    return refuse(
      res,
      409,
      `You already own ${THEMES_PER_ARTIST} themes - retire one before starting another`
    );
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const slug = String(body.slug ?? '').trim().toLowerCase();

  if (!isValidSlug(slug)) {
    return refuse(res, 400, 'A slug is lowercase letters, digits and hyphens, up to 31 characters');
  }
  if (slug === DEFAULT_SLUG) {
    return refuse(res, 400, `"${DEFAULT_SLUG}" is the board's own screens and is not created`);
  }
  if (readThemeRegistry(bbsRoot).themes.some(theme => theme.slug === slug)) {
    return refuse(res, 409, `There is already a theme called "${slug}"`);
  }

  const entry: ThemeEntry = {
    slug,
    title: String(body.title ?? slug).trim() || slug,
    author: String(body.author ?? '').trim(),
    // A sysop assigns an owner; an artist IS the owner. See above.
    owner: sysop ? String(body.owner ?? '').trim() : requester,
    dir: `${THEMES_DIR}/${slug}`,
    widths: Array.isArray(body.widths)
      ? (body.widths as unknown[]).map(Number).filter(w => w === 80 || w === 40)
      : [80],
    doorTheme: String(body.doorTheme ?? '').trim(),
    // A new theme is never live: it has no screens in it yet, and a live theme
    // with no screens is a caller wearing nothing.
    status: 'draft',
  };

  /*
   * An owner has to BE somebody. The sandbox grants write access by matching
   * this string against the caller's account name, so a misspelt owner is a
   * theme its artist cannot open - and nothing said so until they tried.
   * Empty stays legal and means what it always meant: sysops only.
   */
  if (entry.owner) {
    const resolved = resolveOwner(entry.owner);
    if (resolved === null) {
      return refuse(res, 400, `This board has no account called "${entry.owner}"`);
    }
    entry.owner = resolved;
  }

  const root = path.join(bbsRoot, entry.dir);
  for (const scope of SCOPES) fs.mkdirSync(path.join(root, scope), { recursive: true });
  writeTheme(bbsRoot, entry);

  /*
   * A new theme is a COPY of the board, not three empty directories.
   *
   * "all new themes should be a copy of the default theme" - `default` is the
   * board itself, so the copy is what the board resolves today, variants and
   * all. Seeded after the registry entry exists because the seeder resolves
   * the theme's directory through it, and reported rather than thrown: a
   * theme that exists with half its screens is recoverable, one that failed
   * to be created is not.
   */
  let seeded = { copied: 0, screens: 0, conflicts: [] as Array<{ path: string; keptFromPath: string; target: string }> };
  try {
    seeded = seedThemeFromBoard(bbsRoot, entry);
  } catch (error) {
console.warn(`[Themes] ${entry.slug} was created but could not be seeded: ${(error as Error).message}`);
  }

  ok(
    res,
    { ...entry, seeded },
    seeded.copied > 0
      ? `Theme "${slug}" created with ${seeded.copied} screen file(s) copied from the board`
      : `Theme "${slug}" created`,
  );
});

/**
 * PUT /api/themes/:slug - edit one.
 *
 * A sysop may change anything. An OWNER may change what their theme says about
 * itself (title, author, widths, companion) and may send it for review, but
 * may not make it live and may not hand it to somebody else: publishing and
 * ownership are the board's decisions, not the artist's.
 */
themesRouter.put('/:slug', (req: Request, res: Response) => {
  const bbsRoot = config.get('dataDir');
  const who = caller(req);
  const slug = String(req.params.slug ?? '').trim().toLowerCase();
  const existing = readThemeRegistry(bbsRoot).themes.find(theme => theme.slug === slug);
  if (!existing) return refuse(res, 404, `No such theme: "${slug}"`);

  const sysop = isSysop(who);
  const mine = ownedThemes(bbsRoot, who).some(theme => theme.slug === slug);
  if (!sysop && !mine) return refuse(res, 403, 'That theme is not yours');

  const body = (req.body ?? {}) as Record<string, unknown>;
  const wantedStatus = String(body.status ?? existing.status) as ThemeStatus;
  if (!STATUSES.includes(wantedStatus)) return refuse(res, 400, `Unknown status: "${wantedStatus}"`);
  if (!sysop && wantedStatus === 'live') {
    return refuse(res, 403, 'Only a sysop may make a theme live');
  }
  if (!sysop && String(body.owner ?? existing.owner).trim() !== existing.owner) {
    return refuse(res, 403, 'Only a sysop may change who owns a theme');
  }

  /*
   * Publication is the gate the validator exists for.
   *
   * Not the save, and not the review request: an artist saves a half-drawn
   * screen and sends a half-drawn theme for review, and blocking either would
   * make the validator a nuisance rather than a guard. `live` is the moment a
   * theme becomes something a caller can be shown, and the five blocking rules
   * each name a file a caller would be shown that the board cannot serve, or
   * that silently removes content the board has.
   */
  if (wantedStatus === 'live' && existing.status !== 'live') {
    const report = validateTheme(bbsRoot, existing);
    if (!report.publishable) {
      return res.status(400).json({
        success: false,
        error: `"${existing.title}" cannot go live yet: ${report.blocking.length} ${report.blocking.length === 1 ? 'problem' : 'problems'} to fix`,
        data: report,
      });
    }
  }

  const updated: ThemeEntry = {
    ...existing,
    title: String(body.title ?? existing.title).trim() || existing.slug,
    author: String(body.author ?? existing.author).trim(),
    owner: sysop ? String(body.owner ?? existing.owner).trim() : existing.owner,
    widths: Array.isArray(body.widths)
      ? (body.widths as unknown[]).map(Number).filter(w => w === 80 || w === 40)
      : existing.widths,
    doorTheme: String(body.doorTheme ?? existing.doorTheme).trim(),
    status: wantedStatus,
  };

  // Reassigning ownership has the same rule as granting it: the account has
  // to exist, or the sandbox grants write access to nobody.
  if (sysop && updated.owner && updated.owner !== existing.owner) {
    const resolved = resolveOwner(updated.owner);
    if (resolved === null) {
      return refuse(res, 400, `This board has no account called "${updated.owner}"`);
    }
    updated.owner = resolved;
  }

  writeTheme(bbsRoot, updated);
  ok(res, updated, `Theme "${slug}" updated`);
});

/**
 * GET /api/themes/:slug/validation - can this theme be selected without
 * breaking a caller?
 *
 * The same function the publish gate runs, so the page can never show a green
 * report for a theme the server would then refuse, or a red one for a theme it
 * would accept.
 */
themesRouter.get('/:slug/validation', (req: Request, res: Response) => {
  const bbsRoot = config.get('dataDir');
  const slug = String(req.params.slug ?? '').trim().toLowerCase();
  const theme = readThemeRegistry(bbsRoot).themes.find(entry => entry.slug === slug);
  if (!theme) return refuse(res, 404, `No such theme: "${slug}"`);

  ok(res, validateTheme(bbsRoot, theme));
});

/**
 * POST /api/themes/default - the theme a caller with no preference gets.
 *
 * Sysop only, and it must be a theme callers can actually wear: a draft as the
 * board default would leave every caller resolving past it to the board's own
 * screens while the admin claimed otherwise.
 */
themesRouter.post('/default', (req: Request, res: Response) => {
  const who = caller(req);
  if (!isSysop(who)) return refuse(res, 403, 'Only a sysop may set the board default');

  const bbsRoot = config.get('dataDir');
  const slug = String((req.body ?? {}).slug ?? '').trim().toLowerCase();

  if (slug !== DEFAULT_SLUG) {
    const theme = readThemeRegistry(bbsRoot).themes.find(entry => entry.slug === slug);
    if (!theme) return refuse(res, 404, `No such theme: "${slug}"`);
    if (theme.status !== 'live') {
      return refuse(res, 400, `"${slug}" is a ${theme.status} - only a live theme can be the board default`);
    }
  }

  setDefaultTheme(bbsRoot, slug);
  ok(res, { defaultSlug: slug }, `The board default is now "${slug}"`);
});


/**
 * POST /api/themes/:slug/copy - start a theme's screen from the board's.
 *
 * An artist redrawing a screen wants what callers see today as the starting
 * point, and the screen editor only REPLACES a file that exists - so without
 * this a new theme is a set of empty directories with nothing to open.
 */
themesRouter.post('/:slug/copy', (req: Request, res: Response) => {
  const bbsRoot = config.get('dataDir');
  const who = caller(req);
  const slug = String(req.params.slug ?? '').trim().toLowerCase();

  const theme = readThemeRegistry(bbsRoot).themes.find(entry => entry.slug === slug);
  if (!theme) return refuse(res, 404, `No such theme: "${slug}"`);
  if (!isSysop(who) && !ownedThemes(bbsRoot, who).some(owned => owned.slug === slug)) {
    return refuse(res, 403, 'That theme is not yours');
  }

  const from = String((req.body ?? {}).path ?? '').trim();
  // The index decides the scope. A logo the board pulls into LOGON by path is
  // not a Board screen and belongs in the theme's `Files/` mirror, which is
  // the tree that arm of the loader reads.
  const target = from ? themeTargetForBoardFile(getScreenIndex(bbsRoot), from) : null;
  if (!from || !target) return refuse(res, 400, 'Name a board screen to copy');

  const source = path.resolve(bbsRoot, from);
  if (!source.startsWith(path.resolve(bbsRoot) + path.sep)) {
    return refuse(res, 400, 'That path is outside the board');
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    return refuse(res, 404, `The board has no screen at ${from}`);
  }

  const themeRoot = themeDirectory(bbsRoot, theme);
  if (!themeRoot) return refuse(res, 400, `"${slug}" has no directory of its own`);

  const destination = path.join(themeRoot, target);
  if (fs.existsSync(destination)) {
    return refuse(res, 409, `${theme.title} already has ${target} - edit it in the screen editor`);
  }

  // The screen, not one of its files: the security variants and the .seq/.rip
  // twins come too, or the theme shadows the board's sysop bulletin the moment
  // it is redrawn and the publish gate refuses it.
  const result = copyScreenIntoTheme(bbsRoot, theme, from);
  const files = result.copied.length;

  ok(res, {
    from,
    to: path.join(theme.dir, target),
    target,
    copied: result.copied,
    kept: result.kept,
  }, `Copied into ${theme.title} - ${files} file${files === 1 ? '' : 's'}, edit it in the screen editor`);
});
