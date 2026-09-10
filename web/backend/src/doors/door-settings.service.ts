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
import { resolvePath as resolveTruePath } from '../utils/amigafs';

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
  /**
   * Group heading the admin form renders this setting under. Settings share
   * a heading while consecutive settings name the same group; ungrouped
   * settings render as they always have. Added for Empire doors, which
   * declare dozens of fields no sysop wants as one flat wall.
   */
  group?: string;
  /**
   * Hide this setting from the generic form. It stays a real setting - the
   * API reads and writes it - but a bespoke editor owns it (the Bulls
   * conference masks live in a checkbox matrix on the Bulls Menu page; 39
   * raw mask strings in the form would be the wall groups were built to
   * avoid).
   */
  hidden?: boolean;
  /**
   * Regex a string value must match (e.g. `^[X-]{20}$` for an Empire access
   * mask). Validated on save; must itself compile.
   */
  pattern?: string;
  /**
   * Bind this setting to a different legacy file than the manifest's
   * `cfgFile` (e.g. `joincnf.cfg` beside `Bulls.CFG`). Same bare-filename
   * rule. Only meaningful on file-backed (`cfgFormat: 'empire'`) manifests.
   */
  cfgFile?: string;
  /**
   * Row binding for sectioned (`cfgFormat: 'empire'`) files. `section` names
   * the `[Name_END]` section without the suffix (`bullnames`, `masks`);
   * `row` is the zero-based data row; `field` picks the cell. Init-style
   * `KEY value` settings use `cfgKey` with `{ section: 'init' }` (or omit
   * `cfgRow` and take the manifest file's init section).
   */
  cfgRow?: {
    section: string;
    row?: number;
    field: 'value' | 'title' | 'file' | 'mask';
  };
}

export type DoorCfgFormat = 'key-value' | 'empire';

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
  /**
   * `key-value` (default) renders `Key=value` lines from `cfgKey` settings.
   * `empire` parses the sectioned Empire format in place instead — the file
   * is the store (settings.json is neither read nor written), unmapped bytes
   * survive every save, and each setting binds via `cfgKey`/`cfgRow` plus an
   * optional per-setting `cfgFile`.
   */
  cfgFormat?: DoorCfgFormat;
  /**
   * Art blocks the ANSI Studio edits (Bulls' Title logo). Read/written as
   * whole sections through the Empire driver — never through the settings
   * form, which is the wrong tool for art.
   */
  artSections?: DoorArtSection[];
}

const BARE_FILE_RE = /^[A-Za-z0-9._-]+$/;

const CfgRowSchema = z.object({
  section: z.string().min(1).max(32),
  row: z.number().int().min(0).max(9999).optional(),
  field: z.enum(['value', 'title', 'file', 'mask']),
});

