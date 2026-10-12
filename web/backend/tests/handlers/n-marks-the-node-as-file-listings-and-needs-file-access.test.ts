/**
 * N (express.e:25275-25279 internalCommandN):
 *
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_NOT_ALLOWED  25276
 *   setEnvStat(ENV_FILES)                                                      25278
 *   ENDPROC myNewFiles(params)                                                 25279
 *
 * The node is marked "File Listings" for the node list / STATS file before the
 * new-files walk starts (it was a console.log). The walk itself (myNewFiles,
 * 27906-28023) is pinned elsewhere; here displayNewFiles is a sentinel and the
 * property is the wiring around it: refused callers never reach it, allowed
 * callers reach it with their parameters.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

const walks: string[] = [];
jest.mock('../../src/handlers/file/file.handler', () => ({
  ...jest.requireActual('../../src/handlers/file/file.handler'),
  displayNewFiles: async (_s: unknown, _sess: unknown, params: string) => { walks.push(params); },
}));

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `n-cmd-${Math.random().toString(36).slice(2)}`,
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

beforeEach(() => { walks.length = 0; });

test('N marks the node File Listings and starts the new-files walk with the caller\'s parameters', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'N', '19990101 S');
  expect(c.session.currentStat).toBe(EnvStat.FILES);
  expect(walks).toEqual(['19990101 S']);
});

test('N without file-listing access says "Command requires higher access." and never starts the walk', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'N', '');
  expect(c.out()).toContain('\r\nCommand requires higher access.\r\n');
  expect(walks).toEqual([]);
  expect(c.session.currentStat).not.toBe(EnvStat.FILES);
});
