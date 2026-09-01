/**
 * A door's own settings: what it declares, and what the sysop set.
 *
 * Two files live beside a door's package.json:
 *
 *   door.settings.json  - the DECLARATION, shipped with the door and read by
 *                         the admin to build a form. Part of the image.
 *   settings.json       - the VALUES, written by the sysop through the admin.
 *                         Never shipped: the deploy syncs a door's directory
 *                         with `tar cf - . | tar xf -`, which overwrites what
 *                         the image carries and leaves everything else alone,
 *                         so a file the image does not have survives a deploy.
 *
 * A door calls `readDoorSettings(__dirname)` once at start and gets its
 * declared keys with the sysop's values applied over the defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DoorSetting, DoorSettingsManifest, DoorSettingValues } from './types';

export const MANIFEST_FILE = 'door.settings.json';
export const VALUES_FILE = 'settings.json';

/** Thrown with the door's own path, so a bad manifest names itself. */
export class DoorSettingsError extends Error {
  constructor(doorDir: string, detail: string) {
    super(`${path.join(doorDir, MANIFEST_FILE)}: ${detail}`);
    this.name = 'DoorSettingsError';
  }
}

/** How far above a compiled door's `dist/` the declaration may sit. */
const DOOR_ROOT_SEARCH_DEPTH = 3;

/**
 * The door's own directory - where its files are, wherever it was loaded from.
 *
 * `__dirname` is not the same place in development as it is on the board: the
 * backend imports `index.ts` in development and `dist/index.js` in production
 * (`door.handler.ts`), so a compiled door asks from `Doors/<door>/dist` while
 * the admin, the sysop and the door's own data files are in `Doors/<door>`.
 * Walking up makes both ask the same question, and makes
 * `readDoorSettings(__dirname)` - what every door is told to call - correct in
 * both.
 *
 * A door's declaration marks the root, and so does its package.json: doors
 * without settings still keep files of their own beside it, and every one of
 * them had the same bug. `process.cwd()` is worse than `__dirname` and was
 * used for the same purpose - the backend's cwd on the board is
 * /app/web/backend, so a door reading cwd + 'Doors/<door>/<file>' named a
 * path that has never existed.
 *
 * Nothing found means the directory asked about comes back unchanged.
 */
