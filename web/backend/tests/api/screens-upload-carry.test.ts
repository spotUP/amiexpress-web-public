/**
 * Uploading art over a screen, without throwing away what the screen DOES.
 *
 * Driven through the route because that is where the two rules live: the
 * upload wins if it carries codes of its own, and each target keeps its OWN
 * codes rather than the first target's.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

const NEW_ART = Buffer.from('\x1b[34mNEW ART\r\nSECOND ROW\r\n', 'latin1');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-carry-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node7'), { recursive: true });

  // Each node's copy names its OWN node - the case that makes one shared plan
  // wrong.
  for (const node of [1, 7]) {
    fs.writeFileSync(
      path.join(root, `Node${node}`, 'LOGON.TXT'),
      [`~SS_BBS:Node${node}/BBSTITLE.txt| ~SP`, '\x1b[31mOLD ART', '~CC_gwall|', ''].join('\r\n'),
      'latin1'
    );
  }

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const read = (rel: string) => fs.readFileSync(path.join(root, rel)).toString('latin1');

function upload(fields: Record<string, string>, bytes = NEW_ART) {
  const req = request(app).post('/api/screens/upload').attach('file', bytes, 'art.txt');
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req;
}

test('without carryCodes an upload still writes exactly what arrived', async () => {
  const res = await upload({ path: 'Node1/LOGON.TXT' });

  expect(res.status).toBe(200);
  expect(read('Node1/LOGON.TXT')).toBe(NEW_ART.toString('latin1'));
});

test('carryCodes=above keeps the head above the art and the tail below it', async () => {
  const res = await upload({ path: 'Node1/LOGON.TXT', carryCodes: 'above' });

  expect(res.status).toBe(200);
  expect(read('Node1/LOGON.TXT')).toBe(
    '~SS_BBS:Node1/BBSTITLE.txt| ~SP\r\n\x1b[34mNEW ART\r\nSECOND ROW\r\n~CC_gwall|\r\n'
  );
});

test('every target keeps ITS OWN codes, not the first target\'s', async () => {
  const res = await upload({
    path: 'Node1/LOGON.TXT',
    targets: JSON.stringify(['Node1/LOGON.TXT', 'Node7/LOGON.TXT']),
    carryCodes: 'above',
  });

  expect(res.status).toBe(200);
  expect(read('Node1/LOGON.TXT')).toContain('~SS_BBS:Node1/BBSTITLE.txt|');
  expect(read('Node7/LOGON.TXT')).toContain('~SS_BBS:Node7/BBSTITLE.txt|');
  expect(read('Node7/LOGON.TXT')).not.toContain('Node1');
});

test('an upload carrying codes of its own wins, and nothing is carried', async () => {
  const own = Buffer.from('~CC_ctop|\r\nMY ART\r\n', 'latin1');
  const res = await upload({ path: 'Node1/LOGON.TXT', carryCodes: 'above' }, own);

  expect(res.status).toBe(200);
  expect(read('Node1/LOGON.TXT')).toBe('~CC_ctop|\r\nMY ART\r\n');
});

test('a dry run answers 200 with the verdicts and writes nothing', async () => {
  const before = read('Node1/LOGON.TXT');

  const res = await upload({
    path: 'Node1/LOGON.TXT',
    targets: JSON.stringify(['Node1/LOGON.TXT', 'Node7/LOGON.TXT']),
    carryCodes: 'above',
    dryRun: 'true',
  });

  expect(res.status).toBe(200);
  expect(res.body.data.dryRun).toBe(true);
  expect(res.body.data.targets).toHaveLength(2);
  expect(res.body.data.targets[0].carried).toEqual([
    '~SS_BBS:Node1/BBSTITLE.txt| ~SP', '~CC_gwall|',
  ]);
  expect(read('Node1/LOGON.TXT')).toBe(before);
});

test('a code among the art is reported as lost rather than placed somewhere it never was', async () => {
  fs.writeFileSync(
    path.join(root, 'Node1', 'LOGON.TXT'),
    ['~', '\x1b[31mART', 'press ~CC_gwall| to shout', 'MORE ART', ''].join('\r\n'),
    'latin1'
  );

  const res = await upload({ path: 'Node1/LOGON.TXT', carryCodes: 'above', dryRun: 'true' });

  expect(res.body.data.targets[0].lost).toEqual([{ text: '~CC_gwall|', line: 3 }]);
});

test('an unknown placement is refused rather than silently treated as none', async () => {
  const res = await upload({ path: 'Node1/LOGON.TXT', carryCodes: 'sideways' });

  expect(res.status).toBe(400);
  expect(res.body.error).toContain('carryCodes');
});

test('a fan-out that fails part way leaves every target as it was', async () => {
  const before1 = read('Node1/LOGON.TXT');

  const res = await upload({
    path: 'Node1/LOGON.TXT',
    targets: JSON.stringify(['Node1/LOGON.TXT', '../escape.txt']),
    carryCodes: 'above',
  });

  expect(res.status).toBe(400);
  expect(read('Node1/LOGON.TXT')).toBe(before1);
});

test('high-bit Amiga bytes in the uploaded art survive the carry', async () => {
  const art = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0xdb, 0x0d, 0x0a]);
  await upload({ path: 'Node1/LOGON.TXT', carryCodes: 'above' }, art);

  const written = fs.readFileSync(path.join(root, 'Node1', 'LOGON.TXT'));
  expect(written.includes(Buffer.from([0xa1, 0xb0, 0xdb]))).toBe(true);
});

/**
 * The admin's Replace and the editor's Save both go through PUT, not POST, so
 * a carry that lived only on the upload route would be unreachable from the
 * page the sysop actually uses.
 */
describe('PUT /api/screens/file carries codes the same way', () => {
  const put = (body: Record<string, unknown>) =>
    request(app).put('/api/screens/file').query({ path: 'Node1/LOGON.TXT' }).send(body);

  test('carryCodes=above keeps the head and the tail around the new art', async () => {
    const res = await put({
      content: NEW_ART.toString('base64'),
      carryCodes: 'above',
    });

    expect(res.status).toBe(200);
    expect(read('Node1/LOGON.TXT')).toBe(
      '~SS_BBS:Node1/BBSTITLE.txt| ~SP\r\n\x1b[34mNEW ART\r\nSECOND ROW\r\n~CC_gwall|\r\n'
    );
  });

  test('the default is still to write exactly what was sent', async () => {
    const res = await put({ content: NEW_ART.toString('base64') });

    expect(res.status).toBe(200);
    expect(read('Node1/LOGON.TXT')).toBe(NEW_ART.toString('latin1'));
  });

  test('a dry run reports per target and writes nothing', async () => {
    const before = read('Node7/LOGON.TXT');

    const res = await put({
      content: NEW_ART.toString('base64'),
      targets: ['Node1/LOGON.TXT', 'Node7/LOGON.TXT'],
      carryCodes: 'above',
      dryRun: true,
    });

    expect(res.body.data.targets.map((t: { path: string }) => t.path))
      .toEqual(['Node1/LOGON.TXT', 'Node7/LOGON.TXT']);
    expect(res.body.data.targets[1].carried[0]).toBe('~SS_BBS:Node7/BBSTITLE.txt| ~SP');
    expect(read('Node7/LOGON.TXT')).toBe(before);
  });

  test('an unknown placement is refused', async () => {
    const res = await put({ content: NEW_ART.toString('base64'), carryCodes: 'sideways' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('carryCodes');
  });
});
