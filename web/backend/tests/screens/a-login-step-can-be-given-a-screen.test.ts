/**
 * A STEP WITH NO FILE CAN BE GIVEN ONE, AND AN INCLUDED SCREEN CAN BE EDITED.
 *
 * "there are more stuff that launches stuff during login bulletins etc"
 * (sysop, 2026-09-16), looking at a login sequence where five of six steps
 * read "[no file on this board - the step is skipped in silence]" and the
 * sixth stopped at the name of the screen it includes.
 *
 * Two routes answer that: one creates the screen a step does not have, at the
 * place the loader would look for it FIRST (anywhere else is a file nothing
 * reads), and one writes the rows of a screen the sequence includes.
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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-create-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');

  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull6.txt'), 'last callers\r\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull1.txt'), 'top uploaders\r\n', 'latin1');

  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'Logon.txt'), '~CC_gl ~SP\r\n', 'latin1');

  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

const stepOf = (body: any, screen: string) =>
  body.data.steps.find((s: { screen: string }) => s.screen === screen);

describe('a step the board has no file for', () => {
  it('is reported with no file, and the sequence still lists it', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1');
    expect(stepOf(res.body, 'BULL').file).toBeNull();
  });

  it('is created where the loader looks FIRST, with the row it was given', async () => {
    const before = await request(app()).get('/api/screens/login-sequence?node=1');
    expect(stepOf(before.body, 'BULL').file).toBeNull();

    const created = await request(app()).post('/api/screens/login-sequence').send({
      screen: 'BULL',
      path: 'Screens/BULL.txt',
      node: 1,
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false }],
    });

    expect(created.status).toBe(200);
    expect(created.body.data.file).toBe('Screens/BULL.txt');

    invalidateScreenIndex();
    const after = await request(app()).get('/api/screens/login-sequence?node=1');
    const step = stepOf(after.body, 'BULL');
    expect(step.file).toBe('Screens/BULL.txt');
    // A row also reports the file it SHOWS and whether the board writes that
    // file for itself - the page draws the screen from one and warns from the
    // other - so this is the row's shape, not only its code and target.
    expect(step.items).toEqual([{
      code: 'SS',
      target: 'BBS:Bulletins/bull6.txt',
      pause: false,
      shows: 'Bulletins/bull6.txt',
      generated: false,
    }]);
  });

  it('refuses a path that is not where the board would read it', async () => {
    const res = await request(app()).post('/api/screens/login-sequence').send({
      screen: 'BULL',
      path: 'Bulletins/BULL.txt',
      node: 1,
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false }],
    });

    expect(res.status).toBe(409);
    expect(res.body.home).toBe('Screens/BULL.txt');
    expect(fs.existsSync(path.join(root, 'Bulletins', 'BULL.txt'))).toBe(false);
  });

  it('refuses to create a screen that would draw nothing', async () => {
    const res = await request(app()).post('/api/screens/login-sequence').send({
      screen: 'BULL', path: 'Screens/BULL.txt', node: 1, items: [],
    });

    expect(res.status).toBe(409);
    expect(fs.existsSync(path.join(root, 'Screens', 'BULL.txt'))).toBe(false);
  });

  it('refuses to create a second one where a screen already resolves', async () => {
    const res = await request(app()).post('/api/screens/login-sequence').send({
      screen: 'LOGON', path: 'Node1/Logon.txt', node: 1,
      items: [{ code: 'CC', target: 'gl', pause: true }],
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already resolves/);
  });
});

describe('the screen a step includes', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'Screens', 'BULL.txt'),
      '~f|\r\n~SS_BBS:Bulletins/bull6.txt\r\n',
      'latin1',
    );
    invalidateScreenIndex();
  });

  it('is reported under the row that shows it', async () => {
    const res = await request(app()).get('/api/screens/login-sequence?node=1');
    const step = stepOf(res.body, 'BULL');
    expect(step.items[0].target).toBe('BBS:Bulletins/bull6.txt');
    // bull6 is art on this fixture, so there is nothing below it.
    expect(step.items[0].nested).toBeUndefined();
  });

  it('carries the rows of an included screen that is a program itself', async () => {
    fs.writeFileSync(
      path.join(root, 'Bulletins', 'bull6.txt'),
      '~SS_BBS:Bulletins/bull1.txt ~SP\r\n',
      'latin1',
    );
    invalidateScreenIndex();

    const res = await request(app()).get('/api/screens/login-sequence?node=1');
    expect(stepOf(res.body, 'BULL').items[0].nested).toEqual({
      file: 'Bulletins/bull6.txt',
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: true }],
    });
  });

  it('keeps a pause on its LAST row, which a step would drop', async () => {
    /*
     * The step rule - "the last item never pauses" - is right for a STEP: the
     * display flow pauses after each bulletin screen anyway. It is wrong one
     * level down, where nothing follows but the next line of the SAME walk,
     * so an included screen may end on `~SP`.
     */
    fs.writeFileSync(
      path.join(root, 'Bulletins', 'bull6.txt'),
      '~SS_BBS:Bulletins/bull1.txt\r\n',
      'latin1',
    );
    invalidateScreenIndex();

    const res = await request(app()).put('/api/screens/login-sequence/include').send({
      path: 'Bulletins/bull6.txt',
      node: 1,
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: true }],
    });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'Bulletins', 'bull6.txt'), 'latin1'))
      .toContain('~SS_BBS:Bulletins/bull1.txt ~SP');
  });

  it('is writable, and the write lands in the included file', async () => {
    fs.writeFileSync(
      path.join(root, 'Bulletins', 'bull6.txt'),
      '~SS_BBS:Bulletins/bull1.txt ~SP\r\n',
      'latin1',
    );
    invalidateScreenIndex();

    const res = await request(app()).put('/api/screens/login-sequence/include').send({
      path: 'Bulletins/bull6.txt',
      node: 1,
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
    });

    expect(res.status).toBe(200);
    const written = fs.readFileSync(path.join(root, 'Bulletins', 'bull6.txt'), 'latin1');
    expect(written).toContain('~SS_BBS:Bulletins/bull1.txt');
    expect(written).not.toContain('~SP');
  });

  it('refuses a file the sequence does not include, so it is not a writer for the board', async () => {
    fs.writeFileSync(path.join(root, 'user.data'), 'PRECIOUS', 'latin1');

    const res = await request(app()).put('/api/screens/login-sequence/include').send({
      path: 'user.data',
      node: 1,
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: false }],
    });

    expect(res.status).toBe(409);
    expect(fs.readFileSync(path.join(root, 'user.data'), 'latin1')).toBe('PRECIOUS');
  });
});
