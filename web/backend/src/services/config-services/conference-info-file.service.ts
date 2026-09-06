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
  // MIN_ACCESS and MAX_ACCESS are this admin's own bookkeeping - see
  // CONFERENCE_TOOLTYPES_AMIEXPRESS_IGNORES.
  min_access_level: 'MIN_ACCESS',
  max_access_level: 'MAX_ACCESS',
  // express.e:5013 and :15269 read MENU_PROMPT. MENUPROMPT, without the
  // underscore, is a key AmiExpress has never looked for.
  menu_prompt: 'MENU_PROMPT',
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
  // PRIVATE and READ_ONLY are this admin's own - see
  // CONFERENCE_TOOLTYPES_AMIEXPRESS_IGNORES.
  private_conf: 'PRIVATE',
  read_only: 'READ_ONLY',
  // These four were classed "database only, because AmiExpress has no
  // tooltype for them". All four have one, and all four are read from the
  // conference's own icon:
  free_downloads: 'FREEDOWNLOADS',   // express.e:5010
  use_username: 'USERNAME',          // express.e:4081
  use_realname: 'REALNAME',          // express.e:4083
  use_internetname: 'INTERNETNAME',  // express.e:5022
};

/**
 * Conference tooltypes AmiExpress does not read.
 *
 * A conference is gated by the caller's own conferenceAccess mask -
 * express.e:8499-8512 tests `user.conferenceAccess[confNum-1]="X"` - not by a
 * level range, and there is no PRIVATE or READ_ONLY tooltype anywhere in the
 * sources. They are this port's own bookkeeping and they are kept, because
 * the admin shows them and a sysop's board already carries them; what they
 * are not is a setting that changes what AmiExpress does.
 */
export const CONFERENCE_TOOLTYPES_AMIEXPRESS_IGNORES: Record<string, string> = {
  min_access_level: "This port's own. AmiExpress gates a conference by the caller's conferenceAccess mask (express.e:8499-8512), not by a level range",
  max_access_level: "This port's own. AmiExpress gates a conference by the caller's conferenceAccess mask (express.e:8499-8512), not by a level range",
  private_conf: "This port's own. No PRIVATE tooltype exists in AmiExpress",
  read_only: "This port's own. No READ_ONLY tooltype exists in AmiExpress",
};

/**
 * Fields the admin keeps in the database only.
 *
 * Empty. It used to hold free_downloads, use_username, use_realname and
 * use_internetname on the grounds that AmiExpress had no tooltype for them.
 * All four have one - FREEDOWNLOADS, USERNAME, REALNAME and INTERNETNAME -
 * and all four are read from the conference's own icon, so all four now go
 * where the BBS looks for them.
 */
export const CONFERENCE_DATABASE_ONLY_FIELDS = [] as const;

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
  free_downloads: boolean;
  use_username: boolean;
  use_realname: boolean;
  use_internetname: boolean;
  /** DLPATH.1 .. DLPATH.16, keyed 1-based. */
  dlpaths: Record<number, string>;
  /** ULPATH.1 .. ULPATH.16, keyed 1-based. */
  ulpaths: Record<number, string>;
  /**
   * STORAGEDRIVE.1 .. STORAGEDRIVE.16, keyed 1-based: which DRIVE.n a
   * directory's files live on. 0 means local disk, the default.
   *
   * This is the tooltype that puts a file area in the pool, and nothing in
   * the admin could set it - a sysop had to write it into Conf<N>.info by
   * hand, which made a configured bucket unreachable from the interface that
   * configures buckets.
   */
  storagedrives: Record<number, number>;
}

/** Read a conference's settings out of its tooltypes. */
export function readConferenceFields(toolTypes: ToolTypes): ConferenceInfoFields {
  const number = (key: string, fallback: number): number => {
    const parsed = parseInt(toolTypes.get(key) ?? '', 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const dlpaths: Record<number, string> = {};
  const ulpaths: Record<number, string> = {};
  const storagedrives: Record<number, number> = {};
  for (let i = 1; i <= MAX_FILE_AREAS; i += 1) {
    dlpaths[i] = toolTypes.get(`DLPATH.${i}`) ?? '';
    ulpaths[i] = toolTypes.get(`ULPATH.${i}`) ?? '';
    // A conference-wide STORAGEDRIVE (no .n) applies to every directory that
    // does not name its own - remote-areas.ts reads it the same way.
    const perDir = toolTypes.get(`STORAGEDRIVE.${i}`) ?? toolTypes.get('STORAGEDRIVE');
    const parsed = perDir === undefined ? 0 : Number.parseInt(perDir, 10);
    storagedrives[i] = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return {
    storagedrives,
    ndirs: number('NDIRS', 0),
    min_access_level: number('MIN_ACCESS', 0),
    max_access_level: number('MAX_ACCESS', 255),
    menu_prompt: toolTypes.get('MENU_PROMPT') ?? '',
    confdb_shared: number('CONFDB_SHARED', 0),
    force_newscan: flagIsSet(toolTypes, 'FORCE_NEWSCAN'),
    no_newscan: flagIsSet(toolTypes, 'NO_NEWSCAN'),
    show_new_files: flagIsSet(toolTypes, 'SHOW_NEW_FILES'),
    no_new_files: flagIsSet(toolTypes, 'NO_NEW_FILES'),
    exclude_ftp: flagIsSet(toolTypes, 'EXCLUDE_FTP'),
    private_conf: flagIsSet(toolTypes, 'PRIVATE'),
    read_only: flagIsSet(toolTypes, 'READ_ONLY'),
    free_downloads: flagIsSet(toolTypes, 'FREEDOWNLOADS'),
    use_username: flagIsSet(toolTypes, 'USERNAME'),
    use_realname: flagIsSet(toolTypes, 'REALNAME'),
    use_internetname: flagIsSet(toolTypes, 'INTERNETNAME'),
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

  if (updates.storagedrives) {
    for (const [index, drive] of Object.entries(updates.storagedrives)) {
      const key = `STORAGEDRIVE.${index}`;
      // 0 is "local disk", and local disk is the ABSENCE of the tooltype -
      // writing STORAGEDRIVE.n=0 would name a drive that does not exist and
      // usableAreasFor would drop the area entirely.
      if (!drive || drive <= 0) {
        toolTypes.delete(key);
      } else {
        toolTypes.set(key, String(drive));
      }
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
