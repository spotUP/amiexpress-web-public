/**
 * GET /api/door-admin/installed/:cmd/info — a command's tooltypes.
 *
 * Real .info files on a real temp root, including a binary DiskObject copied
 * from the board's own Commands/BBSCmd. A commented tooltype must survive the
 * round trip flagged: a reader that silently dropped disabled entries would
 * make the phase C editor built on it delete them.
 *
 * Which syntax counts as commented depends on the file's form, and that was
 * measured rather than assumed - see the parenthesis case below.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

let root: string;

jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn(),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter, doorAdminBodyError } from '../../src/server/door-admin.routes';

function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

function info(cmd: string) {
  return request(app()).get(`/api/door-admin/installed/${cmd}/info`).set('X-Door-Token', 'valid');
}

function rowsOf(text: string): string[] {
  return text.split('\r\n').slice(1).filter((l) => l !== '');
}

function writeInfo(command: string, lines: string[]): void {
  const dir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${command}.info`), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dooradmin-info-'));
  process.env.BBS_DATA_DIR = root;
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_DATA_DIR;
});

it('lists the tooltypes of a command', async () => {
  writeInfo('AEHELP', ['NAME=AE Help', 'LOCATION=Doors/AEHELP', 'ACCESS=10']);

  const res = await info('AEHELP');

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  const rows = rowsOf(res.text);
  expect(res.text.split('\r\n')[0]).toBe(`INFO|${rows.length}`);
  expect(rows).toContain('0|NAME|AE Help');
  expect(rows).toContain('0|LOCATION|Doors/AEHELP');
  expect(rows).toContain('0|ACCESS|10');
});

it('keeps a commented tooltype flagged rather than dropping it', async () => {
  writeInfo('AEHELP', ['NAME=AE Help', '!INTERNAL=1']);

  const res = await info('AEHELP');

  const rows = rowsOf(res.text);
  expect(rows.some((r) => r.startsWith('1|INTERNAL|'))).toBe(true);
});

it('reads a real binary DiskObject .info from the board', async () => {
  // The .info files on the board are binary Amiga DiskObjects (e3 10 ...),
  // not the text variant the other cases here write. The fixture is a real
  // one copied out of Commands/BBSCmd, and it is CHECKED IN: the first
  // version of this test read the board's own copy, which is untracked
  // runtime state, so it passed here and died with ENOENT in CI.
  const source = path.join(__dirname, '..', 'fixtures', 'wall.info');
  const dir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(source, path.join(dir, 'WALL.info'));

  const res = await info('WALL');

  expect(res.status).toBe(200);
  const rows = rowsOf(res.text);
  expect(res.text.split('\r\n')[0]).toBe(`INFO|${rows.length}`);
  expect(rows.length).toBeGreaterThan(0);
  // Every row is <commented>|<key>|<value>, and nothing leaked a separator.
  for (const row of rows) {
    expect(row.split('|')).toHaveLength(3);
    expect(row).toMatch(/^[01]\|/);
  }
});

it('reports a parenthesised key in a TEXT .info as a literal key, not as commented', async () => {
  // Pinning measured behaviour, not endorsing it. extractTooltypesFallback
  // (info-file.util.ts) honours the `!KEY` form and leaves `(KEY)` as part of
  // the key; the parenthesis form is handled for binary DiskObject tooltypes
  // only. Phase C's writer has to know which it is looking at.
  writeInfo('PARENS', ['NAME=X', '(INTERNAL)=1']);

  const res = await info('PARENS');

  const rows = rowsOf(res.text);
  expect(rows).toContain('0|(INTERNAL)|1');
});

it('accepts a lower-case command and reads the upper-case .info', async () => {
  writeInfo('WALL', ['NAME=The Wall']);

  const res = await info('wall');

  expect(res.status).toBe(200);
  expect(rowsOf(res.text)).toContain('0|NAME|The Wall');
});

it('sanitises a value containing a pipe so the row keeps three fields', async () => {
  writeInfo('ART', ['NAME=DOOR|MANAGER']);

  const res = await info('ART');

  const row = rowsOf(res.text).find((r) => r.includes('NAME'))!;
  expect(row.split('|')).toHaveLength(3);
  expect(row).toBe('0|NAME|DOOR MANAGER');
});

it('404s a command with no .info on disk', async () => {
  const res = await info('NOSUCH');

  expect(res.status).toBe(404);
  expect(res.text).toContain('NOT FOUND');
});

it('400s a command name that could not name a .info', async () => {
  const res = await request(app())
    .get('/api/door-admin/installed/way_too_long_name/info')
    .set('X-Door-Token', 'valid');

  expect([400, 404]).toContain(res.status);
  expect(res.text).not.toContain('INFO|');
});

it('refuses without a token', async () => {
  writeInfo('AEHELP', ['NAME=AE Help']);
  claims = null;

  const res = await request(app()).get('/api/door-admin/installed/AEHELP/info');

  expect(res.status).toBe(401);
});

it('refuses a user who is not a sysop', async () => {
  writeInfo('AEHELP', ['NAME=AE Help']);
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await info('AEHELP');

  expect(res.status).toBe(403);
  expect(res.text).not.toContain('AE Help');
});
