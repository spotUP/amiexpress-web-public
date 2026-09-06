/**
 * The revision history the admin's Revisions button reads.
 *
 * Driven through the routes, because that is what went missing. e29dd5698
 * added `saveRevision` to `writeToTargets` and three endpoints on top of the
 * screens router; 08be9a627 restored screens-routes.ts from main's pre-merge
 * side to undo a bad merge, and those three - which had landed the day AFTER
 * that merge and were in neither of its parents - went with it.
 *
 * Nothing failed loudly. screen-revisions.ts stayed in src with no importer,
 * config-app kept ScreenRevisionsPanel and three client methods, and the
 * button answered 404. So the pin is on the ROUTES, not on the module: a
 * green screen-revisions unit test would have said nothing about any of it.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

const SCREEN = 'Node1/BBSTITLE.txt';
// 0xA1 is an Amiga high-bit byte: a revision is stored and returned as BYTES,
// and a UTF-8 round trip anywhere in the chain would turn it into U+FFFD.
const V1 = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0x0d, 0x0a]);
const V2 = Buffer.from([0x1b, 0x5b, 0x33, 0x32, 0x6d, 0xb0, 0x0d, 0x0a]);

function put(content: Buffer) {
  return request(app)
    .put('/api/screens/file')
    .query({ path: SCREEN })
    .send({ content: content.toString('base64'), carryCodes: 'none' });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-revisions-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, SCREEN), V1);

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the revision history of a screen', () => {
  it('is empty before anything overwrites the file', async () => {
    const res = await request(app).get('/api/screens/revisions').query({ path: SCREEN });

    expect(res.status).toBe(200);
    expect(res.body.data.revisions).toEqual([]);
  });

  it('gains an entry for the version a write replaced', async () => {
    expect((await put(V2)).status).toBe(200);

    const res = await request(app).get('/api/screens/revisions').query({ path: SCREEN });
    expect(res.status).toBe(200);
    expect(res.body.data.revisions).toHaveLength(1);
    expect(res.body.data.revisions[0].source).toBe(SCREEN);
    expect(res.body.data.revisions[0].bytes).toBe(V1.length);
  });

  it('hands back the replaced version byte for byte', async () => {
    await put(V2);
    const list = await request(app).get('/api/screens/revisions').query({ path: SCREEN });

    const res = await request(app)
      .get('/api/screens/revision')
      .query({ path: SCREEN, file: list.body.data.revisions[0].file });

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body.data.content, 'base64')).toEqual(V1);
  });

  it('puts a revision back on disk, and keeps the version it displaced', async () => {
    await put(V2);
    const list = await request(app).get('/api/screens/revisions').query({ path: SCREEN });

    const res = await request(app)
      .post('/api/screens/restore')
      .send({ path: SCREEN, file: list.body.data.revisions[0].file });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(root, SCREEN))).toEqual(V1);

    // The restore snapshots what it overwrote, so V2 is recoverable too.
    const after = await request(app).get('/api/screens/revisions').query({ path: SCREEN });
    expect(after.body.data.revisions).toHaveLength(2);
  });

  it('answers 404 for a revision that is not there, rather than 200 with nothing', async () => {
    const view = await request(app)
      .get('/api/screens/revision')
      .query({ path: SCREEN, file: 'no-such-revision.bin' });
    expect(view.status).toBe(404);

    const restore = await request(app)
      .post('/api/screens/restore')
      .send({ path: SCREEN, file: 'no-such-revision.bin' });
    expect(restore.status).toBe(404);
  });

  it('refuses a call with no path, rather than listing the whole store', async () => {
    expect((await request(app).get('/api/screens/revisions')).status).toBe(400);
    expect((await request(app).get('/api/screens/revision').query({ path: SCREEN })).status).toBe(400);
    expect((await request(app).post('/api/screens/restore').send({ path: SCREEN })).status).toBe(400);
  });
});
