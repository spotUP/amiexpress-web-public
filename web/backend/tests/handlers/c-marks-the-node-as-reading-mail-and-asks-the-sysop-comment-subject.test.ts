// @ts-nocheck
/**
 * C (express.e:24658-24670 internalCommandC -> commentToSYSOP 8757-8803).
 *
 * Gate ACS_COMMENT_TO_SYSOP (24659, refusal = higherAccess at 28400),
 * setEnvStat(ENV_MAIL) (24660), then commentToSYSOP: the header rule
 * (8779), the To line naming account 1 (8780-8781), the Subject prompt
 * (8783). A blank subject prints one more line break and ends quietly
 * (8787-8790); a subject sets status "R" and comment=1 (8792-8793) so message
 * entry skips Private and Quote.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397)
 * on a board directory whose account 1 is the sysop. The To: naming rules
 * live in tests/handlers/message/entering-a-message-names-the-recipient-like-express.test.ts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c-cmd-'));
process.env.BBS_DATA_DIR = root;
process.env.BBS_ROOT = root;
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/conference-tooltypes.util', () => {
  const actual = jest.requireActual('../../src/utils/conference-tooltypes.util');
  return { ...actual, getConferenceToolFlags: (id: number) => ({ ...actual.getConferenceToolFlags(id) }) };
});

jest.resetModules();
const { UserFileManager } = require('../../src/services/UserFileManager');
const { processBBSCommand, handleCommand } = require('../../src/handlers/command.handler');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
const { EnvStat } = require('../../src/constants/env-codes');
const { flushOutput } = require('../../src/utils/output.util');

beforeAll(() => {
  new UserFileManager().writeUserFiles({ username: 'Spot', realname: 'Johan Sysop', confAccess: 'XXXXXXXXX' }, 1);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const SUBJECT = '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `c-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 9, username: 'Poster', secLevel: 20, securityFlags: flags, confAccess: 'X', ansi: true },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); const t = wire.join(''); wire.length = 0; return t; } };
}

test('C marks the node as Reading Mail, draws the header rule, names the sysop and asks the Subject', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'C', '');
  expect(c.out()).toBe(
    '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n'
    + "     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m Spot\r\n"
    + SUBJECT);
  expect(c.session.currentStat).toBe(EnvStat.MAIL);
  expect(c.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_SUBJECT);
  expect(c.session.tempData.messageEntry.isComment).toBe(true);
});

test('C with a blank Subject prints one more line break and ends without a message', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'C', '');
  c.out();
  await handleCommand(c.socket, c.session, '\r');
  await new Promise((r) => setTimeout(r, 40));
  expect(c.out().startsWith('\r\n\r\n')).toBe(true);
  expect(c.session.tempData?.messageEntry).toBeUndefined();
});

test('C without comment access says "Command requires higher access." and asks nothing', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'C', '');
  const out = c.out();
  expect(out).toContain('\r\nCommand requires higher access.\r\n');
  expect(out).not.toContain('Subject');
  expect(c.session.currentStat).not.toBe(EnvStat.MAIL);
});
