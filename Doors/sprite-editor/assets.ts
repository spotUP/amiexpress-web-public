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
import { Sprite, parseSprite, serializeSprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

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
  // Containment FIRST - the base itself can escape when the DOOR argument
  // carries traversal, and the '.'-listing shortcut must not run before
  // this is settled. Review-caught 2026-08-31: the shortcut-first ordering
  // let resolveAssetPath('..', 'sprites', '.') list outside Doors/.
  if (!base.startsWith(DOORS_ROOT + sep)) {
    throw new Error(`asset path outside ${door}/${kind}: ${file}`);
  }
  if (target === base) return base; // the directory itself, for listing
  if (!target.startsWith(base + sep)) {
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

/** Write one sheet: guarded path, validated content, atomic replace. */
export function writeSprite(door: string, file: string, sprite: Sprite): void {
  const path = resolveAssetPath(door, 'sprites', file);
  const json = serializeSprite(sprite); // throws before any disk touch
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, path); // atomic on the same filesystem
}

/** `*.ans` files in a door's art/ directory, sorted; [] when none. */
export function listArt(door: string): string[] {
  try {
    const dir = resolveAssetPath(door, 'art', '.');
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ans')).sort();
  } catch {
    return []; // no art/ directory is a normal state, not an error
  }
}

export function readArt(door: string, file: string): Buffer {
  return fs.readFileSync(resolveAssetPath(door, 'art', file));
}

export function writeArt(door: string, file: string, data: Buffer): void {
  const path = resolveAssetPath(door, 'art', file);
  fs.mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, path);
}
