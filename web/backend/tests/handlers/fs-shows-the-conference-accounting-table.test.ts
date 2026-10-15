/**
 * FS prints the per-conference file status table (express.e:24872-24875
 * internalCommandFS -> fileStatus 24141-24192).
 *
 * Pinned from the product's dispatcher (processBBSCommand, express.e:28289):
 *   - 24873: without ACS_CONFERENCE_ACCOUNTING the command is refused and the
 *     dispatcher says "Command requires higher access." (28400);
 *   - 24151-24160: blank line, green Uploads/Downloads banner, blank line, the
 *     Bytes header, the dashed rule;
 *   - 24178-24182 row format: yellow right-justified (4) conference number,
 *     "> ", pen 3 for the current conference / 6 for the rest, uploads LEFT
 *     justified in 7, upload bytes right in 14, downloads (\r\d[7]) RIGHT
 *     justified in 7, download bytes right in 14, bytes available right in 9
 *     ("Infinite" when todaysBytesLimit is 0, 24172-24176), then ratio
 *     "N" + reset + ":" + pen + "1";
 *   - 24184: the table ends with '[0m' CRLF.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';
import { container, DI_TOKENS } from '../../src/container';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `fs-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, tempData: {},
    user: {
      id: 'u1', username: 'caller', secLevel: 255, securityFlags: flags, confAccess: 'XX',
      uploads: 5, downloads: 7, bytesUpload: 1234, bytesDownload: 99, ratio: 3, byteLimit: 0,
    },
  };
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

// The board's two conferences, registered where production registers its database.
beforeEach(() => {
  const conferences = [{ id: 1, name: 'General' }, { id: 2, name: 'Other' }];
  container.registerInstance(DI_TOKENS.Database, { getConferences: async () => conferences });
  container.registerInstance(DI_TOKENS.Conferences, conferences);
});

test('FS prints the banner, header, rule and one row per accessible conference (express.e:24151-24184)', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'FS', '');
  const out = c.out();
  expect(out.startsWith(
    '\r\n\x1b[32m              Uploads                 Downloads\r\n\r\n'
    + '\x1b[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\r\n'
    + '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\r\n',
  )).toBe(true);
  // Current conference (pen 3): uploads left in 7, downloads right in 7.
  expect(out).toContain('\x1b[33m       1\x1b[0m> \x1b[33m5        ');
  expect(out).toContain('1234       7  '); // 24179: \\r\\d[7]
  expect(out).toContain('Infinite');
  expect(out).toContain('\x1b[0m:\x1b[33m1\r\n');
  // Other conference (pen 6).
  expect(out).toContain('\x1b[33m       2\x1b[0m> \x1b[36m');
  expect(out.endsWith('\x1b[0m\r\n')).toBe(true);
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});

test('FS without conference accounting is refused by the dispatcher (express.e:24873, 28400)', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'FS', '');
  expect(c.out()).toBe('\r\nCommand requires higher access.\r\n');
});

test('FS shows bytes available as an unsigned 32-bit difference, limit minus today (express.e:24172-24174)', async () => {
  const c = caller('T'.repeat(100));
  Object.assign(c.session.user, { todaysBytesLimit: 1000, dailyBytesDld: 400 });
  await processBBSCommand(c.socket, c.session, 'FS', '');
  expect(c.out()).toContain('      600  ');
  const over = caller('T'.repeat(100));
  Object.assign(over.session.user, { todaysBytesLimit: 1000, dailyBytesDld: 1001 });
  await processBBSCommand(over.socket, over.session, 'FS', '');
  expect(over.out()).toContain('4294967295');
});
