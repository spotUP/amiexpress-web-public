/**
 * Is this caller already logged in on another node?
 *
 * express.e:29715-29727 - `checkUserOnLine(1)` walks every node and refuses a
 * second simultaneous login by the same account, writing
 * "User <name> already on another node!" to the CallersLog and showing the
 * board's ONENODE screen before hanging up.
 *
 * This port had no such check at all: the same account could hold as many
 * nodes as it could open connections, which on a 24-node board is the whole
 * board.
 *
 * It reads the NODE FILES, as express.e does, and not the in-process session
 * map. `node<n>.user` is written at login and deleted at logoff
 * (NodeFileManager), and it is the same record a real AmiExpress and every
 * door reads - a check against a Map would answer differently to what the
 * board itself believes, and a restart with callers connected would forget
 * everyone.
 */

import * as fs from 'fs';
import * as path from 'path';

import { nodeFileManager } from './NodeFileManager';

/** Every node this board HAS, from its directories - the same rule the index uses. */
export function boardNodeIds(bbsRoot: string): number[] {
  try {
    return fs.readdirSync(bbsRoot)
      .filter(entry => /^Node\d+$/i.test(entry))
      .map(entry => parseInt(entry.slice(4), 10))
      .filter(id => Number.isFinite(id))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * The node this account is already on, or null.
 *
 * Names are compared the way the board compares them everywhere else:
 * case-insensitively, trimmed, and after the C string's NUL padding is gone -
 * `node<n>.user` is a fixed-width binary record, so a raw === would answer no
 * for every caller.
 *
 * Ghost guard (2026-09-10): a name match with no live session behind it is
 * a stale record, not a second login. Node files delete at clean logoff,
 * but a missed teardown (or a kick whose disconnect never fired) leaves
 * the file behind, and the next login - on a fresh node, excluding only
 * itself - is refused against its OWN previous session. The liveness
 * check is injected (never imported: this module stays disk-first, and
 * after a boot sweep there are no records without sessions anyway, so
 * the invariant "runtime record implies live session" holds).
 */
export interface NodeUserFiles {
  readNodeUserFile(nodeId: number): { name?: string } | null;
  deleteNodeFiles(nodeId: number): void;
}

export function userAlreadyOnNode(
  bbsRoot: string,
  username: string,
  exceptNodeId: number,
  isLive?: (nodeId: number) => boolean,
  onStale?: (nodeId: number) => void,
  files?: NodeUserFiles
): number | null {
  const wanted = String(username ?? '').replace(/\0/g, '').trim().toLowerCase();
  if (wanted === '') return null;
  // The file store answers reads AND collects stale files. Default is
  // the singleton (production behavior unchanged); tests hand a
  // manager rooted at a temp board.
  const store: NodeUserFiles = files ?? nodeFileManager;

  for (const nodeId of boardNodeIds(bbsRoot)) {
    if (nodeId === exceptNodeId) continue;
    // A node with no user file has nobody on it, which is the common case and
    // not worth a log line per node per login.
    if (!fs.existsSync(path.join(bbsRoot, `node${nodeId}.user`))) continue;

    let record: { name?: string } | null = null;
    try {
      record = store.readNodeUserFile(nodeId);
    } catch {
      continue; // an unreadable record must not refuse a legitimate login
    }

    const there = String(record?.name ?? '').replace(/\0/g, '').trim().toLowerCase();
    if (there === '' || there !== wanted) continue;
    // Name matches: refuse only if something is actually there. A stale
    // file with no session behind it is cleaned up best-effort so the
    // next login does not trip over it again.
    if (isLive && !isLive(nodeId)) {
      try {
        (onStale ?? ((id) => store.deleteNodeFiles(id)))(nodeId);
      } catch {
        // Best-effort: the miss below already unblocks this login.
      }
      continue;
    }
    return nodeId;
  }

  return null;
}
