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
