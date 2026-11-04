/**
 * The shared door logo reader: an artist's file wins, the code logo is the
 * fallback, and a narrow caller is never handed wide art.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDoorLogo, doorLogoRows, blessedArtRow } from '../../utils/door-logo';

let root: string;
let doorDir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorlogo-'));
  doorDir = path.join(root, 'Doors', 'galaga');
  fs.mkdirSync(path.join(doorDir, 'art'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const base = () => ({ key: 'logo', doorDir, bbsRoot: root, columns: 80, command: 'galaga', defaultFile: 'art/logo.ans' });
const variant = (ext: string, text: string) => {
  const dir = path.join(root, 'Screens', 'doors', 'GALAGA');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `setting:logo.${ext}.ans`), text, 'latin1');
};

test('no file: wide caller gets null (the code logo), narrow gets []', () => {
  expect(readDoorLogo(base())).toBeNull();
  expect(readDoorLogo({ ...base(), columns: 40 })).toEqual([]);
});

test('an empty (blank) logo file counts as no file', () => {
  fs.writeFileSync(path.join(doorDir, 'art', 'logo.ans'), '\r\n\r\n');
  expect(readDoorLogo(base())).toBeNull();
});

test('the wide file is read as latin1 and trailing blanks dropped', () => {
  fs.writeFileSync(path.join(doorDir, 'art', 'logo.ans'), Buffer.from([0x41, 0xe4, 0x0d, 0x0a, 0x42, 0x0d, 0x0a, 0x0d, 0x0a]));
  expect(readDoorLogo(base())).toEqual(['Aä', 'B']);
});

test('narrow callers read their variant, teletext its own first, never the wide file', () => {
  fs.writeFileSync(path.join(doorDir, 'art', 'logo.ans'), 'WIDE');
  variant('c64', 'C64ROW');
  expect(readDoorLogo({ ...base(), columns: 40 })).toEqual(['C64ROW']);
  expect(readDoorLogo({ ...base(), columns: 40, teletext: true })).toEqual(['C64ROW']);
  variant('ttx', 'TTXROW');
  expect(readDoorLogo({ ...base(), columns: 40, teletext: true })).toEqual(['TTXROW']);
  expect(readDoorLogo({ ...base(), columns: 40 })).toEqual(['C64ROW']);
});

test('a setting value cannot leave the door folder', () => {
  fs.writeFileSync(path.join(root, 'secret.ans'), 'SECRET');
  expect(readDoorLogo({ ...base(), values: { logo: '../../secret.ans' } })).toBeNull();
});

test('art keeps SGR, loses other escapes, escapes braces and clips', () => {
  expect(blessedArtRow('\x1b[2J\x1b[31m{ab}cdef', 5)).toBe('\x1b[31m{open}ab{close}c\x1b[0m');
});

test('doorLogoRows: art, else original, else plain title for narrow', () => {
  const spec = { ...base(), original: ['{cyan-fg}CODE{/}'], title: 'GALAGA', maxCols: 43 };
  expect(doorLogoRows(spec)).toEqual(['{cyan-fg}CODE{/}']);
  expect(doorLogoRows({ ...spec, columns: 40 })).toEqual(['{cyan-fg}GALAGA{/}']);
  fs.writeFileSync(path.join(doorDir, 'art', 'logo.ans'), '\x1b[33mART');
  expect(doorLogoRows(spec)).toEqual(['\x1b[33mART\x1b[0m']);
});

describe('sessionLogoRows (the call a door makes from its menu)', () => {
  const fsx = require('fs') as typeof import('fs');
  const osx = require('os') as typeof import('os');
  const pathx = require('path') as typeof import('path');
  const { sessionLogoRows } = require('../../utils/door-logo') as typeof import('../../utils/door-logo');

  function door(art?: string): string {
    const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'ae-logo-door-'));
    fsx.writeFileSync(pathx.join(dir, 'door.settings.json'), JSON.stringify({
      command: 'GALAGA',
      settings: [{ key: 'logo', label: 'Logo', type: 'string', default: 'art/logo.ans', art: true }],
    }));
    if (art !== undefined) {
      fsx.mkdirSync(pathx.join(dir, 'art'));
      fsx.writeFileSync(pathx.join(dir, 'art', 'logo.ans'), art, 'latin1');
    }
    return dir;
  }
  const spec = (dirname: string) => ({
    dirname, command: 'GALAGA', title: 'GALAGA', maxCols: 43, original: ['{cyan-fg}CODE{/}'],
  });

  it('shows the artist file, with SGR kept and braces escaped', () => {
    const rows = sessionLogoRows({ bbsSession: { screenWidth: 80 } }, spec(door('\x1b[31m{HI}\x1b[0m\n')));
    expect(rows.join('\n')).toContain('\x1b[31m');
    expect(rows.join('\n')).toContain('{open}HI{close}');
    expect(rows.join('\n')).not.toContain('CODE');
  });

  it('shows the code logo when the slot is empty', () => {
    expect(sessionLogoRows({ bbsSession: { screenWidth: 80 } }, spec(door()))).toEqual(['{cyan-fg}CODE{/}']);
  });

  it('gives a 40-column caller a plain title when no narrow variant exists', () => {
    const rows = sessionLogoRows({ bbsSession: { screenWidth: 40 } }, spec(door('WIDE ART\n')));
    expect(rows.join('\n')).toContain('GALAGA');
    expect(rows.join('\n')).not.toContain('WIDE ART');
  });
});
