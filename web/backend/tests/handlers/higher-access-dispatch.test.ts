/**
 * "A command I lack access to should tell me so - once."
 *
 * WHAT WENT WRONG, in order.
 *
 * 1. Every internal command handler in this port that gates on checkSecurity
 *    printed a string it had made up - "Access denied." in OLM and Q,
 *    "Permission denied." in seven more. None of those strings exist in
 *    express.e.
 * 2. So they were removed from OLM and Q for strict parity (95795cbdd), which
 *    is correct as far as the HANDLER goes: express.e:25416 and 25513-25514
 *    are a bare `RETURN RESULT_NOT_ALLOWED` and internalCommandOLM emits not
 *    one byte. The sysop tried it and a refused OLM said nothing at all.
 * 3. He is right that the silence is wrong, because the parity was only
 *    half-copied. express.e is not silent END TO END: its dispatcher answers
 *    for the handler.
 *
 *      express.e:28400  IF ((res=RESULT_NOT_ALLOWED) AND (privcmd=FALSE))
 *                         THEN higherAccess()
 *      express.e:3037   PROC higherAccess()
 *      express.e:3038     aePuts('\b\nCommand requires higher access.\b\n')
 *
 *    One newline, the sentence, one newline. No colour. `\b\n` is this
 *    source's CR+LF idiom, so `\r\nCommand requires higher access.\r\n`.
 *
 * This port had no such path for internal commands - the switch in
 * `command.handler.ts` returned `void`, so RESULT_NOT_ALLOWED had nowhere to
 * travel and each handler shouted for itself. It now returns
 * `InternalCommandResult`, and `processBBSCommand` is express.e:28400.
 *
 * WHAT IS PINNED HERE
 *
 *   - the exact bytes, from the product's own top-level entry point
 *     (`handleCommand` with subState PROCESS_COMMAND, the state a typed menu
 *     command lands in), for every internal command that was converted;
 *   - that it is said ONCE. The SYSCMD/BBSCMD tier already emitted it in
 *     `command-execution.handler.ts` (express.e:4705) AND `handleCommand`
 *     re-emitted it on the way out, so a refused door said it twice. That
 *     second emission is gone: express.e's main loop (28646) discards
 *     processCommand's result and prints nothing;
 *   - that a privcmd invocation stays SILENT. This is the one way this change
 *     could do harm. A refusal that speaks when the caller did not type the
 *     command tells him a command exists that he cannot see - so a ~CC_
 *     screen command and an explicit privcmd call must both say nothing,
 *     exactly as express.e:28400's `AND (privcmd=FALSE)` requires.
 *
 * RED PROOFS (both run, both restored)
 *
 *   a) Comment out the `higherAccess(socket)` call in processBBSCommand's
 *      tail: every "tells me so" case below fails with
 *      `Expected: "\r\nCommand requires higher access.\r\n" Received: ""` -
 *      the refused caller falls silent again, which is exactly the bug the
 *      sysop reported.
 *   b) Restore the emission in `handleCommand`'s `result === 'NOT_ALLOWED'`
 *      branch: "it says it once, not once per tier" fails with 2 received
 *      where 1 is expected, for BOTH the door tier and the internal tier.
 *
 * The users here carry `securityFlags` explicitly ('F' or 'T' at every
 * index), so checkSecurity answers from the user record and never reads the
 * board's `Access/` directory - see acs.util.ts:180-184.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: '',
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { handleCommand, processBBSCommand } from '../../src/handlers/command.handler';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { setOlmDependencies } from '../../src/handlers/transfer/olm.handler';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { RESULT_NOT_ALLOWED } from '../../src/constants/command-results';

/** express.e:3038, rendered. The whole point of the change. */
const HIGHER_ACCESS = '\r\nCommand requires higher access.\r\n';

