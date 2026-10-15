/**
 * WHO / WHD (express.e:26094-26112 internalCommandWHO / WHD, who() 24204-24384).
 *
 *   IF checkSecurity(ACS_WHO_IS_ONLINE) AND sopt.toggles[TOGGLES_MULTICOM]<>0   26095
 *     setEnvStat(ENV_DOORS); who(0)                                              26096-26097
 *   ELSE RETURN RESULT_NOT_ALLOWED                                               26099
 *
 * who(): the Action text is the node's status (24262-24369); the node itself
 * reads "WHO" (24293 i=node), another node in a door reads "MODULE" (24298);
 * RESERVE/SHUTDOWN/NOTACTIVE nodes are listed to a sysop only (24370); the
 * Chat column is the node's blockOLM (24252-24254), not the account's flag.
 * The row/frame bytes are pinned by who-rows-close-the-frame.
 *
 * Not ported, listed: the DL:/UL: file name (misc1, 24272/24282); WHD's debug
 * pointer dump (24239-24250, WEB_ - prints the WHO table); idle-node rows.
 *
 * Driven through processBBSCommand (dispatcher of express.e:28289-28397).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'who-'));
setBoardRoot(board);
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  doPause: (_s: unknown, _sess: unknown, done: () => void) => done(),
}));
jest.mock('../../src/achievements/reporter', () => ({ report: () => undefined }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { setInfoCommandsDependencies } = require('../../src/handlers/commands/info-commands.handler');
const { BBSState, LoggedOnSubState } = require('../../src/constants/bbs-states');
const { EnvStat } = require('../../src/constants/env-codes');
const { flushOutput } = require('../../src/utils/output.util');
const { config } = require('../../src/config');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const ALL = 'T'.repeat(100);
const without = (...idx: number[]) => ALL.split('').map((c, i) => (idx.includes(i) ? 'F' : c)).join('');
// ACS_SYSOP_COMMANDS is 50, ACS_WHO_IS_ONLINE 51
const CALLER = without(50);

function node(nodeId: number, name: string, stat: number, flags = ALL, blockOLM = false) {
  const wire: string[] = [];
  const socket: any = {
    id: `who-${nodeId}-${Math.random().toString(36).slice(2)}`,
    emit: (e: string, d: unknown) => { if (e === 'ansi-output') wire.push(String(d)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND, nodeId, currentConf: 1, currentMsgBase: 1,
    tempData: {}, currentStat: stat, blockOLM,
    user: { id: nodeId, username: name, location: 'Home', secLevel: 1, securityFlags: flags, confAccess: 'X' },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); return visible(wire.join('')); } };
}

function board3(viewerFlags = CALLER) {
  const me = node(1, 'viewer', EnvStat.IDLE, viewerFlags);
  const mail = node(2, 'mailer', EnvStat.MAIL, ALL, true);
  const door = node(3, 'gamer', EnvStat.DOORS);
  const off = node(4, 'ghost', EnvStat.NOTACTIVE);
  setInfoCommandsDependencies({ sessions: new Map([['a', me.session], ['b', mail.session], ['c', door.session], ['d', off.session]]) });
  return me;
}

test.each(['WHO', 'WHD'])('%s lists each node by its status, marks the caller WHO, hides inactive nodes and shows the node blockOLM as Chat', async (cmd) => {
  const me = board3();
  await processBBSCommand(me.socket, me.session, cmd, '');
  const out = me.out();
  expect(me.session.currentStat).toBe(EnvStat.DOORS); // 26096 setEnvStat(ENV_DOORS)
  expect(out).toMatch(/\| 01\| viewer\s+\| Home\s+\| WHO\s+\|YES \|/);          // 24293 i=node
  expect(out).toMatch(/\| 02\| mailer\s+\| Home\s+\| READING MAIL\s+\|NO {2}\|/); // 24300 + blockOLM
  expect(out).toMatch(/\| 03\| gamer\s+\| Home\s+\| MODULE\s+\|YES \|/);         // 24298
  expect(out).not.toContain('ghost');                                            // 24370 status 18
  expect(out).not.toContain('NODE INACTIVE');
});

test('WHO shows the inactive node, with blank name, to a caller with sysop-command access (express.e:24370, 24352)', async () => {
  const me = board3(ALL);
  await processBBSCommand(me.socket, me.session, 'WHO', '');
  expect(me.out()).toMatch(/\| 04\|\s+\|\s+\| NODE INACTIVE\.\s+\|/);
  expect(me.out()).not.toContain('ghost');
});

test('WHO without who-is-online access says "Command requires higher access." and does not mark the node', async () => {
  const me = board3(without(51));
  await processBBSCommand(me.socket, me.session, 'WHO', '');
  expect(me.out()).toContain('Command requires higher access.');
  expect(me.out()).not.toContain('Name/Handle');
  expect(me.session.currentStat).toBe(EnvStat.IDLE);
});

test('WHO is refused while the MULTICOM toggle is off (express.e:26095 sopt.toggles[TOGGLES_MULTICOM]<>0)', async () => {
  const me = board3();
  const orig = config.get('olmEnabled');
  config.set?.('olmEnabled', false);
  try {
    if (config.get('olmEnabled') !== false) return void expect('config not settable').toBe('settable');
    await processBBSCommand(me.socket, me.session, 'WHO', '');
    expect(me.out()).toContain('Command requires higher access.');
    expect(me.out()).not.toContain('Name/Handle');
  } finally {
    config.set?.('olmEnabled', orig);
  }
});
