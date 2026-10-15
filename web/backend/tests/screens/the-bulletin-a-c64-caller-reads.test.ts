/**
 * THE BULLETIN SCREEN, DRIVEN THE WAY THE BOARD DRIVES IT.
 *
 * The sysop photographed the same broken table twice. The second time was
 * AFTER the two-column stacker had shipped and gone live - ` 1. EALL/HT
 * 49,246 16. discord-bridge 0`, two columns squeezed onto one row - and his
 * words were "the right columns is collapsed to the left".
 *
 * The stacker worked on the file. It was never REACHED: the board's own
 * screen is `Screens/BULL.TXT`, six `~SS_BBS:Bulletins/bullN.txt` includes
 * separated by `~SP`, and what the caller reads comes out of that walk.
 *
 * So this drives `displayScreen('BULL')` with a forty-column PETSCII
 * session against a board laid out like the live one, and asks the WIRE
 * what the caller saw. A test that adapted the file directly is what let
 * the first fix ship while the screen stayed broken.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen, processNextScreenSegment } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

/**
 * The LIVE `Bulletins/bull1.txt`, byte for byte off the volume - not a
 * fixture of my own. The first version of this test used a small one and
 * passed against the broken board, which is exactly the trap: the shape
 * that decides the ladder's answer is the real file's.
 */
const BULLETIN = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'multitop-bull1-live.txt'),
  'latin1',
);

/**
 * `Bulletins/bull3.txt`, also off the volume, and NOT the same shape:
 * MultiTop writes bull2 to bull5 with a leading FORM FEED, and bull1
 * without one. Everything the board decides about a screen - whether it is
 * art, whether it is adapted, whether it is skipped - it decides from the
 * bytes, so the two files are two cases and only one of them was tested.
 */
const BULLETIN_FF = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'multitop-bull3-live.txt'),
  'latin1',
);

/** Kept for reference: the small table the first version of this test used. */
const SMALL_BULLETIN = [
  '\x1b[4;33m' + ' '.repeat(77) + '\x1b[0m',
  '\x1b[4;33;44m  MultiTop-II' + ' '.repeat(29) + 'Design Created (c)1994 Bobo/Mystic\x1b[0m',
  '',
  '\x1b[35mNo# Username (Handle)   Uploaded Bytes No# Username (Handle)   Uploaded Bytes\x1b[0m',
  '\x1b[34m===-===================-==============-===-===================-==============\x1b[0m',
  '\x1b[33m 1.\x1b[0m EALL/HT                 49,246 \x1b[33m 3.\x1b[0m discord-bridge               0',
  '\x1b[33m 2.\x1b[0m orlingo                      0 \x1b[33m 4.\x1b[0m h7                           0',
  '',
].join('\r\n');

let root = '';
let previousDataDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull1.txt'), BULLETIN, 'binary');
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull3.txt'), BULLETIN_FF, 'binary');
  // The live screen, shape and all: an include and the pause after it.
  fs.writeFileSync(
    path.join(root, 'Screens', 'BULL.TXT'),
    '~f\r\n~SS_BBS:Bulletins/bull1.txt ~SP\r\n~SS_BBS:Bulletins/bull3.txt ~SP\r\n',
    'binary',
  );
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

/** Everything the caller's terminal received, escapes stripped, as rows. */
async function rowsFor(session: Record<string, unknown>, screen = 'BULL'): Promise<string[]> {
  const wire: string[] = [];
  const socket: any = {
    id: 'bulletin-test',
    session,
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  await displayScreen(socket, session as never, screen, true, true);
  /*
   * THE PAUSE IS PART OF THE SCREEN.
   *
   * The live `Screens/BULL.TXT` is six includes with a `~SP` between them,
   * so what the caller reads after the first bulletin comes off
   * `session.screenSegments` - a different code path from the one that drew
   * the first. A test that stopped at the first segment could not see it.
   */
  for (let guard = 0; guard < 12; guard++) {
    const segState = (session as any).screenSegments;
    if (!segState || segState.segments.length === 0) break;
    (session as any).paginatedScreen = undefined;
    await processNextScreenSegment(socket, session as never);
  }
  return wire.join('')
    .split(/\r?\n/)
    .map(row => row.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s+$/, ''));
}

const c64 = () => ({
  user: { id: 1, username: 'sysop', secLevel: 255 },
  currentConf: 1, nodeId: 1,
  petsciiMode: true, terminalType: 'c64', screenWidth: 40, screenHeight: 25,
  tempData: {},
});

