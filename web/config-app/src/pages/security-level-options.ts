/**
 * The security levels the admin offers, built from the board.
 *
 * Three pages used to carry their own hardcoded lists, disagreeing with each
 * other and with this board: "20 - New User" on a board whose new users are
 * level 30, a Security page that could not select 30 at all, and an operator
 * chat page offering 70 and 150, which nobody here holds. A level list is not
 * a constant - it is what the Access directory holds plus what the users
 * actually are.
 *
 * The serving rule is express.e's own (findAcsLevel, express.e:3025), imported
 * from the backend's disk-free half rather than restated here.
 */

import { acsLevelServing } from '@bbs/config-services/acs-level-serving';

/** A level users hold, and which file serves it - as the levels API reports. */
export interface LevelInUse {
  level: number;
  users: number;
  servedBy: number | null;
}

export interface SecurityLevelOption {
  value: number;
  /** Full words, and the truth: whether it has a file, what serves it, who holds it. */
  label: string;
  hasFile: boolean;
  servedBy: number | null;
  users: number;
}

/**
 * @param levels  the ACS files that exist, from the levels API
 * @param inUse   the levels users hold, from the same call
 * @param alsoInclude  levels a form must keep selectable - the value already
 *   configured, so a setting cannot vanish because the board has no such file
 */
export function securityLevelOptions(
  levels: number[],
  inUse: LevelInUse[],
  alsoInclude: number[] = [],
): SecurityLevelOption[] {
  const users = new Map(inUse.map(row => [row.level, row]));
  const all = [...new Set([...levels, ...inUse.map(r => r.level), ...alsoInclude])]
    .sort((a, b) => a - b);

  return all.map(value => {
    const hasFile = levels.includes(value);
    const row = users.get(value);
    // A level nobody holds is not in `inUse` and has no servedBy of its own,
    // so the rule is applied here - the same rule, from the same module.
    const servedBy = row ? row.servedBy : (hasFile ? value : acsLevelServing(value, levels));
    const count = row?.users ?? 0;

    const parts = [
      hasFile
        ? 'own ACS file'
        : servedBy === null
          ? 'no ACS file, nothing serves it'
          : `no ACS file, served by ACS.${servedBy}.info`,
    ];
    if (count > 0) parts.push(`${count} user${count === 1 ? '' : 's'}`);

    return { value, label: `${value} - ${parts.join(', ')}`, hasFile, servedBy, users: count };
  });
}
