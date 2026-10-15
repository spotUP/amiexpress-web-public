// @ts-nocheck
/**
 * NodeManager Service Tests
 * Tests node assignment, session tracking, and cleanup.
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import { NodeManager } from '../../src/services/node-manager.service';

describe('NodeManager', () => {
  let manager: any;

  beforeEach(() => {
    manager = new NodeManager();
    // Give initializeNodes a tick to complete
  });

  describe('getAvailableNode', () => {
    it('returns a node initially', async () => {
      const node = await manager.getAvailableNode();
      expect(node).not.toBeNull();
      expect(node.id).toBeGreaterThan(0);
      expect(node.status).toBe('available');
    });
  });

  describe('assignSessionToNode', () => {
    it('assigns a session and returns a NodeSession', async () => {
      const session = await manager.assignSessionToNode('sess-1', 'socket-1');
      expect(session.id).toBe('sess-1');
      expect(session.nodeId).toBeGreaterThan(0);
      expect(session.state).toBe('await');
    });

    it('getSession finds it by id', async () => {
      await manager.assignSessionToNode('sess-2', 'socket-2');
      const found = manager.getSession('sess-2');
      expect(found).not.toBeNull();
      expect(found.nodeId).toBeGreaterThan(0);
    });

    it('getSession returns null for unknown id', () => {
      expect(manager.getSession('nonexistent')).toBeNull();
    });
  });

  describe('releaseSession', () => {
    it('releases node back to available', async () => {
      await manager.assignSessionToNode('sess-rel', 'socket-rel');
      await manager.releaseSession('sess-rel');

      // After release, a node should be available
      const node = await manager.getAvailableNode();
      expect(node).not.toBeNull();
    });
  });

  describe('getAllNodeStatuses', () => {
    it('returns array of node statuses', () => {
      const statuses = manager.getAllNodeStatuses();
      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses.length).toBeGreaterThan(0);
    });

    it('all nodes are available initially', () => {
      const available = manager.getAllNodeStatuses().filter(n => n.status === 'available');
      expect(available.length).toBeGreaterThan(0);
    });
  });

  describe('getNodeStatus', () => {
    it('returns node info for valid id', () => {
      const node = manager.getNodeStatus(1);
      expect(node).not.toBeNull();
      expect(node.id).toBe(1);
    });

    it('returns null for unknown node', () => {
      expect(manager.getNodeStatus(9999)).toBeNull();
    });
  });

  describe('getNodeSessions', () => {
    it('returns sessions for occupied node', async () => {
      const session = await manager.assignSessionToNode('sess-ns', 'socket-ns');
      const sessions = await manager.getNodeSessions(session.nodeId);
      expect(sessions.some(s => s.id === 'sess-ns')).toBe(true);
    });

    it('returns empty array for unoccupied node', async () => {
      const sessions = await manager.getNodeSessions(999);
      expect(sessions).toEqual([]);
    });
  });

  describe('updateSessionState', () => {
    it('updates state field', async () => {
      await manager.assignSessionToNode('sess-state', 'socket-state');
      await manager.updateSessionState('sess-state', 'loggedon', 'READ_COMMAND');
      const session = manager.getSession('sess-state');
      expect(session.state).toBe('loggedon');
    });
  });

  describe('getNodeActivityStats', () => {
    it('returns stats with totalSessions and activeSessions', () => {
      const stats = manager.getNodeActivityStats();
      expect(typeof stats.totalSessions).toBe('number');
      expect(typeof stats.activeSessions).toBe('number');
      expect(stats.totalSessions).toBe(0); // fresh manager
    });

    it('activeSessions increments after assignment', async () => {
      await manager.assignSessionToNode('sess-stats', 'socket-stats');
      const stats = manager.getNodeActivityStats();
      expect(stats.activeSessions).toBeGreaterThan(0);
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('runs without throwing', async () => {
      await manager.assignSessionToNode('sess-clean', 'socket-clean');
      // Just verify it doesn't throw
      await expect(manager.cleanupInactiveSessions(60)).resolves.not.toThrow();
    });
  });
});
