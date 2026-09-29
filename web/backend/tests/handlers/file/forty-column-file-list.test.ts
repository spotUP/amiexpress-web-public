/**
 * WHAT A C64 CALLER SEES WHEN HE TYPES `F`.
 *
 * One row per file - ordinal, size, marker, new flag, filename, date - under a
 * header and its rule, at the columns `Prompts/FILEVIEW.40` names. Twenty-plus
 * records to a screen, which is what a fixed-column listing buys and what the
 * stacked block it replaces could not do (three records a screen).
 *
 * The 80-column path must not move a byte: decision 4 freezes every 80-column
 * file format, and the same fixture is driven at both widths here to prove it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { config } from '../../../src/config';
import { resetFileViewLayoutCache } from '../../../src/services/file-layout.service';

const INDENT = ' '.repeat(33);
const DIR = [
  'OTL-DOOR.LHA P  40960  03-28-18  A door from the Outlaws',
  INDENT + 'MegaDoor v2.1',
  // The shape 160 of the live board's 213 records use.
  'PDX-TOOL.LHA N    82MB  01-21-26  A tool',
  // 12 characters, which is express.e's DIR grammar cap - a 13-character
  // name is not parsed as an entry AT ALL, which this fixture found the hard
  // way and is worth knowing before anyone widens ~12F_NAME|.
  'OLDTHING.LHA P   1024  12-24-92  From the Amiga days',
  '',
].join('\n');

let tmp = '';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forty-list-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), DIR, 'binary');
  // `dataDir` is the only root this config has; there is no `bbsRoot` key,
  // and asking for one broke `typecheck:tests` on main.
  config.set('dataDir', tmp);
  resetFileViewLayoutCache();
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  resetFileViewLayoutCache();
});

async function listAt(width: number, petscii: boolean): Promise<string[]> {
  const wire: string[] = [];
  const session: any = {
    currentConf: 1,
    screenWidth: width,
    screenHeight: 25,
    petsciiMode: petscii,
    terminalType: petscii ? 'c64' : 'ansi',
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 0, 1) },
    tempData: {},
  };
  const socket: any = {
    session,
    id: `list-${width}`,
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  await FileListingHandler.handleFileList(socket, session, 'A', false);
  return wire.join('').split(/\r?\n/);
}

/** Strip pens and any MCI the row carries, to read the glyphs. */
const glass = (line: string) => line.replace(/~[^|]*\|/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

describe('a 40-column caller gets one row per file', () => {
  it('lays every record out at the template\'s columns', async () => {
    const rows = (await listAt(40, true)).map(glass);
    const door = rows.find((r) => r.includes('OTL-DOOR.LHA'));
    expect(door).toBeDefined();
    expect(door!.indexOf('1')).toBe(0);              // first record's ordinal
    // THE SIZE AS THE DIR FILE WROTE IT. `~F_SIZE_RAW|` prints the source's
    // own words, so a board whose records say `82MB` reads `82MB` rather than
    // `83968K` - which is seven characters in a six-column field and lost its
    // K on the live board (sysop, 2026-09-07).
    expect(door!.indexOf('40960')).toBe(5);
    expect(door![12]).toBe('P');
    expect(door!.indexOf('OTL-DOOR.LHA')).toBe(14);
    expect(door!.indexOf('03-28-18')).toBe(31);
  });

  it('numbers the records so a caller can ask for one', async () => {
    const rows = (await listAt(40, true)).map(glass);
    const tool = rows.find((r) => r.includes('PDX-TOOL.LHA'));
    expect(tool!.trimStart().startsWith('2')).toBe(true);
  });

  it('marks what is new to THIS caller and nothing else', async () => {
    const rows = (await listAt(40, true)).map(glass);
    // Last call 2026-01-01: the 2026 file is new, the 2018 and 1992 ones are not.
    expect(rows.find((r) => r.includes('PDX-TOOL.LHA'))![13]).toBe('*');
    expect(rows.find((r) => r.includes('OTL-DOOR.LHA'))![13]).toBe(' ');
    expect(rows.find((r) => r.includes('OLDTHING.LHA'))![13]).toBe(' ');
  });

  it('prints the header and its rule once, not per record', async () => {
    const rows = (await listAt(40, true)).map(glass);
    expect(rows.filter((r) => r.includes('Filename')).length).toBe(1);
    expect(rows.filter((r) => /^▔+$/.test(r.trim())).length).toBeGreaterThanOrEqual(1);
  });

  it('never paints past the screen edge', async () => {
    for (const row of (await listAt(40, true)).map(glass)) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });

  it('does not fold a description across rows any more', async () => {
    // The stacked block put the DIZ under each record and fitted three to a
    // screen; the list row carries no description at all.
    const rows = (await listAt(40, true)).map(glass);
    expect(rows.some((r) => r.includes('MegaDoor v2.1'))).toBe(false);
  });
});

describe('the 80-column listing is untouched', () => {
  it('still prints the DIR rows as express.e wrote them', async () => {
    const rows = (await listAt(80, false)).map(glass);
    expect(rows.some((r) => r.includes('OTL-DOOR.LHA P  40960  03-28-18'))).toBe(true);
    // And it still carries the description block the DIR file holds.
    expect(rows.some((r) => r.includes('MegaDoor v2.1'))).toBe(true);
  });

  it('prints no 40-column header at 80', async () => {
    const rows = (await listAt(80, false)).map(glass);
    expect(rows.some((r) => /^▔+$/.test(r.trim()))).toBe(false);
  });
});

describe('what actually reaches the wire', () => {
  it('sends NO raw MCI - the pens are resolved before the bytes leave', async () => {
    // This caught a real bug: the interpreter leaves `~c7|` for the board's own
    // MCI pass, and the wiring skipped that pass - so a caller would have read
    // the literal text `~c7|`. Every other test in this file strips MCI to read
    // the columns, which is exactly how it stayed hidden.
    const raw = (await listAt(40, true)).join('\n');
    expect(raw).not.toMatch(/~[A-Za-z0-9_]*\|/);
  });
});

describe('a size written the way this board writes them', () => {
  it('prints 82MB, not 83968K clipped to six columns', async () => {
    const rows = (await listAt(40, true)).map(glass);
    const tool = rows.find((r) => r.includes('PDX-TOOL.LHA'))!;
    expect(tool.indexOf('82MB')).toBe(5);
    expect(tool).not.toContain('83968');
    expect(tool.length).toBeLessThanOrEqual(40);
  });
});
