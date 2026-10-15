/**
 * VO (express.e:25700-25711 internalCommandVO):
 *
 *   IF checkSecurity(ACS_VOTE)=FALSE THEN RETURN RESULT_NOT_ALLOWED            25701
 *   setEnvStat(ENV_DOORS)                                                       25703
 *   setEnvMsg('Voting Booth')                                                   25704
 *   IF checkSecurity(ACS_MODIFY_VOTE) THEN voteMenu() ELSE vote()               25705-25709
 *
 * The property is the wiring around the booth: a caller without ACS_VOTE is
 * refused with the dispatcher's "Command requires higher access." and the node
 * is NOT marked; a caller with it is marked ENV_DOORS and lands in vote() (no
 * ACS_MODIFY_VOTE) which, on a conference without a Vote/ directory, says
 * voting is not established (20800-ish). The booth's own behaviour (files,
 * counters, voted bit) is pinned by vo-votes-in-the-vote-files and
 * vo-create-topic-uses-the-line-editor.
 *
 * Not ported, listed: setEnvMsg('Voting Booth') (25704) - the port has no
 * node-list message slot at all (setEnvMsg exists nowhere in src/).
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-env-'));
setBoardRoot(board);
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  doPause: (_s: unknown, _sess: unknown, done: () => void) => done(),
}));
jest.mock('../../src/achievements/reporter', () => ({ report: () => undefined }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
const { EnvStat } = require('../../src/constants/env-codes');
const { flushOutput } = require('../../src/utils/output.util');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `vo-cmd-${Math.random().toString(36).slice(2)}`,
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

// ACS_MODIFY_VOTE is permission 67: a caller with every right but that one.
const voterOnly = 'T'.repeat(67) + 'F' + 'T'.repeat(32);

test('VO marks the node In Door and opens the voting topics menu for a caller who may vote but not keep the booth', async () => {
  const c = caller(voterOnly);
  await processBBSCommand(c.socket, c.session, 'VO', '');
  expect(c.session.currentStat).toBe(EnvStat.DOORS);
  expect(c.out()).toContain('VOTING TOPICS MENU');
  expect(c.out()).toContain('VOTING IS NOT ESTABLISHED FOR THIS CONFERENCE');
});

test('VO without vote access says "Command requires higher access." and does not mark the node', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'VO', '');
  expect(c.out()).toContain('\r\nCommand requires higher access.\r\n');
  expect(c.out()).not.toContain('VOTING TOPICS MENU');
  expect(c.session.currentStat).not.toBe(EnvStat.DOORS);
});
