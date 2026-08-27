import { describe, expect, it } from 'vitest';
import { NODE_STATE_TONE, isOccupied, nodeState, nodeStateLabel } from '../lib/node-state';
import type { NodeStatus } from '../types/bbs';

function node(overrides: Partial<NodeStatus> = {}): NodeStatus {
  return { nodeId: 1, online: false, reservedFor: null, ...overrides };
}

describe('nodeState', () => {
  it('calls a node with a caller on it online', () => {
    expect(nodeState(node({ online: true, username: 'SPOT' }))).toBe('online');
  });

  it('calls a node that is up with nobody on it waiting, not online', () => {
    // This is the distinction the old sidebar could not make: "online" was
    // true for a listening node, so the board looked busy when it was idle.
    expect(nodeState(node({ online: true }))).toBe('idle');
    expect(nodeStateLabel(nodeState(node({ online: true })))).toBe('Waiting');
  });

  it('reports a held node as reserved when nobody has called in on it', () => {
    expect(nodeState(node({ reservedFor: 'SPOT' }))).toBe('reserved');
  });

  it('lets an error state win over everything else', () => {
    expect(nodeState(node({ online: true, username: 'SPOT', state: 'ERROR' }))).toBe('error');
  });

  it('falls back to offline', () => {
    expect(nodeState(node())).toBe('offline');
  });
});

describe('NODE_STATE_TONE', () => {
  it('gives offline a hollow ring rather than another colour', () => {
    expect(NODE_STATE_TONE.offline).toBe('hollow');
  });

  it('maps every state to a tone', () => {
    for (const state of ['online', 'idle', 'reserved', 'offline', 'error'] as const) {
      expect(NODE_STATE_TONE[state]).toBeTruthy();
    }
  });
});

describe('isOccupied', () => {
  it('counts only nodes carrying a caller', () => {
    expect(isOccupied(node({ online: true, username: 'SPOT' }))).toBe(true);
    expect(isOccupied(node({ online: true }))).toBe(false);
    expect(isOccupied(node({ reservedFor: 'SPOT' }))).toBe(false);
  });
});
