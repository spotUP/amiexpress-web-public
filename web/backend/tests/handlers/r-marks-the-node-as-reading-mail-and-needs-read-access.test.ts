/**
 * R (express.e:25518-25531 internalCommandR) is gated by ACS_READ_MESSAGE
 * (25519), then setEnvStat(ENV_MAIL) (25520) marks the node as "Reading Mail"
 * for the node list / STATS file, parseParams (25521) hands the words to the
 * reader, and callMsgFuncs(MAIL_READ) (25526) runs readMSG.
 *
 * The reader itself (readMSG, 11972-12296) is proven in
 * tests/messages/the-reader-walks-message-numbers.test.ts; here readMSG is a
 * sentinel and the property is the wiring around it.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

const reads: string[] = [];
jest.mock('../../src/handlers/message/read-msg', () => ({
  ...jest.requireActual('../../src/handlers/message/read-msg'),
  startReadMSG: (_s: unknown, _sess: unknown, params: string) => { reads.push(params); },
}));

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `r-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: flags, confAccess: 'X' },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

beforeEach(() => { reads.length = 0; });

test('R marks the node as Reading Mail and starts the reader with the typed words', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'R', '5 NS');
  expect(reads).toEqual(['5 NS']);
  expect(c.session.currentStat).toBe(EnvStat.MAIL);
});

test('R without read access says "Command requires higher access." and never starts the reader', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'R', '');
  expect(reads).toEqual([]);
  expect(c.out()).toContain('\r\nCommand requires higher access.\r\n');
  expect(c.session.currentStat).not.toBe(EnvStat.MAIL);
});
