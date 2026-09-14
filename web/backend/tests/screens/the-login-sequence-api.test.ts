/**
 * The login sequence, over the wire the admin app will use.
 *
 * The module beside this one proves the editing is safe; this proves the
 * admin can reach it, and that it edits THE FILE THE BOARD ACTUALLY SERVES.
 * That last part is the whole risk: `Themes/<id>/Node/BULL.TXT` shadows
 * `Node<N>/BULL.TXT` shadows `Screens/BULL.TXT`, and a picker that writes the
 * wrong rung changes nothing on screen and reads as a broken feature.
 *
 * The board built here is the sysop's, in miniature: a node bulletin screen
 * listing five MultiTop pages, which is what he asked to be able to change.
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

const FIVE_BULLETINS = [
  '~f|',
  '~SS_BBS:Bulletins/bull1.txt ~SP',
  '~SS_BBS:Bulletins/bull2.txt ~SP',
  '~SS_BBS:Bulletins/bull3.txt ~SP',
  '~SS_BBS:Bulletins/bull4.txt ~SP',
  '~SS_BBS:Bulletins/bull5.txt',
  '',
].join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-seq-api-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');

  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  for (let n = 1; n <= 6; n += 1) {
    fs.writeFileSync(path.join(root, 'Bulletins', `bull${n}.txt`), `bulletin ${n}\r\n`, 'latin1');
  }

  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'BULL.txt'), 'the board bulletin\r\n', 'latin1');

  // The node's screen directory is `Node<N>/` itself on this board - measured
  // against the index, not assumed: `Node1/Screens/` is NOT where NODE_BULL
  // resolves, and a fixture that puts it there tests nothing.
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'BULL.txt'), FIVE_BULLETINS, 'latin1');

  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

describe('GET /api/screens/login-sequence', () => {
  it('lists the walk in order, with the file each step really resolves to', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1');

    expect(res.status).toBe(200);
    expect(res.body.data.steps.map((s: { screen: string }) => s.screen)).toEqual([
      'LOGON', 'BULL', 'NODE_BULL', 'ACHIEVETOP', 'MAILSCAN', 'CONF_BULL',
    ]);

    const nodeBull = res.body.data.steps.find((s: { screen: string }) => s.screen === 'NODE_BULL');
    expect(nodeBull.exists).toBe(true);
    expect(nodeBull.items.map((i: { target: string }) => i.target)).toEqual([
      'BBS:Bulletins/bull1.txt',
      'BBS:Bulletins/bull2.txt',
      'BBS:Bulletins/bull3.txt',
      'BBS:Bulletins/bull4.txt',
      'BBS:Bulletins/bull5.txt',
    ]);
  });

  it('says a step has no file rather than pretending it has none to show', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1');

    const achieve = res.body.data.steps.find((s: { screen: string }) => s.screen === 'ACHIEVETOP');
    expect(achieve.exists).toBe(false);
    expect(achieve.items).toEqual([]);
  });

  it('offers the bulletins on disk, with their sizes, including one not in any screen', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1');

    const targets = res.body.data.available.map((a: { target: string }) => a.target);
    expect(targets).toContain('BBS:Bulletins/bull6.txt');   // never included anywhere
    const bull6 = res.body.data.available.find((a: { target: string }) => a.target === 'BBS:Bulletins/bull6.txt');
    expect(bull6.bytes).toBeGreaterThan(0);
  });
});

describe('PUT /api/screens/login-sequence', () => {
  const nodeBullPath = path.join('Node1', 'BULL.txt');

  it('writes the sysop\'s choice into the file the board serves', async () => {
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({
        screen: 'NODE_BULL',
        path: nodeBullPath,
        node: 1,
        items: [
          { code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: true },
          { code: 'SS', target: 'BBS:Bulletins/bull3.txt', pause: true },
        ],
      });

    expect(res.status).toBe(200);

    const written = fs.readFileSync(path.join(root, nodeBullPath)).toString('latin1');
    expect(written).toBe([
      '~f|',
      '~SS_BBS:Bulletins/bull1.txt ~SP',
      '~SS_BBS:Bulletins/bull3.txt',
      '',
    ].join('\n'));

    // And the board now reads back what he chose.
    const after = await request(app()).get('/api/screens/login-sequence?node=1');
    const nodeBull = after.body.data.steps.find((s: { screen: string }) => s.screen === 'NODE_BULL');
    expect(nodeBull.items.map((i: { target: string }) => i.target))
      .toEqual(['BBS:Bulletins/bull1.txt', 'BBS:Bulletins/bull3.txt']);
  });

  it('refuses to empty a screen, and names what to remove instead', async () => {
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({ screen: 'NODE_BULL', path: nodeBullPath, node: 1, items: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/keypress on a blank screen/);
    expect(res.body.remove).toBe(nodeBullPath);
    // Refused means UNCHANGED, not half-written.
    expect(fs.readFileSync(path.join(root, nodeBullPath)).toString('latin1')).toBe(FIVE_BULLETINS);
  });

  it('refuses a path that is not the one the step resolves to', async () => {
    // The stale-tab case: someone else changed the theme since the GET, and
    // writing the old rung would change nothing on screen.
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({
        screen: 'NODE_BULL',
        path: 'Screens/BULL.txt',
        node: 1,
        items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/reload the sequence/);
    expect(fs.readFileSync(path.join(root, 'Screens', 'BULL.txt')).toString('latin1'))
      .toBe('the board bulletin\r\n');
  });

  it('refuses a step that resolves to no file, instead of creating one', async () => {
    /*
     * THE CASE NOBODY DESIGNED FOR.
     *
     * ACHIEVETOP is not on this board, so the step resolves to nothing. The
     * path check only fired when there WAS a resolution, so an unresolved step
     * fell past it and the write ran against whatever path the body carried -
     * creating a screen file where the board had none. A page whose Save
     * button sent `path: null` would have written a file literally called
     * `null` into the board root.
     *
     * Asked by session_01QtFX after an empty `Screens/LOGON.TXT` appeared on
     * the live volume at 14:52 UTC: not this code, which reached the board at
     * 15:06, but this is the shape that WOULD have done it.
     */
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({
        screen: 'ACHIEVETOP',
        path: 'Screens/AchieveTop.txt',
        node: 1,
        items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/resolves to no file/);
    expect(fs.existsSync(path.join(root, 'Screens', 'AchieveTop.txt'))).toBe(false);
  });

  it('will not write a path the caller invented for a step that has one', async () => {
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({
        screen: 'NODE_BULL',
        path: 'Screens/SomethingElse.txt',
        node: 1,
        items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
      });

    expect(res.status).toBe(409);
    expect(fs.existsSync(path.join(root, 'Screens', 'SomethingElse.txt'))).toBe(false);
  });

  it('refuses a screen that is not part of the login walk', async () => {
    const res = await request(app())
      .put('/api/screens/login-sequence')
      .send({ screen: 'MENU', path: nodeBullPath, node: 1, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not a step of the login sequence/);
  });

  it('keeps the previous version, like every other screen edit', async () => {
    await request(app())
      .put('/api/screens/login-sequence')
      .send({
        screen: 'NODE_BULL',
        path: nodeBullPath,
        node: 1,
        items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
      });

    // writeToTargets snapshots to .backup and to the revision store - this
    // route gets that for free by using the board's one writer.
    expect(fs.existsSync(path.join(root, `${nodeBullPath}.backup`))).toBe(true);
    expect(fs.readFileSync(path.join(root, `${nodeBullPath}.backup`)).toString('latin1'))
      .toBe(FIVE_BULLETINS);
  });
});
