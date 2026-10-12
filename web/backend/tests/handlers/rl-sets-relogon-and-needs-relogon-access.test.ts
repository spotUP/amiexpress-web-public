/**
 * RL (express.e:25534-25539 internalCommandRL):
 *
 *   IF checkSecurity(ACS_RELOGON)=FALSE THEN RETURN RESULT_NOT_ALLOWED   25535
 *   relogon:=TRUE                                                         25536
 *   internalCommandG(params)                                              25537
 *
 * G (25047-25069) then ends with setEnvStat(ENV_LOGOFF) (25069) and, with
 * relogon set, the caller lands back at the login prompt (8234-8293, pinned in
 * relogon-returns-to-login.test.ts; goodbye itself in goodbye-and-callerslog).
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `rl-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    flagManager: { getCount: () => 0, save: () => {} },
    user: { id: 1, username: 'caller', slotNumber: 1, secLevel: 1, securityFlags: flags, confAccess: 'X' },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

beforeAll(() => {
  const mod = require('../../src/handlers/commands/system-commands.handler');
  mod.setSystemCommandsDependencies({ displayScreen: async () => false, findSecurityScreen: () => null });
  require('../../src/handlers/commands/utility-commands.handler').setUtilityCommandsDependencies({
    handleGoodbyeCommand: mod.handleGoodbyeCommand,
    messages: [], confScreenDir: '', findSecurityScreen: () => null, displayScreen: () => false,
    searchFileDescriptions: async () => [],
  });
});

test('RL logs the caller off, marks the node Logging Off and returns him to the name prompt', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'RL', 'Y');
  expect(c.session.currentStat).toBe(EnvStat.LOGOFF);
  expect(c.session.state).toBe(BBSState.LOGON);
  expect(c.session.relogon).toBe(false);
  expect(c.out()).toContain('Enter your Name:');
});

test('RL without relogon access says "Command requires higher access." and leaves the caller logged on', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'RL', '');
  expect(c.out()).toContain('\r\nCommand requires higher access.\r\n');
  expect(c.session.state).toBe(BBSState.LOGGEDON);
  expect(c.session.relogon).toBeFalsy();
  expect(c.session.currentStat).not.toBe(EnvStat.LOGOFF);
});
