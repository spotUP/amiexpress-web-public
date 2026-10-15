/**
 * A THEMED STEP WITH NO INCLUDES SAYS WHERE THE INCLUDES ARE.
 *
 * A theme's copy shadows the board's, and a theme is usually pure art - so
 * with one in play every step of the login sequence reads "Nothing included"
 * while the board's own copy carries the whole script. The sysop sent a
 * screenshot of exactly that on 2026-09-16: six empty steps, with
 * `Node1/logon20.txt` and its five includes one selection away and never
 * mentioned.
 *
 * The route now reports the other rung when, and only when, this one is empty
 * and that one is not.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

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

const SCRIPT = ['~CC_gl ~SP', '~CC_gwall', '~SS_BBS:Bulletins/bull6.txt', ''].join('\r\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'other-copy-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');

  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull6.txt'), 'last callers\r\n', 'latin1');

  // The board's own logon screen: the script the caller actually walks.
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'Logon.txt'), SCRIPT, 'latin1');

  // A theme whose copy of the same screen is art and nothing else.
  fs.mkdirSync(path.join(root, 'Themes', 'tango', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Themes', 'tango', 'Node', 'LOGON.TXT'), 'ART\r\n', 'latin1');
  // A theme is a REGISTRY ENTRY plus a directory; the directory alone is
  // rightly ignored by the resolver (`Themes.info`, an Amiga icon's
  // tooltypes).
  fs.writeFileSync(path.join(root, 'Themes.info'), [
    'TYPE.0=tango', 'TITLE.0=Tango', 'DIR.0=Themes/tango', 'STATUS.0=live',
    'WIDTHS.0=80', 'DEFAULT=tango', '',
  ].join('\n'), 'latin1');

  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

const logonStep = (body: any) => body.data.steps.find((s: { screen: string }) => s.screen === 'LOGON');

describe('GET /api/screens/login-sequence with a theme in play', () => {
  it('names the board copy that has the script, and how many steps it holds', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1&theme=tango');

    expect(res.status).toBe(200);
    const step = logonStep(res.body);
    expect(step.items).toEqual([]);
    expect(step.otherCopy).toEqual({
      theme: 'default',
      file: 'Node1/Logon.txt',
      items: 3,
    });
  });

  it('offers nothing when the step being looked at already has its includes', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1&theme=default');

    const step = logonStep(res.body);
    expect(step.items.length).toBe(3);
    expect(step.otherCopy).toBeNull();
  });

  it('offers nothing when the board copy is empty too, rather than a dead link', async () => {
    fs.writeFileSync(path.join(root, 'Node1', 'Logon.txt'), 'JUST ART\r\n', 'latin1');
    invalidateScreenIndex();

    const res = await request(app()).get('/api/screens/login-sequence?node=1&theme=tango');

    expect(logonStep(res.body).otherCopy).toBeNull();
  });
});
