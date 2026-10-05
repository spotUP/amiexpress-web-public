/**
 * W's prompts are lineInput/getPass2 (express.e 25889-26010): each answer
 * ends with a line break before the caller code's own. The port printed one
 * fewer everywhere; a word at "Which to change" is Val() 0, LOGIN NAME; a
 * password is echoed as stars.
 */
process.env.SKIP_DB_INIT = '1';

import { handleUserEditInput } from '../../src/handlers/command-handler/user-edit-states';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

function caller(subState: LoggedOnSubState) {
  const wire: string[] = [];
  const socket: any = { id: `w-${Math.random()}`, emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; }, on: () => socket };
  const session: any = {
    nodeId: 1, currentConf: 1, subState, inputBuffer: '', tempData: {},
    user: { id: 'u1', username: 'caller', secLevel: 255, securityFlags: 'T'.repeat(64) },
  };
  return { socket, session, said: () => { flushOutput(socket); return wire.join(''); } };
}

async function type(c: ReturnType<typeof caller>, text: string) {
  for (const ch of text) await handleUserEditInput(c.socket, c.session, ch);
}

test('a word at "Which to change" opens LOGIN NAME, two line breaks before "Name: "', async () => {
  const c = caller(LoggedOnSubState.W_OPTION_SELECT);
  await type(c, 'x\r');
  expect(c.session.subState).toBe(LoggedOnSubState.W_EDIT_NAME);
  expect(c.said()).toContain('x\r\n\r\nName: ');
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
  const wild = caller(LoggedOnSubState.W_EDIT_INTERNETNAME);
  await type(wild, 'a*\r');
  expect(wild.said()).toContain('\r\nChecking for duplicate name...No wildcards allowed in a name.\r\n\r\nInternet Name: ');

  const spaced = caller(LoggedOnSubState.W_EDIT_INTERNETNAME);
  await type(spaced, 'a b\r');
  expect(spaced.said()).not.toContain('No spaces allowed');
});
