/**
 * A conference bulletin that pulls in a screen taller than the caller's
 * terminal joins the conference ONCE.
 *
 * h7's conference bulletin includes the REQUESTS door's bulletin with
 * `~SS_BBS:Bulletins/bull9.txt`. At 26 lines it is taller than a 24-row
 * terminal, so the include paginates - and its prompt went up while the login
 * flow still sat at AUTO_REJOIN, because the join only left that state AFTER
 * the bulletin and its commands had finished. The caller's key dismissed the
 * pagination, the dismissal advanced the display flow, the flow found
 * AUTO_REJOIN and ran the join a second time: the bulletin twice, and
 * express.e:5068's `processSysCommand('S')` - this board's zOOsTAtS door - twice.
 *
 * express.e:28573-28580 consumes the state by running joinConf to completion;
 * every pause inside it happens inside that one call. This port yields at each
 * pause, so the join must leave AUTO_REJOIN before anything in it can wait for
 * a key.
 *
 * Real displayScreen, real joinConference, real advanceDisplayFlow and the
 * keypress entry point handleCommand, on a temp board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/services/lost-carrier-files.service', () => ({
  scanHoldDesc: jest.fn(async () => undefined),
}));
// express.e:5068's processSysCommand('S'). This board's is the zOOsTAtS door;
// a temp board has no SysCmd, so it reaches the internal S - counted here.
const userStats = jest.fn(async () => undefined);
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  ...jest.requireActual('../../src/handlers/commands/user-commands.handler'),
  handleUserStatsCommand: (...args: unknown[]) => (userStats as jest.Mock)(...args),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 1, lowestNotDel: 0 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import * as commandHandler from '../../src/handlers/command.handler';
import {
  setConferences, setMessageBases, setHelpers, setConstants,
} from '../../src/handlers/operations/conference.handler';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { config } from '../../src/config';

const TALL_LINES = 30;      // taller than the caller's 24 rows
const BULLETIN = 'THE CONFERENCE BULLETIN';

let root: string;
const originalDataDir = config.get('dataDir');

beforeAll(() => {
  setConferences([{ id: 1, name: 'Amiga Demoscene!' }] as any);
  setMessageBases([{ id: 1, conferenceId: 1, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tall-include-join-'));
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  // The leading `~` opens express.e's per-file MCI gate (express.e:6800-6806).
  fs.writeFileSync(
    path.join(root, 'Conf1', 'BULL.TXT'),
    `~ ${BULLETIN}\r\n~SS_BBS:Bulletins/tall.txt\r\n`,
    'latin1',
  );
  const tall = Array.from({ length: TALL_LINES }, (_, i) => `request ${i + 1}`).join('\r\n');
  fs.writeFileSync(path.join(root, 'Bulletins', 'tall.txt'), `${tall}\r\n`, 'latin1');
});

afterEach(() => {
  jest.restoreAllMocks();
  config.set('dataDir', originalDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function aCallerBeingRejoined() {
  const emits: string[] = [];
  const socket = {
    id: `tall-include-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') emits.push(data);
      return true;
    },
    on: () => undefined,
    off: () => undefined,
    removeListener: () => undefined,
  } as any;
  const session = {
    nodeId: 1,
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.AUTO_REJOIN,
    currentConf: 1,
    relConfNum: 1,
    ansiEnabled: true,
    screenWidth: 80,
    screenHeight: 24,
    menuPause: true,
    user: {
      id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X',
      securityFlags: '', confAccess: 'X', confRJoin: 1, msgBaseRJoin: 1,
    },
    tempData: {},
  } as any;
  const wire = () => { flushAllBuffers(); return emits.join(''); };
  return { socket, session, wire };
}

/** Let the bulletin's scheduled `~SS_` run and the join reach its pause. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
};

describe('a conference bulletin whose include is taller than the screen', () => {
  it('rejoins once and runs SysCmd S once, however many keys the caller presses', async () => {
    userStats.mockClear();
    const { socket, session, wire } = aCallerBeingRejoined();

    // Not awaited: the join waits on the bulletin's `~SS_`, and the include
    // waits on the caller's key - exactly as on the board.
    const flow = commandHandler.advanceDisplayFlow(socket, session);
    await settle();

    // The include paginated: its prompt is up and the tail is not yet drawn.
    expect(session.paginatedScreen).toBeTruthy();
    expect(session.subState).not.toBe(LoggedOnSubState.AUTO_REJOIN);

    // Every key the caller needs to reach the menu.
    for (let i = 0; i < 12 && (session.paginatedScreen || session.screenSegments); i++) {
      // Not awaited either: on the broken path the key re-enters the join,
      // and that join waits for the next key.
      void commandHandler.handleCommand(socket, session, '\r');
      await settle();
    }

    // A second join would hold the first one's flow open on its own pause.
    await Promise.race([flow, settle()]);
    expect({ bulletins: wire().split(BULLETIN).length - 1, sysCmdS: userStats.mock.calls.length })
      .toEqual({ bulletins: 1, sysCmdS: 1 });
    expect(wire().split('Auto-ReJoined').length - 1).toBe(1);
  });
});
