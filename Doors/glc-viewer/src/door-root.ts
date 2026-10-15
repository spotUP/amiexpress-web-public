/**
 * Where this door's own files are.
 *
 * `path.resolve(__dirname, '..')` was wrong in a way that only showed on one
 * machine. In production the board runs `dist/index.js`, so `..` is the door
 * root. On localhost the board runs `index.ts` STRAIGHT FROM SOURCE - tsx,
 * cache-busting on - and `index.ts` sits IN the door root, so `..` is
 * `Doors/`. Every file the door read relative to itself was silently missing
 * there: the C64 placeholder, the wide art, `GLCViewer.cfg` itself - with
 * the compiled-in art covering for it on the wide screen, which is why it
 * took a bare C64 screen to notice (sysop, 2026-09-16: "still no petscii
 * logo in sight").
 *
 * So the root is FOUND, not assumed: walk up from wherever this file is
 * until the directory that holds the door's `package.json`. That is true of
 * `src/`, `dist/src/`, `dist/` and the root itself, and of any layout the
 * build grows into.
 */
import * as fs from 'fs';
import * as path from 'path';

/** The nearest ancestor of `from` (inclusive) that holds a package.json. */
export function doorRootFrom(from: string): string {
  let dir = path.resolve(from);
  for (let depth = 0; depth < 6; depth++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Nothing found: the old guess, so a door that is somehow not a package
  // still runs rather than throwing at import.
  return path.resolve(from, '..');
}
