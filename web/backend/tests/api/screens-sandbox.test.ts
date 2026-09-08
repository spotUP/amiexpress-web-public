/**
 * SP5: an artist account may write its OWN theme and nothing else.
 *
 * `/api/screens` is mounted behind `requireLevel(100)`, and level 100 is what
 * an artist needs to reach the screen editor at all - so before this, handing
 * somebody an artist account handed them the live board. Driven through real
 * HTTP requests against the real router, because the guard is middleware and a
 * middleware that is never mounted is invisible to a unit test.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;

function app(user: { username: string; secLevel: number } | null) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (user) (req as express.Request & { user?: unknown }).user = { ...user, userId: '1' };
    next();
  });
  const { screensRouter } = require('../../src/api/screens-routes');
  a.use('/api/screens', screensRouter);
  return a;
}

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

const b64 = (text: string) => Buffer.from(text, 'latin1').toString('base64');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-sandbox-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  clearThemeRegistryCache();

  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
    dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'draft',
  });
  writeTheme(root, {
    slug: 'quiet', title: 'Quiet', author: 'Other', owner: 'other',
    dir: 'Themes/quiet', widths: [80], doorTheme: '', status: 'draft',
  });
  write('Themes/neon/Board/BULL.TXT', 'the neon bulletin\r\n');
  write('Themes/quiet/Board/BULL.TXT', 'the quiet bulletin\r\n');
  clearThemeRegistryCache();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

const artist = { username: 'skope', secLevel: 100 };
const sysop = { username: 'sysop', secLevel: 255 };
const nobody = { username: 'helper', secLevel: 100 };

describe('an artist inside their own theme', () => {
  it('may write it', async () => {
    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/neon/Board/BULL.TXT' })
      .send({ content: b64('redrawn by the artist\r\n') });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'Themes/neon/Board/BULL.TXT'), 'latin1'))
      .toBe('redrawn by the artist\r\n');
  });
});

describe('what an artist may not touch', () => {
  it("the board's own screens", async () => {
    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('the artist takes the board\r\n') });

    expect(res.status).toBe(403);
    expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe('the board bulletin\r\n');
  });

  it("another artist's theme", async () => {
    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/quiet/Board/BULL.TXT' })
      .send({ content: b64('not yours\r\n') });

    expect(res.status).toBe(403);
    expect(fs.readFileSync(path.join(root, 'Themes/quiet/Board/BULL.TXT'), 'latin1'))
      .toBe('the quiet bulletin\r\n');
  });

  it('a theme whose slug merely starts the same way', async () => {
    // `Themes/neon2` starts with `Themes/neon` as a STRING. Containment is a
    // path question, and getting it wrong hands one artist another's work the
    // moment two slugs share a prefix.
    writeTheme(root, {
      slug: 'neon2', title: 'Neon 2', author: 'Other', owner: 'other',
      dir: 'Themes/neon2', widths: [80], doorTheme: '', status: 'draft',
    });
    write('Themes/neon2/Board/BULL.TXT', 'a different artist\r\n');
    clearThemeRegistryCache();

    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/neon2/Board/BULL.TXT' })
      .send({ content: b64('mine now\r\n') });

    expect(res.status).toBe(403);
  });

  it('the board, by climbing out of their own directory', async () => {
    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/neon/../../Screens/BULL.TXT' })
      .send({ content: b64('escaped\r\n') });

    expect(res.status).toBe(403);
    expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe('the board bulletin\r\n');
  });

  it('a second target smuggled in beside a legitimate one', async () => {
    // PUT /file takes `targets`: one write, many destinations. Checking only
    // the query path would let the board ride along with a themed write.
    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/neon/Board/BULL.TXT' })
      .send({
        content: b64('and the board too\r\n'),
        targets: ['Themes/neon/Board/BULL.TXT', 'Screens/BULL.TXT'],
      });

    expect(res.status).toBe(403);
    expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe('the board bulletin\r\n');
  });
});

describe('the accounts at either end', () => {
  it('a sysop still writes the board, exactly as before', async () => {
    const res = await request(app(sysop))
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('the sysop redrew it\r\n') });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe('the sysop redrew it\r\n');
  });

  it('an admin account that owns no theme keeps the access it has today', async () => {
    // The sandbox constrains ARTISTS. Taking board access away from every
    // other level-100 account would be a second change nobody asked for, and
    // it would break a board whose helpers have been editing screens for
    // years. An account becomes constrained by OWNING a theme.
    const res = await request(app(nobody))
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('helpful\r\n') });

    expect(res.status).toBe(200);
  });

  it('an artist may save the screen the copy route just made them', async () => {
    // The point of "redraw this": the copy lands inside the theme, and the
    // very next thing the artist does is save over it. A sandbox that refused
    // that would make the button a dead end.
    fs.mkdirSync(path.join(root, 'Themes/neon/Board'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Themes/neon/Board/BULL.TXT'), 'the board bulletin\r\n', 'latin1');

    const res = await request(app(artist))
      .put('/api/screens/file')
      .query({ path: 'Themes/neon/Board/BULL.TXT' })
      .send({ content: b64('the artist drew it\r\n') });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'Themes/neon/Board/BULL.TXT'), 'latin1')).toBe('the artist drew it\r\n');
  });

  it('reading is not writing - the guard leaves GET alone', async () => {
    const res = await request(app(artist)).get('/api/screens/file').query({ path: 'Screens/BULL.TXT' });
    expect(res.status).toBe(200);
  });
});
