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
  const file = path.join(doorDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new DoorSettingsError(doorDir, `is not valid JSON (${(error as Error).message})`);
  }

  const manifest = parsed as Partial<DoorSettingsManifest>;
  if (!manifest || typeof manifest !== 'object') {
    throw new DoorSettingsError(doorDir, 'is not an object');
  }
  if (!manifest.command || typeof manifest.command !== 'string') {
    throw new DoorSettingsError(doorDir, 'has no command');
  }
  if (!Array.isArray(manifest.settings)) {
    throw new DoorSettingsError(doorDir, 'has no settings array');
  }

  const settings = manifest.settings.map((s, i) => assertSetting(doorDir, s, i));

  const seen = new Set<string>();
  for (const s of settings) {
    if (seen.has(s.key)) {
      throw new DoorSettingsError(doorDir, `declares ${s.key} twice`);
    }
    seen.add(s.key);
  }

  return { command: manifest.command, settings };
}

/** The raw values file, or an empty object. Unvalidated on purpose. */
export function readValues(doorDir: string): Record<string, unknown> {
  const file = path.join(doorDir, VALUES_FILE);
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
 * What the door should use: declared defaults, with the sysop's values over
 * them.
 *
 * A key in settings.json that the door does not declare is ignored - a door
 * that dropped a setting should not be handed it back - and a value of the
 * wrong type falls back to the default rather than reaching the door as a
 * string where it expects a number.
 */
export function readDoorSettings(doorDir: string): DoorSettingValues {
  const manifest = readManifest(doorDir);
  if (!manifest) return {};

  const values = readValues(doorDir);
  const out: DoorSettingValues = {};

  for (const setting of manifest.settings) {
    const raw = values[setting.key];
    const fallback = setting.default;

    if (raw === undefined || raw === null) {
      if (fallback !== undefined) out[setting.key] = fallback;
      continue;
    }

    switch (setting.type) {
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        out[setting.key] = Number.isFinite(n) ? n : (fallback as number ?? 0);
        break;
      }
      case 'boolean':
        out[setting.key] = typeof raw === 'boolean' ? raw : raw === 'true' || raw === 1;
        break;
      case 'choice': {
        const allowed = (setting.choices ?? []).map(c => c.value);
        out[setting.key] = allowed.includes(String(raw)) ? String(raw) : (fallback as string ?? allowed[0]);
        break;
      }
      default:
        out[setting.key] = String(raw);
    }
  }

  return out;
}
