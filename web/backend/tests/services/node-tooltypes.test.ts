/**
 * The per-node switches on Node<n>.info, which nothing in this port read.
 *
 * express reads them where the behaviour lives, with
 * `checkToolTypeExists(TOOLTYPE_NODE, node, KEY)`. The names come from the
 * setup tool, which is what writes them (axSetupTool/frmNodeEdit.e:841-935) -
 * and the parity audit had three of the four WRONG, having read the tool's
 * internal control constants instead:
 *
 *   NODE_SHOW_PWFAILS  is really  SHOWPWFAIL        (express.e:30030)
 *   NODE_USERNUM_LOGON is really  USERNUMBER_LOGIN  (express.e:29598)
 *   NODE_LOG_IP        is really  LOG_HOST          (express.e:16048)
 *   NODE_NO_TIMEOUT    is really  NO_TIMEOUT        (express.e:2185)
 *
 * Writing the audit's names would have produced tooltypes AmiExpress never
 * reads, which is the same fault that once cost this board six conference
 * settings saved under one key and read from another.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function boardWithNodeIcon(tooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-icon-'));
  fs.writeFileSync(path.join(root, 'Node1.info'), tooltypes.join('\n'), 'utf8');
  return root;
}

function freshUtil(root: string) {
  jest.resetModules();
  process.env.BBS_DATA_DIR = root;
  // config captures dataDir when it loads, so the module must be re-required
  // after the env is set.
  const util = require('../../src/utils/node-tooltypes.util');
  util.clearNodeTooltypeCache();
  return util;
}

describe('a node switch', () => {
  let root: string;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    delete process.env.BBS_DATA_DIR;
  });

  it('is on when the tooltype is on the icon', () => {
    root = boardWithNodeIcon(['SHOWPWFAIL', 'LOG_HOST']);

    const { nodeFlag } = freshUtil(root);

    expect(nodeFlag(1, 'SHOWPWFAIL')).toBe(true);
    expect(nodeFlag(1, 'LOG_HOST')).toBe(true);
  });

  it('is off when it is not', () => {
    root = boardWithNodeIcon(['SHOWPWFAIL']);

    const { nodeFlag } = freshUtil(root);

    expect(nodeFlag(1, 'USERNUMBER_LOGIN')).toBe(false);
  });

  it('is off for a node with no icon at all', () => {
    root = boardWithNodeIcon(['SHOWPWFAIL']);

    const { nodeFlag } = freshUtil(root);

    expect(nodeFlag(9, 'SHOWPWFAIL')).toBe(false);
  });

  it('reads an explicit =0 as off, as conference flags are read', () => {
    root = boardWithNodeIcon(['SHOWPWFAIL=0']);

    const { nodeFlag } = freshUtil(root);

    expect(nodeFlag(1, 'SHOWPWFAIL')).toBe(false);
  });

  it('does not stat the icon again for every keystroke', () => {
    // These are read on the input path; the cache is what keeps that cheap.
    root = boardWithNodeIcon(['SHOWPWFAIL']);
    const { nodeFlag } = freshUtil(root);
    expect(nodeFlag(1, 'SHOWPWFAIL')).toBe(true);

    fs.rmSync(path.join(root, 'Node1.info'));

    expect(nodeFlag(1, 'SHOWPWFAIL')).toBe(true);
  });

  it('picks up an edit once the sysop clears the cache', () => {
    root = boardWithNodeIcon(['SHOWPWFAIL']);
    const util = freshUtil(root);
    expect(util.nodeFlag(1, 'SHOWPWFAIL')).toBe(true);

    fs.writeFileSync(path.join(root, 'Node1.info'), 'LOG_HOST\n', 'utf8');
    util.clearNodeTooltypeCache();

    expect(util.nodeFlag(1, 'SHOWPWFAIL')).toBe(false);
    expect(util.nodeFlag(1, 'LOG_HOST')).toBe(true);
  });
});

/**
 * USERNUMBER_LOGIN at the name prompt (express.e:29598).
 *
 * With the tooltype set, a numeric answer is a SLOT and is loaded directly;
 * without it the same digits are looked up as a name. This port had no reader,
 * so a caller who typed his number was told the name is not used on this BBS
 * and offered a new account.
 */
