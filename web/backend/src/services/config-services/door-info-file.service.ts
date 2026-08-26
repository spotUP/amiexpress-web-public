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