const ArtSectionSchema = z.object({
  file: z.string().min(1).max(64).regex(BARE_FILE_RE),
  section: z.string().min(1).max(32),
  label: z.string().min(1).max(80),
  maxLines: z.number().int().min(1).max(100),
  maxLineLength: z.number().int().min(1).max(1000),
});
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
  group: z.string().min(1).max(40).optional(),
  hidden: z.boolean().optional(),
  pattern: z.string().min(1).max(200).optional(),
  cfgFile: z.string().min(1).max(64).regex(BARE_FILE_RE).optional(),
  cfgRow: CfgRowSchema.optional(),
}).refine(
  s => s.type !== 'choice' || (s.choices?.length ?? 0) > 0,
  { message: 'a choice needs choices' }
).refine(
  s => s.pattern === undefined || s.type === 'string',
  { message: 'pattern is for strings' }
).refine(
  s => {
    if (s.pattern === undefined) return true;
    try {
      // eslint-disable-next-line no-new
      new RegExp(s.pattern);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'pattern must be a valid regular expression' }
).refine(
  s => !s.cfgRow || s.cfgRow.field === 'value' || s.cfgRow.row !== undefined,
  { message: 'a title, file or mask row needs its row number' }
);

const ManifestSchema = z.object({
  command: z.string().min(1).max(50),
  settings: z.array(SettingSchema).max(200),
  // Bare filename: no separators, no traversal. The cfg is written INSIDE the
  // door directory and nowhere else.
  cfgFile: z.string().min(1).max(64).regex(BARE_FILE_RE).optional(),
  cfgFormat: z.enum(['key-value', 'empire']).optional(),
  artSections: z.array(ArtSectionSchema).max(10).optional(),
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
  // A LOCATION's case is the author's, not the disk's (Bulls registers
  // Doors/EmP_Tools/Bulls; the volume holds Doors/emp_tools). The resolver
  // above matches case-insensitively but hands back the candidate spelling,
  // and every plain-fs call below would then miss on a case-sensitive
  // volume — the admin's Door settings section silently vanishing. Resolve
  // to the true on-disk spelling first.
  const real = resolveTruePath(resolvedPath) ?? resolvedPath;
  try {
    return fs.statSync(real).isDirectory() ? real : path.dirname(real);
  } catch {
    return null;
  }
}

/** Null when the door declares nothing - the normal case, not an error. */
export function readDoorSettingsView(doorDir: string): DoorSettingsView | null {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest) return null;

  // File-backed (Empire) manifests read the legacy files themselves: the
  // live file's customized titles are what the form must show, not the
  // manifest defaults. settings.json is never consulted for these doors.
  if (manifest.cfgFormat === 'empire') {
    return readEmpireSettingsView(doorDir, manifest);
  }

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

  // File-backed (Empire) manifests serialize into the legacy files: the CFG
  // is the store, so settings.json is never written (a mirror would drift).
  if (manifest.cfgFormat === 'empire') {
    return writeEmpireSettings(doorDir, manifest, declared, incoming);
  }

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

    const str = String(value);
    if (setting.pattern && !new RegExp(setting.pattern).test(str)) {
      throw new Error(`${setting.label} must match ${setting.pattern}`);
    }
    out[key] = str;
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
  // Empire files are their own store — the Key=value renderer would flatten
  // sections, comments and art into garbage. Startup (renderAllDoorCfgs)
  // reaches here for every manifest with a cfgFile, so this guard is what
  // keeps a reboot from destroying Bulls.CFG.
  if (manifest.cfgFormat === 'empire') return null;

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

/* ------------------------------------------------------------------ *
 * Empire sectioned files (cfgFormat: 'empire').
 *
 * The legacy file is the store: reads parse it, writes serialize into it,
 * and settings.json is never touched (a mirror would drift the moment a
 * sysop hand-edits beside the admin). Unmapped bytes survive every save —
 * the driver guarantees it, and the round-trip test pins it.
 * ------------------------------------------------------------------ */

import {
  parseEmpireFile,
  serializeEmpireFile,
  getKv,
  setKv,
  getBullRows,
  setBullRow,
  appendBullRow,
  getMaskRows,
  setMaskRow,
  appendMaskRow,
  getSectionBody,
  setSectionBody,
  type EmpireFile,
} from './text-cfg/empire';

/** Which legacy file a setting binds (per-setting override, else manifest). */
function empireFileName(manifest: DoorSettingsManifest, setting: DoorSetting): string {
  const file = setting.cfgFile ?? manifest.cfgFile;
  if (!file) {
    throw new Error(
      `${manifest.command}: ${setting.key} binds no file — an empire setting needs cfgFile (per setting or manifest)`
    );
  }
  return file;
}

function loadEmpireFiles(
  doorDir: string,
  manifest: DoorSettingsManifest
): Map<string, { file: EmpireFile; dirty: boolean }> {
  const names = new Set<string>();
  for (const setting of manifest.settings) {
    if (setting.cfgKey || setting.cfgRow) names.add(empireFileName(manifest, setting));
  }
  const loaded = new Map<string, { file: EmpireFile; dirty: boolean }>();
  for (const name of names) {
    const full = path.join(doorDir, name);
    let raw: Buffer;
    try {
      raw = fs.readFileSync(full);
    } catch {
      // Mirror the door's own complaint: Bulls errors `Bulls.CFG Not Found`.
      throw new Error(`${manifest.command}: ${name} not found beside the door — nothing to edit yet`);
    }
    loaded.set(name, { file: parseEmpireFile(raw), dirty: false });
  }
  return loaded;
}

type EmpireCell = string | number | boolean | undefined;

function readEmpireCell(
  entry: { file: EmpireFile },
  manifest: DoorSettingsManifest,
  setting: DoorSetting
): EmpireCell {
  const { file } = entry;
  const row = setting.cfgRow;
  if (row) {
    if (row.field === 'title' || row.field === 'file') {
      const rows = getBullRows(file);
      const found = rows[row.row ?? -1];
      if (!found) return undefined;
      return row.field === 'title' ? found.title : found.file;
    }
    if (row.field === 'mask') {
      const masks = getMaskRows(file);
      const found = masks[row.row ?? -1];
      return found;
    }
    // field 'value' with an explicit section: init-style KV there.
    if (setting.cfgKey) {
      return getKv(file, row.section, setting.cfgKey);
    }
    return undefined;
  }
  if (setting.cfgKey) {
    return getKv(file, 'init', setting.cfgKey);
  }
  return undefined;
}

function coerceEmpireValue(
  setting: DoorSetting,
  value: string | number | boolean
): string | number {
  if (setting.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${setting.label} must be a number`);
    if (setting.min !== undefined && n < setting.min) throw new Error(`${setting.label} must be at least ${setting.min}`);
    if (setting.max !== undefined && n > setting.max) throw new Error(`${setting.label} must be at most ${setting.max}`);
    return n;
  }
  if (setting.type === 'boolean') {
    // Empire files speak YES/NO.
    const yes = value === true || value === 'true' || value === 1 || String(value).toUpperCase() === 'YES';
    return yes ? 'YES' : 'NO';
  }
  if (setting.type === 'choice') {
    const allowed = (setting.choices ?? []).map(c => c.value);
    if (!allowed.includes(String(value))) {
      throw new Error(`${setting.label} must be one of: ${allowed.join(', ')}`);
    }
    return String(value);
  }
  const str = String(value);
  if (setting.pattern && !new RegExp(setting.pattern).test(str)) {
    throw new Error(`${setting.label} must match ${setting.pattern}`);
  }
  return str;
}

/** Grow a bull/mask section until `index` exists, scaffolding `-`/blank rows. */
function ensureEmpireRow(file: EmpireFile, kind: 'bull' | 'mask', index: number): void {
  if (kind === 'bull') {
    while (getBullRows(file).length <= index) {
      const n = getBullRows(file).length + 1;
      appendBullRow(file, { title: '-', file: `bull${n}.txt` });
    }
    return;
  }
  while (getMaskRows(file).length <= index) {
    const n = getMaskRows(file).length;
    appendMaskRow(file, '-'.repeat(20), `; Conference ${n + 1}`);
  }
}

function applyEmpireCell(
  entry: { file: EmpireFile; dirty: boolean },
  manifest: DoorSettingsManifest,
  setting: DoorSetting,
  value: string | number
): void {
  const str = String(value);
  const { file } = entry;
  const row = setting.cfgRow;
  const fileLabel = empireFileName(manifest, setting);
  if (row) {
    if (row.field === 'title' || row.field === 'file') {
      if (row.row === undefined) throw new Error(`${manifest.command}: ${setting.key} needs its row number`);
      ensureEmpireRow(file, 'bull', row.row);
      const ok = setBullRow(file, row.row, row.field === 'title' ? { title: str } : { file: str });
      if (!ok) throw new Error(`${setting.label} points past the bulletin list in ${fileLabel}`);
      entry.dirty = true;
      return;
    }
    if (row.field === 'mask') {
      if (row.row === undefined) throw new Error(`${manifest.command}: ${setting.key} needs its row number`);
      ensureEmpireRow(file, 'mask', row.row);
      const ok = setMaskRow(file, row.row, str);
      if (!ok) throw new Error(`${setting.label} points past the access list in ${fileLabel}`);
      entry.dirty = true;
      return;
    }
    if (setting.cfgKey) {
      const ok = setKv(file, row.section, setting.cfgKey, str);
      if (!ok) throw new Error(`${setting.label} names ${setting.cfgKey}, which ${fileLabel} does not have`);
      entry.dirty = true;
      return;
    }
    throw new Error(`${manifest.command}: ${setting.key} binds nothing writable`);
  }
  if (setting.cfgKey) {
    const ok = setKv(file, 'init', setting.cfgKey, str);
    if (!ok) throw new Error(`${setting.label} names ${setting.cfgKey}, which ${fileLabel} does not have`);
    entry.dirty = true;
    return;
  }
  throw new Error(`${manifest.command}: ${setting.key} binds nothing writable`);
}

function readEmpireSettingsView(doorDir: string, manifest: DoorSettingsManifest): DoorSettingsView {
  const loaded = loadEmpireFiles(doorDir, manifest);
  const fileFor = (setting: DoorSetting) => {
    const entry = loaded.get(empireFileName(manifest, setting));
    if (!entry) throw new Error(`${manifest.command}: ${setting.key} binds no loaded file`);
    return entry;
  };
  const values: Record<string, string | number | boolean> = {};
  const secretsSet: string[] = [];
  for (const setting of manifest.settings) {
    if (!setting.cfgKey && !setting.cfgRow) {
      // Display-only or future binding: fall back to the declared default.
      if (setting.default !== undefined) values[setting.key] = setting.default;
      continue;
    }
    const raw = readEmpireCell(fileFor(setting), manifest, setting);
    if (setting.secret) {
      if (raw !== undefined && raw !== null && raw !== '') secretsSet.push(setting.key);
      values[setting.key] = '';
      continue;
    }
    if (raw !== undefined && raw !== null && raw !== '') {
      if (setting.type === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n)) values[setting.key] = n;
        else if (setting.default !== undefined) values[setting.key] = setting.default;
      } else {
        values[setting.key] = raw as string | number | boolean;
      }
    } else if (setting.default !== undefined) {
      values[setting.key] = setting.default;
    }
  }
  return { manifest, values, secretsSet };
}

function writeEmpireSettings(
  doorDir: string,
  manifest: DoorSettingsManifest,
  declared: Map<string, DoorSetting>,
  incoming: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const loaded = loadEmpireFiles(doorDir, manifest);
  const fileFor = (setting: DoorSetting) => {
    const entry = loaded.get(empireFileName(manifest, setting));
    if (!entry) throw new Error(`${manifest.command}: ${setting.key} binds no loaded file`);
    return entry;
  };
  for (const [key, value] of Object.entries(incoming)) {
    const setting = declared.get(key)!;
    if (!setting.cfgKey && !setting.cfgRow) {
      throw new Error(`${setting.label} binds no file row — the manifest must say where it lives`);
    }
    if (setting.secret && (value === '' || value === null || value === undefined)) {
      continue;
    }
    const coerced = coerceEmpireValue(setting, value);
    applyEmpireCell(fileFor(setting), manifest, setting, coerced);
  }
  // Atomic per file, latin1 so art bytes survive, normal perms (no secrets here).
  for (const [name, entry] of loaded) {
    if (!entry.dirty) continue;
    const target = path.join(doorDir, name);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, Buffer.from(serializeEmpireFile(entry.file), 'latin1'));
    fs.renameSync(temp, target);
  }
  // Read back what the files now say.
  const view = readEmpireSettingsView(doorDir, manifest);
  return view.values;
}

/* ------------------------------------------------------------------ *
 * Door art sections (ANSI Studio).
 *
 * Some doors keep their art INSIDE a config file — Bulls' Title logo lives
 * in Bulls.CFG between the body lines and `[Title_END]`. No screen path
 * names it, so the Studio's file gallery can never list it; instead the
 * manifest declares `artSections` and these two functions read/write the
 * named section through the Empire driver. The artists get the Studio's
 * real canvas, the door keeps its single file, and the settings form never
 * shows a textarea pretending to be an art tool.
 * ------------------------------------------------------------------ */

export interface DoorArtSection {
  /** Bare filename inside the door directory (e.g. `Bulls.CFG`). */
  file: string;
  /** Section name without the marker suffix (`title` for `[Title_END]`). */
  section: string;
  /** What the Studio card says. */
  label: string;
  /** DOC limits (Bulls title: 20 lines, 200 chars per line). */
  maxLines: number;
  maxLineLength: number;
}

export interface DoorArtContent {
  file: string;
  section: string;
  label: string;
  /** Raw section body, base64 of the latin1 bytes (art carries ESC/high bytes). */
  content: string;
  lines: number;
  maxLines: number;
  maxLineLength: number;
}

function readArtManifest(doorDir: string): DoorSettingsManifest & { artSections: DoorArtSection[] } {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest) throw new Error('This door does not declare any settings');
  if (!manifest.artSections || manifest.artSections.length === 0) {
    throw new Error('This door declares no art sections for the Studio');
  }
  return { ...manifest, artSections: manifest.artSections };
}

function loadArtFile(doorDir: string, file: string): EmpireFile {
  const full = path.join(doorDir, file);
  let raw: Buffer;
  try {
    raw = fs.readFileSync(full);
  } catch {
    throw new Error(`${file} not found beside the door — nothing to draw yet`);
  }
  return parseEmpireFile(raw);
}

/** Every art section the manifest declares, with its current body. */
export function readDoorArtSections(doorDir: string): DoorArtContent[] {
  return listDoorArtSections(doorDir).map((entry) => {
    const file = loadArtFile(doorDir, entry.file);
    const body = getSectionBody(file, entry.section);
    if (!body) throw new Error(`${entry.file} has no [${entry.section}] section`);
    return {
      file: entry.file,
      section: entry.section,
      label: entry.label,
      content: Buffer.from(body.join('\n'), 'latin1').toString('base64'),
      lines: body.length,
      maxLines: entry.maxLines,
      maxLineLength: entry.maxLineLength,
    };
  });
}

export interface DoorArtListing {
  file: string;
  section: string;
  label: string;
  lines: number;
  maxLines: number;
  maxLineLength: number;
}

/** Declared art sections with live line counts, without the bodies. */
export function listDoorArtSections(doorDir: string): DoorArtListing[] {
  const manifest = readArtManifest(doorDir);
  return manifest.artSections.map((entry) => {
    const file = loadArtFile(doorDir, entry.file);
    const body = getSectionBody(file, entry.section);
    if (!body) throw new Error(`${entry.file} has no [${entry.section}] section`);
    return {
      file: entry.file,
      section: entry.section,
      label: entry.label,
      lines: body.length,
      maxLines: entry.maxLines,
      maxLineLength: entry.maxLineLength,
    };
  });
}

/**
 * Replace an art section body. Lines keep the file's own ending style;
 * validation follows the manifest limits (the door's DOC numbers).
 */
export function writeDoorArtSection(
  doorDir: string,
  fileName: string,
  section: string,
  contentBase64: string
): DoorArtContent {
  const manifest = readArtManifest(doorDir);
  const entry = manifest.artSections.find(
    (a) => a.file === fileName && a.section.toLowerCase() === section.toLowerCase()
  );
  if (!entry) throw new Error(`No art section ${section} in ${fileName} — the manifest must declare it`);
  const text = Buffer.from(contentBase64, 'base64').toString('latin1');
  const lines = text.split(/\r\n|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > entry.maxLines) {
    throw new Error(`${entry.label}: ${lines.length} lines, at most ${entry.maxLines}`);
  }
  for (const [i, line] of lines.entries()) {
    if (line.length > entry.maxLineLength) {
      throw new Error(`${entry.label} line ${i + 1}: ${line.length} chars, at most ${entry.maxLineLength}`);
    }
  }
  const full = path.join(doorDir, entry.file);
  const file = loadArtFile(doorDir, entry.file);
  if (!setSectionBody(file, entry.section, lines)) {
    throw new Error(`${entry.file} has no [${entry.section}] section`);
  }
  const temp = `${full}.tmp`;
  fs.writeFileSync(temp, Buffer.from(serializeEmpireFile(file), 'latin1'));
  fs.renameSync(temp, full);
  return readDoorArtSections(doorDir).find(
    (a) => a.file === entry.file && a.section.toLowerCase() === entry.section.toLowerCase()
  )!;
}
