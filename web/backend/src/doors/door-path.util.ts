import * as fs from 'fs';
import * as path from 'path';

import { resolvePath as resolveCaseInsensitivePath } from '../utils/amigafs';

/**
 * Resolve a door resource path (config files, assets, etc.) using
 * Amiga-style case-insensitive lookups. Checks the current working
 * directory plus parent directories so doors can be executed from
 * web/backend or the project root.
 */
export function resolveDoorResourcePath(...segments: string[]): string | null {
  const searchRoots = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..')
  ];

  for (const root of searchRoots) {
    const fullPath = path.join(root, ...segments);
    const resolved = resolveCaseInsensitivePath(fullPath);
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

/**
 * Where a door's registered LOCATION actually lands, or null if nowhere.
 *
 * `Commands/BBSCmd/<CMD>.info` carries `LOCATION=`, and it is written the way
 * AmiExpress writes it: `DOORS:ANNOUNCE/ANNOUNCE.REXX`, where `DOORS:` is the
 * assign that resolves to the board's `Doors/`. What it points AT differs by
 * door type - a TypeScript door registers its DIRECTORY, a 68K or ARexx door
 * registers a FILE - so this answers for either, and the caller decides what
 * the answer means.
 *
 * Resolution is Amiga-style and case-insensitive because the board's own
 * directories disagree with their .info files about case (the volume has
 * `GL.info` where the image ships `gl.info`). A lexical check would call
 * working doors broken.
 */
export function resolveDoorTarget(bbsRoot: string, location?: string | null): string | null {
  if (!location) return null;
  const trimmed = String(location).trim();
  if (!trimmed) return null;

  if (path.isAbsolute(trimmed)) {
    return fs.existsSync(trimmed) ? trimmed : null;
  }

  // `DOORS:x/y` is the assign; strip it and let the join below put the path
  // under the board's own Doors/. Any other assign is left alone - it is not
  // ours to interpret and the join will simply not resolve.
  const withoutAssign = /^doors:/i.test(trimmed)
    ? `Doors/${trimmed.slice('doors:'.length)}`
    : trimmed;

  const components = withoutAssign
    .replace(new RegExp('\\\\', 'g'), '/')
    .split('/')
    .filter((c) => c.length > 0);
  if (components.length === 0) return null;

  const fullPath = path.join(bbsRoot, ...components);
  const resolved = resolveCaseInsensitivePath(fullPath) || fullPath;
  return fs.existsSync(resolved) ? resolved : null;
}

/** One registration, as far as the missing-target scan is concerned. */
export interface DoorRegistration {
  command: string;
  path?: string | null;
}

/**
 * The registrations whose door is not on disk.
 *
 * BROADCAST was on the live menu for weeks pointing at a `Doors/ANNOUNCE/`
 * that does not exist, and the only way anyone could find out was a caller
 * running it and being told to contact the sysop. The startup scan already
 * warns about a LOCATION that resolves OUTSIDE `Doors/`; a LOCATION that
 * resolves nowhere is the same class of broken registration and belongs in
 * the same pass.
 *
 * A registration with no LOCATION at all is skipped: that is a different
 * defect, the existing scan already passes over it, and reporting it here
 * would bury the ones a sysop can actually act on.
 */
export function missingDoorTargets(
  doors: DoorRegistration[],
  bbsRoot: string,
): Array<{ command: string; location: string }> {
  const out: Array<{ command: string; location: string }> = [];
  for (const door of doors) {
    const location = door?.path;
    if (!location) continue;
    if (resolveDoorTarget(bbsRoot, location) === null) {
      out.push({ command: door.command, location: String(location) });
    }
  }
  return out;
}
