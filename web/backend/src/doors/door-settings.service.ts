/**
 * A door's declared settings, and the values a sysop set for them.
 *
 * The declaration is `Doors/<door>/door.settings.json`, shipped with the door.
 * The values are `Doors/<door>/settings.json`, written here. The deploy syncs a
 * door's directory with `tar cf - . | tar xf -` (docker-entrypoint.sh), which
 * overwrites what the image carries and leaves everything else alone - so a
 * file the image does not ship survives a deploy, which is why the values live
 * in a separate file from the declaration.
 *
 * Reading a declaration must never execute the door. Importing 34 door modules
 * to build an admin page runs each door's top-level code, and one door that is
 * broken or half-written would take the page down with it; JSON is also
 * readable before a door has ever been built. The parsing and the merge rules
 * live in the SDK (`sdk/core/settings.ts`) so the door and the admin agree by
 * construction rather than by two implementations staying in step.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
// The narrow subpath, not the package root: the root pulls in the server
// bundle and its audio engine, and a settings read has no business loading
// Tone.js.
import { resolveDoorDirectory } from './door-list';

/**
 * The two file names, and the shape, are the contract with the SDK
 * (`sdk/core/settings.ts`). They are re-stated here rather than imported: the
 * backend's build has `rootDir: ./src` so it cannot compile SDK source, and
 * the package root pulls in the server bundle's audio engine, which is ESM and
 * has no business loading to read a JSON file.
 *
 * The two implementations are held together by
 * `tests/services/door-settings-round-trip.test.ts`, which writes with this
 * one and reads back with the SDK's - so a change to either side that breaks
 * the agreement fails a test rather than a door.
 */
export const MANIFEST_FILE = 'door.settings.json';
export const VALUES_FILE = 'settings.json';

export interface DoorSetting {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  choices?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
  help?: string;
  min?: number;
  max?: number;
  secret?: boolean;
  /**
   * Render this value into the door's legacy cfg file under this key, when the
   * manifest declares `cfgFile`. 68K/C doors cannot read settings.json - they
   * read a plain `Key=value` file beside the binary - so this is the bridge.
   */
  cfgKey?: string;
  /**
   * Take this value from the board's own system config when the door has none
   * of its own, naming the system_config column to read.
   *
   * The board already holds the achievements board key - encrypted at rest and
   * decrypted on read - and REQUESTS needs exactly that key. Without this a
   * sysop had to find the secret in one admin page and paste it into another,
   * which is both a chore and a second copy of a secret. The door's own value
   * still wins if one is set.
   */
  fromSystemConfig?: string;
}

export interface DoorSettingsManifest {
  command: string;
  settings: DoorSetting[];
  /**
   * Optional legacy config file (e.g. `REQUESTS.cfg`) rendered beside the door
   * whenever its settings are saved. A 68K door reads that file, not
   * settings.json, so without this the admin form and the door never meet.
   * Bare filename only - never a path.
   */
  cfgFile?: string;
}

const SettingSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  type: z.enum(['string', 'number', 'boolean', 'choice']),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  help: z.string().max(300).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  secret: z.boolean().optional(),
  cfgKey: z.string().min(1).max(64).optional(),
  fromSystemConfig: z.string().min(1).max(64).optional(),
}).refine(
  s => s.type !== 'choice' || (s.choices?.length ?? 0) > 0,
  { message: 'a choice needs choices' }
);

const ManifestSchema = z.object({
  command: z.string().min(1).max(50),
  settings: z.array(SettingSchema).max(100),
  // Bare filename: no separators, no traversal. The cfg is written INSIDE the
  // door directory and nowhere else.
  cfgFile: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
});

/** The door's declaration, or null when it has none - the normal case. */
function readManifestFromDir(doorDir: string): DoorSettingsManifest | null {
  const file = path.join(doorDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`${file}: ${first.path.join('.')} ${first.message}`);
  }

  const seen = new Set<string>();
  for (const setting of result.data.settings) {
    if (seen.has(setting.key)) throw new Error(`${file}: declares ${setting.key} twice`);
    seen.add(setting.key);
  }

  return result.data as DoorSettingsManifest;
}

/** The values file, or an empty object. A broken one must not stop the admin. */
function readValuesFromDir(doorDir: string): Record<string, unknown> {
  const file = path.join(doorDir, VALUES_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/** What a PUT may carry: the declared keys, nothing else. */
export const DoorSettingsPayloadSchema = z.record(
  z.union([z.string().max(2000), z.number(), z.boolean()])
);

export interface DoorSettingsView {
  manifest: DoorSettingsManifest;
  /** Secrets come back as '' - set, but not readable. */
  values: Record<string, string | number | boolean>;
  /** Which keys hold a secret that IS set, so the form can say so. */
  secretsSet: string[];
}

/**
 * The door's directory, resolved the way the door list resolves it.
 *
 * A door's LOCATION points at its binary or its directory; `resolveDoorDirectory`
 * already owns that difference, and the answer has to be the same one the door
 * itself will use at runtime.
 */
export function doorDirectoryFor(bbsRoot: string, door: { path?: string; location?: string; command?: string }): string | null {
  const { resolvedPath } = resolveDoorDirectory(bbsRoot, door as any);
  if (!resolvedPath) return null;
  try {
    return fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
  } catch {
    return null;
  }
}

/** Null when the door declares nothing - the normal case, not an error. */
export function readDoorSettingsView(doorDir: string): DoorSettingsView | null {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest) return null;

  const stored = readValuesFromDir(doorDir);
  const values: Record<string, string | number | boolean> = {};
  const secretsSet: string[] = [];

  for (const setting of manifest.settings) {
    const raw = stored[setting.key];
    if (setting.secret) {
      if (raw !== undefined && raw !== null && raw !== '') secretsSet.push(setting.key);
      values[setting.key] = '';
      continue;
    }
    if (raw !== undefined && raw !== null) {
      values[setting.key] = raw as string | number | boolean;
    } else if (setting.default !== undefined) {
      values[setting.key] = setting.default;
    }
  }

  return { manifest, values, secretsSet };
}

export class UnknownDoorSettingError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `Not a setting this door declares: ${keys.join(', ')}. ` +
      `A door's settings come from its own door.settings.json.`
    );
    this.name = 'UnknownDoorSettingError';
  }
}

