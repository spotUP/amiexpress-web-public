import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * The board's ASCII logo, shared with dev/scripts/start-servers.sh so the
 * startup pane and the console's login screen show the same art.
 *
 * The asset is the single source of truth; nothing here redraws it. It is
 * stored as UTF-8 (the artist's tag carries one non-ASCII glyph) and is
 * LOGO_WIDTH columns wide, which is wider than the login box - callers gate
 * on the terminal actually being that wide.
 */
export const LOGO_WIDTH = 79;

const ASSET = join('dev', 'assets', 'amiexpress-logo.txt');

/**
 * Walk up from this module looking for the asset. The console runs both from
 * source (dev/console/src/theme) and from its build (dev/console/dist/src/
 * theme), which sit at different depths, so a fixed number of `..` would work
 * for one and not the other.
 */
function findAsset(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const candidate = join(dir, ASSET);
      readFileSync(candidate);
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * The logo's lines, or an empty array when the asset cannot be found - a
 * missing decoration must never stop a sysop logging in.
 */
export function loadLogo(): string[] {
  const path = findAsset();
  if (!path) return [];
  try {
    return readFileSync(path, 'utf8').replace(/\n$/, '').split('\n');
  } catch {
    return [];
  }
}

/** The art breaks up once it wraps, so it is shown only when it fits whole. */
export function logoFits(columns: number | undefined): boolean {
  return typeof columns === 'number' && columns >= LOGO_WIDTH;
}