let root: string;
const realConfigGet = config.get.bind(config);

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'higher-access-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : key === 'olmEnabled' ? true : realConfigGet(key)
  );
  commandCache.bbscmd.clear();
  commandCache.syscmd.clear();
  setOlmDependencies({
    db: null,
    sessions: new Map(),
    io: null,
    setEnvStat: () => { /* no STATS@ file from a test */ },
    config: { get: (k: string) => (k === 'olmEnabled' ? true : undefined) },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeSocket() {
  const emitted: string[] = [];
  return {
    id: `higher-access-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) {
      if (event === 'ansi-output') emitted.push(String(data ?? ''));
      return true;
    },
    on() { return this; },
    text() { return emitted.join(''); },
  };
}

/** Refused everywhere: 'F' at every ACS index the handlers below consult. */
const refusedUser = {
  id: 'u-refused',
  username: 'NEWBIE',
  secLevel: 10,
  securityFlags: 'F'.repeat(80),
};

/** Granted everywhere. */
const grantedUser = {
  id: 'u-granted',
  username: 'SPOT',
  secLevel: 255,
  securityFlags: 'T'.repeat(80),
};

function typedCommand(commandText: string, user: any = refusedUser): any {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.PROCESS_COMMAND,
    user,
    nodeId: 1,
    terminalType: 'ansi',
    screenWidth: 80,
    screenHeight: 25,
    currentConf: 1,
    tempData: {},
    commandHistory: [],
    historyIndex: 0,
    historyCycle: 0,
    commandText,
  };
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/**
 * Every internal command whose express.e original is a bare
 * `RETURN RESULT_NOT_ALLOWED`, with the line that proves it. Each one used to
 * print a string of this port's own invention instead; the third column is
 * what it used to say, so a regression that puts it back is named in the
 * failure rather than merely missing the new text.
 */
const CONVERTED: Array<[command: string, expressE: string, invented: string]> = [
  ['OLM', 'express.e:25416 internalCommandOLM',   'Access denied.'],
  ['Q',   'express.e:25513 internalCommandQ',     'Access denied.'],
  ['V',   'express.e:25676 internalCommandV',     'Permission denied.'],
  ['VS',  'express.e:25676 internalCommandV',     'Permission denied.'],
  ['Z',   'express.e:26130 internalCommandZ',     'Permission denied.'],
  ['A',   'express.e:24602 internalCommandA',     'Permission denied.'],
  ['<',   'express.e:24531 internalCommandLT',    'Permission denied.'],
  ['>',   'express.e:24550 internalCommandGT',    'Permission denied.'],
  ['DB',  'no express.e original - shaped after express.e:24854 internalCommandD', 'Permission denied.'],
];

describe('a command I lack access to tells me so', () => {
  it.each(CONVERTED)('%s (%s)', async (command, _where, invented) => {
    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand(command), '');

    expect(socket.text()).toBe(HIGHER_ACCESS);
    expect(socket.text()).not.toContain(invented);
  });

  it('sends the express.e bytes and nothing else - no colour, no separator, no press-key', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand('OLM'), '');

    // express.e:3038 aePuts('\b\nCommand requires higher access.\b\n')
    expect(socket.text()).toBe('\r\nCommand requires higher access.\r\n');
    expect(socket.text()).not.toMatch(/\x1b\[/);
    expect(socket.text()).not.toContain('Press any key');
  });

  it('leaves the caller at the menu, paused, as express.e:28647-28648 does', async () => {
    const socket = makeSocket();
    const session = typedCommand('OLM');
    await handleCommand(socket as any, session, '');

    expect(session.menuPause).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('says nothing of the sort to a caller who HAS the grant', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand('OLM', grantedUser), '');

    // Positive evidence that the command ran: a refusal is one specific
    // sentence now, so "no denial string" on its own would prove nothing.
    expect(socket.text()).toContain('OLM MESSAGE SYSTEM');
    expect(socket.text()).not.toContain('Command requires higher access');
  });
});

describe('it says it once, not once per tier', () => {
  it('an internal command refuses once', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand('OLM'), '');
    expect(occurrences(socket.text(), 'Command requires higher access.')).toBe(1);
  });

  it('a BBSCMD door whose ACCESS outranks the caller refuses once', async () => {
    // express.e:4702-4707 - the ACCESS tooltype gate inside runCommand. This
    // is the tier that already spoke; `handleCommand` used to speak again on
    // the way out, so the caller heard it twice.
    commandCache.bbscmd.set('SECRETDOOR', {
      name: 'SECRETDOOR',
      type: 'XIM',
      location: 'Doors/SecretDoor/SecretDoor',
      access: 255,
      toolTypes: { LOCATION: 'Doors:SecretDoor/SecretDoor', TYPE: 'XIM', ACCESS: '255' },
    } as any);

    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand('SECRETDOOR'), '');

    expect(socket.text()).toContain('Command requires higher access.');
    expect(occurrences(socket.text(), 'Command requires higher access.')).toBe(1);
  });

  it('a door refused by ACCESS never reaches the internal tier, so still only one tier speaks', async () => {
    // A name that IS an internal command and IS registered as a door above
    // its access level. express.e:28254 returns RESULT_NOT_ALLOWED without
    // consulting processInternalCommand, so exactly one tier answers.
    commandCache.bbscmd.set('V', {
      name: 'V',
      type: 'XIM',
      location: 'Doors/ViewDoor/ViewDoor',
      access: 255,
      toolTypes: { LOCATION: 'Doors:ViewDoor/ViewDoor', TYPE: 'XIM', ACCESS: '255' },
    } as any);

    const socket = makeSocket();
    await handleCommand(socket as any, typedCommand('V'), '');

    expect(occurrences(socket.text(), 'Command requires higher access.')).toBe(1);
  });
});

describe('a command I did not type stays silent', () => {
  /**
   * express.e:28400's `AND (privcmd=FALSE)`. This is the guard that keeps the
   * sweep from leaking the existence of commands an ordinary caller is not
   * meant to know about: a ~CC_ screen command, a door's RETURNCOMMAND or an
   * ACP/sysop-remote invocation refuses in silence, because a refusal the
   * caller did not ask for is an announcement.
   */
  it('an explicit privcmd invocation refuses without a word', async () => {
    const socket = makeSocket();
    const session = typedCommand('OLM');

    const res = await processBBSCommand(socket as any, session, 'OLM', '', true);

    expect(res).toBe(RESULT_NOT_ALLOWED);
    expect(socket.text()).toBe('');
  });

  it('a screen-triggered command (~CC_, ~XC_, ~XI) refuses without a word', async () => {
    const socket = makeSocket();
    const session = typedCommand('OLM');
    session.executingScreenCommand = true;

    const res = await processBBSCommand(socket as any, session, 'OLM', '');

    expect(res).toBe(RESULT_NOT_ALLOWED);
    expect(socket.text()).toBe('');
  });

  it('still reports the refusal to its caller, so the dispatch can act on it', async () => {
    // Silence towards the CALLER is not silence towards the code: the result
    // code still travels, which is what lets processCommand pause the menu
    // and what a future privileged caller would branch on.
    const socket = makeSocket();
    for (const command of ['OLM', 'Q', 'V', 'Z', 'A', '<', '>', 'DB']) {
      const res = await processBBSCommand(
        socket as any, typedCommand(command), command, '', true
      );
      expect([command, res]).toEqual([command, RESULT_NOT_ALLOWED]);
    }
    expect(socket.text()).toBe('');
  });
});

describe('the handlers themselves print nothing - express.e parity, byte for byte', () => {
  /**
   * The other half of 95795cbdd, kept. A handler that prints its own refusal
   * is the defect; if one of these ever emits again, the caller hears the
   * dispatcher's sentence AND the handler's, which is the "once per tier"
   * bug in a different coat.
   */
  it.each(CONVERTED)('%s emits not one byte on its own gate', async (command) => {
    const socket = makeSocket();
    const res = await processBBSCommand(
      socket as any, typedCommand(command), command, '', true
    );
    expect(res).toBe(RESULT_NOT_ALLOWED);
    expect(socket.text()).toBe('');
  });
});
