/**
 * Ghost logoff (ghostlogoff 2026-09-10): logging out with G then logging
 * back in was refused as "already on another node".
 *
 * Root cause: web disconnects defer teardown by two grace periods (3 s
 * reconnect wait + 15 s disconnect grace). A deliberate goodbye waited
 * like a network drop, so a fast re-login met its own not-yet-cleaned
 * session - and the pending timer could later fire mid-login and wipe
 * the fresh session's maps.
 *
 * Fix, three parts:
 * 1. G marks session.cleanLogoff; disconnects skip every grace for it.
 * 2. wantsImmediateTeardown() decides (kicked or clean goodbye).
 * 3. Fresh login reclaims its own grace-ghost first (maps still naming
 *    the dead socket), so the already-on check reads a clean board.
 */
process.env.SKIP_SERVER_START = '1';

import {
  sessions,
  userSessions,
  socketToUser,
  socketToNodeId,
  pendingDisconnects,
  trackPendingDisconnect,
  clearPendingDisconnect,
  deleteSession,
  reclaimGraceGhost,
} from '../../src/server/session-manager';
import { wantsImmediateTeardown } from '../../src/server/socket-handlers';

const fakeSession = (socketId: string, nodeId: number): any => ({
  socketId,
  nodeId,
  user: { id: 9, username: 'ghost' },
});

function seedGhost(userId: string, socketId: string, nodeId: number): { timer: ReturnType<typeof setTimeout> } {
  const s = fakeSession(socketId, nodeId);
  sessions.set(String(nodeId), s);
  userSessions.set(userId, s);
  socketToUser.set(socketId, userId);
  socketToNodeId.set(socketId, nodeId);
  const timer = setTimeout(() => {}, 60000);
  trackPendingDisconnect(userId, socketId, nodeId, timer);
  return { timer };
}

function scrub(userId: string, socketId: string, nodeId: number): void {
  clearPendingDisconnect(userId);
  deleteSession(socketId);
  sessions.delete(String(nodeId));
  userSessions.delete(userId);
  socketToUser.delete(socketId);
  socketToNodeId.delete(socketId);
  pendingDisconnects.delete(userId);
}

describe('wantsImmediateTeardown', () => {
  test('a kicked session skips grace', () => {
    expect(wantsImmediateTeardown({ sysopKicked: true })).toBe(true);
  });

  test('a clean G logoff skips grace', () => {
    expect(wantsImmediateTeardown({ cleanLogoff: true })).toBe(true);
  });

  test('drops, timeouts and bumps keep their grace', () => {
    expect(wantsImmediateTeardown({})).toBe(false);
    expect(wantsImmediateTeardown({ sysopKicked: false, cleanLogoff: false })).toBe(false);
    expect(wantsImmediateTeardown(null)).toBe(false);
    expect(wantsImmediateTeardown(undefined)).toBe(false);
  });
});

describe('reclaimGraceGhost', () => {
  test('reclaims what still names the dead socket', () => {
    seedGhost('9', 'dead-sock', 7);
    expect(reclaimGraceGhost('9', () => false)).toBe(true);
    expect(pendingDisconnects.has('9')).toBe(false);
    expect(sessions.has('7')).toBe(false);
    expect(userSessions.has('9')).toBe(false);
    scrub('9', 'dead-sock', 7);
  });

  test('leaves a live socket alone', () => {
    seedGhost('9', 'live-sock', 7);
    expect(reclaimGraceGhost('9', (id) => id === 'live-sock')).toBe(false);
    expect(pendingDisconnects.has('9')).toBe(true);
    expect(sessions.has('7')).toBe(true);
    scrub('9', 'live-sock', 7);
  });

  test('leaves maps that already moved on to someone live', () => {
    seedGhost('9', 'dead-sock', 7);
    // Another tab took the user slot while the timer pended.
    const liveTab = fakeSession('live-tab-sock', 8);
    userSessions.set('9', liveTab);
    expect(reclaimGraceGhost('9', () => false)).toBe(false);
    expect(userSessions.get('9')).toBe(liveTab);
    scrub('9', 'dead-sock', 7);
    sessions.delete('8');
  });

  test('no pending timer, nothing to do', () => {
    expect(reclaimGraceGhost('nobody', () => false)).toBe(false);
  });
});
