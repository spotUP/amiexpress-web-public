/**
 * W's prompts are lineInput/getPass2 (express.e 25889-26010): each answer
 * ends with a line break before the caller code's own. The port printed one
 * fewer everywhere; a word at "Which to change" is Val() 0, LOGIN NAME; a
 * password is echoed as stars.
 */
process.env.SKIP_DB_INIT = '1';

// W 0/2/3 look names up on disk (findUserFromName) and refuse a `*` only with
// USEWILDCARDS on (checkForAst); both are the board's, stubbed here.
jest.mock('../../src/handlers/message/msg-names', () => ({
  ...jest.requireActual('../../src/handlers/message/msg-names'),
  useWildcards: () => true,
  findUserFromName: (_s: number, _t: string, name: string) => (name.toUpperCase() === 'TAKEN' ? 4 : 0),
}));
jest.mock('../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (session: any, fields: any) => Object.assign(session.user, fields)),
  saveAccount: jest.fn(async () => undefined),
}));

import { feedInputWaiter } from '../../src/utils/await-input';
import { handleUserEditInput } from '../../src/handlers/command-handler/user-edit-states';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

function caller(subState: LoggedOnSubState) {
  const wire: string[] = [];
  const socket: any = { id: `w-${Math.random()}`, emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; }, on: () => socket };
  const session: any = {
    nodeId: 1, currentConf: 1, subState, inputBuffer: '', tempData: {},
    user: { id: 'u1', username: 'caller', secLevel: 255, securityFlags: 'T'.repeat(128) },
  };
  return { socket, session, said: () => { flushOutput(socket); return wire.join(''); } };
}

/** One key at a time, as handleCommand hands them on: a waiting lineInput first. */
async function type(c: ReturnType<typeof caller>, text: string) {
  for (const ch of text) {
    if (feedInputWaiter(c.socket, c.session, ch)) { await new Promise(r => setTimeout(r, 2)); continue; }
    await Promise.race([handleUserEditInput(c.socket, c.session, ch), new Promise(r => setTimeout(r, 20))]);
  }
}

test('a word at "Which to change" opens LOGIN NAME, the name already in it (express.e:25906)', async () => {
  const c = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(c, 'x\r');
  expect(c.said()).toContain('x\r\n\r\nName: caller');
  expect(c.session.inputWaiter?.text).toBe('caller');

  // Enter alone is the name typed again: back to the menu, nothing changed.
  await type(c, '\r');
  expect(c.session.inputWaiter).toBeUndefined();
  expect(c.session.user.username).toBe('caller');
  expect(c.said()).not.toContain('Checking for duplicate name');
});

test('LOGIN NAME: a name in use goes back to "Name: ", a free one is taken', async () => {
  const c = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(c, '0\r' + '\x7f'.repeat(6) + 'taken\r');
  expect(c.said()).toContain('taken\r\n\r\nChecking for duplicate name...Already in use!, try another.\r\n\r\nName: caller');

  await type(c, '\x7f'.repeat(6) + 'randy\r');
  expect(c.said()).toContain('\r\nChecking for duplicate name...Ok!\r\n');
  expect(c.session.user.username).toBe('randy');
});

test('the new password is starred, and "Reenter" follows getPass2\'s one break', async () => {
  const c = caller(LoggedOnSubState.W_EDIT_PASSWORD);
  await type(c, 'abc\r');
  expect(c.said()).toBe('***\r\nReenter New Password: ');
});

test('W 7 is express\'s line test: count down, ask, and a bad answer runs it again silently', async () => {
  const c = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(c, '7\r');
  const asked = c.said();
  expect(asked).toContain(' 70\r\n 69\r\n');
  expect(asked).toContain(' 2\r\n\r\nEnter the number you see at the top of your screen (or 0 for Auto): ');
  expect(asked).not.toContain('Lines Per Screen (0=Auto)');

  const before = asked.length;
  await type(c, '300\r');
  const again = c.said().slice(before);
  expect(again).not.toContain('Invalid number');
  expect(again).toContain(' 70\r\n');
  expect(c.session.subState).toBe(LoggedOnSubState.W_EDIT_LINES);
});

test('W 3 says "Checking for duplicate name..." before the wildcard refusal, and has no space test', async () => {
  const wild = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(wild, '3\ra*\r');
  expect(wild.said()).toContain('\r\nChecking for duplicate name...No wildcards allowed in a name.\r\n\r\nInternet Name: (Alpha Numeric No Spaces) ');

  const spaced = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(spaced, '3\ra b\r');
  expect(spaced.said()).not.toContain('No spaces allowed');
  expect(spaced.session.user.internetName).toBe('a b');
});

test('W 2 shows the real name in its prompt', async () => {
  const c = caller(LoggedOnSubState.W_OPTION_SELECT);
  c.session.user.realname = 'Johan';
  await type(c, '2\r');
  expect(c.said()).toContain('2\r\n\r\nReal Name: (Alpha Numeric) Johan');
});

test('W 11 answers express\'s way: no "Protocol set to", a bad number asks again with no error', async () => {
  const c = caller(LoggedOnSubState.W_EDIT_PROTOCOL);
  await type(c, '9\r');
  expect(c.said()).toBe('9\r\n\r\nChoose protocol: ');
  expect(c.session.subState).toBe(LoggedOnSubState.W_EDIT_PROTOCOL);
});
