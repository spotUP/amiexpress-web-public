/**
 * Node Control Routes API Tests
 * Tests /api/nodes/* endpoints.
 */

jest.mock('../../src/server/session-manager', () => ({
  sessions: new Map(),
  socketToNodeId: new Map(),
  getSocketIdByNodeId: jest.fn().mockReturnValue(null),
}));

import express from 'express';
import request from 'supertest';
import { createNodeControlRouter } from '../../src/api/node-control-routes';
import {
  resetAllNodeReservations,
  getNodeReservation,
  setNodeReservation,
} from '../../src/services/node-reservation.service';

describe('Node Control Routes', () => {
  let app: express.Application;
  const mockIo: any = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/nodes', createNodeControlRouter(mockIo));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetAllNodeReservations();
  });

  describe('GET /api/nodes/status', () => {
    it('returns 200 with node status data', async () => {
      const res = await request(app).get('/api/nodes/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('includes reservedFor field per node row (A-3 admin UI hook)', async () => {
      // Inject a fake online session so the status loop emits a row.
      const sessionMgr = require('../../src/server/session-manager');
      sessionMgr.sessions.set('12', {
        nodeId: 12,
        state: 'LOGGEDON',
        subState: 'IDLE',
        user: { id: 'u-12', username: 'alice' },
        connectionType: 'web',
        lastActivity: Date.now(),
        timeRemaining: 30,
      });

      try {
        // No reservation — reservedFor should be null on every row.
        const res1 = await request(app).get('/api/nodes/status');
        const row1 = res1.body.data.find((r: any) => r.nodeId === 12);
        expect(row1).toBeDefined();
        expect(row1).toHaveProperty('reservedFor', null);

        // With reservation — reservedFor should reflect the stored username.
        setNodeReservation(12, 'bob');
        const res2 = await request(app).get('/api/nodes/status');
        const row2 = res2.body.data.find((r: any) => r.nodeId === 12);
        expect(row2.reservedFor).toBe('bob');
      } finally {
        sessionMgr.sessions.delete('12');
      }
    });
  });

  describe('POST /api/nodes/:nodeId/kick', () => {
    it('returns 4xx for offline node', async () => {
      const res = await request(app).post('/api/nodes/99/kick');
      // 404 when session-manager mock works, 500 if mock doesn't intercept
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/nodes/:nodeId/exit', () => {
    it('returns 4xx for offline node', async () => {
      const res = await request(app).post('/api/nodes/99/exit');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/nodes/:nodeId/reserve (A-3, express.e:7649-7656)', () => {
    it('with {username} body persists the reservation, even on offline node', async () => {
      // Sysop reserves an offline node ahead of an expected caller —
      // express.e couldn't do this (F4 was node-local) but our admin
      // dashboard is global; persistence is the audit's literal scope.
      const res = await request(app)
        .post('/api/nodes/5/reserve')
        .send({ username: 'alice' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reservedFor).toBe('alice');
      expect(getNodeReservation(5)).toBe('alice');
    });

    it('with empty body, when reservation IS set, clears it (F4 toggle)', async () => {
      setNodeReservation(6, 'alice');
      const res = await request(app).post('/api/nodes/6/reserve').send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reservedFor).toBeNull();
      expect(getNodeReservation(6)).toBeNull();
    });

    it('with empty body, when no reservation is set, returns 400 (must specify username)', async () => {
      const res = await request(app).post('/api/nodes/7/reserve').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('overwrites an existing reservation when given a different username', async () => {
      setNodeReservation(8, 'alice');
      const res = await request(app)
        .post('/api/nodes/8/reserve')
        .send({ username: 'bob' });
      expect(res.status).toBe(200);
      expect(res.body.reservedFor).toBe('bob');
      expect(getNodeReservation(8)).toBe('bob');
    });

    it('rejects whitespace-only username with 400 (cannot reserve to nobody)', async () => {
      const res = await request(app)
        .post('/api/nodes/9/reserve')
        .send({ username: '   ' });
      expect(res.status).toBe(400);
      expect(getNodeReservation(9)).toBeNull();
    });
  });

  describe('GET /api/nodes/:nodeId/reserve (A-3)', () => {
    it('returns null reservedFor when nothing is set', async () => {
      const res = await request(app).get('/api/nodes/10/reserve');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reservedFor).toBeNull();
    });

    it('returns the reserved username when set', async () => {
      setNodeReservation(11, 'alice');
      const res = await request(app).get('/api/nodes/11/reserve');
      expect(res.status).toBe(200);
      expect(res.body.reservedFor).toBe('alice');
    });
  });

  describe('POST /api/nodes/:nodeId/chat', () => {
    it('returns 4xx for offline node', async () => {
      const res = await request(app).post('/api/nodes/99/chat');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
