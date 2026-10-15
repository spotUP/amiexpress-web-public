/**
 * A door's "Enter Password >: " is lineInput (express.e:4720): its line
 * break, then '\b\nInValid Password!\b\n' (4726). The port printed one.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommandPasswordInput } from '../../src/handlers/command-execution.handler';

test('a wrong door password: two line breaks before "InValid Password!"', async () => {
  const wire: string[] = [];
  const socket: any = { id: 'pw', emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; } };
  const session: any = { tempData: { passwordProtectedCommand: { commandName: 'GAME', commandDef: { password: 'secret' } } } };
  await handleCommandPasswordInput(socket, session, 'nope');
  expect(wire.join('')).toBe('\r\n\r\nInValid Password!\r\n');
});
