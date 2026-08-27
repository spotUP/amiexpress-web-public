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

  for (const [field, key] of Object.entries(DOOR_FIELD_TOOLTYPES)) {
    const value = tooltypeValue(field, (fields as any)[field]);
    if (value === null) continue;

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
