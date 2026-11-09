/**
 * Conference, node and board facts a door reads through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import { db } from '../database';
import type { BBSSession } from '../index';
import type { BBSConference, BBSNode, BBSSystemInfo } from './bbs-api-types';
import { getBoardConfig } from '../services/bbs-config-file.service';
import { config as appConfig } from '../config';
import { appendUserNote } from '../utils/user-notes.util';


/**
 * Move the caller into conference `confNum`: the board's own join state
 * (conference.handler joinConferenceForDoor), refused without access.
 * Setting currentConf alone left joinedConf, the rejoin values, the
 * conference's account counters and read pointers on the old conference.
 */
export async function doorJoinConference(session: BBSSession, confNum: number): Promise<boolean> {
  try {
    const { joinConferenceForDoor } = require('../handlers/operations/conference.handler');
    return await joinConferenceForDoor(session, confNum);
  } catch (error) {
console.error('[BBSApi] Error joining conference:', error);
    return false;
  }
}

/**
 * List available conferences
 */
export async function doorListConferences(): Promise<BBSConference[]> {
  try {
    const conferences = await db.getConferences();
    return conferences.map((conf: any) => ({
      id: conf.id,
      name: conf.name,
      description: conf.description || '',
      accessLevel: conf.accessLevel ?? conf.access_level ?? 0
    }));
  } catch (error) {
console.error('[BBSApi] Error listing conferences:', error);
    return [];
  }
}

/**
 * Get BBS system information
 */
export async function doorGetSystemInfo(): Promise<BBSSystemInfo> {
  const sysConfig = getBoardConfig(appConfig.get('dataDir'));
  return {
    bbsName: sysConfig?.bbs_name || 'AmiExpress-Web',
    sysopName: sysConfig?.sysop_name || 'Sysop',
    version: '2.x',
    nodes: sysConfig?.max_nodes || 255
  };
}

/**
 * Get information about all nodes (for WHO doors)
 */
export async function doorGetNodes(session: BBSSession): Promise<BBSNode[]> {
  try {
    // Import NodeStatusManager (avoid circular dependency by lazy loading)
    const { nodeStatusManager } = await import('../nodes/NodeStatusManager');
    const activeNodes = nodeStatusManager.getActiveNodes();

    return activeNodes.map(node => ({
      nodeId: node.nodeId,
      username: node.handle || 'Unknown',
      location: node.location || '',
      activity: node.misc1 || 'Online',
      online: true
    }));
  } catch (error) {
console.error('[BBSApi] Error getting nodes:', error);
    // Fallback: return current node only
    return [
      {
        nodeId: (session.nodeId || 1),
        username: session.user?.username || 'Unknown',
        location: 'In door',
        activity: 'Running door',
        online: true
      }
    ];
  }
}

/**
 * Append a sysop note about `username` (the store the account editor's `*` User
 * Notes view reads). Author = the calling session's user, else the sysop name
 * the board is configured with. ONE rule for BBSApi.addUserNote (TS doors) and
 * AEW_USERNOTE (68K doors, xim/user-note.ts). False: unknown user / no slot / save failed.
 */
export async function doorAddUserNote(session: BBSSession | null | undefined, username: string, text: string): Promise<boolean> {
  const target = await db.getUserByUsername(username);
  if (!target?.slotNumber) return false;
  const author = session?.user?.username ?? (await doorGetSystemInfo()).sysopName;
  return appendUserNote(target.slotNumber, author, text);
}
