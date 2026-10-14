/**
 * THE MAGAZINE'S SCREENS ARE IN THE ANSI STUDIO (sysop, 2026-10-14).
 *
 * MAG declares each piece as a door-art slot (`art_<name>`, REQUESTS' shape),
 * so the Studio lists it on the artist lane and saves it IN PLACE into
 * `Doors/magazine/art/<name>.ans` - the folder the door's loader reads
 * (Doors/magazine/art.ts shippedArtDir). Driven through the real router on a
 * temp volume holding the repo's own manifest and art.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const DOOR_SRC = path.join(REPO, 'Doors', 'magazine');
const PIECES = [
  'mag_title', 'mag_front', 'mag_contents', 'mag_goodbye', 'mag_article_end', 'mag_logo_small', 'mag_loading',
  'sec_hack', 'sec_scene', 'sec_graffiti', 'sec_music', 'sec_people', 'sec_archive', 'sec_stream', 'sec_general',
];

let root: string;
let previousDataDir: string;

function app() {
  const a = express();
  a.use(express.json());
  const { createDoorArtRouter } = require('../../src/api/door-art-routes');
  a.use('/api/door-art', createDoorArtRouter({ getDoors: () => [] }));
  return a;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-studio-'));
  const door = path.join(root, 'Doors', 'magazine');
  fs.mkdirSync(path.join(door, 'art'), { recursive: true });
  fs.copyFileSync(path.join(DOOR_SRC, 'door.settings.json'), path.join(door, 'door.settings.json'));
  for (const p of PIECES) fs.copyFileSync(path.join(DOOR_SRC, 'art', `${p}.ans`), path.join(door, 'art', `${p}.ans`));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('the magazine screens in the ANSI Studio', () => {
  it('lists all fifteen pieces for the artist lane', async () => {
    const list = await request(app()).get('/api/door-art');
    expect(list.status).toBe(200);
    const mag = list.body.data.find((d: { command: string }) => d.command === 'MAG');
    expect(mag.sections.map((s: { file: string }) => s.file).sort()).toEqual(PIECES.map((p) => `art/${p}.ans`).sort());
    expect(mag.sections.every((s: { missing?: boolean; lines: number }) => !s.missing && s.lines > 0)).toBe(true);
  });

  it('opens a piece as Amiga ANSI latin1 bytes', async () => {
    const res = await request(app()).get('/api/door-art/MAG');
    expect(res.status).toBe(200);
    const title = res.body.data.find((s: { file: string }) => s.file === 'art/mag_title.ans');
    expect(Buffer.from(title.content, 'base64').equals(fs.readFileSync(path.join(DOOR_SRC, 'art', 'mag_title.ans')))).toBe(true);
  });

  it('saves a piece into the file the door loader reads', async () => {
    const bytes = '\x1b[1;36mSTUDIO \xaf\xab\r\n';
    const res = await request(app()).put('/api/door-art/MAG')
      .send({ file: 'art/mag_goodbye.ans', section: 'setting:art_mag_goodbye', content: b64(bytes) });
    expect(res.status).toBe(200);
    // Doors/magazine/art/<name>.ans is exactly shippedArtDir()/<name>.ans in Doors/magazine/art.ts.
    const read = fs.readFileSync(path.join(root, 'Doors', 'magazine', 'art', 'mag_goodbye.ans'));
    expect(read.equals(Buffer.from(bytes, 'latin1'))).toBe(true);
  });

  it('refuses a path outside the door folder', async () => {
    const res = await request(app()).put('/api/door-art/MAG')
      .send({ file: '../settings.json', section: 'setting:art_mag_title', content: b64('x') });
    expect(res.status).toBe(400);
  });
});
