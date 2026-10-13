/**
 * UP (express.e:25667-25674 internalCommandUP):
 *
 *   formatLongDateTime(nodeStart,tempStr2)                                      25670
 *   StringF(tempStr,'\b\nNode \d was started at \s.\b\n',node,tempStr2)         25671
 *   aePuts(tempStr)                                                             25672
 *   ENDPROC RESULT_SUCCESS                                                      25673
 *
 * No security check, no env status: any caller gets exactly one line framed by
 * a blank-line-leading CRLF and a trailing CRLF, with the node's own number
 * and formatLongDateTime's "Day DD-Mon-YYYY HH:MM:SS" (MiscFuncs.e:338).
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 * Deliberate, not changed: express.e's nodeStart is the node PROCESS start
 * (31476); the port keeps session.nodeStartTime, stamped when the session is
 * created, because a web node has no process of its own.
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { RESULT_NOT_ALLOWED } from '../../src/constants/command-results';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string, nodeId: number, start: number) {
  const wire: string[] = [];
  const socket: any = {
    id: `up-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId, currentConf: 1, currentMsgBase: 1, tempData: {},
    nodeStartTime: start,
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: flags, confAccess: 'X' },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

test('UP prints "Node <n> was started at <Day DD-Mon-YYYY HH:MM:SS>." framed by CRLFs, for a caller with no access at all', async () => {
  const start = new Date(2026, 9, 12, 8, 5, 3).getTime(); // Mon 12-Oct-2026 08:05:03 local
  const c = caller('F'.repeat(100), 3, start);
  const res = await processBBSCommand(c.socket, c.session, 'UP', '');
  expect(c.out()).toBe('\r\nNode 3 was started at Mon 12-Oct-2026 08:05:03.\r\n');
  expect(res).not.toBe(RESULT_NOT_ALLOWED);
});
