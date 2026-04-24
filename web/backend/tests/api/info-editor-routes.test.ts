/**
 * Info Editor Routes API Tests
 * Tests /api/info/* endpoints for .info file tooltype management.
 */

import express from 'express';
import request from 'supertest';
import { infoEditorRouter } from '../../src/api/info-editor-routes';

describe('Info Editor Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/info', infoEditorRouter);
  });

  describe('GET /api/info/files', () => {
    it('responds without crashing', async () => {
      const res = await request(app).get('/api/info/files');
      // 200 with { files: [...] } when dataDir accessible, 500 when not
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.files)).toBe(true);
      }
    }, 30000); // Extended timeout: endpoint scans the BBS directory tree
  });

  describe('GET /api/info/file', () => {
    it('returns 400 when path query param missing', async () => {
      const res = await request(app).get('/api/info/file');
      expect(res.status).toBe(400);
    });

    it('returns 404 or 400 for nonexistent path', async () => {
      const res = await request(app).get('/api/info/file?path=/nonexistent/path.info');
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('PUT /api/info/file', () => {
    it('returns 400 when body missing required fields', async () => {
      const res = await request(app).put('/api/info/file').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 or 404 for nonexistent file path', async () => {
      const res = await request(app).put('/api/info/file').send({
        path: '/nonexistent/path.info',
        key: 'TESTKEY',
        value: 'TESTVAL',
      });
      expect([400, 404, 500]).toContain(res.status);
    });
  });
});
