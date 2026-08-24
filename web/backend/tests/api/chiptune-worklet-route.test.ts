/**
 * chiptune3 AudioWorklet serving (door-api-routes.ts).
 *
 * The SDK TrackerEngine plays MOD/XM/S3M/IT (and 30 more formats) through
 * chiptune3, which registers its AudioWorklet with
 * `new URL('./chiptune3.worklet.js', import.meta.url)`. Inside a door
 * bundle that URL resolves to a sibling of /api/doors/:doorId/bundle.js,
 * so the backend must answer those two sibling paths with the worklet
 * files from the SDK's chiptune3 package. Without this route the request
 * 404s and every tracker-music door is silent.
 */
import request from 'supertest';
import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { doorApiRouter } from '../../src/doors/door-api-routes';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CHIPTUNE_DIR = path.join(REPO_ROOT, 'sdk', 'node_modules', 'chiptune3');

function makeApp() {
  const app = express();
  app.use('/api', doorApiRouter);
  return app;
}

describe('chiptune3 worklet route', () => {
  beforeAll(() => {
    // BBS_ROOT drives getBbsRoot() inside the router; tests do not run
    // from web/backend/../../, so pin it to the repo root explicitly.
    process.env.BBS_ROOT = REPO_ROOT;
  });

  afterAll(() => {
    delete process.env.BBS_ROOT;
  });

  it('serves chiptune3.worklet.js as a sibling of any door bundle', async () => {
    const res = await request(makeApp()).get('/api/doors/ARKANOID/chiptune3.worklet.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    // The real worklet registers the libopenmpt processor.
    expect(res.text).toContain('libopenmpt');
  });

  it('serves libopenmpt.worklet.js (the 1.7 MB wasm payload) with caching', async () => {
    const res = await request(makeApp()).get('/api/doors/ARKANOID/libopenmpt.worklet.js');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age');
    const onDisk = fs.statSync(path.join(CHIPTUNE_DIR, 'libopenmpt.worklet.js')).size;
    expect(Number(res.headers['content-length'])).toBe(onDisk);
  });

  it('is door-id agnostic - the same files back every door', async () => {
    const a = await request(makeApp()).get('/api/doors/ARKANOID/chiptune3.worklet.js');
    const b = await request(makeApp()).get('/api/doors/SOMEOTHERDOOR/chiptune3.worklet.js');

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.text).toBe(b.text);
  });

  it('does not open a generic file-serving hole next to the bundle', async () => {
    const res = await request(makeApp()).get('/api/doors/ARKANOID/package.json');

    expect(res.status).toBe(404);
  });
});
