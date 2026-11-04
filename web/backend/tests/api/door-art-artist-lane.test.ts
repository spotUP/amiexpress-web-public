/**
 * "level 100 is ansi artists" (sysop, 2026-09-14).
 *
 * The admin offers a level-100 account Screens and nothing else, and the
 * Studio lists a door's art beside the screen files there. The three art
 * endpoints were mounted under `/api/config`, behind `requireSysop()`, so
 * the card was drawn and the canvas behind it answered 403: the people who
 * draw the art could not reach it.
 *
 * Driven through real HTTP against the real router, because a lane is
 * middleware and a middleware that is never mounted is invisible to a unit
 * test. Same shape as screens-sandbox.test.ts, for the same reason.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';

const CFG = [
  '[Init_END] =========================================================',
  '\x1b[36m WIDE LOGO',
  '[Title_END] ========================================================',
].join('\n');

const MANIFEST = {
  command: 'B',
  cfgFile: 'Bulls.CFG',
  cfgFormat: 'empire',
  settings: [],
  artSections: [
    { file: 'Bulls.CFG', section: 'title', label: 'Title logo', maxLines: 20, maxLineLength: 200, commands: ['B'] },
  ],
};

let root: string;
let previousDataDir: string;

/** The router as it is mounted for an artist: level 100 and nothing above. */
function app() {
  const a = express();
  a.use(express.json());
  const { createDoorArtRouter } = require('../../src/api/door-art-routes');
  // A plain relative LOCATION: the `DOORS:` assign a live registration uses
  // is resolved against the running board's own volumes, which a temp
  // fixture has none of.
  a.use('/api/door-art', createDoorArtRouter({
    getDoors: () => [{ command: 'B', name: 'Bulls', location: 'Doors/EmP_Tools/Bulls' }],
  }));
  return a;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-art-lane-'));
  const doorDir = path.join(root, 'Doors', 'EmP_Tools');
  fs.mkdirSync(doorDir, { recursive: true });
  fs.writeFileSync(path.join(doorDir, 'Bulls.CFG'), Buffer.from(CFG, 'latin1'));
  fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify(MANIFEST));
  // The door's LOCATION names the binary, and the directory resolver stats
  // it: no binary, no door directory, and the art is invisible.
  fs.writeFileSync(path.join(doorDir, 'Bulls'), '');
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  // NO resetModules here: it would hand the router a FRESH `config` module
  // whose dataDir is the real board's, and the line above would be talking
  // to an instance nobody reads. The door list is injected instead of
  // mocked, so nothing has to boot a BBS to answer it.
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('door art on the artist lane', () => {
  it('lists the doors that have art to draw', async () => {
    const res = await request(app()).get('/api/door-art');
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { command: string }) => d.command)).toContain('B');
  });

  it('says in the list which narrow drawings a slot has, so a card can answer without its body', async () => {
    await request(app())
      .put('/api/door-art/B')
      .send({ file: 'Bulls.CFG', section: 'title', content: b64(' NARROW'), variant: 'c64' });

    const res = await request(app()).get('/api/door-art');

    expect(res.body.data[0].sections[0].variants).toEqual({ c64: true, ttx: false, tti: false });
  });

  it('hands over one door art section, and says which variants exist', async () => {
    const res = await request(app()).get('/api/door-art/B');
    expect(res.status).toBe(200);
    expect(res.body.data[0].variants).toEqual({ c64: false, ttx: false, tti: false });
  });

  it('saves a narrow drawing without touching the door config', async () => {
    const before = fs.readFileSync(path.join(root, 'Doors', 'EmP_Tools', 'Bulls.CFG'));
    const res = await request(app())
      .put('/api/door-art/B')
      .send({ file: 'Bulls.CFG', section: 'title', content: b64(' NARROW'), variant: 'c64' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'Screens', 'doors', 'B', 'title.c64.ans'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'Doors', 'EmP_Tools', 'Bulls.CFG'))).toEqual(before);
  });

  it('refuses a drawing wider than the caller has columns', async () => {
    const res = await request(app())
      .put('/api/door-art/B')
      .send({ file: 'Bulls.CFG', section: 'title', content: b64('x'.repeat(41)), variant: 'c64' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/41 columns, at most 40/);
  });

  it('reaches ART and nothing else: a file the manifest does not declare is refused', async () => {
    const res = await request(app())
      .put('/api/door-art/B')
      .send({ file: 'door.settings.json', section: 'title', content: b64('x'), variant: 'c64' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).toMatch(/No art section/);
  });

  it('refuses a variant name it does not serve', async () => {
    const res = await request(app())
      .put('/api/door-art/B')
      .send({ file: 'Bulls.CFG', section: 'title', content: b64('x'), variant: 'amiga' });
    expect(res.status).toBe(400);
  });
});
