/**
 * "two arrow up and then enter overwrites row with a new number" (sysop,
 * 2026-09-30). Up arrow arrives as ESC[A. The line editor took any unhandled
 * multi-byte input as text: it stored ESC[A in the line and echoed it, the
 * echo moved the caller's cursor up a row, and the next line prompt was drawn
 * over an earlier one. express.e's edit() handles left and right and drops
 * every other control key (10292 `IF(c<" ") THEN JUMP next2`).
 *
 * Driven through handleCommand, the entry point every keystroke takes.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';

function bodySession(): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    terminalType: 'ansi',
    connectionType: 'web',
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255 },
    tempData: { messageEntry: { body: ['test'], currentLine: 2, toUser: 'ALL', subject: 's' } },
  };
}

describe('a key the line editor has no use for', () => {
  it.each(['\x1b[A', '\x1b[B', '\x1bOA', '\x1b[5~', '\x1b[11~'])('%j is neither stored nor echoed', async (key) => {
    const out: string[] = [];
    const socket: any = { id: `arrow-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
    const session = bodySession();

    await handleCommand(socket, session, key);
    await handleCommand(socket, session, key);
    await new Promise((r) => setTimeout(r, 30));

    expect(session.inputBuffer).toBe('');
    expect(out.join('')).not.toContain('\x1b');
  });

  it('still takes typed text and a pasted run of it', async () => {
    const socket: any = { id: `paste-${Math.random()}`, emit: () => true, on() {}, off() {}, removeListener() {} };
    const session = bodySession();
    await handleCommand(socket, session, 'a');
    await handleCommand(socket, session, 'bc de');
    expect(session.inputBuffer).toBe('abc de');
  });
});
