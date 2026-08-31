/**
 * The studio's window onto every door's assets - guarded.
 *
 * The rule is the door-delete incident's, verbatim: a resolved-path guard,
 * not a trusted string. Every path the UI can reach funnels through
 * resolveAssetPath, which resolves first and compares after, so no
 * combination of dots, slashes or absolute paths escapes
 * Doors/<door>/<kind>/.
 *
 * Server-side fs on purpose: this door is server-side blessed (like the
 * ANSI editor it forks), so it reads the same disk the doors run from.
 * No RPC, no copies, no drift.
 */

import * as fs from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
import { Sprite, parseSprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

/**
 * Doors/, found by walking up from wherever this file runs - which is
 * Doors/sprite-editor under tsx and Doors/sprite-editor/dist in
 * production, the same split the Pengo sprite loading handles.
 */
export const DOORS_ROOT = (() => {
  let dir = __dirname;
  while (basename(dir) !== 'Doors' && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  if (basename(dir) !== 'Doors') {
    throw new Error(`sprite-editor cannot find Doors/ above ${__dirname}`);
  }
  return dir;
})();

/** Resolve one asset path, or throw. The only door to the filesystem. */
export function resolveAssetPath(
  door: string,
  kind: 'sprites' | 'art',
  file: string
): string {
  const base = resolve(DOORS_ROOT, door, kind);
  const target = resolve(base, file);
  // the directory itself, for listing
  if (target === base) return base;
  // Resolve FIRST, compare AFTER - and the base itself must still be
  // inside Doors/, or a door name of "../web" moves the fence.
  if (!base.startsWith(DOORS_ROOT + sep) || !target.startsWith(base + sep)) {
    throw new Error(`asset path outside ${door}/${kind}: ${file}`);
  }
  return target;
}

/** Door directories that ship at least one sprite sheet, sorted. */
export function listDoorsWithSprites(): string[] {
  return fs.readdirSync(DOORS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => {
      try {
        return fs.readdirSync(join(DOORS_ROOT, name, 'sprites'))
          .some(f => f.endsWith('.sprite.json'));
      } catch {
        return false; // no sprites/ directory - not a sprite door
      }
    })
    .sort();
}

/** Sprite sheet filenames in one door, sorted. */
export function listSprites(door: string): string[] {
  const dir = resolveAssetPath(door, 'sprites', '.');
  return fs.readdirSync(dir).filter(f => f.endsWith('.sprite.json')).sort();
}

/** One sheet, parsed and validated - a bad file throws with its name. */
export function readSprite(door: string, file: string): Sprite {
  const path = resolveAssetPath(door, 'sprites', file);
  return parseSprite(JSON.parse(fs.readFileSync(path, 'utf8')), file);
}
