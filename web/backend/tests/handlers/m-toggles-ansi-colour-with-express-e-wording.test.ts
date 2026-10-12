/**
 * M (express.e:25239-25248 internalCommandM) flips ansiColour and says so,
 * with a blank line before (\b\n) and no pause:
 *
 *   IF(ansiColour) ansiColour:=FALSE; aePuts('\b\nAnsi Color Off\b\n')
 *   ELSE           ansiColour:=TRUE;  aePuts('\b\nAnsi Color On\b\n')
 *
 * M has no checkSecurity, so every caller may use it. Driven through
 * processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `m-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    ansiMode: true,
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: flags, confAccess: 'X', ansi: true },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); const t = wire.join(''); wire.length = 0; return t; } };
}

test('M switches colour off then on again, each time with a blank line first and the wording of express.e', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'M', '');
  expect(c.out()).toBe('\r\nAnsi Color Off\r\n');
  expect(c.session.ansiMode).toBe(false);
  await processBBSCommand(c.socket, c.session, 'M', '');
  expect(c.out()).toBe('\r\nAnsi Color On\r\n');
  expect(c.session.ansiMode).toBe(true);
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});
