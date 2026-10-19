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
import { boardListeners, boardListenerFor } from '../server/board-listeners';
import * as path from 'path';
import { isNativeError } from 'util/types';
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
   * This setting's VALUE names an art file in the door's own folder, so the
   * ANSI Studio offers it as a drawable slot and the picker writes this same
   * setting. Declared in C with AE_SETTING_ART. Only meaningful on a string.
   */
  art?: boolean;
  /** Editor limits for that slot. Omitted, the canvas ceilings apply. */
  artMaxLines?: number;
  artMaxLineLength?: number;
  /**
   * The files this slot's picker may offer, as values with `*` inside a
   * segment (`headers/*`, `bulletindesign/Tail*`). Omitted, the slot offers
   * only its default: a door folder holds many pieces and most of them belong
   * to OTHER slots - the magazine's title slot was offered every banner.
   */
  artChoices?: string[];
  /**
   * The 40-column drawings this DOOR reads for the slot - the Studio's C64
   * and Teletext tabs. Omitted, none: a tab whose drawing nothing reads is a
   * save that changes nothing a caller sees.
   */
  artVariants?: Array<'c64' | 'ttx'>;
  /**
   * Render this value into the door's legacy cfg file under this key, when the
   * manifest declares `cfgFile`. 68K/C doors cannot read settings.json - they
   * read a plain `Key=value` file beside the binary - so this is the bridge.
   */
  cfgKey?: string;
  /**
   * The value a narrow session (40-column PETSCII or teletext) reads
   * instead of the file's, via the 68K file shadow - the disk file and
   * every wide node are untouched. Bulls' DUAL_LISTING reads NO there so
   * bulletins lay out in one column that fits. Requires cfgKey: an
   * override without a file binding names nothing to rewrite.
   */
  narrowValue?: string;
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
  /**
   * Door commands this setting belongs to (`["B"]`, `["J"]`), compared
   * upper-cased. One directory can serve two doors - emp_tools serves
   * Bulls (B) and Joincnf (J) from a single door.settings.json - and
   * without this both forms show all 49 settings. Absent means every
   * command, which is every single-door manifest today.
   */
  commands?: string[];
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
  /** Folders whose every art file is a Studio slot. See ArtFolderSchema. */
  artFolders?: DoorArtFolder[];
  /**
   * Events this door raises with bbs.notify (`door.<command>.<slug>`). A door
   * that does not declare an event cannot send it, and nobody can opt in to it:
   * the NOTIFY door lists exactly these, under the door's own labels.
   */
  notifications?: DoorNotificationDecl[];
}

export interface DoorNotificationDecl {
  /** The last part of the event id: lowercase letters, digits, `-` and `_`. */
  slug: string;
  /** Full words the caller sees in NOTIFY. */
  label: string;
  description?: string;
}

export interface DoorArtFolder {
  /** Inside the door's folder, e.g. `art/fill`. */
  dir: string;
  label: string;
  maxLines: number;
  maxLineLength: number;
  commands?: string[];
}

/**
 * A bare filename beside the door's own cfg - no directory, no traversal.
 *
 * The dot had to be allowed for `Bulls.CFG`, and allowing it as the FIRST
 * character let `.` and `..` through: both match `[A-Za-z0-9._-]+`, and a
 * path joined with `..` leaves the door's directory. The first character is
 * never a dot now, so a name is a name.
 */
const BARE_FILE_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/*
 * QuickNew's config is not the `[Section_END]` shape everything else here
 * reads, and the number of editable templates is whatever the sysop
 * configured - so one manifest entry expands into two sections per area,
 * discovered from the file. See doors/quicknew-config.ts.
 */
import {
  parseQuickNewBlocks,
  quickNewSectionName,
  parseQuickNewSectionName,
  quickNewSectionLabel,
  replaceQuickNewTemplate,
  type QuickNewTemplate,
} from './quicknew-config';

const CfgRowSchema = z.object({
  section: z.string().min(1).max(32),
  row: z.number().int().min(0).max(9999).optional(),
  field: z.enum(['value', 'title', 'file', 'mask']),
});

const ArtSectionSchema = z.object({
  file: z.string().min(1).max(64).regex(BARE_FILE_RE),
  /**
   * How the file is cut into sections. `markers` is the `[Name_END]` shape the
   * empire cfg files use and stays the default, so no existing manifest
   * changes. `quicknew` is discovered from the file instead - its blocks are
   * however many areas the sysop configured - so `section` is absent there.
   */
  format: z.enum(['markers', 'quicknew']).optional(),
  section: z.string().min(1).max(32).optional(),
  label: z.string().min(1).max(80),
  maxLines: z.number().int().min(1).max(100),
  maxLineLength: z.number().int().min(1).max(1000),
  /**
   * Door commands this art belongs to, the same way a setting declares its
   * own. One directory can serve two doors - emp_tools is Bulls (B) and
   * Joincnf (J) out of one manifest - and each has its own logo in its own
   * file. Without this the sysop editing the bulletins would be offered the
   * conference banner as well, which is the duplication `commands` was added
   * to the settings for.
   */
  commands: z.array(z.string().min(1).max(20)).max(10).optional(),
});
/**
 * A folder of whole-file pieces the Studio lists one slot per file - the
 * magazine's filler, sixty-five pieces nobody would declare one by one.
 */
