/**
 * Everything the BOARD already knows about its own screens.
 *
 * "Investigate how we can get good meta data like this for as many screens as
 * possible." Four sources were being ignored, and each one turns a path into a
 * sentence:
 *
 * - ScreenTypes.info names the screen types, so `.GR` is "Amiga Ansi" rather
 *   than a suffix a designer has to know.
 * - user.data says how many callers actually fall in a variant's level range,
 *   which is the difference between "levels 20-29" and "95 of your 100
 *   callers".
 * - ConfConfig.info's NDIRS and the conference's own name were already read for
 *   names; the message bases and file areas hang off the same file.
 * - express.e itself says where each screen is displayed from - authoritative,
 *   and this port is 1:1 with it by rule.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';
import { screenTypeNames, describeCallerRange } from '../../src/screens/screen-metadata';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-src-'));
  // The live board's own ScreenTypes.info, in the shape the icon holds.
  write('ScreenTypes.info', 'TYPE.1=TXT.GR\nTITLE.1=Amiga Ansi\nTYPE.2=IBM\nTITLE.2=IBM Ansi\n');
  write('Conf2/Menu.txt', 'menu\n');
  write('Conf2/menu250.txt.GR', 'sysop menu\n');
  write('ConfConfig.info', 'NCONFS=1\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf2/\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the screen types this board defines', () => {
  test('names them from the board icon, not from a table in the code', () => {
    expect(screenTypeNames(root)).toMatchObject({ GR: 'Amiga Ansi', IBM: 'IBM Ansi' });
  });

  test('a variant carries that name, so .GR reads as Amiga Ansi', () => {
    const index = buildScreenIndex(root);
    const reader = index.files['Conf2/menu250.txt.GR'].readBy[0];

    expect(reader.screenTypeName).toBe('Amiga Ansi');
  });

  test('answers with nothing when the board has no ScreenTypes.info', () => {
    fs.rmSync(path.join(root, 'ScreenTypes.info'));

    expect(screenTypeNames(root)).toEqual({});
  });
});

describe('how many callers a variant serves', () => {
  const levels = { 0: 1, 30: 95, 255: 4 };

  test('counts the accounts inside the range', () => {
    expect(describeCallerRange('30 and above', levels)).toBe('99 callers');
    expect(describeCallerRange('20-29', levels)).toBe('no callers');
  });

  test('says nothing when the board has no level counts to offer', () => {
    expect(describeCallerRange('20-29', {})).toBe('');
  });

  test('reads a single level as itself', () => {
    expect(describeCallerRange('255 and above', levels)).toBe('4 callers');
  });
});
