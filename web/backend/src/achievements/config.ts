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
 */
import type { SystemConfig } from '../database/types';

export interface AchievementsSettings {
  serverUrl: string;
  boardKey: string;
  boardId: string;
  enabled: boolean;
}

export function achievementsSettings(cfg: SystemConfig | null | undefined): AchievementsSettings {
  const serverUrl = (cfg?.achievements_server_url ?? '').trim().replace(/\/+$/, '');
  const boardKey = (cfg?.achievements_board_key ?? '').trim();
  const dot = boardKey.indexOf('.');
  const boardId = dot > 0 ? boardKey.slice(0, dot) : '';
  const enabled = serverUrl !== '' && boardId !== '' && dot < boardKey.length - 1 && !cfg?.achievements_disabled;
  return { serverUrl, boardKey, boardId, enabled };
}
