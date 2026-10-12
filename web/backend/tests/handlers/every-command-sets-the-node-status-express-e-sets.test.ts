/**
 * Every command that express.e marks with setEnvStat(ENV_x) at entry does the
 * same here, so the node list / WHO / STATS file shows what the caller is doing.
 * These were console.log('[ENV] ...') stubs. One row per command; each is driven
 * through processBBSCommand (the dispatcher of express.e:28289-28397) with full
 * access. The heavy inner procedure may do anything afterwards (a thrown command
 * returns to the menu); the property is the status set on the way in.
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { DownloadHandler } from '../../src/handlers/file/download.handler';

// D waits for a file name from the caller; its inner procedure (beginDLF,
// express.e:24857) is a sentinel here. The status is set before it.
beforeAll(() => { jest.spyOn(DownloadHandler as any, 'beginDLF').mockResolvedValue(undefined); });

// [command, params, expected status, express.e line of the setEnvStat call]
const rows: Array<[string, string, EnvStat, number]> = [
  ['D', '', EnvStat.DOWNLOADING, 24855],
  ['V', '', EnvStat.VIEWING, 25678],
  ['Z', '', EnvStat.FILES, 26132],
  ['A', '', EnvStat.FILES, 24603],
  ['B', '', EnvStat.BULLETINS, 24614],
  ['F', '', EnvStat.FILES, 24880],
  ['FR', '', EnvStat.FILES, 24886],
  ['S', '', EnvStat.STATS, 25546],
  ['W', '', EnvStat.STATS, 25720],
  ['U', '', EnvStat.UPLOADING, 25649],
  ['WHO', '', EnvStat.DOORS, 26096],
  ['WHD', '', EnvStat.DOORS, 26106],
  ['ZOOM', '', EnvStat.ZOOM, 26233],
  ['J', '', EnvStat.JOIN, 25123],
  ['JM', '', EnvStat.JOIN, 25195],
  ['NM', '', EnvStat.SYSOP, 25292],
  ['<', '', EnvStat.JOIN, 24534],
  ['>', '', EnvStat.JOIN, 24553],
  ['<<', '', EnvStat.JOIN, 24570],
  ['>>', '', EnvStat.JOIN, 24584],
];

function caller() {
  const socket: any = {
    id: `env-cmd-${Math.random().toString(36).slice(2)}`,
    emit: () => true,
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 255, securityFlags: 'T'.repeat(100), confAccess: 'X' },
  };
  socket.session = session;
  return { socket, session };
}

test.each(rows)('%s marks the node with the status express.e sets', async (cmd, params, stat) => {
  const c = caller();
  c.session.currentStat = EnvStat.IDLE;
  await processBBSCommand(c.socket, c.session, cmd, params).catch(() => undefined);
  expect(c.session.currentStat).toBe(stat);
});
