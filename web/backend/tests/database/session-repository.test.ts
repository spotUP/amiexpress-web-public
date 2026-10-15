/**
 * Session Repository Tests
 */

import { SessionRepository } from '../../src/database/session-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

function makeSession(id: string, overrides: any = {}) {
  return {
    id,
    userId: undefined,
    socketId: `socket-${id}`,
    state: 'LOGGEDON',
    subState: undefined,
    currentConf: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: new Date(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'General',
    cmdShortcuts: false,
    ...overrides,
  };
}

function makeNodeSession(id: string, nodeId: number, overrides: any = {}) {
  return {
    id,
    nodeId,
    userId: undefined,
    socketId: `socket-${id}`,
    state: 'LOGGEDON',
    currentConf: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: new Date(),
    status: 'active' as const,
    ...overrides,
  };
}

describe('SessionRepository', () => {
  let repo: SessionRepository;
  let rawDb: any;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new SessionRepository(rawDb);
  }, 30000);

  describe('Session CRUD', () => {
    const sessionId = `test-session-${Date.now()}`;

    afterEach(() => {
      rawDb.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    });

    it('createSession then getSession round-trip', async () => {
      await repo.createSession(makeSession(sessionId));
      const session = await repo.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(sessionId);
      expect(session!.state).toBe('LOGGEDON');
    });

    it('getSession returns null for unknown id', async () => {
      const session = await repo.getSession('nonexistent-session-id');
      expect(session).toBeNull();
    });

    it('updateSession modifies session fields', async () => {
      await repo.createSession(makeSession(sessionId, { timeRemaining: 3600 }));
      await repo.updateSession(sessionId, { timeRemaining: 1800 });
      const session = await repo.getSession(sessionId);
      expect(session!.timeRemaining).toBe(1800);
    });

    it('deleteSession removes the row', async () => {
      await repo.createSession(makeSession(sessionId));
      await repo.deleteSession(sessionId);
      const session = await repo.getSession(sessionId);
      expect(session).toBeNull();
    });

    it('getActiveSessions returns active sessions', async () => {
      await repo.createSession(makeSession(sessionId));
      const active = await repo.getActiveSessions();
      expect(Array.isArray(active)).toBe(true);
      expect(active.some(s => s.id === sessionId)).toBe(true);
    });
  });

  describe('NodeSession', () => {
    const nodeSessionId = `node-session-${Date.now()}`;
    const nodeId = 77;

    afterEach(() => {
      rawDb.prepare('DELETE FROM node_sessions WHERE id = ?').run(nodeSessionId);
    });

    it('createNodeSession then getNodeSessions', async () => {
      await repo.createNodeSession(makeNodeSession(nodeSessionId, nodeId));
      const sessions = await repo.getNodeSessions(nodeId);
      expect(sessions.some(s => s.id === nodeSessionId)).toBe(true);
    });

    it('updateNodeSession updates fields', async () => {
      await repo.createNodeSession(makeNodeSession(nodeSessionId, nodeId));
      await repo.updateNodeSession(nodeSessionId, { status: 'idle' });
      const sessions = await repo.getNodeSessions(nodeId);
      const updated = sessions.find(s => s.id === nodeSessionId);
      expect(updated!.status).toBe('idle');
    });

    it('getNodeSessions with no filter returns all', async () => {
      await repo.createNodeSession(makeNodeSession(nodeSessionId, nodeId));
      const all = await repo.getNodeSessions();
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('DB session cleanup (regression: cleanup was a no-op)', () => {
    // node_sessions.nodeid is UNIQUE — each row needs a distinct node id.
    const idleId = `idle-${Date.now()}`;
    const freshId = `fresh-${Date.now()}`;
    const ancientId = `ancient-${Date.now()}`;

    afterEach(() => {
      for (const id of [idleId, freshId, ancientId]) {
        rawDb.prepare('DELETE FROM node_sessions WHERE id = ?').run(id);
      }
    });

    it('markIdleSessionsDisconnected flips only stale active rows', async () => {
      const old = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
      await repo.createNodeSession(makeNodeSession(idleId, 88, { lastActivity: old, status: 'active' }));
      await repo.createNodeSession(makeNodeSession(freshId, 89, { lastActivity: new Date(), status: 'active' }));

      const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30m
      const changed = await repo.markIdleSessionsDisconnected(cutoff);
      expect(changed).toBeGreaterThanOrEqual(1);

      const sessions = await repo.getNodeSessions();
      expect(sessions.find(s => s.id === idleId)!.status).toBe('disconnected');
      expect(sessions.find(s => s.id === freshId)!.status).toBe('active');
    });

    it('deleteOldNodeSessions removes rows past the cutoff', async () => {
      const ancient = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days
      await repo.createNodeSession(makeNodeSession(ancientId, 90, { lastActivity: ancient }));

      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deleted = await repo.deleteOldNodeSessions(cutoff);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const sessions = await repo.getNodeSessions();
      expect(sessions.some(s => s.id === ancientId)).toBe(false);
    });
  });
});