describe('a C64 caller reading the bulletins', () => {
  it('gets one place per row, never two squeezed onto one', async () => {
    const rows = await rowsFor(c64());
    const entries = rows.filter(row => /^\s*\d+\.\s/.test(row));

    expect(entries.length).toBeGreaterThan(0);
    for (const row of entries) {
      // Two places on one row is the defect, and it shows as a SECOND
      // number-and-dot after the first.
      expect(row.replace(/^\s*\d+\.\s/, '')).not.toMatch(/\s\d+\.\s/);
    }
  });

  it('keeps every row inside the forty columns he has', async () => {
    for (const row of await rowsFor(c64())) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });

  it('shows the top of the chart, which is what survives the cut', async () => {
    const rows = await rowsFor(c64());

    // The live file's first place. Everything past the cut is gone rather
    // than squeezed onto a row with somebody else - see the cut's own test.
    expect(rows.some(row => /^\s*1\.\s+\S/.test(row))).toBe(true);
    expect(rows.some(row => row.startsWith('No# Username'))).toBe(true);
  });
});

/**
 * The file MultiTop writes with a form feed in front of it. Same table, same
 * two columns across eighty, and the caller's forty columns have to hold it
 * one place to a row exactly as bull1 does.
 */
describe('a C64 caller reading a bulletin that starts with a form feed', () => {
  it('gets one place per row there too', async () => {
    const rows = await rowsFor(c64());
    const entries = rows.filter(row => /^\s*\d+\.\s/.test(row));
    // The second bulletin is the one behind the pause.
    expect(rows.some(row => row.includes('Phantasm'))).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    for (const row of entries) {
      expect(row.replace(/^\s*\d+\.\s/, '')).not.toMatch(/\s\d+\.\s/);
    }
  });

  it('keeps every row inside forty columns', async () => {
    for (const row of await rowsFor(c64())) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });
});

/**
 * THE `B` COMMAND'S OWN ROUTE.
 *
 * `Screens/BULL.TXT` is the flow's bulletin walk. A caller who types `B` and
 * a number reaches `display-file-commands.handler`, which resolves the file
 * itself (`_findSecurityScreen(Bulletins/Bull1)`) and hands displayScreen an
 * ABSOLUTE PATH rather than a screen name. That is a second entry point into
 * the same screen, and the sysop reads his bulletins through it.
 */
/**
 * "its still too tall - you consolidate the headline 'Multitop-II Design
 * created ....' to Multitop-II (c)1994 Bobo/Mystic", "then it will fit on
 * one row" (the sysop, 2026-09-22).
 */
describe('the masthead a C64 caller reads', () => {
  it('is one row, and names the door and whose work it is', async () => {
    const rows = await rowsFor(c64());
    const masthead = rows.find(row => row.includes('MultiTop-II'));

    expect(masthead).toBeDefined();
    expect(masthead!.trim()).toBe('MultiTop-II (c)1994 Bobo/Mystic');
    // One row: nothing else on the screen carries the title.
    expect(rows.filter(row => row.includes('MultiTop-II')).length).toBe(2);
  });

  it('leaves the whole bulletin inside one C64 screen', async () => {
    const rows = await rowsFor(c64());
    // Two bulletins behind one pause; the first runs from its own masthead
    // to the second one's. Slicing from row zero measured an empty line.
    const mastheads = rows.reduce<number[]>((at, row, i) => (row.includes('MultiTop-II') ? [...at, i] : at), []);
    expect(mastheads.length).toBe(2);
    const first = rows.slice(mastheads[0], mastheads[1]);

    expect(first.filter(row => row.trim().length > 0).length).toBeGreaterThan(5);
    // Twenty-five rows of glass, and the board writes its own pause prompt
    // under the screen.
    expect(first.length).toBeLessThanOrEqual(23);
  });
});

describe('a C64 caller who types B and a number', () => {
  it('gets the chart stacked, one place per row', async () => {
    const rows = await rowsFor(c64(), path.join(root, 'Bulletins', 'bull1.txt'));
    const entries = rows.filter(row => /^\s*\d+\.\s/.test(row));

    expect(entries.length).toBeGreaterThan(0);
    for (const row of entries) {
      expect(row.replace(/^\s*\d+\.\s/, '')).not.toMatch(/\s\d+\.\s/);
    }
  });

  it('keeps every row inside forty columns', async () => {
    for (const row of await rowsFor(c64(), path.join(root, 'Bulletins', 'bull1.txt'))) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('an eighty-column caller reading the same screen', () => {
  it('gets the table as it has always been, two columns across', async () => {
    const rows = await rowsFor({ ...c64(), petsciiMode: false, terminalType: 'ansi', screenWidth: 80 });
    const wide = rows.find(row => row.includes('EALL/HT'));

    expect(wide).toBeDefined();
    expect(wide).toContain('discord-bridge');
  });
});
