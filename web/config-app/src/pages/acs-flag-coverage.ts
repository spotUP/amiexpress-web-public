/**
 * Which security levels grant one permission - the question the Security page
 * could not answer, because it renders one level at a time.
 *
 * PERMISSIONS DO NOT INHERIT UPWARD. express.e:3025-3035 (findAcsLevel) rounds
 * the caller's level down to a multiple of five and walks DOWN until a file
 * exists, then reads that file and no other. A higher level exists precisely so
 * that it can differ - including by granting less.
 *
 * So "unlimited time above level 30", ticked on level 30, gives unlimited time
 * to callers at 30-49 and to nobody above them: a level-50 caller is served by
 * ACS.50.info, a level-255 caller by ACS.255.info, and neither of those files
 * was touched. That is the sysop's report of 2026-09-14 - "all users with
 * higher security level than 30 does not have unlimited time in the bbs" -
 * and it is the board behaving exactly as AmiExpress does.
 *
 * The rule lives here, with no React and no fetch in it, because it is a fact
 * about the board rather than about the page.
 */

export interface FlagCoverage {
  /** Levels whose own file grants this permission, ascending. */
  granted: number[];
  /**
   * Levels ABOVE the one being edited whose own file does NOT grant it.
   *
   * Only worth showing when the level being edited grants it: that is the
   * shape of the mistake - a permission handed out at one level and silently
   * absent from every level above.
   */
  missingAbove: number[];
}

export function flagCoverage(
  name: string,
  levels: number[],
  grants: Record<number, Record<string, boolean>> | undefined,
  editing: number,
  /**
   * The state in the FORM, not on disk, so the warning appears the moment the
   * sysop ticks the box rather than one save later.
   */
  grantedHere: boolean
): FlagCoverage {
  const grantsAt = (level: number): boolean =>
    level === editing ? grantedHere : Boolean(grants?.[level]?.[name]);

  const ordered = [...levels].sort((a, b) => a - b);

  return {
    granted: ordered.filter(grantsAt),
    missingAbove: ordered.filter(level => level > editing && !grantsAt(level)),
  };
}
