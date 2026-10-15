/**
 * `?` could not find the board's own help screen.
 *
 * express.e:25083 builds the path from the BOARD: StringF(tempstr,
 * '\sBBSHelp', cmds.bbsLoc). This passed a bare 'BBSHelp', which resolves
 * against whatever directory the process was started in - not where
 * BBSHelp.txt lives - so the command answered "Sorry Help is unavailable at
 * this time" however well the board was set up.
 *
 * The sibling in utility-commands.handler.ts already resolves its HELP
 * directory properly; this was the second copy of one idea, and only one of
 * them had been fixed.
 *
 * Driven through the REAL handleHelpCommand (system-commands.handler, loaded
 * unmocked as tests/system-commands.test.ts does) on a temp board named by
 * BBS_DATA_DIR - boardRoot()'s own input: the injected findSecurityScreen
 * records what it is asked for, and the screen it answers is displayed.
 * (The injected signature admitting texttvMode is tsc's to enforce.)
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleHelpCommand, setSystemCommandsDependencies } from '../../src/handlers/commands/system-commands.handler';
import { setBoardRoot } from '../helpers/board-root';

describe('the BBSHelp screen', () => {
  let board: string;
  let restoreBoard: () => void;
  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'help-board-'));
    restoreBoard = setBoardRoot(board);
  });
  afterEach(() => {
    restoreBoard();
    fs.rmSync(board, { recursive: true, force: true });
  });

  function askForHelp(session: any) {
    const findSecurityScreen = jest.fn((base: string) => `${base}.TXT`);
    const displayScreen = jest.fn(async () => true);
    setSystemCommandsDependencies({ displayScreen, findSecurityScreen } as any);
    const socket: any = { emit: jest.fn() };
    handleHelpCommand(socket, { tempData: {}, user: { secLevel: 10 }, ...session }, '');
    return { findSecurityScreen, displayScreen, socket };
  }

  it('is looked for on the board, not beside the process', () => {
    const { findSecurityScreen, displayScreen } = askForHelp({});
    expect(findSecurityScreen.mock.calls[0][0]).toBe(path.join(path.resolve(board), 'BBSHelp'));
    expect(displayScreen).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), path.join(path.resolve(board), 'BBSHelp') + '.TXT',
    );
  });

  it('is asked for with the teletext flag, like its sibling', () => {
    const teletext = askForHelp({ texttvMode: true }).findSecurityScreen.mock.calls[0] as unknown[];
    const ansi = askForHelp({}).findSecurityScreen.mock.calls[0] as unknown[];
    expect(teletext[6]).toBe(true);
    expect(ansi[6]).toBe(false);
  });
});
