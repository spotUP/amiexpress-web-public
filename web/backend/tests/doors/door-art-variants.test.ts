/**
 * The narrow art store: one drawing per command, section and alphabet.
 *
 * Art bytes are latin1 and carry ESC and high bytes; a UTF-8 round trip
 * turns an Amiga 0xA1 into three bytes of replacement character, so every
 * read and write here is asserted on the BYTES, never on a decoded string.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  alphabetFor,
  readVariant,
  writeVariant,
  variantPath,
  VARIANT_COLUMNS,
} from '../../src/doors/door-art-variants';

const C64 = { petsciiMode: true, texttvMode: false, petsciiColumns: 40, screenWidth: 40 };
const P8 = { petsciiMode: true, texttvMode: false, petsciiColumns: 80, screenWidth: 80 };
const TELETEXT = { petsciiMode: false, texttvMode: true, screenWidth: 40 };
const ANSI80 = { petsciiMode: false, texttvMode: false, screenWidth: 80 };

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'art-variants-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('alphabetFor', () => {
  test('a 40-column PETSCII caller is c64, a teletext caller is ttx', () => {
    expect(alphabetFor(C64)).toBe('c64');
    expect(alphabetFor(TELETEXT)).toBe('ttx');
  });
  test('an 80-column caller has no narrow alphabet, PETSCII or not', () => {
    expect(alphabetFor(P8)).toBeNull();
    expect(alphabetFor(ANSI80)).toBeNull();
    expect(alphabetFor(undefined)).toBeNull();
    expect(alphabetFor(null)).toBeNull();
  });
});

describe('variantPath', () => {
  test('is keyed by command and section, upper-cased command, lower-cased section', () => {
    expect(variantPath('/board/Screens', 'b', 'Title', 'c64'))
      .toBe(path.join('/board/Screens', 'doors', 'B', 'title.c64.ans'));
  });
});

describe('readVariant', () => {
  test('a drawing that was never made reads as null, not an error', () => {
    expect(readVariant(root, 'B', 'title', 'c64')).toBeNull();
  });

  test('returns the drawing as lines, with its high bytes intact', () => {
    const art = ['\x1b[36m  UP ROUGH  \xa1', '  ----------'];
    writeVariant(root, 'B', 'title', 'c64', art);
    expect(readVariant(root, 'B', 'title', 'c64')).toEqual(art);
  });

  test('an unreadable drawing reads as null, never throws', () => {
    const file = variantPath(root, 'B', 'title', 'c64');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(file);               // a directory where a file belongs
    expect(readVariant(root, 'B', 'title', 'c64')).toBeNull();
  });
});

describe('writeVariant', () => {
  test('creates the command directory on the first save', () => {
    writeVariant(root, 'J', 'title', 'ttx', ['x']);
    expect(fs.existsSync(path.join(root, 'doors', 'J', 'title.ttx.ans'))).toBe(true);
  });

  test('writes latin1 bytes, not UTF-8', () => {
    writeVariant(root, 'B', 'title', 'c64', ['\xa1']);
    expect(fs.readFileSync(variantPath(root, 'B', 'title', 'c64'))).toEqual(Buffer.from([0xa1]));
  });

  test('refuses a line wider than the caller has columns', () => {
    expect(() => writeVariant(root, 'B', 'title', 'c64', ['x'.repeat(VARIANT_COLUMNS + 1)]))
      .toThrow(/line 1: 41 columns, at most 40/);
  });

  test('counts COLUMNS, not bytes: an escape sequence is not width', () => {
    const row = '\x1b[36m' + 'x'.repeat(VARIANT_COLUMNS) + '\x1b[0m';
    expect(() => writeVariant(root, 'B', 'title', 'c64', [row])).not.toThrow();
  });
});
