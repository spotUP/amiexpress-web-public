/**
 * The login sequence must edit the THEME's copy when a theme is what serves.
 *
 * The sysop removed the Fairlight logo from his logon screen in the editor and
 * the board still drew it (2026-09-14, on live). No `.backup` was written
 * beside any screen, and `writeToTargets` always writes one - so nothing
 * reached disk at all.
 *
 * His board resolves LOGON through a theme:
 *
 *     Search locations for LOGON: [ '607080: Node', 'Node2 SCREENS tooltype' ]
 *     Found security screen for LOGON at: Themes/607080/Node/logon20.txt
 *
 * Every test written for this feature used a plain `Node1/BULL.TXT` with no
 * theme over it, so the one shape his board actually has was the one shape
 * never covered.
 */
process.env.SKIP_DB_INIT = '1';

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

/** His logon screen, byte for byte. */
const LOGON20 = [
  '~SS_BBS:bulletins/bull6.txt| ~SP',
  '~CC_gl ~SP',
  '~CC_gwall',
  '~5SR_WORK:bbs/Screens/flt/flt ~SP',
  '~SS_BBS:screens/uprough.txt ~SP',
  '~SS_BBS:screens/quicknew.txt',
  '',
].join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'themed-step-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');

  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull6.txt'), 'last callers\r\n', 'latin1');

  // The node's own copy...
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'logon20.txt'), LOGON20, 'latin1');
  // ...and the theme's, which SHADOWS it and is what the board reads.
  fs.mkdirSync(path.join(root, 'Themes', '607080', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Themes', '607080', 'Node', 'logon20.txt'), LOGON20, 'latin1');

  // A theme is not a directory, it is a REGISTRY ENTRY plus a directory - the
  // first fixture had only the directory, and the resolver was right to ignore
  // it. `607080` is a DRAFT on his board, which is why only he sees it.
  fs.writeFileSync(path.join(root, 'Themes.info'), [
    'TYPE.0=607080', 'TITLE.0=607080', 'DIR.0=Themes/607080', 'STATUS.0=draft',
    'WIDTHS.0=80', 'DEFAULT=607080', '',
  ].join('\n'), 'latin1');

  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

describe('a login step served through a theme', () => {
  it('reports the theme copy as the file it resolves to', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1&theme=607080');

    const logon = res.body.data.steps.find((s: { screen: string }) => s.screen === 'LOGON');
    expect(logon.exists).toBe(true);
    expect(logon.file).toMatch(/Themes[\\/]607080[\\/]Node[\\/]logon20\.txt/);
    expect(logon.items.map((i: { target: string }) => i.target)).toContain('WORK:bbs/Screens/flt/flt');
  });

  it('saves the removal into the theme copy, which is what the board reads', async () => {
    const before = await request(app()).get('/api/screens/login-sequence?node=1&theme=607080');
    const logon = before.body.data.steps.find((s: { screen: string }) => s.screen === 'LOGON');
    const withoutTheLogo = logon.items.filter((i: { target: string }) => !/flt/.test(i.target));

    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({ screen: 'LOGON', path: logon.file, node: 1, theme: '607080', items: withoutTheLogo });

    expect(res.status).toBe(200);

    const served = fs.readFileSync(
      path.join(root, 'Themes', '607080', 'Node', 'logon20.txt'),
    ).toString('latin1');
    expect(served).not.toContain('flt');
    // And the node's own copy is untouched - it is not what serves.
    expect(fs.readFileSync(path.join(root, 'Node1', 'logon20.txt')).toString('latin1'))
      .toContain('flt');
  });
});
