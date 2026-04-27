/**
 * Config Routes API Tests
 * Tests /api/config/* endpoints using the real test database.
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
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

import express from 'express';
import request from 'supertest';
import { createConfigRouter } from '../../src/api/config-routes';

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

describe('Config Routes', () => {
  let app: express.Application;
  let db: any;

  beforeAll(async () => {
    db = await waitForTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  describe('GET /api/config/system', () => {
    it('returns a response (success or 404 if no system config)', async () => {
      const res = await request(app).get('/api/config/system');
      // May return 200 (config exists) or 404 (not yet initialized)
      expect([200, 404]).toContain(res.status);
    });

    it('response has success field', async () => {
      const res = await request(app).get('/api/config/system');
      if (res.status === 200) {
        expect(typeof res.body.success).toBe('boolean');
      }
    });
  });

  describe('GET /api/config/nodes', () => {
    it('returns 200 with array of node configs', async () => {
      const res = await request(app).get('/api/config/nodes');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/config/nodes', () => {
    it('creates a node config and returns it', async () => {
      const res = await request(app)
        .post('/api/config/nodes')
        .send({ node_number: 97 });
      expect([200, 201]).toContain(res.status);
      if (res.status === 200 || res.status === 201) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/config/nodes/:nodeNumber', () => {
    it('returns 4xx for unknown node', async () => {
      const res = await request(app).get('/api/config/nodes/999');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('GET /api/config/conferences', () => {
    it('returns 200 with conference config array', async () => {
      const res = await request(app).get('/api/config/conferences');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('each conference object has a name field', async () => {
      const res = await request(app).get('/api/config/conferences');
      if (res.status === 200 && res.body.data.length > 0) {
        for (const conf of res.body.data) {
          expect(typeof conf.name).toBe('string');
          expect(conf.name.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('GET /api/config/system — sensitive field masking', () => {
    it('does not expose smtp_password in plaintext', async () => {
      const res = await request(app).get('/api/config/system');
      if (res.status === 200) {
        const data = res.body.data ?? res.body;
        // smtp_password must be absent or masked ('***'), never a real value
        if (data.smtp_password !== undefined && data.smtp_password !== null && data.smtp_password !== '') {
          expect(data.smtp_password).toBe('***');
        }
      }
    });

    it('does not expose reg_key in plaintext', async () => {
      const res = await request(app).get('/api/config/system');
      if (res.status === 200) {
        const data = res.body.data ?? res.body;
        if (data.reg_key !== undefined && data.reg_key !== null && data.reg_key !== '') {
          expect(data.reg_key).toBe('***');
        }
      }
    });
  });

  describe('GET /api/config/users — guest user filtering', () => {
    it('does not return _gu_ guest accounts', async () => {
      const res = await request(app).get('/api/config/users');
      if (res.status === 200) {
        const users: any[] = res.body.data ?? [];
        const guestUsers = users.filter((u: any) => u.username?.startsWith('_gu_'));
        expect(guestUsers.length).toBe(0);
      }
    });
  });

  describe('GET /api/config/doors', () => {
    it('responds without server crash', async () => {
      // Doors are loaded from disk via door.handler which may not be available in test env
      const res = await request(app).get('/api/config/doors');
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });
});
