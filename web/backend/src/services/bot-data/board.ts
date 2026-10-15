/**
 * WEB_BOT_DATA board - the board about itself, public facts only.
 *
 * BBS name, sysop handle, doors this caller may run. Secrets never leave:
 * only bbs_name/sysop_name are read off the config, everything else stays
 * on disk. Door visibility reuses commandsOnDisk, the same function the
 * menu system reads, so chat can never offer a door the caller may not run.
 */
import { BOT_cut } from './caps';
import type { BOTActor, BOTResult } from './types';

export interface BOTBoard {
  getBoardConfig(bbsRoot: string): { bbs_name?: string; sysop_name?: string };
  commandsOnDisk(bbsRoot: string, level: number): { external: string[] };
  conferencesFromDisk(bbsRoot: string): Array<{ id: number; name: string }>;
}

export async function BOT_boardInfo(board: BOTBoard | undefined, bbsRoot: string | undefined): Promise<BOTResult> {
  if (!board || !bbsRoot) return { text: 'Board facts are unreachable right now.', truncated: false };
  let name = '?';
  let sysop = '?';
  try {
    const cfg = board.getBoardConfig(bbsRoot);
    name = cfg.bbs_name || name;
    sysop = cfg.sysop_name || sysop;
  } catch {
    return { text: 'Board facts are unreachable right now.', truncated: false };
  }
  return { text: `${name}, run by ${sysop}.`, truncated: false };
}

export async function BOT_listDoors(
  board: BOTBoard | undefined,
  bbsRoot: string | undefined,
  actor: BOTActor,
): Promise<BOTResult> {
  if (!board || !bbsRoot) return { text: 'The door list is unreachable right now.', truncated: false };
  const { external } = board.commandsOnDisk(bbsRoot, actor.secLevel ?? 0);
  if (!external.length) return { text: 'No doors are available to this caller.', truncated: false };
  const { text, truncated } = BOT_cut(`${external.length} doors/programs: ${external.join(', ')}`);
  return { text, truncated, total: external.length };
}

export async function BOT_whereAmI(
  board: BOTBoard | undefined,
  bbsRoot: string | undefined,
  currentConf: number | undefined,
): Promise<BOTResult> {
  if (!board || !bbsRoot) return { text: 'Location is unreachable right now.', truncated: false };
  const confs = board.conferencesFromDisk(bbsRoot);
  const here = confs.find((c) => c.id === currentConf);
  return { text: here ? `Conference ${here.id}: ${here.name}.` : 'Location unknown.', truncated: false };
}
