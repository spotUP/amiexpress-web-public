/**
 * Where a conference's file areas default to.
 *
 * `conference-setup.service.ts` has written `<LOCATION>/Files` and
 * `<LOCATION>/Upload` since conferences could be created at all
 * (express.e:5006 reads NDIRS, DLPATH.n and ULPATH.n from the conference's
 * icon). Nothing else knew that rule, so the admin form left the inputs blank
 * and a sysop typed them by hand - and on a conference with sixteen
 * directories, mostly did not.
 *
 * "Follows" is DERIVED, never stored: a path follows when it equals the
 * default for its conference, and is custom when it does not. There is no flag
 * to fall out of step with the value it describes, a hand-fixed path starts
 * following again by itself, and a deliberately custom path - an archive
 * volume, a shared upload drop - is never silently rewritten.
 */

export interface DerivedConferencePaths {
  /** DLPATH.1 .. DLPATH.<ndirs>, keyed 1-based. */
  dlpaths: Record<number, string>;
  /** ULPATH.1 .. ULPATH.<ndirs>, keyed 1-based. */
  ulpaths: Record<number, string>;
}

/** `BBS:Conf2/` and `BBS:Conf2` are one directory; compare and build from the bare form. */
function withoutTrailingSlash(location: string): string {
  return location.trim().replace(/\/+$/, '');
}

export function deriveConferencePaths(location: string, ndirs: number): DerivedConferencePaths {
  const base = withoutTrailingSlash(location);
  const dlpaths: Record<number, string> = {};
  const ulpaths: Record<number, string> = {};

  for (let dir = 1; dir <= ndirs; dir++) {
    dlpaths[dir] = `${base}/Files`;
    ulpaths[dir] = `${base}/Upload`;
  }

  return { dlpaths, ulpaths };
}

/**
 * Whether a stored path still matches the default.
 *
 * An empty path counts as following: it has never been set, so the default is
 * what the board will use, and showing it as "custom" would be a lie about a
 * blank box. Case and a trailing slash are not differences - the volume is an
 * Amiga one and both spellings appear in real icons.
 */
export function isFollowingDerived(stored: string, derived: string): boolean {
  const value = (stored ?? '').trim();
  if (!value) return true;

  return withoutTrailingSlash(value).toLowerCase() === withoutTrailingSlash(derived).toLowerCase();
}
