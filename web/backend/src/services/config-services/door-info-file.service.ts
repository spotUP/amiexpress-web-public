/**
 * A door's definition is its .info file, not a database row.
 *
 * The admin door list is loaded from disk and numbered by POSITION
 * (`id: index + 1` in config-routes.ts), while the update route looked that
 * number up as a `doors` table row - two unrelated namespaces, so saving a
 * door reported "Door 349 not found". If the table had happened to hold a row
 * with that id it would have edited a different door instead, silently.
 *
 * The BBS scans Commands/BBSCmd/*.info for its commands, so an edit has to
 * change the tooltypes in that file. This module owns the mapping between the
 * admin form's fields and those tooltypes, and nothing else - the reading and
 * writing of the binary .info is the info editor's existing, tested path.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

/**
 * Admin form field -> AmiExpress tooltype.
 *
 * Only fields with a REAL tooltype appear here. `time_limit`, `runtime_env`
 * and `description` have none: runtime_env is derived from TYPE by the API,
 * and inventing a key for the others would put something in a door's .info
 * that AmiExpress does not read.
 */
export const DOOR_FIELD_TOOLTYPES: Record<string, string> = {
  door_name: 'NAME',
  door_path: 'LOCATION',
  door_type: 'TYPE',
  min_security_level: 'ACCESS',
  priority: 'PRIORITY',
};

/**
 * Where a disabled door's normal access level is kept.
 *
 * AmiExpress has no ENABLED tooltype - express.e:4702 reads ACCESS and that
 * is the only gate a door has - so taking one offline means parking its
 * ACCESS out of reach, and the level it used to have has to be written down
 * or turning it back on would be a guess.
 *
 * DOORREPO already settled this and already reads it back
 * (examples/doorrepo-c/flow.c:975 writes the line, :899 parses it), so the
 * admin uses the same two tooltypes rather than inventing a third answer.
 * DRACCESS is DOORREPO's own bookkeeping: express.e never reads it, which is
 * what makes it safe to leave sitting in a door's .info.
 */
export const PRIOR_ACCESS_TOOLTYPE = 'DRACCESS';

/** The level a disabled door is parked at - the highest that exists. */
export const DISABLED_ACCESS_LEVEL = 255;

/**
 * Is this door enabled?
 *
 * A remembered level is the marker: a door only carries one while it is
 * parked. Every door installed before any of this has no DRACCESS and reads
 * as enabled, which is what they are.
 */
export function isDoorEnabled(
  toolTypes: Record<string, string> | undefined | null
): boolean {
  if (!toolTypes) return true;
  return !Object.keys(toolTypes).some(
    key => key.toUpperCase() === PRIOR_ACCESS_TOOLTYPE
  );
}

/**
 * The access level to SHOW for a door - its normal one, not its parked one.
 *
 * A disabled door's ACCESS is the parking level, so serving that as the
 * door's access level would put 255 in the form. Saving it back would then
 * record 255 as the level to restore, and enabling the door would leave it
 * exactly as unreachable as it was.
 */
export function doorNormalAccessLevel(
  door: { accessLevel?: number; toolTypes?: Record<string, string> | null }
): number {
  const tools = door.toolTypes ?? {};
  const key = Object.keys(tools).find(k => k.toUpperCase() === PRIOR_ACCESS_TOOLTYPE);
  if (key) {
    const remembered = parseInt(tools[key], 10);
    if (!isNaN(remembered)) return remembered;
  }
  return door.accessLevel || 0;
}

/** Read a tooltype's value out of a list, whatever case its key is written in. */
function findTooltype(list: Tooltype[], key: string): Tooltype | undefined {
  return list.find(t => t.key.toUpperCase() === key);
}

function setTooltype(list: Tooltype[], key: string, value: string): void {
  const found = findTooltype(list, key);
  if (found) {
    found.value = value;
    found.originalLine = `${found.commented ? '!' : ''}${found.key}=${value}`;
  } else {
    list.push({ key, value, commented: false, originalLine: `${key}=${value}` });
  }
}

/**
 * Turn a door on or off, in place, touching only ACCESS and DRACCESS.
 *
 * Disabling remembers the door's current level and parks ACCESS; enabling
 * puts the remembered level back and drops the marker. Both directions are
 * idempotent, and the remembered value is never overwritten by a second
 * disable - it names the door's NORMAL level, not the most recent one, the
 * same rule DOORREPO's flow_compute_prior_access() case 3 applies.
 *
 * Every other tooltype is passed through untouched: STACK, MULTINODE,
 * RESIDENT and NAME all change how a door runs, and taking it offline for an
 * afternoon has no business rewriting them.
 */
export function applyEnabledToTooltypes(
  existing: Tooltype[],
  enabled: boolean
): Tooltype[] {
  const out = existing.map(t => ({ ...t }));
  const prior = findTooltype(out, PRIOR_ACCESS_TOOLTYPE);

  if (enabled) {
    // Not parked - nothing to restore, and nothing to change.
    if (!prior) return out;

    setTooltype(out, 'ACCESS', prior.value);
    return out.filter(t => t.key.toUpperCase() !== PRIOR_ACCESS_TOOLTYPE);
  }

  // Already parked: leave the remembered level alone.
  if (prior) return out;

  // A door with no ACCESS at all is reachable by everyone, which is level 0.
  // Recording that is what makes it possible to enable the door again.
  const current = findTooltype(out, 'ACCESS')?.value ?? '0';
  setTooltype(out, PRIOR_ACCESS_TOOLTYPE, current);
  setTooltype(out, 'ACCESS', String(DISABLED_ACCESS_LEVEL));
  return out;
}

