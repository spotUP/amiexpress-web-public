/**
 * The ^ help command resolves native .TTI in teletext mode.
 *
 * Two stacked bugs, both answered silence:
 * 1. handleHelpFilesCommand never passed the teletext slot, so the .TTI
 *    twin was invisible.
 * 2. The help dir was CWD-relative ('help/<topic>'), which resolves
 *    nowhere in production - EVERY ^ topic was broken, not just .TTI.
 *    express.e:25089 builds board-root help/ + params; dataDir is that.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/utils/acs.util', () => ({
  checkSecurity: jest.fn(() => true),
}));

import {
  handleHelpFilesCommand,
  setUtilityCommandsDependencies,
} from '../../src/handlers/commands/utility-commands.handler';
import { findSecurityScreen } from '../../src/utils/screen-security.util';

const tSession = () => ({
  user: { username: 'T', secLevel: 255 },
  texttvMode: true,
  ripMode: false,
  subState: 'X',
});
const aSession = () => ({
  user: { username: 'A', secLevel: 255 },
  texttvMode: false,
  petsciiMode: false,
  ripMode: false,
  subState: 'X',
});

describe('^ passes the teletext slot to findSecurityScreen', () => {
  test('a T session searches .TTI, an ANSI session does not', () => {
    const seen: any[][] = [];
    const fakeFind = (...args: any[]) => {
      seen.push(args);
      return null;
    };
    setUtilityCommandsDependencies({
      handleGoodbyeCommand: (() => {}) as any,
      messages: [],
      confScreenDir: '',
      findSecurityScreen: fakeFind as any,
      displayScreen: (() => true) as any,
      searchFileDescriptions: (async () => []) as any,
    });
    const socket: any = { emit: jest.fn(), id: 'help-ttx' };
    handleHelpFilesCommand(socket, tSession() as any, 'P8FF');
    handleHelpFilesCommand(socket, aSession() as any, 'P8FF');
    // Progressive search retries with stripped suffixes; the full term is first.
    // Pinned uppercase: the volume carries HELP/, and ext4 is case-sensitive
    // (AmigaDOS is not - live log once read "Not found: .../help/TESTPAGE").
    const full = seen.filter((a) => String(a[0]).endsWith(path.join('HELP', 'P8FF')));
    expect(full.length).toBe(2);
    expect(full[0][6]).toBe(true);
    expect(full[1][6]).not.toBe(true);
  });
});

describe('a .TTI help file resolves for teletext', () => {
  test('.TTI wins for T, .TXT wins without the flag', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-tti-'));
    try {
      const base = path.join(dir, 'P8FF-3F7F');
      fs.writeFileSync(`${base}.TTI`, 'DE,x\nPN,8FF00\nSC,0000\nCT,8,C\nPS,8000\nOL,0,hi\n');
      fs.writeFileSync(`${base}.TXT`, 'plain help\n');
      expect(findSecurityScreen(base, 255, null, false, false, false, true)).toBe(`${base}.TTI`);
      expect(findSecurityScreen(base, 255, null, false, false, false, false)).toBe(`${base}.TXT`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('^ finds the board help dir, not the process CWD', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const realFind = require('../../src/utils/screen-security.util').findSecurityScreen;
  let oldDataDir = '';
  let board = '';

  afterEach(() => {
    config.set('dataDir', oldDataDir);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('TTX TESTPAGE displays the .TTI on a scratch board', () => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'help-board-'));
    fs.mkdirSync(path.join(board, 'HELP'), { recursive: true });
    fs.writeFileSync(
      path.join(board, 'HELP', 'TESTPAGE.TTI'),
      'DE,x\nPN,8FF00\nSC,0000\nCT,8,C\nPS,8000\nOL,0,hi\n',
    );
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    const shown: string[] = [];
    setUtilityCommandsDependencies({
      handleGoodbyeCommand: (() => {}) as any,
      messages: [],
      confScreenDir: '',
      findSecurityScreen: realFind,
      displayScreen: ((_s: any, _ss: any, name: string) => {
        shown.push(name);
        return true;
      }) as any,
      searchFileDescriptions: (async () => []) as any,
    });
    const socket: any = { emit: jest.fn(), id: 'help-board' };
    handleHelpFilesCommand(socket, tSession() as any, 'TESTPAGE');
    expect(shown).toHaveLength(1);
    expect(shown[0].toUpperCase().endsWith('.TTI')).toBe(true);
  });
});
