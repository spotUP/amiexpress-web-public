/**
 * The door routes a browser fetches take no login (open-surface audit,
 * 2026-10-04): /api/doors/:doorId/bundle.js, /manifest and /assets/*. A
 * browser running a door must be able to fetch its CLIENT part; nothing else
 * of the door, and nothing outside Doors/, is a visitor's to read:
 *
 * - a hybrid door with no `client.entry` was bundled from its `main` - the
 *   SERVER code, keys and all - and sent to whoever asked;
 * - the door id is decoded by Express, so `..%2F` walked out of Doors/;
 * - a manifest's `client.bundle` was joined as given, so `../../user.data`
 *   served the user file;
 * - /api/doors/list listed every door on the board, sysop-only ones too.
 *
 * Through the real app (server/app.ts mounts the router at /api). The
 * bundler is replaced by one that returns the file it was asked to bundle,
 * which is exactly what this proves: WHICH file goes to the browser.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: () => jest.fn(async () => { throw new Error('no token'); }) }),
}));
jest.mock('../../src/handlers/door.handler', () => ({ getDoors: () => [] }));
jest.mock('../../src/doors/client-door-bundler', () => ({
  getClientDoorBundler: () => ({
    bundle: async ({ doorPath }: { doorPath: string }) => {
      const code = require('fs').readFileSync(doorPath, 'utf8');
      return { bundlePath: doorPath, bundleCode: code, hash: 'h', size: code.length };
    },
  }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import type { Express } from 'express';
import { setBoardRoot } from '../helpers/board-root';

let root = '';
let restoreBoard: () => void = () => {};
const ORIGINAL_ROOT = process.env.BBS_ROOT;

function door(dir: string, manifest: object, files: Record<string, string>): void {
  const base = path.join(root, dir);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(manifest));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
    fs.writeFileSync(path.join(base, name), body);
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-routes-'));
  restoreBoard = setBoardRoot(root);
  process.env.BBS_ROOT = root;
  fs.writeFileSync(path.join(root, 'user.data'), 'every caller');
});

afterEach(() => {
  restoreBoard();
  if (ORIGINAL_ROOT === undefined) delete process.env.BBS_ROOT;
  else process.env.BBS_ROOT = ORIGINAL_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

function app(): Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/server/app').app as Express;
}

test("a hybrid door's server code is never sent as its bundle", async () => {
  door('Doors/vault', { runtime: 'hybrid', main: 'index.ts' }, {
    'index.ts': 'const API_KEY = "sk-server-only";',
  });
  const res = await request(app()).get('/api/doors/vault/bundle.js');
  expect(res.status).toBe(404);
  expect(res.text).not.toContain('sk-server-only');
});

test("a hybrid door's client part is still sent", async () => {
  door('Doors/arcade', { runtime: 'hybrid', main: 'index.ts', client: { entry: './client.ts' } }, {
    'index.ts': 'const API_KEY = "sk-server-only";',
    'client.ts': 'export const drawn = "the client";',
  });
  const res = await request(app()).get('/api/doors/arcade/bundle.js');
  expect(res.status).toBe(200);
  expect(res.text).toContain('the client');
  expect(res.text).not.toContain('sk-server-only');
});

test('a door id cannot walk out of Doors/', async () => {
  door('Elsewhere', { name: 'not a door', runtime: 'client', client: { bundle: 'secret.js' } }, {
    'secret.js': 'outside the doors',
    'assets/x.txt': 'outside asset',
  });
  const bundle = await request(app()).get('/api/doors/..%2FElsewhere/bundle.js');
  expect(bundle.status).toBe(404);
  expect(bundle.text).not.toContain('outside the doors');
  expect((await request(app()).get('/api/doors/..%2FElsewhere/manifest')).status).toBe(404);
  expect((await request(app()).get('/api/doors/..%2FElsewhere/assets/x.txt')).status).toBe(404);
});

test("a manifest's bundle path stays inside its door", async () => {
  door('Doors/sneaky', { runtime: 'client', client: { bundle: '../../user.data' } }, {});
  const res = await request(app()).get('/api/doors/sneaky/bundle.js');
  expect(res.text).not.toContain('every caller');
});

test('the list of every door needs a sysop login', async () => {
  door('Doors/vault', { runtime: 'hybrid', main: 'index.ts', description: 'sysop only' }, {});
  const res = await request(app()).get('/api/doors/list');
  expect(res.status).toBe(401);
  expect(res.text).not.toContain('vault');
});