export interface DoorFields {
  door_name?: string;
  door_path?: string;
  door_type?: string;
  min_security_level?: number;
  /** The form's 'P0'..'P4'; the tooltype holds the bare number. */
  priority?: string;
}

/** The tooltype value for a field, or null when it should not be written. */
function tooltypeValue(field: string, raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (field === 'priority') {
    const m = String(raw).match(/^P?(\d+)$/i);
    return m ? m[1] : null;
  }
  return String(raw);
}

/**
 * Apply the admin form's fields to a door's tooltypes.
 *
 * Every tooltype the form does not own is passed through untouched, including
 * disabled ones: STACK, MULTINODE and RESIDENT all change how a door runs, and
 * an edit to its access level has no business rewriting them.
 */
export function applyDoorFieldsToTooltypes(
  existing: Tooltype[],
  fields: DoorFields
): Tooltype[] {
  const out = existing.map(t => ({ ...t }));

  // A parked door's ACCESS is the parking level, not the door's own. An edit
  // to the access level while it is off has to land on the remembered value,
  // or enabling the door again would restore the old level and throw the
  // sysop's edit away.
  const parked = out.some(t => t.key.toUpperCase() === PRIOR_ACCESS_TOOLTYPE);

  for (const [field, key] of Object.entries(DOOR_FIELD_TOOLTYPES)) {
    const value = tooltypeValue(field, (fields as any)[field]);
    if (value === null) continue;

    if (parked && key === 'ACCESS') {
      setTooltype(out, PRIOR_ACCESS_TOOLTYPE, value);
      continue;
    }

    const found = out.find(t => t.key.toUpperCase() === key);
    if (found) {
      found.value = value;
      found.originalLine = `${found.commented ? '!' : ''}${found.key}=${value}`;
    } else {
      out.push({ key, value, commented: false, originalLine: `${key}=${value}` });
    }
  }

  return out;
}

/**
 * Find a command's .info file.
 *
 * The directory holds `wall.info`, `SWall.info`, `ACCV103.info` - the case is
 * whatever the sysop's Amiga wrote, so a case-sensitive join misses. Returns
 * null rather than guessing.
 */
export function findDoorInfoFile(bbsRoot: string, command: string): string | null {
  const dir = path.join(bbsRoot, 'Commands', 'BBSCmd');
  if (!fs.existsSync(dir)) return null;

  const wanted = `${command}.info`.toLowerCase();
  const match = fs.readdirSync(dir).find(name => name.toLowerCase() === wanted);
  return match ? path.join(dir, match) : null;
}

/**
 * The name to SHOW for a door, and therefore the name to write back.
 *
 * A command's `name` is its filename (wall.info -> WALL); its title lives in
 * the NAME tooltype ("dRE!WAll v2.0"). The API served the filename as
 * `door_name`, so the admin form displayed WALL and saving an unrelated field
 * wrote WALL into NAME - an access-level edit renamed the door.
 *
 * Serving the tooltype makes the round trip lossless: what the form shows is
 * what gets written back.
 */
export function doorDisplayName(
  door: { name: string; toolTypes?: Record<string, string> }
): string {
  const tools = door.toolTypes ?? {};
  const raw = tools.NAME ?? (tools as any).name;
  const title = typeof raw === 'string' ? raw.trim() : '';
  return title || door.name;
}

/**
 * The tooltypes a NEW door's .info should carry.
 *
 * The previous writer led with `${door_type}=${door_command}` - "XIM=WALL",
 * which is not a tooltype AmiExpress reads - and set TYPE from a runtime map
 * that produced "TS" or "AMIGA", neither of which the loader recognises as a
 * door type, so a created 68K door was not treated as one.
 *
 * Only what a door actually needs, and nothing invented: a door with no name
 * gets no NAME, rather than having its command written in as its title, which
 * is how wall lost "dRE!WAll v2.0".
 */
export function buildNewDoorTooltypes(fields: {
  door_command: string;
  door_type: string;
  door_path?: string;
  door_name?: string;
  min_security_level?: number;
  priority?: string;
  door_args?: string;
}): Tooltype[] {
  const tts: Tooltype[] = [];
  const add = (key: string, value: string) =>
    tts.push({ key, value, commented: false, originalLine: `${key}=${value}` });

  if (fields.door_path) add('LOCATION', fields.door_path);
  add('TYPE', fields.door_type);
  if (fields.door_name) add('NAME', fields.door_name);
  add('ACCESS', String(fields.min_security_level ?? 0));
  add('MULTINODE', 'YES');

  const priority = fields.priority?.match(/^P?(\d+)$/i)?.[1];
  if (priority) add('PRIORITY', priority);
  if (fields.door_args) add('ARGS', fields.door_args);

  return tts;
}
