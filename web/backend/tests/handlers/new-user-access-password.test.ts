/**
 * The new-user password, asked for and failed, through the handler.
 *
 * P2-13's second half. `new-user-policy.service.ts` decides WHAT the password
 * is; this is about the handler using it and behaving like express when a
 * stranger gets it wrong three times:
 *
 *   express.e:30029-30035  every failure is logged, and the node's SHOWPWFAIL
 *                          decides whether the log holds what was typed
 *   express.e:30038-30041  the third failure says "Excessive Password
 *                          Failure", runs the NUPFAIL system command, and
 *                          hangs up
 *
 * The port logged nothing and ran nothing - a board could not tell that anyone
 * had ever tried, and NUPFAIL, which is how a sysop hears about it, was never
 * called.
 */
process.env.SKIP_DB_INIT = '1';

const logged: Array<{ nodeId: number; text: string }> = [];
const sysCommands: string[] = [];
let showPwFail = false;

jest.mock('../../src/services/CallersLogManager', () => ({
  callersLogManager: {
    logActivity: (nodeId: number, text: string) => { logged.push({ nodeId, text }); },
  },
}));
jest.mock('../../src/utils/node-tooltypes.util', () => ({
  nodeFlag: (_nodeId: number, key: string) => (key === 'SHOWPWFAIL' ? showPwFail : false),
  nodeTooltype: () => undefined,
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map(), syscmd: new Map() },
  runSysCommand: async (_socket: unknown, _session: unknown, cmd: string) => {
    sysCommands.push(cmd);
    return 0;
  },
}));
// KEEP THE REST OF THE MODULE. Replacing it wholesale takes `loadBBSConfig`
// with it, and DoorDropFileManager calls that at import time - the suite then
// fails to run at all, with a stack that says nothing about passwords.
jest.mock('../../src/services/bbs-config-file.service', () => ({
  ...jest.requireActual('../../src/services/bbs-config-file.service'),
  getBoardConfig: jest.fn(() => ({ new_user_password: 'LETMEIN' })),
}));

import { handleAccessPasswordInput } from '../../src/handlers/user/new-user.handler';

function makeSocket() {
  const wire: string[] = [];
  return {
    wire,
    id: 'new-user-pw',
    disconnected: false,
    emit(event: string, payload?: unknown) {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    disconnect() { this.disconnected = true; },
    text() { return this.wire.join(''); },
  };
}

const makeSession = () => ({
  nodeId: 3,
  state: 'registering',
  newUserData: { username: 'STRANGER', accessPasswordTries: 0 },
  tempData: {},
}) as any;

beforeEach(() => {
  logged.length = 0;
  sysCommands.length = 0;
  showPwFail = false;
});

describe('a stranger who does not know the password', () => {
  it('is told, and the attempt is logged masked', async () => {
    const socket = makeSocket();
    const session = makeSession();

    await handleAccessPasswordInput(socket as never, session, 'GUESS');

    // express.e:30036 aePuts('Invalid PassWord\b\n'), plain.
    expect(socket.text()).toContain('\r\nInvalid PassWord\r\n');
    expect(socket.text()).not.toContain('\x1b[31m');
    expect(logged).toEqual([{ nodeId: 3, text: '\tPassword Failure (xxxx)' }]);
    expect(sysCommands).toEqual([]);
  });

  it('has what he typed logged when the node carries SHOWPWFAIL', async () => {
    showPwFail = true;
    const socket = makeSocket();

    await handleAccessPasswordInput(socket as never, makeSession(), 'HUNTER2');

    expect(logged[0].text).toBe('\tPassword Failure (HUNTER2)');
  });

  it('runs NUPFAIL and is hung up on the third try - express.e:30038', async () => {
    const socket = makeSocket();
    const session = makeSession();

    await handleAccessPasswordInput(socket as never, session, 'ONE');
    await handleAccessPasswordInput(socket as never, session, 'TWO');
    await handleAccessPasswordInput(socket as never, session, 'THREE');

    expect(socket.text()).toContain('Excessive Password Failure');
    expect(sysCommands).toEqual(['NUPFAIL']);
    expect(logged).toHaveLength(3);
    // express.e:30038-30041 - that line and NUPFAIL; "Too Many Errors,
    // Goodbye!" is the name prompt's (29634), not this one's.
    expect(socket.text()).not.toContain('Too Many Errors');
  });
});

describe('a stranger who does know it', () => {
  it('is let through, and the board file is where the password came from', async () => {
    const socket = makeSocket();
    const session = makeSession();

    await handleAccessPasswordInput(socket as never, session, 'LETMEIN');

    // express.e:30046 aePuts('Correct\b\n'), plain, after lineInput's CRLF.
    expect(socket.text().startsWith('\r\nCorrect\r\n')).toBe(true);
    expect(logged).toEqual([]);
    expect(sysCommands).toEqual([]);
  });
});
