/**
 * A command that throws puts the caller back at the menu prompt, as a command
 * that finishes does (express.e:28641-28648: after processCommand, menuPause
 * := TRUE and subState := DISPLAY_MENU, however the command ended). The error
 * stays in the server log; nothing is invented on the caller's screen.
 *
 * Before: a typed command that threw printed "Error processing command." and
 * "Press any key to continue..." (no such text in express.e) and landed on the
 * conference bulletin; a throw anywhere else reached the transports'
 * `commandFailed`, which only logged it - a logged-on caller was left with no
 * prompt at all.
 *
 * Driven through the real handlers: `handleCommand` in PROCESS_COMMAND with a
 * command whose implementation throws, and the input pipeline every transport
 * runs (`dispatchInOrder` + `commandFailed`). The menu draw is the sentinel.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** A command whose implementation throws: D's download handler. */
jest.mock('../../src/handlers/file/download.handler', () => ({
  DownloadHandler: {
    handleDownloadCommand: async () => { throw new Error('download handler blew up'); },
  },
}));

/** The menu draw, counted - the "back at the menu prompt" sentinel. */
const displayMainMenu = jest.fn(async (_socket: unknown, session: any) => {
  session.subState = 'read_command';
});
jest.mock('../../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/menu'),
  displayMainMenu: (...args: [unknown, any]) => displayMainMenu(...args),
}));

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { commandFailed, dispatchInOrder } from '../../src/server/terminal-input';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

let root: string;
let previousDataDir: string;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  // An empty board: no BBSCMD door stands in front of the internal D.
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrown-command-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  displayMainMenu.mockClear();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
function aCaller(subState: string) {
  const bytes: string[] = [];
  const socket = {
    id: `thrown-command-${++n}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
      return true;
    },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState,
    connectionType: 'telnet',
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    inputBuffer: '',
    commandHistory: [],
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: 'T'.repeat(64), expert: 'X' },
    tempData: {},
  };
  const wire = () => { flushOutput(socket); return bytes.join(''); };
  return { socket, session, wire };
}

describe('a command that throws', () => {
  it('a typed command that throws ends at the menu prompt, with nothing invented on screen', async () => {
    const { socket, session, wire } = aCaller(LoggedOnSubState.PROCESS_COMMAND);
    session.commandText = 'D';

    await handleCommand(socket, session, '\r');

    expect(displayMainMenu).toHaveBeenCalledTimes(1);
    expect(session.menuPause).toBe(true);
    expect(session.subState).not.toBe(LoggedOnSubState.DISPLAY_CONF_BULL);
    expect(wire()).not.toContain('Error processing command');
    expect(wire()).not.toContain('Press any key');
    // The server log still has it.
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).toContain('download handler blew up');
  });

  it("a throw from a command's own input state, through the transports' pipeline, ends at the menu prompt", async () => {
    const { socket, session, wire } = aCaller(LoggedOnSubState.ZIPPY_SEARCH_INPUT);

    dispatchInOrder(session, ['x'], async () => { throw new Error('input state blew up'); }, commandFailed(socket, session));
    await session.keyChain;
    await new Promise((resolve) => setImmediate(resolve));

    expect(displayMainMenu).toHaveBeenCalledTimes(1);
    expect(session.subState).not.toBe(LoggedOnSubState.ZIPPY_SEARCH_INPUT);
    expect(wire()).not.toMatch(/error/i);
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).toContain('input state blew up');
  });

  it('before logon there is no menu: the throw is only logged', async () => {
    const { socket, session } = aCaller(LoggedOnSubState.READ_COMMAND);
    session.state = BBSState.LOGON;

    dispatchInOrder(session, ['x'], async () => { throw new Error('login blew up'); }, commandFailed(socket, session));
    await session.keyChain;
    await new Promise((resolve) => setImmediate(resolve));

    expect(displayMainMenu).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });
});
