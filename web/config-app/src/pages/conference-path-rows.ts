/**
 * The download/upload path rows in the conference form.
 *
 * A conference declares up to sixteen directories (express.e:5006 reads NDIRS,
 * DLPATH.n and ULPATH.n). The form offered exactly one, blank, so fifteen were
 * unreachable from the admin and the first had to be typed from memory.
 *
 * Each row derives from the conference's own LOCATION - `<location>/Files` and
 * `<location>/Upload`, the same rule conference creation has always written -
 * and FOLLOWS it. Typing something else makes that row custom, and it is never
 * rewritten afterwards. Following is derived by comparison rather than stored,
 * so there is no flag to fall out of step, and correcting a path by hand makes
 * it follow again on its own.
 */

export interface ConferencePathFields {
  location: string;
  ndirs: number;
  [key: string]: string | number;
}

export interface PathCell {
  value: string;
  following: boolean;
}

export interface PathRow {
  dir: number;
  download: PathCell;
  upload: PathCell;
}

export type PathSide = 'download' | 'upload';

const FIELD: Record<PathSide, 'dlpath' | 'ulpath'> = {
  download: 'dlpath',
  upload: 'ulpath',
};

/** `BBS:Conf2/` and `BBS:Conf2` are one directory. */
function bare(value: string): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export function derivedPath(location: string, side: PathSide): string {
  return `${bare(location)}/${side === 'download' ? 'Files' : 'Upload'}`;
}

/**
 * A stored path follows when it matches the default. Empty follows too: it has
 * never been set, so the default is what applies, and showing a blank box as
 * "custom" would misdescribe it.
 */
export function isFollowing(stored: string, derived: string): boolean {
  const value = bare(stored);
  if (!value) return true;
  return value.toLowerCase() === bare(derived).toLowerCase();
}

function cell(conference: ConferencePathFields, dir: number, side: PathSide): PathCell {
  const stored = String(conference[`${FIELD[side]}_${dir}`] ?? '');
  const derived = derivedPath(conference.location, side);
  const following = isFollowing(stored, derived);

  // A following row shows the derived value, so the sysop sees the path the
  // board will use rather than an empty box they have to guess at.
  return { value: following ? derived : stored, following };
}

export function pathRows(conference: ConferencePathFields): PathRow[] {
  const rows: PathRow[] = [];
  for (let dir = 1; dir <= (conference.ndirs || 0); dir++) {
    rows.push({ dir, download: cell(conference, dir, 'download'), upload: cell(conference, dir, 'upload') });
  }
  return rows;
}

export function applyPathEdit<T extends ConferencePathFields>(
  conference: T, dir: number, side: PathSide, value: string,
): T {
  return { ...conference, [`${FIELD[side]}_${dir}`]: value };
}

export function resetPathToDerived<T extends ConferencePathFields>(
  conference: T, dir: number, side: PathSide,
): T {
  return applyPathEdit(conference, dir, side, derivedPath(conference.location, side));
}

/**
 * What the form sends.
 *
 * A following row is sent as its derived value rather than as the empty string
 * it may be stored as, so the conference's icon ends up carrying the path the
 * board is using - a door reading DLPATH.n directly finds it there.
 *
 * Directories beyond NDIRS are passed through untouched: express.e only reads
 * up to NDIRS, and a lowered count is usually temporary. Deleting them would
 * lose a path the sysop set for a directory they are about to re-enable.
 */
export function rowsToFormFields<T extends ConferencePathFields>(conference: T): T {
  const sent = { ...conference };

  for (const row of pathRows(conference)) {
    sent[`dlpath_${row.dir}` as keyof T] = row.download.value as T[keyof T];
    sent[`ulpath_${row.dir}` as keyof T] = row.upload.value as T[keyof T];
  }

  return sent;
}
