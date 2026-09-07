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
themesRouter.get('/', (req: Request, res: Response) => {
  const bbsRoot = config.get('dataDir');
  const who = caller(req);
  const registry = readThemeRegistry(bbsRoot);
  const owned = new Set(ownedThemes(bbsRoot, who).map(theme => theme.slug));
  const wearable = new Set(selectableThemes(bbsRoot, who).map(theme => theme.slug));

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
themesRouter.post('/', (req: Request, res: Response) => {
  const who = caller(req);
  if (!isSysop(who)) return refuse(res, 403, 'Only a sysop may create a theme');

  const bbsRoot = config.get('dataDir');
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
    owner: String(body.owner ?? '').trim(),
    dir: `${THEMES_DIR}/${slug}`,
    widths: Array.isArray(body.widths)
      ? (body.widths as unknown[]).map(Number).filter(w => w === 80 || w === 40)
      : [80],
    doorTheme: String(body.doorTheme ?? '').trim(),
    // A new theme is never live: it has no screens in it yet, and a live theme
    // with no screens is a caller wearing nothing.
    status: 'draft',
  };

  const root = path.join(bbsRoot, entry.dir);
  for (const scope of SCOPES) fs.mkdirSync(path.join(root, scope), { recursive: true });
  writeTheme(bbsRoot, entry);

  ok(res, entry, `Theme "${slug}" created`);
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
 * Where a board screen lives INSIDE a theme.
 *
 * The theme tree is keyed on the SCOPE the loader computes, not on the board's
 * directory names (`screen-resolution.ts:138-148`), so a copy has to be
 * translated rather than mirrored:
 *
 *   Screens/BULL.TXT        -> Board/BULL.TXT
 *   BULL.TXT                -> Board/BULL.TXT      (the board root)
 *   Conf1/MENU250.TXT       -> Conf/1/MENU250.TXT
 *   Conf1/Screens/MENU.TXT  -> Conf/1/MENU.TXT
 *   Node3/LOGON.txt         -> Node/LOGON.txt      (one Node/ serves them all)
 *
 * Anything else - a bulletin reached by path, a `~SR_` pool member - keeps its
 * shape under `Files/`, which is the mirror those arms resolve through.
 */
export function themeTargetFor(relativePath: string): string | null {
  const parts = relativePath.split(/[\\/]/).filter(part => part !== '' && part !== '.');
  if (parts.length === 0) return null;
  if (parts.includes('..')) return null;

  const [head, ...rest] = parts;

  if (/^Screens$/i.test(head) && rest.length === 1) return path.join('Board', rest[0]);
  if (rest.length === 0) return path.join('Board', head);

  const conf = /^Conf(\d+)$/i.exec(head);
  if (conf) {
    const tail = /^Screens$/i.test(rest[0]) ? rest.slice(1) : rest;
    if (tail.length === 1) return path.join('Conf', conf[1], tail[0]);
    return path.join('Files', ...parts);
  }

  if (/^Node\d+$/i.test(head)) {
    const tail = /^Screens$/i.test(rest[0]) ? rest.slice(1) : rest;
    if (tail.length === 1) return path.join('Node', tail[0]);
    return path.join('Files', ...parts);
  }

  return path.join('Files', ...parts);
}

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
  const target = themeTargetFor(from);
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

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Bytes, never text: a screen carries Amiga high-bit art and a UTF-8 round
  // trip turns each of those into three replacement bytes.
  fs.copyFileSync(source, destination);

  ok(res, {
    from,
    to: path.join(theme.dir, target),
  }, `Copied into ${theme.title} - edit it in the screen editor`);
});