describe('logging on by user number', () => {
  function loginModule(flagOn: boolean) {
    jest.resetModules();
    // command.handler writes under the board root as it loads, and the
    // live-data guard refuses that unless it points at a temp board.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'login-board-'));
    process.env.BBS_ROOT = root;
    process.env.BBS_DATA_DIR = root;
    jest.doMock('../../src/utils/node-tooltypes.util', () => ({
      nodeFlag: (_n: number, key: string) => flagOn && key === 'USERNUMBER_LOGIN',
      clearNodeTooltypeCache: jest.fn(),
      loginNamePrompt: () => 'Enter your Name:',
      loginPasswordPrompt: () => 'Password: ',
    }));

    // The handler reaches the database through the DI module, so that is the
    // seam to stub - mocking `src/database` itself means reproducing a
    // dependency graph this test does not care about.
    const bySlot = jest.fn(async () => null as any);
    const byName = jest.fn(async () => null as any);
    jest.doMock('../../src/handlers/command-handler/dependency-injection', () => ({
      ...jest.requireActual('../../src/handlers/command-handler/dependency-injection'),
      getDatabase: () => ({ getUserBySlotNumber: bySlot, getUserByUsername: byName }),
    }));

    const handler = require('../../src/handlers/command.handler');
    return { handler, bySlot, byName };
  }

  function loginSocket(): any {
    return {
      id: 's',
      emit: jest.fn(),
      on: jest.fn(function (this: unknown) { return this; }),
      once: jest.fn(function (this: unknown) { return this; }),
      off: jest.fn(function (this: unknown) { return this; }),
      removeListener: jest.fn(function (this: unknown) { return this; }),
      join: jest.fn(function (this: unknown) { return this; }),
    };
  }

  function loginSession(): any {
    return { state: 'logon', tempData: { loginPhase: 'username' }, nodeId: 1 };
  }

  it('is looked up as a SLOT when the node allows it', async () => {
    const { handler, bySlot } = loginModule(true);
    bySlot.mockResolvedValue({ username: 'spot', slotNumber: 7 } as any);
    const session = loginSession();

    await handler.handleCommand(loginSocket(), session, '7\r');

    expect(bySlot).toHaveBeenCalledWith(7);
    expect(session.tempData.loginUsername).toBe('spot');
    expect(session.tempData.loginPhase).toBe('password');
  });

  it('is looked up as a NAME when the node does not', async () => {
    const { handler, bySlot, byName } = loginModule(false);
    const session = loginSession();

    await handler.handleCommand(loginSocket(), session, '7\r');

    expect(bySlot).not.toHaveBeenCalled();
    expect(byName).toHaveBeenCalledWith('7');
  });

  it('masks the password prompt it moves on to', async () => {
    // Setting the phase without the mask would echo the password back.
    const { handler, bySlot } = loginModule(true);
    bySlot.mockResolvedValue({ username: 'spot', slotNumber: 7 } as any);
    const session = loginSession();
    const socket = loginSocket();

    await handler.handleCommand(socket, session, '7\r');

    expect(session.maskInput).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith('mask-input', true);
  });

  it('falls back to the name path when no such slot exists', async () => {
    const { handler, bySlot, byName } = loginModule(true);
    const session = loginSession();

    await handler.handleCommand(loginSocket(), session, '999\r');

    expect(bySlot).toHaveBeenCalledWith(999);
    expect(byName).toHaveBeenCalledWith('999');
  });
});

/**
 * The logon prompts come from the node's icon (express.e:31770-31780):
 * NAME_PROMPT2 as written, "Enter your <NAME_PROMPT>:", or "Enter your
 * Name:"; PASSWORD_PROMPT plus a space, or "Password: ". The port asked
 * "Username:" whatever the icon said.
 */
describe('the logon prompts', () => {
  let root: string;
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    delete process.env.BBS_DATA_DIR;
  });
  function withIcon(lines: string[]) {
    // The describe above doMocks this util; a doMock outlives resetModules.
    jest.dontMock('../../src/utils/node-tooltypes.util');
    root = boardWithNodeIcon(lines);
    return freshUtil(root);
  }

  it('asks "Enter your Name:" and "Password: " by default', () => {
    const util = withIcon(['SHOWPWFAIL']);
    expect(util.loginNamePrompt(1)).toBe('Enter your Name:');
    expect(util.loginPasswordPrompt(1)).toBe('Password: ');
  });

  it('names what NAME_PROMPT says, and takes NAME_PROMPT2 whole', () => {
    expect(withIcon(['NAME_PROMPT=Handle']).loginNamePrompt(1)).toBe('Enter your Handle:');
    fs.rmSync(root, { recursive: true, force: true });
    expect(withIcon(['NAME_PROMPT2=Who goes there?', 'NAME_PROMPT=Handle']).loginNamePrompt(1)).toBe('Who goes there?');
  });

  it('asks PASSWORD_PROMPT with a space after it', () => {
    expect(withIcon(['PASSWORD_PROMPT=Secret:']).loginPasswordPrompt(1)).toBe('Secret: ');
  });
});
