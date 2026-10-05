/**
 * THE TWO RULES A C64 BOARD RUNS, on the way in and on the way to the sysop.
 *
 * "petscii used in c64 bbs:es have limitations that our petscii editor doesnt
 * enforce, only lowercase characters are allowed and only black background"
 * and "this should apply bbs wide" (sysop, 2026-09-14), decided 2026-09-17:
 * a save that breaks either is REFUSED with the reason, and a file already on
 * the board that breaks one is REPORTED and served exactly as drawn.
 *
 * The gated case is the one that makes this worth a test. A screen the editor
 * saves opens `~D|` and a bulletin opens `~f|`; handed to the machine raw
 * those bytes print as glyphs before the file has said which bank it wants,
 * and every gated screen on this board reads as "three cells in the graphics
 * bank". The codes are not art, here or in the renderer.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';
import { invalidateScreenIndex, screenFileFacts } from '../../src/screens/screen-index.service';

let root: string;
let previousDataDir: string;

function app() {
  const a = express();
  a.use('/api/screens', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = { username: 'sysop', secLevel: 255 };
    next();
  }, express.json({ limit: '8mb' }), screensRouter);
  return a;
}
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

/** `$0E` - the lowercase bank - then art. What the editor writes. */
const LOWERCASE = '\x0e';
/** `$8E` - the graphics bank, a C64's power-on set. */
const GRAPHICS = '\x8e';
/** CCGMS's `$02 <colour>`: background AND border. `$1f` is blue. */
const BLUE_GROUND = '\x02\x1f';

const put = (rel: string, bytes: string, targets?: string[]) =>
  request(app())
    .put(`/api/screens/file?path=${encodeURIComponent(rel)}`)
    .send({ content: b64(bytes), targets: targets ?? [rel], carryCodes: 'none' });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'c64-rules-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

test('a screen drawn in the graphics bank is refused, and nothing is written', async () => {
  const res = await put('Node1/BBSTITLE.seq', `${GRAPHICS}hello\r`);

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/lowercase bank/);
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.seq'))).toBe(false);
});

test('a screen that never says which bank it wants is written - it starts in the board\'s lowercase bank', async () => {
  // 0b52f8744 (sysop decision 2026-10-04): the board puts every caller in the
  // lowercase bank before any screen and keeps the caller's CTRL+L choice
  // after that, so a screen starts in the BOARD's bank, not a power-on C64's.
  // A screen that selects $8E and draws in it is still refused (above).
  const res = await put('Node1/BBSTITLE.seq', 'hello\r');

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1', 'BBSTITLE.seq'), 'latin1')).toBe('hello\r');
});

test('the same art in the lowercase bank is written', async () => {
  const res = await put('Node1/BBSTITLE.seq', `${LOWERCASE}hello\r`);

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1', 'BBSTITLE.seq'), 'latin1'))
    .toBe(`${LOWERCASE}hello\r`);
});

test('a screen asking for a background colour is refused, and the reason says why', async () => {
  const res = await put('Node1/BBSTITLE.seq', `${LOWERCASE}${BLUE_GROUND}hello\r`);

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/black screen/);
});

test('the MCI gate is not art: a gated screen is accepted', async () => {
  const res = await put('Node1/BBSTITLE.seq', `~D|${LOWERCASE}hello\r`);

  expect(res.status).toBe(200);
});

test('an ANSI screen is not judged by the C64 rules', async () => {
  const res = await put('Node1/BBSTITLE.txt', 'hello\r\n');

  expect(res.status).toBe(200);
});

test('an upload is refused by the same rules, per target', async () => {
  const res = await request(app())
    .post('/api/screens/upload')
    .field('path', 'Node1/BBSTITLE.seq')
    .field('targets', JSON.stringify(['Node1/BBSTITLE.seq']))
    .field('carryCodes', 'none')
    .attach('file', Buffer.from(`${GRAPHICS}hello\r`, 'latin1'), 'art.seq');

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/lowercase bank/);
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.seq'))).toBe(false);
});

test('a screen already on the board is REPORTED, not repaired', () => {
  const abs = path.join(root, 'Node1', 'BBSTITLE.seq');
  const bytes = `~f|${GRAPHICS}hello\r`;
  fs.writeFileSync(abs, bytes, 'latin1');

  const facts = screenFileFacts(root, abs);

  expect(facts.problems).toContain('petscii-graphics-bank');
  // Served exactly as its artist drew it: reading the facts changes no byte.
  expect(fs.readFileSync(abs, 'latin1')).toBe(bytes);
});

test('a screen that follows both rules is reported as fine', () => {
  const abs = path.join(root, 'Node1', 'BBSTITLE.seq');
  fs.writeFileSync(abs, `~D|${LOWERCASE}hello\r`, 'latin1');

  expect(screenFileFacts(root, abs).problems).toEqual([]);
});