export function resolveDoorRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth <= DOOR_ROOT_SEARCH_DEPTH; depth++) {
    if (fs.existsSync(path.join(dir, MANIFEST_FILE))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

/** How far above a door the BBS root may sit: Doors/<door>/dist is three. */
const BBS_ROOT_SEARCH_DEPTH = 6;

/**
 * The BBS root - the directory holding Commands, Doors, Access and the rest.
 *
 * A door needs this as often as it needs its own directory: RIPgraphics,
 * Screens, Bulletins and the conference tree all live here, and none of them
 * are inside the door. The container sets BBS_DATA_DIR (BBS_ROOT is empty
 * there, which is how new users came to be written to a file nothing reads),
 * so the environment is asked first and the walk is the fallback.
 *
 * `Commands/BBSCmd` is what identifies it: every board has one, and no door
 * does. Nothing found means the door's own root, which at least exists.
 */
export function resolveBbsRoot(startDir: string): string {
  const fromEnv = process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'Commands', 'BBSCmd'))) return fromEnv;

  let dir = path.resolve(startDir);
  for (let depth = 0; depth <= BBS_ROOT_SEARCH_DEPTH; depth++) {
    if (fs.existsSync(path.join(dir, 'Commands', 'BBSCmd'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolveDoorRoot(startDir);
}

function assertSetting(doorDir: string, setting: unknown, index: number): DoorSetting {
  const where = `settings[${index}]`;
  if (!setting || typeof setting !== 'object') {
    throw new DoorSettingsError(doorDir, `${where} is not an object`);
  }
  const s = setting as Partial<DoorSetting>;
  if (!s.key || typeof s.key !== 'string') {
    throw new DoorSettingsError(doorDir, `${where} has no key`);
  }
  if (!s.label || typeof s.label !== 'string') {
    throw new DoorSettingsError(doorDir, `${where} (${s.key}) has no label`);
  }
  if (!s.type || !['string', 'number', 'boolean', 'choice'].includes(s.type)) {
    throw new DoorSettingsError(doorDir, `${where} (${s.key}) has type ${JSON.stringify(s.type)}, which is not one of string, number, boolean, choice`);
  }
  // A choice with nothing to choose from renders as an empty dropdown, which
  // reads as a broken admin rather than as a broken door.
  if (s.type === 'choice' && (!Array.isArray(s.choices) || s.choices.length === 0)) {
    throw new DoorSettingsError(doorDir, `${where} (${s.key}) is a choice with no choices`);
  }
  return s as DoorSetting;
}

/**
 * The door's declaration, or null when it does not have one.
 *
 * Null is the normal case and not an error: a door without a manifest is a
 * door the admin shows exactly as it does today.
 */
export function readManifest(doorDir: string): DoorSettingsManifest | null {
  const root = resolveDoorRoot(doorDir);
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new DoorSettingsError(root, `is not valid JSON (${(error as Error).message})`);
  }

  const manifest = parsed as Partial<DoorSettingsManifest>;
  if (!manifest || typeof manifest !== 'object') {
    throw new DoorSettingsError(root, 'is not an object');
  }
  if (!manifest.command || typeof manifest.command !== 'string') {
    throw new DoorSettingsError(root, 'has no command');
  }
  if (!Array.isArray(manifest.settings)) {
    throw new DoorSettingsError(root, 'has no settings array');
  }

  const settings = manifest.settings.map((s, i) => assertSetting(root, s, i));

  const seen = new Set<string>();
  for (const s of settings) {
    if (seen.has(s.key)) {
      throw new DoorSettingsError(root, `declares ${s.key} twice`);
    }
    seen.add(s.key);
  }

  return { command: manifest.command, settings };
}

/** The raw values file, or an empty object. Unvalidated on purpose. */
export function readValues(doorDir: string): Record<string, unknown> {
  const file = path.join(resolveDoorRoot(doorDir), VALUES_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    // A values file the sysop's editor broke must not stop the door. It falls
    // back to the declared defaults, which is what the door shipped with.
    return {};
  }
}

/**
 * One stored value, as the setting declares it.
 *
 * A value of the wrong type falls back to the default rather than reaching the
 * door as a string where it expects a number - the sysop's editor and a
 * hand-written settings.json are both allowed to be sloppy; the door is not
 * the place to find out.
 */
function coerce(setting: DoorSetting, raw: unknown): string | number | boolean {
  switch (setting.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : (setting.default as number ?? 0);
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : raw === 'true' || raw === 1;
    case 'choice': {
      const allowed = (setting.choices ?? []).map(c => c.value);
      return allowed.includes(String(raw))
        ? String(raw)
        : (setting.default as string ?? allowed[0]);
    }
    default:
      return String(raw);
  }
}

/**
 * What the door should use: declared defaults, with the sysop's values over
 * them.
 *
 * A key in settings.json that the door does not declare is ignored - a door
 * that dropped a setting should not be handed it back.
 */
export function readDoorSettings(doorDir: string): DoorSettingValues {
  const manifest = readManifest(doorDir);
  if (!manifest) return {};

  const values = readValues(doorDir);
  const out: DoorSettingValues = {};

  for (const setting of manifest.settings) {
    const raw = values[setting.key];

    if (raw === undefined || raw === null) {
      if (setting.default !== undefined) out[setting.key] = setting.default;
      continue;
    }

    out[setting.key] = coerce(setting, raw);
  }

  return out;
}

/**
 * Only what the sysop actually set - no defaults.
 *
 * For a door that is migrating off a configuration file of its own: its old
 * file must keep working for one release, and a default cannot be allowed to
 * overwrite a value that file supplies. Layer it defaults -> old file ->
 * these, and a key nobody has touched in the admin stays whatever the old
 * file says.
 */
export function readDoorSettingOverrides(doorDir: string): Partial<DoorSettingValues> {
  const manifest = readManifest(doorDir);
  if (!manifest) return {};

  const values = readValues(doorDir);
  const out: DoorSettingValues = {};

  for (const setting of manifest.settings) {
    const raw = values[setting.key];
    if (raw === undefined || raw === null || raw === '') continue;
    out[setting.key] = coerce(setting, raw);
  }

  return out;
}
