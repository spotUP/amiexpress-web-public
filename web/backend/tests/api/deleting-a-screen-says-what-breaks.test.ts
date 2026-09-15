/**
 * The Studio's delete says what pointed at the screen, and can mend it.
 *
 * "if i delete a logo that is used in one of the screen files etc in the bbs,
 * can we update the file as well and remove it?" - the sysop, 2026-09-15.
 *
 * Reporting is unconditional; MENDING is opt-in and only ever touches lines
 * that exist solely to make the include.
 */
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-del-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});

afterEach(() => { config.set('dataDir', previousDataDir); });

const write = (rel: string, text: string) =>
  fs.writeFileSync(path.join(root, rel), text, 'latin1');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/screens', screensRouter);
  return a;
};

it('names the screens that pointed at the deleted one', async () => {
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/BULL.TXT', 'header\n~SS_BBS:screens/uprough.txt\nfooter\n');

  const res = await request(app()).delete('/api/screens/file?path=Screens/uprough.txt');

  expect(res.status).toBe(200);
  expect(res.body.data.referencedBy).toEqual([expect.objectContaining({
    from: 'Screens/BULL.TXT', line: 2, removable: true,
  })]);
});

it('changes nothing in them unless asked', async () => {
  const including = 'header\n~SS_BBS:screens/uprough.txt\nfooter\n';
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/BULL.TXT', including);

  const res = await request(app()).delete('/api/screens/file?path=Screens/uprough.txt');

  expect(res.body.data.fixed).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe(including);
});

it('drops the include when asked, and says which file it changed', async () => {
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/BULL.TXT', 'header\n~SS_BBS:screens/uprough.txt\nfooter\n');

  const res = await request(app())
    .delete('/api/screens/file?path=Screens/uprough.txt&fixReferences=1');

  expect(res.body.data.fixed).toEqual([{ file: 'Screens/BULL.TXT', linesRemoved: 1 }]);
  expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1')).toBe('header\nfooter\n');
});

it('leaves a sentinel that shares its line with art, even when asked', async () => {
  // The rule the sysop set: remove what is unambiguous, SHOW what is not.
  const art = '\x1b[34m| ~SS_BBS:screens/uprough.txt \x1b[34m|\n';
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/C.TXT', art);

  const res = await request(app())
    .delete('/api/screens/file?path=Screens/uprough.txt&fixReferences=1');

  expect(res.body.data.fixed).toEqual([]);
  expect(res.body.data.referencedBy).toEqual([expect.objectContaining({ removable: false })]);
  expect(fs.readFileSync(path.join(root, 'Screens/C.TXT'), 'latin1')).toBe(art);
});

it('still backs the deleted screen up', async () => {
  write('Screens/uprough.txt', 'the logo\n');

  await request(app()).delete('/api/screens/file?path=Screens/uprough.txt');

  expect(fs.readFileSync(path.join(root, 'Screens/uprough.txt.backup'), 'latin1')).toBe('the logo\n');
});
