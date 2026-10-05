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
