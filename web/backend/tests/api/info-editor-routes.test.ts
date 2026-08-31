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
      // 200 with the standard envelope when dataDir is readable, 500 when not.
      //
      // This asserted `res.body.files` - the shape the route used to send.
      // Every caller types these endpoints as ApiResponse and reads `.data`,
      // so the route agreed with this test and with nothing else: the file
      // tree and both tooltype editors always showed zero files. The test was
      // codifying the bug, so it moves to the contract the clients use.
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.files)).toBe(true);
      }
    }, 60000); // Extended timeout: the endpoint walks the whole BBS tree - a few
    // thousand files - and under full-suite parallel load 30s was not enough.
    // It passes in about 3s on its own; this is headroom, not slowness that
    // has been accepted.
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
