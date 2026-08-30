/**
 * The mapping between a conference's admin fields and its Conf{N}.info
 * tooltypes, owned in one place.
 *
 * It was written down twice and the two copies disagreed. The reader looked
 * for MINACCESSLEVEL, MAXACCESSLEVEL, FORCENEWSCAN, EXCLUDEFTP, PRIVATECONF
 * and READONLY; the writer wrote MIN_ACCESS, MAX_ACCESS, FORCE_NEWSCAN,
 * EXCLUDE_FTP, PRIVATE and READ_ONLY - which are the names on disk and, for
 * FORCE_NEWSCAN and EXCLUDE_FTP, the names express.e reads (express.e:576,
 * :28947). So six conference settings were saved under one key and read back
 * from another: the form showed the old value however many times a sysop
 * changed it, and a flag already set on disk read as off.
 *
 * Reader and writer now share this module, so the two cannot drift again.
 */

/** Scalar settings: the tooltype holds the value. */
export const CONFERENCE_FIELD_TOOLTYPES: Record<string, string> = {
  ndirs: 'NDIRS',
  min_access_level: 'MIN_ACCESS',
  max_access_level: 'MAX_ACCESS',
  menu_prompt: 'MENUPROMPT',
  confdb_shared: 'CONFDB_SHARED',
};

/**
 * Flag settings: the tooltype's PRESENCE is the value, which is how
 * express.e reads them (checkToolTypeExists, express.e:576). This project
 * writes `=1` as well, and both are honoured on the way back in.
 */
export const CONFERENCE_FLAG_TOOLTYPES: Record<string, string> = {
  force_newscan: 'FORCE_NEWSCAN',
  no_newscan: 'NO_NEWSCAN',
  show_new_files: 'SHOW_NEW_FILES',
  no_new_files: 'NO_NEW_FILES',
  exclude_ftp: 'EXCLUDE_FTP',
  private_conf: 'PRIVATE',
  read_only: 'READ_ONLY',
};

/**
 * Fields the admin keeps in the database only, because AmiExpress has no
 * tooltype for them: free_downloads, use_username, use_realname and
 * use_internetname. Inventing keys for these would put values in a
 * conference's .info that the BBS never reads.
 */
export const CONFERENCE_DATABASE_ONLY_FIELDS = [
  'free_downloads',
  'use_username',
  'use_realname',
  'use_internetname',
] as const;

export const MAX_FILE_AREAS = 16;

/** Upper-cased tooltypes, as both sides index them. */
export type ToolTypes = Map<string, string>;

function flagIsSet(toolTypes: ToolTypes, key: string): boolean {
  if (!toolTypes.has(key)) return false;
  const value = (toolTypes.get(key) ?? '').trim();
  // Present with no value is how an Amiga icon says "on"; '0' is off.
  return value !== '0';
}

export interface ConferenceInfoFields {
  ndirs: number;
  min_access_level: number;
  max_access_level: number;
  menu_prompt: string;
  confdb_shared: number;
  force_newscan: boolean;
  no_newscan: boolean;
  show_new_files: boolean;
  no_new_files: boolean;
  exclude_ftp: boolean;
  private_conf: boolean;
  read_only: boolean;
  /** DLPATH.1 .. DLPATH.16, keyed 1-based. */
  dlpaths: Record<number, string>;
  /** ULPATH.1 .. ULPATH.16, keyed 1-based. */
  ulpaths: Record<number, string>;
}

/** Read a conference's settings out of its tooltypes. */
export function readConferenceFields(toolTypes: ToolTypes): ConferenceInfoFields {
  const number = (key: string, fallback: number): number => {
    const parsed = parseInt(toolTypes.get(key) ?? '', 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const dlpaths: Record<number, string> = {};
  const ulpaths: Record<number, string> = {};
  for (let i = 1; i <= MAX_FILE_AREAS; i += 1) {
    dlpaths[i] = toolTypes.get(`DLPATH.${i}`) ?? '';
    ulpaths[i] = toolTypes.get(`ULPATH.${i}`) ?? '';
  }

  return {
    ndirs: number('NDIRS', 0),
    min_access_level: number('MIN_ACCESS', 0),
    max_access_level: number('MAX_ACCESS', 255),
    menu_prompt: toolTypes.get('MENUPROMPT') ?? '',
    confdb_shared: number('CONFDB_SHARED', 0),
    force_newscan: flagIsSet(toolTypes, 'FORCE_NEWSCAN'),
    no_newscan: flagIsSet(toolTypes, 'NO_NEWSCAN'),
    show_new_files: flagIsSet(toolTypes, 'SHOW_NEW_FILES'),
    no_new_files: flagIsSet(toolTypes, 'NO_NEW_FILES'),
    exclude_ftp: flagIsSet(toolTypes, 'EXCLUDE_FTP'),
    private_conf: flagIsSet(toolTypes, 'PRIVATE'),
    read_only: flagIsSet(toolTypes, 'READ_ONLY'),
    dlpaths,
    ulpaths,
  };
}

export interface ConferenceFieldUpdates extends Partial<Omit<ConferenceInfoFields, 'dlpaths' | 'ulpaths'>> {
  name?: string;
  location?: string;
  dlpaths?: Record<number, string>;
  ulpaths?: Record<number, string>;
}

/**
 * Apply an admin edit to a conference's tooltypes, in place.
 *
 * An empty path CLEARS its tooltype rather than being ignored. Skipping empty
 * strings meant a file area could be set and never removed - the sysop
 * cleared the field, the form reported a save, and the path stayed on disk.
 */
export function applyConferenceFields(toolTypes: ToolTypes, updates: ConferenceFieldUpdates): ToolTypes {
  if (updates.name !== undefined) toolTypes.set('NAME', updates.name);
  if (updates.location !== undefined) toolTypes.set('LOCATION', updates.location);

  for (const [field, key] of Object.entries(CONFERENCE_FIELD_TOOLTYPES)) {
    const value = (updates as Record<string, unknown>)[field];
    if (value === undefined) continue;
    if (value === '' || value === null) {
      toolTypes.delete(key);
    } else {
      toolTypes.set(key, String(value));
    }
  }

  for (const [field, key] of Object.entries(CONFERENCE_FLAG_TOOLTYPES)) {
    const value = (updates as Record<string, unknown>)[field];
    if (value === undefined) continue;
    if (value) {
      toolTypes.set(key, '1');
    } else {
      toolTypes.delete(key);
    }
  }

  for (const [side, paths] of [['DLPATH', updates.dlpaths], ['ULPATH', updates.ulpaths]] as const) {
    if (!paths) continue;
    for (const [index, value] of Object.entries(paths)) {
      const key = `${side}.${index}`;
      if (value === '' || value === null || value === undefined) {
        toolTypes.delete(key);
      } else {
        toolTypes.set(key, value);
      }
    }
  }

  return toolTypes;
}
