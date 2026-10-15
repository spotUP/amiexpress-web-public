/**
 * Node Control Routes API Tests
 * Tests /api/nodes/* endpoints.
 */

jest.mock('../../src/server/session-manager', () => ({
  sessions: new Map(),
  socketToNodeId: new Map(),
  getSocketIdByNodeId: jest.fn().mockReturnValue(null),
}));

// POST /:nodeId/chat (SV_CHAT) delegates entirely to initiateSysopChat -
// exercised end-to-end (real acceptPage()/endChat()/activeChatSessions) in
// tests/handlers/operator-chat-sysop-initiated.test.ts. Mocked here so this
// file stays a route-wiring test: status codes and response fields, not the
// chat machinery.
jest.mock('../../src/handlers/operator-chat.handler', () => ({
  initiateSysopChat: jest.fn(),
}));
jest.mock('../../src/database', () => ({
  db: { getOperatorChatRepository: jest.fn().mockReturnValue({}) },
}));

import express from 'express';
import request from 'supertest';
import { createNodeControlRouter } from '../../src/api/node-control-routes';
import { initiateSysopChat } from '../../src/handlers/operator-chat.handler';
import {
  resetAllNodeReservations,
  getNodeReservation,
  setNodeReservation,
} from '../../src/services/node-reservation.service';

const mockInitiateSysopChat = initiateSysopChat as jest.Mock;

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
    // Default: matches express.e:1411-1412 (SV_CHAT is a no-op with nobody
    // logged on) — individual tests override with mockResolvedValueOnce.
    mockInitiateSysopChat.mockResolvedValue({
      success: false,
      message: 'Node has no caller logged on',
    });
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

  describe('POST /api/nodes/:nodeId/chat (SV_CHAT, P2-8 — sysop-initiated, ACP.e:1005-1013/express.e:1411-1412,7845-7862)', () => {
    // The route is a thin wire to initiateSysopChat (mocked above); the real
    // behaviour — toggle on/off, the door-interrupt queue, the "no caller
    // logged on" no-op — is exercised end-to-end in
    // tests/handlers/operator-chat-sysop-initiated.test.ts.
    it('is no longer a 501 stub: 200 + the pageId when initiateSysopChat opens a chat', async () => {
      mockInitiateSysopChat.mockResolvedValueOnce({
        success: true,
        pageId: 'page-1',
        message: 'Chat started with Caller on node 1',
      });

      const res = await request(app).post('/api/nodes/1/chat');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.command).toBe('SV_CHAT');
      expect(res.body.pageId).toBe('page-1');
      expect(mockInitiateSysopChat).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 1, expect.any(String), expect.any(String), expect.any(String)
      );
    });

    it('reports ended:true when the call toggled an existing chat off (chatFlag:=Not(chatFlag))', async () => {
      mockInitiateSysopChat.mockResolvedValueOnce({
        success: true,
        ended: true,
        pageId: 'page-1',
        message: 'Chat with node 1 ended',
      });

      const res = await request(app).post('/api/nodes/1/chat');

      expect(res.status).toBe(200);
      expect(res.body.ended).toBe(true);
    });

    it('reports queued:true when the caller is inside a door', async () => {
      mockInitiateSysopChat.mockResolvedValueOnce({
        success: true,
        queued: true,
        pageId: 'page-1',
        message: 'Caller is inside a door; chat will open when they return to a prompt',
      });

      const res = await request(app).post('/api/nodes/1/chat');

      expect(res.status).toBe(200);
      expect(res.body.queued).toBe(true);
    });

    it('returns 4xx (not 501) for a node with no caller logged on (express.e:1411-1412)', async () => {
      const res = await request(app).post('/api/nodes/99/chat');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(501);
      expect(res.body.success).toBe(false);
    });
  });
  describe('supervisor commands with nothing on the other end', () => {
    // `supervisor:command` is emitted and NOTHING in this codebase subscribes
    // to it. Nine of the eleven Node Control buttons ended in that emit and the
    // route answered `{ success: true }` - so the sysop pressed Reinitialize
    // Modem and was told it had worked.
    //
    // SV_CHAT (P2-8) is no longer in this list: it is a real, implemented
    // feature now (see the describe block above), not a dead button.
    const DEAD = [
      ['/api/nodes/1/uniconify', 'SV_UNICONIFY'],
      ['/api/nodes/1/sysop-login', 'SV_SYSOPLOG'],
      ['/api/nodes/1/instant-login', 'SV_INSTANT'],
      ['/api/nodes/1/exit', 'SV_EXITNODE'],
      ['/api/nodes/1/offhook', 'SV_NODEOFFHOOK'],
      ['/api/nodes/1/init-modem', 'SV_INITMODEM'],
      ['/api/nodes/1/start', 'SV_STARTNODE'],
      ['/api/nodes/toggle-chat', 'SV_CHATTOGGLE'],
      ['/api/nodes/quiet-mode', 'SV_QUIETNODE'],
    ];

    it.each(DEAD)('%s answers 501 rather than claiming success', async (url, command) => {
      const res = await request(app).post(url as string).send({ enabled: true });

      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
      expect(res.body.command).toBe(command);
    });

    it('kick still refuses a node that is not online', async () => {
      // Kick is the one of the nine with an unambiguous meaning here - a
      // browser node IS its socket - so it does the real thing instead.
      const res = await request(app).post('/api/nodes/99/kick');

      // 404 when the session-manager mock intercepts, 500 when it does not -
      // the sibling test above documents the same. What matters is that this
      // is NOT a 501: kick is implemented, and it disconnects the socket.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(501);
    });
  });
});
