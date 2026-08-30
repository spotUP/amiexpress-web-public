/**
 * doorAdminRouter — POST /api/door-admin/installed
 *
 * Mounted at /api/door-admin, not /api/doors (the brief's original prefix):
 * /api/doors is already door-api-routes.ts, which serves browsers with no
 * door token at all (client door bundles, manifests, assets). Putting this
 * router's token-gated middleware on that prefix would 401 every one of
 * those unauthenticated browser requests.
 *
 * This is the one route the DoorRepo C door can reach to report an install
 * it already performed on disk. It is a remote door-wipe surface if left
 * unauthenticated (RepoHost=bbs.uprough.net ships baked into other people's
 * doors), so every request must carry a valid launch token AND secLevel
 * >= 250, checked server-side on every request.
 */
import express from 'express';
import request from 'supertest';

const recorded: any[] = [];
jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn((input: any) => { recorded.push(input); }),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter, doorAdminBodyError } from '../../src/server/door-admin.routes';

// Mounts the parser, the body-parser error handler, and the router in the
// exact order app.ts does (see app.ts's `/api/door-admin` mount). Importing
// doorAdminBodyError from door-admin.routes.ts rather than redefining it
// here means this helper and the real mount can never drift apart - there
// is only one function, used in both places.
function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

beforeEach(() => { recorded.length = 0; claims = { nodeId: '1', userId: 7, secLevel: 255 }; });

it('records an install the door reports', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('OK');
  expect(recorded[0]).toMatchObject({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });
});

it('refuses without a token', async () => {
  claims = null;
  const res = await request(app())
    .post('/api/door-admin/installed')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(401);
  expect(recorded).toHaveLength(0);
});

it('refuses a user who is not a sysop, token or no token', async () => {
  claims = { nodeId: '1', userId: 9, secLevel: 100 };
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(403);
  expect(recorded).toHaveLength(0);
});

it('refuses a command that is not a command', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: '../../etc', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(400);
  expect(recorded).toHaveLength(0);
});

// A body-parser failure (malformed JSON, a bare JSON string, a body over
// the limit) happens in express.json() before doorAdminRouter ever runs.
// Without doorAdminBodyError sitting between the parser and the router,
// this falls through to app.ts's global error handler, which answers with
// a JSON body - exactly what a C89 door reading plain text CRLF must never
// receive on any path, including this one.
it('answers malformed JSON in plain text, never JSON', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .set('Content-Type', 'application/json')
    .send('{not valid json');

  expect(res.status).toBe(400);
  expect(res.text).toBe('BAD REQUEST\r\n');
  expect(res.headers['content-type']).toMatch(/text\/plain/);
});

it('answers a bare JSON string in plain text', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .set('Content-Type', 'application/json')
    .send('"hello"');

  expect(res.status).toBe(400);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
});

// The command regex builds filesystem paths (installDir, infoPath) on a
// public, delete-adjacent surface - the regex looking correct on inspection
// is not the same as it being exercised against the shapes an attacker
// would actually try. Every case must both 400 AND leave `recorded` empty:
// the status code alone doesn't prove the value never reached the
// filesystem-touching recorder.
it.each([
  ['a traversal', '../../etc'],
  ['a path separator', 'FOO/BAR'],
  ['an encoded separator', 'FOO%2F..'],
  ['a backslash', 'FOO\\BAR'],
  ['an empty command', ''],
  ['a name over twelve characters', 'THIRTEENCHARS'],
  ['an embedded null byte', 'FOO BAR'],
])('refuses %s and records nothing', async (_label, command) => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command, archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(400);
  expect(res.text).toBe('BAD REQUEST\r\n');
  expect(recorded).toHaveLength(0);
});
