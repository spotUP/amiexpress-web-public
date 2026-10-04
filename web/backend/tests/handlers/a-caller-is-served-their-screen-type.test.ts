/**
 * A caller is served the screen-type variant their account selects.
 *
 * express.e:6246-6310 findSecurityScreen tries, at every security level it
 * walks and then for the unnumbered name, `<name><screenTypeExt>` before
 * `<name>.TXT`, where screenTypeExt is ScreenTypes.info's TYPE.n for the
 * user's `screenType` index (express.e:31899-31926, 11366). The loader passed
 * `null` for that type in every call, so `menu250.txt.GR` - on the board and
 * in every theme - was never served to anybody.
 *
 * Drives the real loader and the real displayScreen on a scratch board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen, loadScreenFile } from '../../src/handlers/screen.handler';
import { screenTypeIndex, userScreenTypeExtension } from '../../src/screens/screen-metadata';

// The live board's own ScreenTypes.info, in the text shape the parser reads.
const SCREEN_TYPES = 'TYPE.1=TXT.GR\nTITLE.1=Amiga Ansi\nTYPE.2=IBM\nTITLE.2=IBM Ansi\n';

function makeBoard(files: Record<string, string>): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-type-'));
  for (const [rel, body] of Object.entries(files)) {
    const target = path.join(board, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, 'latin1');
  }
  return board;
}

function makeSession(user: Record<string, unknown>): any {
  return {
    user: { username: 'T', secLevel: 100, ...user },
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    subState: 'READ_COMMAND',
    slowmo: 0,
    slowmoCount: 0,
  };
}

const servedName = (user: Record<string, unknown>) =>
  path.basename(loadScreenFile('LOGON', 1, 1, makeSession(user))!.filePath);

describe('the screen type a caller has selected', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  let oldDataDir = '';
  let board = '';

  beforeEach(() => { oldDataDir = config.getConfig().dataDir; });
  afterEach(() => {
    config.set('dataDir', oldDataDir);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('draws Logon.txt.GR for an Amiga Ansi caller when it exists', async () => {
    board = makeBoard({
      'ScreenTypes.info': SCREEN_TYPES,
      'Node1/Logon.txt': 'PLAIN LOGON\r\n',
      'Node1/Logon.txt.GR': 'GRAPHICS LOGON\r\n',
    });
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'gr' };

    const shown = await displayScreen(socket, makeSession({ screenType: 'Amiga Ansi' }), 'LOGON', false);

    expect(shown).toBe(true);
    const wire = socket.emit.mock.calls
      .filter((c: any[]) => c[0] === 'ansi-output')
      .map((c: any[]) => String(c[1] ?? ''))
      .join('');
    expect(wire).toContain('GRAPHICS LOGON');
    expect(wire).not.toContain('PLAIN LOGON');
  });

  test('falls back to the plain file when the board has no variant of that type', () => {
    board = makeBoard({ 'ScreenTypes.info': SCREEN_TYPES, 'Node1/Logon.txt': 'PLAIN\r\n' });
    config.set('dataDir', board);

    expect(servedName({ screenType: 'Amiga Ansi' })).toBe('Logon.txt');
  });

  test('an IBM Ansi caller gets .IBM and never the Amiga .GR', () => {
    board = makeBoard({
      'ScreenTypes.info': SCREEN_TYPES,
      'Node1/Logon.txt': 'PLAIN\r\n',
      'Node1/Logon.txt.GR': 'GR\r\n',
      'Node1/Logon.IBM': 'IBM\r\n',
    });
    config.set('dataDir', board);

    expect(servedName({ screenType: 'IBM Ansi' })).toBe('Logon.IBM');
  });

  test('the level walk still wins: Logon100.txt beats the unnumbered Logon.txt.GR', () => {
    // express.e:6273-6290 walks every level (type, then .TXT) before the
    // unnumbered name is tried at 6292-6306.
    board = makeBoard({
      'ScreenTypes.info': SCREEN_TYPES,
      'Node1/Logon100.txt': 'LEVEL 100\r\n',
      'Node1/Logon.txt.GR': 'GR\r\n',
    });
    config.set('dataDir', board);

    expect(servedName({ screenType: 'Amiga Ansi' })).toBe('Logon100.txt');
  });

  test('at one level the type comes before .TXT: Logon100.txt.GR beats Logon100.txt', () => {
    board = makeBoard({
      'ScreenTypes.info': SCREEN_TYPES,
      'Node1/Logon100.txt': 'LEVEL 100\r\n',
      'Node1/Logon100.txt.GR': 'LEVEL 100 GR\r\n',
    });
    config.set('dataDir', board);

    expect(servedName({ screenType: 'Amiga Ansi' })).toBe('Logon100.txt.GR');
  });

  test('a board with no ScreenTypes.info has no types to serve', () => {
    board = makeBoard({ 'Node1/Logon.txt': 'PLAIN\r\n', 'Node1/Logon.txt.GR': 'GR\r\n' });
    config.set('dataDir', board);

    expect(servedName({ screenType: 'Amiga Ansi' })).toBe('Logon.txt');
  });
});

describe("the user's screen-type index", () => {
  const types = [
    { title: 'Amiga Ansi', extension: '.TXT.GR' },
    { title: 'IBM Ansi', extension: '.IBM' },
  ];

  test('a stored title is looked up on the board list, case-insensitively', () => {
    expect(screenTypeIndex('ibm ansi', types)).toBe(1);
  });

  test('a user.data index is the index, including the 0.0 a sync wrote', () => {
    expect(screenTypeIndex('1', types)).toBe(1);
    expect(screenTypeIndex('0.0', types)).toBe(0);
    expect(screenTypeIndex(1, types)).toBe(1);
  });

  test('a user who never chose has the zeroed Amiga field: index 0', () => {
    expect(screenTypeIndex('ANSI', types)).toBe(0);
    expect(screenTypeIndex(undefined, types)).toBe(0);
  });

  test('an index past the board list selects no type (express.e:6264)', () => {
    const board = makeBoard({ 'ScreenTypes.info': SCREEN_TYPES });
    try {
      expect(userScreenTypeExtension({ screenType: '5' }, board)).toBeNull();
      expect(userScreenTypeExtension({ screenType: '1' }, board)).toBe('.IBM');
      expect(userScreenTypeExtension(null, board)).toBeNull();
    } finally {
      fs.rmSync(board, { recursive: true, force: true });
    }
  });
});
