/**
 * A command that hands back to the menu is followed by the menu prompt, with
 * no key between.
 *
 * express.e's main loop goes straight round to DISPLAY_MENU after
 * processCommand (28641-28648). `T` sets DISPLAY_MENU and returns, and the
 * command dispatcher did not run the flow - the caller saw "It is ..." and a
 * silent line until he pressed a key nobody had asked for. Found by the
 * scripted telnet login (dev/scripts/bbs_telnet.py), 2026-09-27, on every
 * line ending a client can send.
 *
 * Driven through handleCommand in PROCESS_COMMAND, the state a submitted
 * command line is run from.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { flushOutput } from '../../src/utils/output.util';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';

function aCaller() {
  const out: string[] = [];
  const socket: any = {
    id: `cmd-prompt-${Math.random().toString(36).slice(2)}`,
    connected: true,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') out.push(data); },
    on: () => {},
  };
  const session: any = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND,
    currentConf: 1, relConfNum: 1, currentConfName: 'Main', timeRemaining: 3600, tempData: {}, commandHistory: [], historyIndex: 0,
    user: { id: 'u1', username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
  };
  return { socket, session, out };
}

describe('the T command', () => {
  /*
   * The real telnet path: the caller is at a prompt displayMainMenu drew
   * (which leaves skipNextDisplayFlowMenu set), types T and RETURN. The
   * unit case below started in PROCESS_COMMAND with the flag unset and
   * passed while the live board still swallowed the prompt.
   */
  it('is followed by the prompt when typed at a prompt the menu drew', async () => {
    const { socket, session, out } = aCaller();
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.skipNextDisplayFlowMenu = true;
    session.manualMenuTargetState = LoggedOnSubState.READ_COMMAND;

    await handleCommand(socket, session, 'T');
    await handleCommand(socket, session, '\r');
    await new Promise((r) => setTimeout(r, 30));   // the submit runs PROCESS_COMMAND on the next tick
    flushOutput(socket);

    const wire = out.join('');
    expect(wire).toContain('It is ');
    expect(wire.slice(wire.indexOf('It is '))).toMatch(/Menu \(/);
  });

  // The echo of the typed "T" sat in emitText's buffer while T wrote its
  // time with a direct emit, so the time landed above the caller's own
  // keystroke (live telnet walk, 2026-09-29).
  it('prints the time after the caller\'s echoed "T", not above it', async () => {
    const { socket, session, out } = aCaller();
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.skipNextDisplayFlowMenu = true;
    session.manualMenuTargetState = LoggedOnSubState.READ_COMMAND;

    await handleCommand(socket, session, 'T');
    await handleCommand(socket, session, '\r');
    await new Promise((r) => setTimeout(r, 30));
    flushOutput(socket);

    const wire = out.join('');
    const echo = wire.indexOf('T');
    expect(echo).toBeGreaterThanOrEqual(0);
    expect(echo).toBeLessThan(wire.indexOf('It is '));
  });

  it('is followed by the menu prompt without another key', async () => {
    const { socket, session, out } = aCaller();
    session.commandText = 'T';

    await handleCommand(socket, session, '');
    flushOutput(socket);

    const wire = out.join('');
    expect(wire).toContain('It is ');
    expect(wire.slice(wire.indexOf('It is '))).toMatch(/Menu \(/);
  });
});

describe('F and FR after the directory prompt', () => {
  // The answer to "Directories: ..." is handled in an input branch that never
  // went back round the menu loop, so the board held in silence; the port
  // papered over it with its own "Press any key to continue..." (the sysop's
  // FR paste, 2026-09-29), which express.e's displayFileList does not have.
  // The command ends like any other: the menu loop's pause, then the prompt.
  it('Enter at the directory prompt comes back to the menu prompt', async () => {
    const { socket, session, out } = aCaller();
    session.subState = LoggedOnSubState.FILE_LIST_DIR_INPUT;
    session.tempData = { fileListParams: { reverse: true, hasNonStop: false } };

    await handleCommand(socket, session, '\r');
    await new Promise((r) => setTimeout(r, 30));
    flushOutput(socket);

    const wire = out.join('');
    expect(wire).not.toContain('Press any key');
    expect(wire).toMatch(/Menu \(/);
  });
});

describe('N and FI end at the menu loop, not a "Press any key" of their own', () => {
  // The same invented ending F had: express.e's myNewFiles (27906-28023) and
  // the file record print no prompt; the menu loop's menuPause is the pause.
  // The prompt was added when a finished command sat in silence (2026-09-07),
  // which the dispatcher now answers for every command (2026-09-27, T above).
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { config } = require('../../src/config');
  let root: string;
  let previous: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'n-fi-prompt-'));
    fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), 'PROBE.LHA    P   12345  09-29-26  A probe file\r\n', 'latin1');
    previous = config.get('dataDir');
    config.set('dataDir', root);
  });
  afterEach(() => {
    config.set('dataDir', previous);
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function run(command: string, tempData: Record<string, unknown> = {}) {
    const { socket, session, out } = aCaller();
    session.commandText = command;
    session.tempData = tempData;
    await handleCommand(socket, session, '');
    await new Promise((r) => setTimeout(r, 30));
    flushOutput(socket);
    return out.join('');
  }

  it('N comes back to the menu prompt', async () => {
    // Wired as boot wires it (index.ts): the command's real body, not the
    // unwired fallback.
    const { setNavigationCommandsDependencies } = require('../../src/handlers/commands/navigation-commands.handler');
    const { displayNewFiles } = require('../../src/handlers/file/file.handler');
    setNavigationCommandsDependencies({
      conferences: [], messageBases: [], joinConference: async () => undefined,
      checkConfAccess: () => true, displayNewFiles,
    });
    const wire = await run('N');
    // N ran its directory loop (express.e:27914) - and printed no heading of its own.
    expect(wire).toContain('Scanning directory 1');
    expect(wire).not.toContain('Searching for files newer than');
    expect(wire).not.toContain('Press any key');
    expect(wire).toMatch(/Menu \(/);
  });

  it('FI <n> shows the record and comes back to the menu prompt', async () => {
    const wire = await run('FI 1', { fileListIndex: [{ dirNumber: 1, filename: 'PROBE.LHA' }] });
    expect(wire).toContain('PROBE.LHA');
    expect(wire).not.toContain('Press any key');
    expect(wire).toMatch(/Menu \(/);
  });
});