const ArtFolderSchema = z.object({
  dir: z.string().min(1).max(80).regex(ART_FOLDER_RE),
  label: z.string().min(1).max(80),
  maxLines: z.number().int().min(1).max(100),
  maxLineLength: z.number().int().min(1).max(1000),
  commands: z.array(z.string().min(1).max(20)).max(10).optional(),
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
  /**
   * The value names an art file - see DoorSetting.art. It MUST be declared
   * here: zod strips unknown keys, so a manifest carrying the flag against a
   * schema without it loses it between the file and every reader, and the
   * Studio draws nothing with no error anywhere.
   */
  art: z.boolean().optional(),
  artMaxLines: z.number().int().min(1).max(100).optional(),
  artMaxLineLength: z.number().int().min(1).max(1000).optional(),
  artChoices: z.array(z.string().min(1).max(80).regex(/^[A-Za-z0-9_*-][A-Za-z0-9._*-]*(\/[A-Za-z0-9_*-][A-Za-z0-9._*-]*)?$/)).max(20).optional(),
  artVariants: z.array(z.enum(['c64', 'ttx'])).max(2).optional(),
  cfgKey: z.string().min(1).max(64).optional(),
  narrowValue: z.string().min(1).max(64).optional(),
  fromSystemConfig: z.string().min(1).max(64).optional(),
  group: z.string().min(1).max(40).optional(),
  hidden: z.boolean().optional(),
  pattern: z.string().min(1).max(200).optional(),
  cfgFile: z.string().min(1).max(64).regex(BARE_FILE_RE).optional(),
  cfgRow: CfgRowSchema.optional(),
  commands: z.array(z.string().min(1).max(20)).max(10).optional(),
}).refine(
  s => s.type !== 'choice' || (s.choices?.length ?? 0) > 0,
  { message: 'a choice needs choices' }
).refine(
  s => !s.art || s.type === 'string',
  { message: 'art is only meaningful on a string setting - a number cannot name a file' }
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
).refine(
  s => s.narrowValue === undefined || s.cfgKey !== undefined,
  { message: 'narrowValue needs a cfgKey to rewrite' }
);

const ManifestSchema = z.object({
  command: z.string().min(1).max(50),
  settings: z.array(SettingSchema).max(200),
  // Bare filename: no separators, no traversal. The cfg is written INSIDE the
  // door directory and nowhere else.
  cfgFile: z.string().min(1).max(64).regex(BARE_FILE_RE).optional(),
  cfgFormat: z.enum(['key-value', 'empire']).optional(),
  artSections: z.array(ArtSectionSchema).max(10).optional(),
  artFolders: z.array(ArtFolderSchema).max(10).optional(),
  notifications: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9_-]+$/).max(40),
    label: z.string().min(1).max(60),
    description: z.string().max(200).optional(),
  })).max(20).optional(),
});

/**
 * Whether the admin has anything to show for a manifest: a setting, an art
 * block or an art folder. A manifest that only declares `notifications` is
 * read by NOTIFY, not by the admin, and must not put a badge on the door.
 */
export function hasAdminContent(manifest: DoorSettingsManifest): boolean {
  return manifest.settings.length + (manifest.artSections?.length ?? 0) + (manifest.artFolders?.length ?? 0) > 0;
}

/**
 * The door's declaration, or null when it has none - the normal case.
 *
 * Exported because it is the ONE reader of door.settings.json: the schema
 * below is what decides whether a manifest is a manifest, and a second parser
 * elsewhere accepts files this one rejects and misses fields this one knows.
 * The 68K narrow-config shadow had its own `JSON.parse` until 2026-09-13.
 */
