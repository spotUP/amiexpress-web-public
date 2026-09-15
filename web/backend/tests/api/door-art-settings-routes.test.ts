/**
 * The door-art endpoints carry a file-backed slot.
 *
 * `createDoorArtRouter({ getDoors })` exists so a route test need not boot a
 * BBS to ask which doors have a logo, which is what makes this cheap enough
 * to pin the refusals as well as the happy path.
 */
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { createDoorArtRouter } from '../../src/api/door-art-routes';

let root: string;
let doorDir: string;
let previousDataDir: string;

beforeEach(() => {
  // A temp BOARD root, not a loose directory: `doorDirectoryFor` resolves a
  // door's LOCATION against the board's dataDir, so a fixture outside it
  // resolves to null and the router quietly lists the real board's doors
  // instead - which is exactly what this test did on its first run.
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-board-'));
  doorDir = path.join(root, 'Doors', 'REQUESTS');
  fs.mkdirSync(path.join(doorDir, 'headers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  // The door's own executable: doorDirectoryFor STATS the registered
  // LOCATION and takes its dirname, so a fixture without it resolves to null
  // and every write answers 404.
  fs.writeFileSync(path.join(doorDir, 'requests'), 'not really a 68K binary');
  fs.writeFileSync(path.join(doorDir, 'Bulletin_Header.txt'), 'one\ntwo\n', 'latin1');
  fs.writeFileSync(path.join(doorDir, 'headers', 'Header3.ansi'), 'a\nb\nc\n', 'latin1');
  fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify({
    command: 'REQ',
    cfgFile: 'REQUESTS.cfg',
    settings: [
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ],
  }));
  fs.writeFileSync(path.join(doorDir, 'settings.json'),
    JSON.stringify({ bulletinHeader: 'Bulletin_Header.txt' }));

  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
});

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/door-art', createDoorArtRouter({
    getDoors: () => [{ command: 'REQ', name: 'Global Requests', location: 'Doors/REQUESTS/requests' }],
  }));
  return a;
};

describe('door art from a setting', () => {
  it('lists the slot with the file it names and the alternates', async () => {
    const res = await request(app()).get('/api/door-art');

    const req = res.body.data.find((d: { command: string }) => d.command === 'REQ');
    expect(req.sections).toEqual([expect.objectContaining({
      section: 'setting:bulletinHeader',
      file: 'Bulletin_Header.txt',
      choices: expect.arrayContaining([{ file: 'headers/Header3.ansi', lines: 3 }]),
    })]);
  });

  it('saves a drawing back into the file the setting names', async () => {
    const body = Buffer.from('\x1b[34mdrawn\n', 'latin1').toString('base64');

    const res = await request(app())
      .put('/api/door-art/REQ')
      .send({ file: 'Bulletin_Header.txt', section: 'setting:bulletinHeader', content: body });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(doorDir, 'Bulletin_Header.txt'), 'latin1'))
      .toBe('\x1b[34mdrawn\n');
  });

  it('saves into an ALTERNATE the artist has open, not only the current one', async () => {
    const body = Buffer.from('\x1b[35mother\n', 'latin1').toString('base64');

    const res = await request(app())
      .put('/api/door-art/REQ')
      .send({ file: 'headers/Header3.ansi', section: 'setting:bulletinHeader', content: body });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(doorDir, 'headers', 'Header3.ansi'), 'latin1'))
      .toBe('\x1b[35mother\n');
  });

  it('refuses a file that escapes the door, with 400 and no write', async () => {
    const res = await request(app())
      .put('/api/door-art/REQ')
      .send({ file: '../escape.txt', section: 'setting:bulletinHeader',
              content: Buffer.from('x', 'latin1').toString('base64') });

    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(path.dirname(doorDir), 'escape.txt'))).toBe(false);
  });

  it('reads the slot as a canvas, bytes intact', async () => {
    fs.writeFileSync(path.join(doorDir, 'Bulletin_Header.txt'), '\x1b[35m\xa6art\n', 'latin1');

    const res = await request(app()).get('/api/door-art/REQ');

    const slot = res.body.data.find((s: { section: string }) => s.section === 'setting:bulletinHeader');
    expect(Buffer.from(slot.content, 'base64').toString('latin1')).toBe('\x1b[35m\xa6art\n');
  });
});
