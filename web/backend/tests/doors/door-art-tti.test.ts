/**
 * The teletext caller's native drawing: `Screens/doors/<CMD>/<section>.tti`.
 *
 * The Studio's teletext editor saves a packet page through the artist lane
 * (`variant: 'tti'`), and a teletext caller entering a door reads that page
 * rendered, ahead of the `.ttx.ans` ANSI drawing. Driven through the real
 * router on a temp volume; the shadow is the provider the DOS layer asks on
 * every open, with its real manifest reader, file reader and art store.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { renderNativeTti } from '@amiexpress/bbs-door-sdk/teletext/render-native';

import { config } from '../../src/config';
import {
  artKindFor,
  artRowText,
  artRows,
  boardVariantDir,
  loadArt,
  shippedArtDir,
  type ArtSources,
} from '../../../../Doors/magazine/art';

// The sentinel: the real renderer, counted. The module's exports are
// non-configurable getters, so a spyOn cannot wrap them.
jest.mock('@amiexpress/bbs-door-sdk/teletext/render-native', () => {
  const actual = jest.requireActual('@amiexpress/bbs-door-sdk/teletext/render-native');
  return { ...actual, renderNativeTti: jest.fn(actual.renderNativeTti) };
});

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** A small native page, CRLF as teletext tools write it. */
const TTI = ['DE,door logo', 'PN,10000', 'SC,0000', 'PS,8000', 'OL,1,NATIVE LOGO', ''].join('\r\n');

const b64 = (s: string): string => Buffer.from(s, 'latin1').toString('base64');
const un64 = (s: string): string => Buffer.from(s, 'base64').toString('latin1');

let root: string;
let previousDataDir: string;

function app(): express.Express {
  const a = express();
  a.use(express.json());
  const { createDoorArtRouter } = require('../../src/api/door-art-routes');
  a.use('/api/door-art', createDoorArtRouter({ getDoors: () => [] }));
  return a;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-art-tti-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the tti variant on the artist lane (MAG)', () => {
  const MAG_TITLE = { file: 'art/mag_title.ans', section: 'setting:art_mag_title' };

  beforeEach(() => {
    const door = path.join(root, 'Doors', 'magazine');
    fs.mkdirSync(path.join(door, 'art'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'Doors', 'magazine', 'door.settings.json'), path.join(door, 'door.settings.json'));
    fs.copyFileSync(path.join(REPO, 'Doors', 'magazine', 'art', 'mag_title.ans'), path.join(door, 'art', 'mag_title.ans'));
  });

  it('round-trips a page into Screens/doors/MAG/<section>.tti', async () => {
    const empty = await request(app()).get('/api/door-art/MAG').query({ ...MAG_TITLE, variant: 'tti' });
    expect(empty.status).toBe(200);
    expect(empty.body.data.variants.tti).toBe(false);

    const put = await request(app()).put('/api/door-art/MAG').send({ ...MAG_TITLE, variant: 'tti', content: b64(TTI) });
    expect(put.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'Screens', 'doors', 'MAG', 'setting:art_mag_title.tti'))).toBe(true);

    const read = await request(app()).get('/api/door-art/MAG').query({ ...MAG_TITLE, variant: 'tti' });
    expect(un64(read.body.data.content)).toBe(TTI.replace(/\r\n/g, '\n').replace(/\n$/, ''));
    expect(read.body.data.variants).toEqual({ c64: false, ttx: false, tti: true });
  });

  it('refuses text that is not a page the board can render', async () => {
    const put = await request(app()).put('/api/door-art/MAG')
      .send({ ...MAG_TITLE, variant: 'tti', content: b64('\x1b[36mANSI, not packets\n') });
    expect(put.status).not.toBe(200);
    expect(fs.existsSync(path.join(root, 'Screens', 'doors', 'MAG', 'setting:art_mag_title.tti'))).toBe(false);
  });
});

/*
 * REACHABILITY. MAG is a TypeScript door that reads its own art
 * (Doors/magazine/art.ts) and never goes through the file shadow. So the
 * wire is proven on MAG itself: the page saved through the route, read by
 * the door's own loader with the sources the door builds at runtime - the
 * variant folder found from the door's folder through the board root, the
 * caller a teletext one. (The shadow's own .tti path is file-shadow.test.ts.)
 */
describe('a saved .tti reaches a teletext caller in MAG', () => {
  const MAG_TITLE = { file: 'art/mag_title.ans', section: 'setting:art_mag_title' };
  let previousBbsDataDir: string | undefined;

  beforeEach(() => {
    const door = path.join(root, 'Doors', 'magazine');
    fs.mkdirSync(path.join(door, 'art'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'Doors', 'magazine', 'door.settings.json'), path.join(door, 'door.settings.json'));
    fs.copyFileSync(path.join(REPO, 'Doors', 'magazine', 'art', 'mag_title.ans'), path.join(door, 'art', 'mag_title.ans'));
    // A board root is the folder that holds Commands/BBSCmd; the door finds it from BBS_DATA_DIR.
    fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
    previousBbsDataDir = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;
  });
  afterEach(() => {
    if (previousBbsDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousBbsDataDir;
  });

  it('PUT variant=tti, then the door\'s loader serves the rendered rows, rendered once', async () => {
    const put = await request(app()).put('/api/door-art/MAG').send({ ...MAG_TITLE, variant: 'tti', content: b64(TTI) });
    expect(put.status).toBe(200);

    // The save rendered once to check the page; count the caller's read only.
    const render = jest.mocked(renderNativeTti);
    render.mockClear();
    const door = path.join(root, 'Doors', 'magazine');
    const sources: ArtSources = {
      shippedDir: shippedArtDir(door),
      slots: {},
      variantDir: boardVariantDir(door),
      teletext: true,
    };
    const art = loadArt('mag_title', artKindFor(false, 40), sources);

    expect(render).toHaveBeenCalledTimes(1);
    expect(art?.file).toBe(path.join(root, 'Screens', 'doors', 'MAG', 'setting:art_mag_title.tti'));
    const rows = artRows(art!, 25, 40).map(artRowText).join('\n');
    expect(rows).toContain('NATIVE LOGO');
    expect(rows).not.toContain('OL,');
  });
});