export function readManifestFromDir(doorDir: string): DoorSettingsManifest | null {
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

  const slugs = new Set<string>();
  for (const n of result.data.notifications ?? []) {
    if (slugs.has(n.slug)) throw new Error(`${file}: declares notification ${n.slug} twice`);
    slugs.add(n.slug);
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
/** The manifest as one requesting door command sees it. */
function scopeManifest(
  manifest: DoorSettingsManifest,
  command: string | undefined,
): DoorSettingsManifest {
  if (!command) return manifest;
  const want = command.toUpperCase();
  const belongs = (declared: string[] | undefined) =>
    !declared || declared.some(c => c.toUpperCase() === want);
  const settings = manifest.settings.filter(s => belongs(s.commands));
  const artSections = manifest.artSections?.filter(a => belongs(a.commands));
  return { ...manifest, settings, artSections };
}

export function readDoorSettingsView(doorDir: string, command?: string): DoorSettingsView | null {
  const found = readManifestFromDir(doorDir);
  if (!found) return null;
  const manifest = scopeManifest(found, command);

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
/**
 * A door may not be pointed at the board's own listener.
 *
 * The board is one node process - the API, telnet, SSH, FTP and every 68K
 * door's emulator. A door that opens a socket to one of those ports is
 * talking to the process running it: the emulator parks in
 * `deasync.loopWhile`, which accepts the connection but cannot drain
 * microtasks from where it is called, so the request it is waiting for can
 * never finish. The board stops answering ANYONE - not just this door.
 *
 * It is not hypothetical. On 2026-09-13 the Text-TV door shipped with
 * Host=127.0.0.1 Port=3001 and every caller was locked off the live board
 * until the container was recreated. No shipped door needs the board's own
 * port now, so this refuses rather than warns.
 *
 * The ports are asked for, never restated - see server/board-listeners.ts.
 */
interface DeadlyListener {
  /** The setting key holding the port. */
  key: string;
  port: number;
  /** What the board serves on it, for a message a sysop can act on. */
  serves: string;
  /** The manifest's own default, to fall back to. */
  fallback: string | number;
}

/**
 * Is this door aimed at the board's own listener?
 *
 * ONE detector, asked by both the save (which refuses) and the boot render
 * (which repairs). Two copies of this rule would be two chances to disagree
 * about which ports are deadly.
 *
 * The host and port are found by what the manifest calls them, so a door that
 * dials no socket has neither and is never considered.
 */
function boardsOwnListenerIn(
  values: Record<string, string | number | boolean>,
  declared: Map<string, DoorSetting>
): DeadlyListener | undefined {
  const keyFor = (re: RegExp): string | undefined =>
    [...declared.keys()].find((k) => re.test(k) || re.test(String(declared.get(k)?.cfgKey ?? '')));

  const hostKey = keyFor(/^host$/i);
  const portKey = keyFor(/^port$/i);
  if (!hostKey || !portKey) return undefined;

  const host = String(values[hostKey] ?? '');
  const port = Number(values[portKey]);
  if (!Number.isFinite(port)) return undefined;

  const listener = boardListenerFor(host, port, boardListeners());
  if (!listener) return undefined;

  return {
    key: portKey,
    port,
    serves: listener.serves,
    // A port default is a number or a numeric string; a boolean default on a
    // port setting is a malformed manifest, and '' is the honest answer.
    fallback: (() => {
      const d = declared.get(portKey)?.default;
      return typeof d === 'string' || typeof d === 'number' ? d : '';
    })(),
  };
}

/**
 * A door may not be SAVED pointed at the board's own listener.
 *
 * The board is one node process - the API, telnet, SSH, FTP and every 68K
 * door's emulator. A door that opens a socket to one of those ports is
 * talking to the process running it: the emulator parks in
 * `deasync.loopWhile`, which accepts the connection but cannot drain
 * microtasks from where it is called, so the request it waits for can never
 * finish. The board stops answering ANYONE - not just this door.
 *
 * It is not hypothetical. On 2026-09-13 the Text-TV door shipped with
 * Host=127.0.0.1 Port=3001 and every caller was locked off the live board
 * until the container was recreated. No shipped door needs the board's own
 * port, so a save refuses; the boot render repairs instead, because failing
 * startup over one door's setting is worse than the bug.
 */
function refuseBoardsOwnListener(
  values: Record<string, string | number | boolean>,
  declared: Map<string, DoorSetting>
): void {
  const deadly = boardsOwnListenerIn(values, declared);
  if (!deadly) return;

  throw new Error(
    `Port ${deadly.port} is the board's own listener - it serves ${deadly.serves}. ` +
    `A door that connects to it talks to the process running it, which parks ` +
    `the board's event loop and locks every caller out until the container is ` +
    `restarted. Point this door at its own service instead.`
  );
}

export function writeDoorSettings(
  doorDir: string,
  incoming: Record<string, string | number | boolean>,
  resolveSystemValue?: SystemValueResolver,
  command?: string,
): Record<string, string | number | boolean> {
  const found = readManifestFromDir(doorDir);
  if (!found) {
    throw new Error('This door does not declare any settings');
  }
  const manifest = scopeManifest(found, command);

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

  // Before a byte is written: refuse a door aimed at the board itself.
  refuseBoardsOwnListener(out, declared);

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

/**
 * One line, whatever the sysop typed.
 *
 * Every one of these formats is line-oriented: a newline inside a value does
 * not escape, it ends the line and the rest becomes a new record. In an Empire
 * file that means a title can forge `[Init_END]` and a whole section with it.
 * Both writers ask this, so the rule cannot drift between them again.
 */
export function oneCfgLine(value: string | number): string {
  return String(value).replace(/[\r\n]+/g, ' ');
}

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
  const resolved: Record<string, string | number | boolean> = {};
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
    resolved[setting.key] = raw as string | number | boolean;
    // One line per key, no quoting: that is the format these doors parse.
    lines.push(`${setting.cfgKey}=${oneCfgLine(raw as string)}`);
  }

  // REPAIR, not refuse.
  //
  // The save path turns away a door aimed at the board's own listener, but a
  // settings.json written before that guard existed still holds one - and
  // this runs at every boot, for every door. Refusing here would fail the
  // board's startup over one door's setting, which is worse than the bug. So
  // a deadly value is replaced by the manifest's own default and said out
  // loud, and the door comes up pointed somewhere survivable.
  const deadly = boardsOwnListenerIn(resolved, new Map(manifest.settings.map((x) => [x.key, x])));
  if (deadly) {
    console.log(
      `[DoorSettings] ${manifest.command}: ${deadly.key}=${deadly.port} is the board's own ` +
      `listener (${deadly.serves}). A door that dials it parks the board's event loop and ` +
      `locks every caller out. Using the door's default (${deadly.fallback}) instead - ` +
      `set a real one in the admin.`
    );
    for (let i = 0; i < manifest.settings.length; i++) {
      const setting = manifest.settings[i];
      if (setting.key !== deadly.key || !setting.cfgKey) continue;
      const at = lines.findIndex((l) => l.startsWith(`${setting.cfgKey}=`));
      if (at >= 0) lines[at] = `${setting.cfgKey}=${oneCfgLine(deadly.fallback)}`;
    }
  }

  const target = path.join(doorDir, manifest.cfgFile);
  const temp = `${target}.tmp`;
  const merged = mergeIntoCfg(target, lines);
  // The file could not be read and was not absent: it keeps what it has.
  if (merged === null) return target;
  fs.writeFileSync(temp, merged, { mode: 0o600 });
  fs.renameSync(temp, target);
  return target;
}

/**
 * The rendered lines folded INTO the file that is already there, rather than
 * over it.
 *
 * This used to write `lines.join('\n')` and nothing else, which made the
 * manifest the whole truth of the file: every comment went, and so did every
 * key the manifest did not happen to model. That is a silent, delayed
 * failure - it happens at the next boot, to a door nobody touched, because
 * `renderAllDoorCfgs` runs for every manifest with a `cfgFile`.
 *
 * It bit `Doors/DoorRepo/DoorRepo.cfg` on 2026-09-14, the first time that
 * door was given a manifest: the seven-line header explaining why its paths
 * must be AmigaDOS assigns, and a `KeepFailedDownloads` flag left over from
 * an open checksum investigation, were both deleted from a TRACKED file. The
 * flag's own comment said a deploy rewrites this file from the repo - and
 * this is the code that does the rewriting.
 *
 * So: a key the manifest owns is REPLACED where it stands, keeping the file's
 * order and the comments around it; a key it does not own is left exactly as
 * it was; anything that is not a key - comments, blank lines - is untouched.
 * Keys the file does not have yet are appended. A file that does not exist is
 * created from the rendered lines alone, which is the old behaviour and the
 * right one for a door being configured for the first time.
 */
function mergeIntoCfg(target: string, lines: string[]): string | null {
  /*
   * A READ THAT FAILS IS NOT A READ THAT FOUND NOTHING.
   *
   * Rendering the settings alone is right for a door being configured for the
   * FIRST time and wrong for every other reason a read can fail, because it
   * throws away the comments and the keys the manifest does not model.
   *
   * The write below is `writeFileSync(temp)` then `renameSync(temp, target)`,
   * so when several boots run against one tree - jest workers each starting a
   * server, which is how `renderAllDoorCfgs` reaches the real `Doors/` - one
   * render's read lands in the window where another's rename has the path
   * swapped out. `readFileSync` throws ENOENT for a file that plainly exists
   * and is about to exist again. Taking that as "no file yet" is what emptied
   * the prose out of `Doors/GWall/GWALL.cfg` and `Doors/glc/GLCViewer.cfg` on
   * 2026-09-14: settings intact, comments gone, not one line added. Diagnosed
   * by session_014HgB.
   *
   * So the question asked first is whether the file was THERE, and a read
   * that fails on a file that was there means this render does not get to
   * rewrite it. Returning null tells the caller to leave it alone: a cfg that
   * keeps yesterday's comments beats one that loses them.
   */
  const wasThere = fs.existsSync(target);
  let existing: string;
  try {
    existing = fs.readFileSync(target, 'utf8');
  } catch (error) {
    // `instanceof Error` is false for a native errno error raised in another
    // realm, which is every fs error under jest - see the errno-classifying
    // note in the repo's test notes. `isNativeError` is realm-safe.
    const code = isNativeError(error) ? (error as NodeJS.ErrnoException).code : undefined;
    if (wasThere || code !== 'ENOENT') {
      console.warn(
        `[DoorSettings] ${path.basename(target)}: could not be read (${code ?? 'unknown'}) - ` +
        `leaving it as it is rather than rewriting it from the manifest.`
      );
      return null;
    }
    return lines.join('\n') + '\n';
  }

  /** `KEY=value` -> KEY, for a line that is a setting rather than prose. */
  const keyOf = (line: string): string | null => {
    const trimmed = line.trim();
    // `;` and `#` both start a comment in the cfgs these doors read, and a
    // line with no `=` is not a setting however it looks.
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return null;
    const at = trimmed.indexOf('=');
    return at > 0 ? trimmed.slice(0, at).trim().toLowerCase() : null;
  };

  const rendered = new Map<string, string>();
  for (const line of lines) {
    const key = keyOf(line);
    if (key) rendered.set(key, line);
  }

  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const endsWithBreak = /\r?\n$/.test(existing);
  const body = existing.split(/\r?\n/);
  if (endsWithBreak) body.pop();   // the empty string after a trailing break

  const written = new Set<string>();
  const merged = body.map(line => {
    const key = keyOf(line);
    if (!key || !rendered.has(key)) return line;   // prose, or not ours
    written.add(key);
    return rendered.get(key)!;
  });

  // A setting the file has never carried goes on the end, in manifest order.
  for (const [key, line] of rendered) {
    if (!written.has(key)) merged.push(line);
  }

  return merged.join(eol) + eol;
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
  BULL_SECTION,
  MASK_SECTION,
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
      // BULL_SECTION, not `row.section`. For a row setting `cfgRow.section`
      // is a LABEL for the admin form - emp_tools writes "masks" for all 39
      // conference rows - and no such section exists in the file. Only the
      // `field:'value'` KV branch below reads it as a real section name.
      const rows = getBullRows(file, BULL_SECTION);
      const found = rows[row.row ?? -1];
      if (!found) return undefined;
      return row.field === 'title' ? found.title : found.file;
    }
    if (row.field === 'mask') {
      const masks = getMaskRows(file, MASK_SECTION);
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
  const str = oneCfgLine(String(value));
  // A semicolon starts a comment in an Empire file, and in a bull row it is
  // the delimiter between the title and its filename. Either way the format
  // cannot carry one inside a value: saving "a; ATTACK" read back as "a", so
  // the sysop's text was lost between the save and the next form load. Say so
  // rather than truncate.
  if (str.includes(';')) {
    throw new Error(`${setting.label} cannot contain a semicolon - these files read it as a comment`);
  }
  if (setting.pattern && !new RegExp(setting.pattern).test(str)) {
    throw new Error(`${setting.label} must match ${setting.pattern}`);
  }
  return str;
}

/**
 * Grow a bull/mask section until `index` exists, scaffolding `-`/blank rows.
 *
 * The append answers false when there is no section to append to - a
 * `Bulls.CFG` that has lost its `[BullNames_END]` marker, say. `getBullRows`
 * answers `[]` for that same file, so a loop that ignores the answer never
 * grows and never ends: one PUT pinned a core and hung every caller, socket
 * and door until the board was restarted. A refused append ends the walk.
 */
function ensureEmpireRow(
  file: EmpireFile,
  kind: 'bull' | 'mask',
  index: number,
  fileLabel: string,
  section: string
): void {
  if (kind === 'bull') {
    while (getBullRows(file, section).length <= index) {
      const n = getBullRows(file, section).length + 1;
      if (!appendBullRow(file, { title: '-', file: `bull${n}.txt` }, section)) {
        throw new Error(
          `${fileLabel} has no bulletin list to grow - its [BullNames_END] marker is missing`
        );
      }
    }
    return;
  }
  while (getMaskRows(file, section).length <= index) {
    const n = getMaskRows(file, section).length;
    if (!appendMaskRow(file, '-'.repeat(20), `; Conference ${n + 1}`, section)) {
      throw new Error(
        `${fileLabel} has no conference access list to grow - its [CnfAccess_END] marker is missing`
      );
    }
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
      ensureEmpireRow(file, 'bull', row.row, fileLabel, BULL_SECTION);
      const ok = setBullRow(file, row.row, row.field === 'title' ? { title: str } : { file: str }, BULL_SECTION);
      if (!ok) throw new Error(`${setting.label} points past the bulletin list in ${fileLabel}`);
      entry.dirty = true;
      return;
    }
    if (row.field === 'mask') {
      if (row.row === undefined) throw new Error(`${manifest.command}: ${setting.key} needs its row number`);
      ensureEmpireRow(file, 'mask', row.row, fileLabel, MASK_SECTION);
      const ok = setMaskRow(file, row.row, str, MASK_SECTION);
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

  // Same refusal as the JSON writer, before anything is written: no shipped
  // Empire door dials a socket today, but the rule belongs to "a door's
  // settings", not to one of the two formats that store them.
  refuseBoardsOwnListener(
    { ...readEmpireSettingsView(doorDir, manifest).values, ...incoming },
    declared
  );

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

import {
  readVariant,
  writeVariant,
  VARIANT_COLUMNS,
  alphabetOfVariant,
  type ArtAlphabet,
  type ArtVariant,
} from './door-art-variants';
import {
  resolveArtValue,
  listArtChoices,
  artFileLines,
  artChoiceMatches,
  listArtFolder,
  resolveArtFolderFile,
  ART_FOLDER_RE,
} from './door-art-file';

export interface DoorArtSection {
  /** Bare filename inside the door directory (e.g. `Bulls.CFG`). */
  file: string;
  /** How the file is cut up; `markers` when absent. */
  format?: 'markers' | 'quicknew';
  /** Section name without the marker suffix; absent for discovered formats. */
  section?: string;
  /** What the Studio card says. */
  label: string;
  /** DOC limits (Bulls title: 20 lines, 200 chars per line). */
  maxLines: number;
  maxLineLength: number;
  /**
   * Door commands this art belongs to, upper-cased on comparison. Absent
   * means every command, which is every single-door manifest. See the
   * schema above for why a shared directory needs it.
   */
  commands?: string[];
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
  /**
   * Which narrow drawings exist for this section, so the Studio can say
   * "not drawn yet" rather than open a blank canvas that looks the same as
   * a drawing somebody made and emptied.
   */
  variants: { c64: boolean; ttx: boolean; tti: boolean };
  /** The narrow tabs the Studio offers: the drawings this door actually reads. */
  offers: ArtAlphabet[];
}

/**
 * Which 40-column drawings a door reads, per kind of slot. A section in a
 * config file is served both by the Empire narrow shadow; a setting's file
 * only by a door that says so (`artVariants`); a folder piece by none.
 */
const SECTION_OFFERS: ArtAlphabet[] = ['c64', 'ttx'];

/**
 * The art this DOOR declares.
 *
 * `command` matters where one directory serves two doors: emp_tools holds
 * Bulls' title logo in Bulls.CFG and Joincnf's conference banner in
 * joincnf.cfg, and the sysop editing one has no business being offered the
 * other. Omitted, every section comes back - which is every single-door
 * manifest, and what the Studio's own listing wants when it asks per door.
 */
function readArtManifest(
  doorDir: string,
  command?: string,
): DoorSettingsManifest & { artSections: DoorArtSection[]; artSettings: DoorSetting[]; artFolders: DoorArtFolder[] } {
  const manifest = readManifestFromDir(doorDir);
  if (!manifest) throw new Error('This door does not declare any settings');
  const want = command ? command.toUpperCase() : null;
  const scoped = <T extends { commands?: string[] }>(x: T): boolean =>
    !want || !x.commands || x.commands.some(c => c.toUpperCase() === want);
  const sections = (manifest.artSections ?? []).filter(scoped);
  /**
   * A door can also declare art by marking a SETTING whose value names a
   * file - see DoorSetting.art. Those are slots too, and a door may have only
   * that kind, so the "declares no art" refusal has to consider both.
   */
  const artSettings = (manifest.settings ?? []).filter(x => x.art && scoped(x));
  const artFolders = (manifest.artFolders ?? []).filter(scoped);
  if (sections.length === 0 && artSettings.length === 0 && artFolders.length === 0) {
    throw new Error('This door declares no art sections for the Studio');
  }
  return { ...manifest, artSections: sections, artSettings, artFolders };
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

/**
 * Every art section the manifest declares, with its current body.
 *
 * `artRoot` is the board's Screens directory. Without it the narrow
 * drawings cannot be looked for and every section reports none - which is
 * what the callers that do not care about variants want.
 */
export function readDoorArtSections(
  doorDir: string,
  command?: string,
  artRoot?: string,
): DoorArtContent[] {
  return listDoorArtSections(doorDir, command).map((entry) => {
    const drawnFor = (section: string) => (alphabet: ArtVariant): boolean =>
      !!artRoot && !!command && readVariant(artRoot, command, section, alphabet) !== null;

    /**
     * A file-backed slot is the whole file, not a section cut out of one. A
     * missing file reads as an empty canvas rather than a throw - the setting
     * names something that is not there, which the listing already reports and
     * the Studio answers with the picker.
     */
    const settingKey = artSettingKey(entry.section);
    const folderPiece = artFolderPiece(entry.section);
    if (settingKey !== null || folderPiece !== null) {
      const body = entry.missing
        ? ''
        : fs.readFileSync(
          folderPiece ? resolveArtFolderFile(doorDir, folderPiece.dir, folderPiece.name) : resolveArtValue(doorDir, entry.file),
          'latin1',
        );
      const drawn = drawnFor(entry.section);
      return {
        file: entry.file,
        section: entry.section,
        label: entry.label,
        content: Buffer.from(body, 'latin1').toString('base64'),
        lines: entry.lines,
        maxLines: entry.maxLines,
        maxLineLength: entry.maxLineLength,
        variants: { c64: drawn('c64'), ttx: drawn('ttx'), tti: drawn('tti') },
        offers: entry.offers ?? [],
      };
    }

    const discovered = parseQuickNewSectionName(entry.section);
    const body = discovered
      ? quickNewBody(doorDir, entry.file, discovered)
      : getSectionBody(loadArtFile(doorDir, entry.file), entry.section);
    if (!body) throw new Error(`${entry.file} has no [${entry.section}] section`);
    const drawn = (alphabet: ArtVariant): boolean =>
      !!artRoot && !!command && readVariant(artRoot, command, entry.section, alphabet) !== null;
    return {
      file: entry.file,
      section: entry.section,
      label: entry.label,
      content: Buffer.from(body.join('\n'), 'latin1').toString('base64'),
      lines: body.length,
      maxLines: entry.maxLines,
      maxLineLength: entry.maxLineLength,
      variants: { c64: drawn('c64'), ttx: drawn('ttx'), tti: drawn('tti') },
      offers: entry.offers ?? SECTION_OFFERS,
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
  /**
   * The setting names a file that is not there. The Studio offers the PICKER
   * and not the editor - a door whose art setting points at something deleted
   * must not take the whole door-art tab down with it.
   */
  missing?: boolean;
  /** For a file-backed slot: the files this slot may draw, as a picker's options. */
  choices?: Array<{ file: string; lines: number }>;
  /** The narrow tabs the Studio offers for this slot. */
  offers?: ArtAlphabet[];
}

/**
 * The section name an art SETTING is addressed by.
 *
 * Namespaced so it can never collide with an Empire section name, and stable
 * across a file swap - which is what lets the C64 and Teletext variants, which
 * are stored per section, survive the picker changing which file the wide slot
 * draws.
 */
export const artSettingSection = (key: string): string => `setting:${key}`;
export const artSettingKey = (section: string): string | null =>
  section.startsWith('setting:') ? section.slice('setting:'.length) : null;

/** A folder piece is addressed `folder:<dir>/<name>`; its file is `<dir>/<name>`. */
export const artFolderSection = (dir: string, name: string): string => `folder:${dir}/${name}`;
export function artFolderPiece(section: string): { dir: string; name: string } | null {
  if (!section.startsWith('folder:')) return null;
  const rel = section.slice('folder:'.length);
  const cut = rel.lastIndexOf('/');
  if (cut <= 0) return null;
  return { dir: rel.slice(0, cut), name: rel.slice(cut + 1) };
}

/**
 * What one slot's picker offers: the door's art files its `artChoices`
 * patterns match - its default alone when it declares none - and the file it
 * names now, so the control always has its own value.
 */
function choicesFor(doorDir: string, setting: DoorSetting, current: string): Array<{ file: string; lines: number }> {
  const patterns = setting.artChoices ?? (typeof setting.default === 'string' ? [setting.default] : []);
  return listArtChoices(doorDir).filter(
    (c) => c.file === current || patterns.some((p) => artChoiceMatches(p, c.file)),
  );
}

/** The slots a door's art FOLDERS contribute: one per art file in each. */
function artFolderListings(doorDir: string, command?: string): DoorArtListing[] {
  const manifest = readArtManifest(doorDir, command);
  return manifest.artFolders.flatMap((folder) =>
    listArtFolder(doorDir, folder.dir).map((piece) => ({
      file: `${folder.dir}/${piece.name}`,
      section: artFolderSection(folder.dir, piece.name),
      label: `${folder.label}: ${piece.name}`,
      lines: piece.lines,
      maxLines: folder.maxLines,
      maxLineLength: folder.maxLineLength,
      offers: [],
    })),
  );
}

/** The slots a door's art SETTINGS contribute, with live line counts. */
function artSettingListings(doorDir: string, command?: string): DoorArtListing[] {
  const manifest = readArtManifest(doorDir, command);
  const values = readValuesFromDir(doorDir);
  return manifest.artSettings.map((setting) => {
    const value = String(values[setting.key] ?? setting.default ?? '');
    let lines = 0;
    let missing = true;
    try {
      lines = artFileLines(resolveArtValue(doorDir, value));
      missing = false;
    } catch {
      /* the picker, not the editor */
    }
    return {
      file: value,
      section: artSettingSection(setting.key),
      label: setting.label,
      lines,
      missing,
      maxLines: setting.artMaxLines ?? 100,
      maxLineLength: setting.artMaxLineLength ?? 1000,
      choices: choicesFor(doorDir, setting, value),
      offers: setting.artVariants ?? [],
    };
  });
}

/** Declared art sections with live line counts, without the bodies. */
export function listDoorArtSections(doorDir: string, command?: string): DoorArtListing[] {
  const manifest = readArtManifest(doorDir, command);
  // flatMap, not map: a discovered format turns ONE manifest entry into two
  // sections per configured area. The art SETTINGS are appended after, so a
  // door that declares both keeps its config sections first.
  const sections = manifest.artSections.flatMap((entry) => {
    if (entry.format === 'quicknew') {
      return quickNewListings(doorDir, entry);
    }
    const file = loadArtFile(doorDir, entry.file);
    const body = getSectionBody(file, entry.section!);
    if (!body) throw new Error(`${entry.file} has no [${entry.section}] section`);
    return [{
      file: entry.file,
      section: entry.section!,
      label: entry.label,
      lines: body.length,
      maxLines: entry.maxLines,
      maxLineLength: entry.maxLineLength,
    }];
  });
  return [...sections, ...artSettingListings(doorDir, command), ...artFolderListings(doorDir, command)];
}

/** Read QuickNew's config as one editable template per heading and stats line. */
function quickNewText(doorDir: string, fileName: string): string {
  return fs.readFileSync(path.join(doorDir, fileName), 'latin1');
}

function quickNewListings(doorDir: string, entry: DoorArtSection): DoorArtListing[] {
  return parseQuickNewBlocks(quickNewText(doorDir, entry.file)).flatMap((block) =>
    (['header', 'stats'] as QuickNewTemplate[]).map((which) => ({
      file: entry.file,
      section: quickNewSectionName(block.index, which),
      label: quickNewSectionLabel(block, which),
      // One line, and the door's own width. A second line would shift every
      // area after it and re-point the headings at the wrong conferences.
      lines: 1,
      maxLines: 1,
      maxLineLength: entry.maxLineLength,
    }))
  );
}

/**
 * Replace an art section body. Lines keep the file's own ending style;
 * validation follows the manifest limits (the door's DOC numbers).
 */
/** One QuickNew template as a one-line body, or null when the block is gone. */
function quickNewBody(
  doorDir: string,
  fileName: string,
  at: { index: number; which: QuickNewTemplate }
): string[] | null {
  const block = parseQuickNewBlocks(quickNewText(doorDir, fileName)).find(b => b.index === at.index);
  if (!block) return null;
  return [at.which === 'header' ? block.header : block.stats];
}

export function writeDoorArtSection(
  doorDir: string,
  fileName: string,
  section: string,
  contentBase64: string,
  command?: string
): DoorArtContent {
  // Scoped like the read and like a settings PUT: a request in one door's
  // name cannot rewrite the other door's logo just by naming its file.
  const manifest = readArtManifest(doorDir, command);

  /**
   * A file-backed slot: the whole file is the body.
   *
   * `fileName` comes from the request, but only a value this setting could
   * legally hold, resolved inside the door - so a request in one door's name
   * cannot write another's file, exactly as for a section. The file need not
   * be the one the setting currently names: the Studio saves a drawing into
   * whichever alternate the artist has open.
   */
  const settingKey = artSettingKey(section);
  if (settingKey !== null) {
    const declared = manifest.artSettings.find((x) => x.key === settingKey);
    if (!declared) throw new Error(`No art setting ${settingKey} — the manifest must declare it`);
    const full = resolveArtValue(doorDir, fileName);
    fs.writeFileSync(full, Buffer.from(contentBase64, 'base64').toString('latin1'), 'latin1');
    const written = readDoorArtSections(doorDir, command).find((c) => c.section === section);
    if (!written) throw new Error(`${section} vanished between the write and the read`);
    return written;
  }

  /**
   * A folder piece: the whole file, inside the folder the manifest declares,
   * held to the folder's limits. The file must already be one of its pieces -
   * the Studio edits what is there, it does not mint names.
   */
  const piece = artFolderPiece(section);
  if (piece !== null) {
    const folder = manifest.artFolders.find((f) => f.dir === piece.dir);
    if (!folder || fileName !== `${piece.dir}/${piece.name}`) {
      throw new Error(`No art folder ${piece.dir} - the manifest must declare it`);
    }
    const full = resolveArtFolderFile(doorDir, folder.dir, piece.name);
    if (!fs.existsSync(full)) throw new Error(`${fileName} not found in ${folder.dir}`);
    const text = Buffer.from(contentBase64, 'base64').toString('latin1');
    const rows = text.split(/\r\n|\n/);
    if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
    if (rows.length > folder.maxLines) {
      throw new Error(`${folder.label}: ${rows.length} lines, at most ${folder.maxLines}`);
    }
    const temp = `${full}.tmp`;
    fs.writeFileSync(temp, Buffer.from(text, 'latin1'));
    fs.renameSync(temp, full);
    const written = readDoorArtSections(doorDir, command).find((c) => c.section === section);
    if (!written) throw new Error(`${section} vanished between the write and the read`);
    return written;
  }

  const discovered = parseQuickNewSectionName(section);
  const entry = manifest.artSections.find((a) =>
    a.file === fileName &&
    (discovered
      ? a.format === 'quicknew'
      : (a.section ?? '').toLowerCase() === section.toLowerCase())
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
  const temp = `${full}.tmp`;

  if (discovered) {
    // Line-for-line, so the preamble's form feed and colour prefixes - which
    // nothing here understands - survive the sysop editing a heading.
    const updated = replaceQuickNewTemplate(
      quickNewText(doorDir, entry.file), discovered.index, discovered.which, lines[0] ?? ''
    );
    fs.writeFileSync(temp, Buffer.from(updated, 'latin1'));
    fs.renameSync(temp, full);
  } else {
    const file = loadArtFile(doorDir, entry.file);
    if (!setSectionBody(file, entry.section!, lines)) {
      throw new Error(`${entry.file} has no [${entry.section}] section`);
    }
    fs.writeFileSync(temp, Buffer.from(serializeEmpireFile(file), 'latin1'));
    fs.renameSync(temp, full);
  }

  return readDoorArtSections(doorDir, command).find(
    (a) => a.file === entry.file && a.section.toLowerCase() === section.toLowerCase()
  )!;
}

/**
 * The section entry this door declares, or a throw.
 *
 * Scoped like every other art call: a request in one door's name cannot
 * reach the other door's logo just by naming its file.
 */
function artEntryFor(
  doorDir: string,
  command: string,
  fileName: string,
  section: string,
  variant: ArtVariant,
): { file: string; label: string; maxLines: number } {
  const manifest = readArtManifest(doorDir, command);
  // A `.tti` is the teletext caller's drawing: a door that reads a ttx
  // drawing reads this one too, so the declaration asked about is the ttx one.
  const alphabet = alphabetOfVariant(variant);
  /*
   * A setting's slot draws its narrow versions too - when its door reads them.
   * This lookup used to know only config sections, so every C64 or Teletext
   * save on a setting slot (MAG, GLC) failed with "the manifest must declare
   * it" while the tab sat there offering itself.
   */
  const settingKey = artSettingKey(section);
  if (settingKey !== null || artFolderPiece(section) !== null) {
    const setting = settingKey !== null ? manifest.artSettings.find((x) => x.key === settingKey) : undefined;
    if (!setting) throw new Error(`No art setting ${section} - the manifest must declare it`);
    if (!(setting.artVariants ?? []).includes(alphabet)) {
      throw new Error(`${setting.label}: this door does not read a ${alphabet} drawing, so it must be declared in artVariants first`);
    }
    return { file: fileName, label: setting.label, maxLines: setting.artMaxLines ?? 100 };
  }
  const entry = manifest.artSections.find(
    (a) => a.file === fileName &&
      ((a.section ?? '').toLowerCase() === section.toLowerCase() ||
       // A discovered section names no entry of its own; the manifest entry
       // that produced it is the one for the whole file.
       (a.format === 'quicknew' && parseQuickNewSectionName(section) !== null)),
  );
  if (!entry) throw new Error(`No art section ${section} in ${fileName} - the manifest must declare it`);
  return entry;
}

/**
 * One narrow drawing, or empty content when it has never been drawn.
 *
 * An empty canvas is the honest answer for a variant nobody has made: the
 * Studio opens it and the artist starts drawing. `maxLineLength` is the
 * caller's FORTY columns, not the door's DOC number - that is the one limit
 * that differs between the wide art and a variant.
 */
export function readDoorArtVariant(
  doorDir: string,
  artRoot: string,
  command: string,
  fileName: string,
  section: string,
  variant: ArtVariant,
): DoorArtContent {
  const entry = artEntryFor(doorDir, command, fileName, section, variant);
  const lines = readVariant(artRoot, command, section, variant) ?? [];
  return {
    file: entry.file,
    section,
    label: entry.label,
    content: Buffer.from(lines.join('\n'), 'latin1').toString('base64'),
    lines: lines.length,
    maxLines: entry.maxLines,
    maxLineLength: VARIANT_COLUMNS,
    variants: {
      c64: readVariant(artRoot, command, section, 'c64') !== null,
      ttx: readVariant(artRoot, command, section, 'ttx') !== null,
      tti: readVariant(artRoot, command, section, 'tti') !== null,
    },
    offers: artSettingKey(section) !== null
      ? (readArtManifest(doorDir, command).artSettings.find((x) => x.key === artSettingKey(section))?.artVariants ?? [])
      : SECTION_OFFERS,
  };
}

/** Save one narrow drawing. The door's own file is never touched. */
export function writeDoorArtVariant(
  doorDir: string,
  artRoot: string,
  command: string,
  fileName: string,
  section: string,
  variant: ArtVariant,
  contentBase64: string,
): DoorArtContent {
  const entry = artEntryFor(doorDir, command, fileName, section, variant);
  const text = Buffer.from(contentBase64, 'base64').toString('latin1');
  const lines = text.split(/\r\n|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // A .tti's lines are packet records (DE, PN, OL...), not screen rows; the
  // store checks it is a page the board renders instead.
  if (variant !== 'tti' && lines.length > entry.maxLines) {
    throw new Error(`${entry.label}: ${lines.length} lines, at most ${entry.maxLines}`);
  }
  writeVariant(artRoot, command, section, variant, lines);
  return readDoorArtVariant(doorDir, artRoot, command, fileName, section, variant);
}
