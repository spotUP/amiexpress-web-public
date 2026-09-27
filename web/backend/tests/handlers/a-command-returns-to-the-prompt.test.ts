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
    currentConf: 1, relConfNum: 1, currentConfName: 'Main', timeRemaining: 3600, tempData: {},
    user: { id: 'u1', username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
  };
  return { socket, session, out };
}

describe('the T command', () => {
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
