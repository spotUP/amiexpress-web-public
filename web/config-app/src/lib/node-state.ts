/**
 * The one place a node's raw status is turned into a state a sysop reads.
 *
 * Kept out of the components so it can be tested directly, and so the node
 * strip on the Overview and the Nodes page can never disagree about what
 * "idle" means.
 */

import type { NodeStatus } from '../types/bbs';
import type { StatusTone } from '../types/ui';

export type NodeState = 'online' | 'idle' | 'reserved' | 'offline' | 'error';

export function nodeState(node: NodeStatus): NodeState {
  // An explicit error state wins: a node in trouble must not read as healthy.
  if (typeof node.state === 'string' && node.state.toLowerCase() === 'error') return 'error';

  // Online with nobody on it is a listening node, not an occupied one.
  if (node.online) return node.username ? 'online' : 'idle';

  // Held for somebody who has not called yet.
  if (node.reservedFor) return 'reserved';

  return 'offline';
}

export function nodeStateLabel(state: NodeState): string {
  switch (state) {
    case 'online':
      return 'Online';
    case 'idle':
      return 'Waiting';
    case 'reserved':
      return 'Reserved';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Error';
  }
}

export const NODE_STATE_TONE: Record<NodeState, StatusTone> = {
  online: 'ok',
  idle: 'neutral',
  reserved: 'warn',
  offline: 'hollow',
  error: 'danger',
};

/** True when the node is carrying a caller right now. */
export function isOccupied(node: NodeStatus): boolean {
  return nodeState(node) === 'online';
}
