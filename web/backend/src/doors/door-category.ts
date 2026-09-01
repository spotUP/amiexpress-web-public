/**
 * What KIND of thing a door is.
 *
 * A door declares `category` in its package.json, and the admin's Activity
 * feed wants it so it can say "Started a game of FROGGER" rather than "Opened
 * FROGGER" - and, just as importantly, so it does NOT say that about DOORMAN.
 *
 * The declared values are inconsistent by hand - "Games", "game", "utility",
 * "Utilities" - because nothing has ever read them. They are normalised here
 * rather than tidied on disk: a sysop's own door may spell it either way and
 * should still be understood.
 *
 * A 68K door has no package.json and therefore no category. That is not a
 * failure; it means the feed says "Opened" for it, which is true.
 */

import * as path from 'path';
import * as amigafs from '../utils/amigafs';

/** The normalised kinds. Anything unrecognised keeps its own lower-cased name. */
export type DoorCategory = string;

/** Parsed once per directory - a door's category does not change while it runs. */
const cache = new Map<string, DoorCategory | null>();

/**
 * "Games", "game", "GAMES" are one thing. So are "utility" and "Utilities".
 */
export function normaliseCategory(raw: string | undefined): DoorCategory | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;

  if (value === 'games' || value === 'game') return 'game';
  if (value === 'utilities' || value === 'utility') return 'utility';
  return value;
}

/** Is this a door someone PLAYS? */
export function isGameCategory(category: string | undefined | null): boolean {
  return normaliseCategory(category ?? undefined) === 'game';
}

/**
 * The category of the door whose files live at (or beside) `doorPath`.
 *
 * `door.path` may name the door's directory or the executable inside it, so
 * both are tried - the same reasoning as ownDirectoryOf in
 * door-registration-paths.
 */
export function doorCategoryAt(doorPath: string | undefined): DoorCategory | null {
  if (!doorPath) return null;

  const cached = cache.get(doorPath);
  if (cached !== undefined) return cached;

  let category: DoorCategory | null = null;
  for (const directory of candidateDirectories(doorPath)) {
    const manifest = path.join(directory, 'package.json');
    try {
      if (!amigafs.existsSync(manifest)) continue;
      const contents = amigafs.readFileSync(manifest, 'utf8');
      const parsed = JSON.parse(typeof contents === 'string' ? contents : contents.toString());
      category = normaliseCategory(parsed?.category);
      if (category) break;
    } catch {
      // An unreadable or invalid manifest is not worth failing a door launch
      // over; the feed simply says "Opened".
    }
  }

  cache.set(doorPath, category);
  return category;
}

function candidateDirectories(doorPath: string): string[] {
  try {
    if (amigafs.statSync(doorPath).isDirectory()) {
      return [doorPath];
    }
  } catch {
    // Not there - fall through to the parent, which may still be.
  }
  return [path.dirname(doorPath)];
}

/** Drop the cache. For tests, and for a door reinstalled under a new category. */
export function clearDoorCategoryCache(): void {
  cache.clear();
}
