/**
 * Achievements: is this board reporting, and to whom?
 *
 * Three system_config columns (database-resident, SP2): the door server's
 * url, the board key the server minted for this board (encrypted at rest
 * by config-repository, like vapid_private_key), and the switch - stored
 * as the NEGATIVE, achievements_disabled, because a flag that had to
 * default to "on" would read as "off" on every board that predates the
 * column, and the feature would ship dark.
 *
 * The board id is the key's prefix (`uprough.<secret>`): there is no
 * separate column, so the two cannot disagree.
 *
 * A key with NO address means the public server. The address field's
 * placeholder used to be the only place that string appeared, and a sysop
 * read the placeholder as a value, saved the key alone and got a door that
 * said the board was not configured (2026-09-07). A board key is minted BY
 * a server, so a key on its own is not ambiguous - it is this one.
 */
import type { SystemConfig } from '../database/types';

/** Where a board with a key and no address of its own reports. */
export const DEFAULT_ACHIEVEMENTS_SERVER = 'https://doors.uprough.net';

export interface AchievementsSettings {
  serverUrl: string;
  boardKey: string;
  boardId: string;
  enabled: boolean;
}

export function achievementsSettings(cfg: SystemConfig | null | undefined): AchievementsSettings {
  const boardKey = (cfg?.achievements_board_key ?? '').trim();
  const dot = boardKey.indexOf('.');
  const boardId = dot > 0 ? boardKey.slice(0, dot) : '';
  const hasKey = boardId !== '' && dot < boardKey.length - 1;
  const typed = (cfg?.achievements_server_url ?? '').trim().replace(/\/+$/, '');
  const serverUrl = typed !== '' ? typed : hasKey ? DEFAULT_ACHIEVEMENTS_SERVER : '';
  const enabled = serverUrl !== '' && hasKey && !cfg?.achievements_disabled;
  return { serverUrl, boardKey, boardId, enabled };
}
