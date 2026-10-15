/**
 * T prints "It is MM-DD-YY HH:MM:SS" (express.e:25622-25644 internalCommandT).
 *
 * DateToStr with FORMAT_USA (25629) gives the date as MM-DD-YY and the time as
 * 24-hour HH:MM:SS; strday is 0 (25631) so there is no weekday name. The
 * output is '\b\nIt is ' + date + ' ' + time + '\b\n' (25636-25640), i.e. one
 * leading CRLF, the sentence, one trailing CRLF. T takes no security check
 * (28307-28308), so a caller with no access flags still gets the answer.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `t-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: flags, confAccess: 'X' },
  };
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

afterEach(() => jest.useRealTimers());

test('T prints the USA date and 24-hour time on their own line, with no access flags needed', async () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 5, 7, 8, 9) });
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'T', '');
  expect(c.out()).toBe('\r\nIt is 10-05-26 07:08:09\r\n');
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});

test('T pads a single-digit year and a 23:59 hour (express.e:25629 FORMAT_USA)', async () => {
  jest.useFakeTimers({ now: new Date(2005, 0, 2, 23, 59, 0) });
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'T', '');
  expect(c.out()).toBe('\r\nIt is 01-02-05 23:59:00\r\n');
});
