/**
 * A save made standing in a theme lands in that theme.
 *
 * "i saved a main menu in 607080's theme and i can see it in h7's theme"
 * (the sysop, 2026-09-27). The studio sent the BOARD's file as the target
 * whenever the open card was a board card - a sysop may write anything - so
 * the edit overwrote the board's own menu, which every theme's gallery shows.
 * The dialog now says which theme it stands in, and the endpoint every save
 * goes through lands the write there. Real HTTP against the real router.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;
let previousDataDir: string;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { username: 'sysop', secLevel: 255, userId: '1' };
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
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'latin1');
const b64 = (text: string) => Buffer.from(text, 'latin1').toString('base64');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'save-in-theme-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
    dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'draft',
  });
  fs.mkdirSync(path.join(root, 'Themes/neon'), { recursive: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the sysop saving a board card while standing in a theme', () => {
  it('leaves the board file exactly as it was', async () => {
    const res = await request(app())
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('the neon redraw\r\n'), targets: ['Screens/BULL.TXT'], theme: 'neon' });

    expect(res.status).toBe(200);
    expect(read('Screens/BULL.TXT')).toBe('the board bulletin\r\n');
  });

  it('writes the edit into the theme', async () => {
    await request(app())
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('the neon redraw\r\n'), targets: ['Screens/BULL.TXT'], theme: 'neon' });

    const drawn = fs.readdirSync(path.join(root, 'Themes/neon'), { recursive: true }) as string[];
    const bull = drawn.find((rel) => /bull\.txt$/i.test(rel));
    expect(bull).toBeDefined();
    expect(read(path.join('Themes/neon', bull!))).toBe('the neon redraw\r\n');
  });
});

describe('the board page, which names no theme', () => {
  it('still writes the board file', async () => {
    await request(app())
      .put('/api/screens/file')
      .query({ path: 'Screens/BULL.TXT' })
      .send({ content: b64('the board, edited\r\n') });

    expect(read('Screens/BULL.TXT')).toBe('the board, edited\r\n');
  });
});
