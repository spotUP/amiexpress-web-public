/**
 * Regression tests for the cross-tab session leak fix (2026-04-24).
 *
 * Two bugs, one leak:
 *   A. getSession(socketId) used to check userSessions[userId] first, so a
 *      second tab logged in as the same user overwrote userSessions and the
 *      first tab's socket lookup returned the second tab's session.
 *   B. restore-session silently hijacked the existing session even when its
 *      old socket was still alive, rebinding session.socketId to whichever
 *      tab reconnected most recently.
 *
 * These tests exercise A directly (B requires socket.io wiring and is
 * verified manually on a running server).
 */

import {
  sessions,
  userSessions,
  socketToNodeId,
  socketToUser,
  getSession,
  setSession,
  deleteSession,
} from '../src/server/session-manager';

function freshBBSSession(nodeId: number, userId: string | undefined) {
  // Minimal shape — session-manager only reads .nodeId and .user.
  return {
    nodeId,
    user: userId ? { id: userId, userId } : undefined,
  } as any;
}

describe('Session manager — cross-tab leak fix', () => {
  beforeEach(() => {
    sessions.clear();
    userSessions.clear();
    socketToNodeId.clear();
    socketToUser.clear();
  });

  test('getSession resolves via socket→nodeId, not userSessions', () => {
    const sessionA = freshBBSSession(5, 'user-1');
    const sessionB = freshBBSSession(6, 'user-1');

    // Tab A logs in: session for node 5, socketA mapped.
    socketToNodeId.set('socketA', 5);
    socketToUser.set('socketA', 'user-1');
    setSession('socketA', sessionA);

    // Tab B logs in as the same user: session for node 6. userSessions gets
    // overwritten to sessionB — that used to poison tab A's lookup.
    socketToNodeId.set('socketB', 6);
    socketToUser.set('socketB', 'user-1');
    setSession('socketB', sessionB);

    // Each socket still resolves to its own session.
    expect(getSession('socketA')).toBe(sessionA);
    expect(getSession('socketB')).toBe(sessionB);
  });

  test('getSession falls back to userSessions only when no nodeId is mapped', () => {
    const session = freshBBSSession(9, 'user-2');
    userSessions.set('user-2', session);
    socketToUser.set('stray-socket', 'user-2');
    // No socketToNodeId mapping for 'stray-socket'.

    expect(getSession('stray-socket')).toBe(session);
  });

  test('setSession still writes the user→session index for non-chatOnly sessions', () => {
    const session = freshBBSSession(7, 'user-3');
    socketToNodeId.set('socketC', 7);
    setSession('socketC', session);
    expect(userSessions.get('user-3')).toBe(session);
  });

  test('setSession skips user→session for chatOnly sessions (earlier fix)', () => {
    const bbsSession = freshBBSSession(10, 'user-4');
    const chatSession = { ...freshBBSSession(11, 'user-4'), chatOnly: true };

    socketToNodeId.set('bbsSock', 10);
    setSession('bbsSock', bbsSession);

    socketToNodeId.set('chatSock', 11);
    setSession('chatSock', chatSession);

    // chatOnly must not stomp userSessions.
    expect(userSessions.get('user-4')).toBe(bbsSession);
  });

  test('deleteSession cleans up both socket and user indices', () => {
    const session = freshBBSSession(12, 'user-5');
    socketToNodeId.set('sockD', 12);
    socketToUser.set('sockD', 'user-5');
    setSession('sockD', session);

    expect(getSession('sockD')).toBe(session);
    deleteSession('sockD');
    expect(getSession('sockD')).toBeUndefined();
    expect(userSessions.has('user-5')).toBe(false);
  });
});