/**
 * Write the values a sysop just set.
 *
 * Every incoming key is checked against the declaration and an unknown one is
 * refused BY NAME rather than written - a file full of keys nothing reads is
 * how ACS files ended up with tooltypes AmiExpress ignores. A secret that
 * arrives empty keeps the stored one, because the form never received it to
 * send back.
 */
export function writeDoorSettings(
  doorDir: string,
  incoming: Record<string, string | number | boolean>,
  resolveSystemValue?: SystemValueResolver,
): Record<string, string | number | boolean> {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest) {
    throw new Error('This door does not declare any settings');
  }

  const declared = new Map(manifest.settings.map(s => [s.key, s]));
  const unknown = Object.keys(incoming).filter(k => !declared.has(k));
  if (unknown.length > 0) throw new UnknownDoorSettingError(unknown);

  const stored = readValuesFromDir(doorDir);
  const out: Record<string, string | number | boolean> = { ...stored } as any;

  for (const [key, value] of Object.entries(incoming)) {
    const setting = declared.get(key)!;

    if (setting.secret && (value === '' || value === null || value === undefined)) {
      continue; // unchanged: the form was never given it to send back
    }

    if (setting.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${setting.label} must be a number`);
      if (setting.min !== undefined && n < setting.min) throw new Error(`${setting.label} must be at least ${setting.min}`);
      if (setting.max !== undefined && n > setting.max) throw new Error(`${setting.label} must be at most ${setting.max}`);
      out[key] = n;
      continue;
    }

    if (setting.type === 'boolean') {
      out[key] = value === true || value === 'true' || value === 1;
      continue;
    }

    if (setting.type === 'choice') {
      const allowed = (setting.choices ?? []).map(c => c.value);
      if (!allowed.includes(String(value))) {
        throw new Error(`${setting.label} must be one of: ${allowed.join(', ')}`);
      }
      out[key] = String(value);
      continue;
    }

    out[key] = String(value);
  }

  const target = path.join(doorDir, VALUES_FILE);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(out, null, 2) + '\n');
  fs.renameSync(temp, target);

  // A 68K door reads a plain Key=value file, not settings.json. Render it now
  // so saving in the admin actually reaches the door.
  renderDoorCfg(doorDir, resolveSystemValue);

  return out;
}

/**
 * Render the door's legacy `Key=value` config file from its saved settings.
 *
 * Only does anything when the manifest declares `cfgFile`; returns the path
 * written, or null. Values come from settings.json, falling back to each
 * setting's declared default, so a door is configured the moment it is
 * installed rather than only after a sysop opens the form.
 *
 * Written 0600 and atomically: it carries secrets (a board key), and a door
 * that reads it mid-write would see half a file.
 */
export type SystemValueResolver = (systemConfigKey: string) => string | undefined;

export function renderDoorCfg(
  doorDir: string,
  resolveSystemValue?: SystemValueResolver,
): string | null {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest?.cfgFile) return null;

  const values = readValuesFromDir(doorDir);
  const lines: string[] = [];
  for (const setting of manifest.settings) {
    if (!setting.cfgKey) continue;
    // Precedence: what the sysop set for THIS door, then the board's own
    // system config, then the declared default. The door's own value wins so
    // a board can point one door at a different server without moving the
    // board-wide secret.
    let fromBoard: string | undefined;
    const own = values[setting.key];
    const ownIsEmpty = own === undefined || own === null || own === '';
    if (ownIsEmpty && setting.fromSystemConfig && resolveSystemValue) {
      try {
        fromBoard = resolveSystemValue(setting.fromSystemConfig);
      } catch {
        fromBoard = undefined; // a broken config read must not blank the cfg
      }
    }
    const raw = (ownIsEmpty ? (fromBoard ?? setting.default ?? '') : own) ?? '';
    // One line per key, no quoting: that is the format these doors parse.
    lines.push(`${setting.cfgKey}=${String(raw).replace(/[\r\n]/g, ' ')}`);
  }

  const target = path.join(doorDir, manifest.cfgFile);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, lines.join('\n') + '\n', { mode: 0o600 });
  fs.renameSync(temp, target);
  return target;
}

/**
 * Render every installed door legacy cfg from its saved settings.
 *
 * Run at startup. Rendering only on save is not enough: a freshly installed
 * door must be configured from its declared defaults before anyone opens the
 * admin, and the deploy re-syncs Doors/ from the image on every boot. The
 * sysop settings.json survives that (it is not in the image, and the sync only
 * adds), so the cfg is rebuilt from it here.
 *
 * Never throws: one malformed manifest must not stop the board booting.
 */
export function renderAllDoorCfgs(
  doorsRoot: string,
  resolveSystemValue?: SystemValueResolver,
): number {
  let rendered = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(doorsRoot);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const doorDir = path.join(doorsRoot, entry);
    try {
      if (!fs.statSync(doorDir).isDirectory()) continue;
      if (renderDoorCfg(doorDir, resolveSystemValue)) rendered++;
    } catch (err: any) {
      console.error(`[doorSettings] cfg render failed for ${entry}: ${err?.message || err}`);
    }
  }
  return rendered;
}
