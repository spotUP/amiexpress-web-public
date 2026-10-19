/**
 * The Studio's three canvases for one logo: wide, c64, teletext.
 *
 * The wide one is the door's own file and keeps the manifest's limits. A
 * variant is the board's file and is capped at the caller's forty columns.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readDoorArtSections,
  readDoorArtVariant,
  writeDoorArtVariant,
} from '../../src/doors/door-settings.service';

const CFG = [
  '[Init_END] =========================================================',
  '\x1b[36m WIDE',
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

let board: string;
let doorDir: string;
let artRoot: string;

beforeEach(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'art-api-'));
  doorDir = path.join(board, 'Doors', 'EmP_Tools');
  artRoot = path.join(board, 'Screens');
  fs.mkdirSync(doorDir, { recursive: true });
  fs.writeFileSync(path.join(doorDir, 'Bulls.CFG'), Buffer.from(CFG, 'latin1'));
  fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify(MANIFEST));
});
afterEach(() => { fs.rmSync(board, { recursive: true, force: true }); });

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');
const un64 = (s: string) => Buffer.from(s, 'base64').toString('latin1');

test('a section reports which variants have been drawn', () => {
  expect(readDoorArtSections(doorDir, 'B', artRoot)[0].variants).toEqual({ c64: false, ttx: false, tti: false });
  writeDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64', b64(' ART'));
  expect(readDoorArtSections(doorDir, 'B', artRoot)[0].variants).toEqual({ c64: true, ttx: false, tti: false });
});

test('a variant round-trips byte for byte, high bytes and all', () => {
  const art = '\x1b[36m  UP ROUGH \xa1';
  writeDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64', b64(art));
  expect(un64(readDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64').content)).toBe(art);
});

test('a 41-column row is refused', () => {
  expect(() =>
    writeDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64', b64('x'.repeat(41))),
  ).toThrow(/41 columns, at most 40/);
});

test('writing a variant does not touch the door file', () => {
  const before = fs.readFileSync(path.join(doorDir, 'Bulls.CFG'));
  writeDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64', b64(' ART'));
  expect(fs.readFileSync(path.join(doorDir, 'Bulls.CFG'))).toEqual(before);
});

test('a section this door does not declare is refused, whatever the file says', () => {
  expect(() =>
    writeDoorArtVariant(doorDir, artRoot, 'B', 'joincnf.cfg', 'title', 'c64', b64(' ART')),
  ).toThrow(/No art section/);
});

test('an undrawn variant reads as empty content, not an error', () => {
  const read = readDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'ttx');
  expect(read.content).toBe('');
  expect(read.lines).toBe(0);
});

test('a variant read reports the FORTY-column limit, not the wide one', () => {
  expect(readDoorArtVariant(doorDir, artRoot, 'B', 'Bulls.CFG', 'title', 'c64').maxLineLength).toBe(40);
  expect(readDoorArtSections(doorDir, 'B', artRoot)[0].maxLineLength).toBe(200);
});
