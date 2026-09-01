/**
 * Which ACS file serves a security level - the rule, with no disk in it.
 *
 * express.e:3025-3034 (findAcsLevel): the user's secStatus is rounded DOWN to
 * a multiple of five, then walked down in fives until a file exists, falling
 * back to 0. A board whose Access/ directory holds 10, 20, 50 and 255 serves
 * a level-30 user out of ACS.20.info.
 *
 * Kept apart from acs-level-file.service so the ADMIN can import it: that
 * module reads the disk, and the browser cannot. The rule is one rule either
 * way - a second copy in the admin would be the thing that drifts.
 */

/** Returns null when nothing matches, which is express.e's fall back to 0. */
export function acsLevelServing(level: number, available: number[]): number | null {
  let candidate = Math.floor(level / 5) * 5;
  const have = new Set(available);
  while (candidate > 0) {
    if (have.has(candidate)) return candidate;
    candidate -= 5;
  }
  return have.has(0) ? 0 : null;
}
