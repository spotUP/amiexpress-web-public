/**
 * CM (express.e:24843-24852 internalCommandCM) around conferenceMaintenance:
 *
 *   IF checkSecurity(ACS_SYSOP_COMMANDS)=FALSE THEN RETURN RESULT_NOT_ALLOWED  24844
 *   setEnvStat(ENV_SYSOP)                                                      24845
 *   sendCLS()                                                                  24847
 *   conferenceMaintenance()                                                    24848
 *   loadMsgPointers(currentConf,currentMsgBase)                                24849
 *
 * The screen is cleared once by sendCLS; the maintenance loop (22686-22939)
 * only repositions, so a redraw after "-" / "+" does not clear it again. When
 * the sysop leaves with TAB, whatever he wrote to his own Conf.DB record
 * (ratio, read pointers) is loaded back as his live account and pointers.
 * The screens, options and numbers of the loop itself are pinned in
 * jm-nm-cm-say-what-express-says.test.ts and
 * conference-maintenance-names-the-right-base.test.ts.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { processBBSCommand, handleCommand } from '../../src/handlers/command.handler';
import { setMessageCommandsDependencies } from '../../src/handlers/message/message-commands.handler';
import {
  messagePointerFileManager, deserializeConfBase, serializeConfBase, CONFBASE_RECORD_SIZE,
} from '../../src/services/MessagePointerFileManager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { flushOutput } from '../../src/utils/output.util';

function caller(flags: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `cm-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    lastMsgReadConf: 900, lastNewReadConf: 901,
    user: { id: 'u1', slotNumber: 1, username: 'SPOT', secLevel: 255, securityFlags: flags, confAccess: 'X', ratio: 0, ratioType: 0 },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); const t = wire.join(''); wire.length = 0; return t; } };
}

let dir: string;
beforeEach(() => {
  setMessageCommandsDependencies({
    messageBases: [{ id: 1, conferenceId: 1, name: 'General' }, { id: 2, conferenceId: 2, name: 'Amiga' }] as never,
    conferences: [{ id: 1, name: 'Uptown' }, { id: 2, name: 'Downtown' }] as never,
    sessions: new Map(),
    getConferenceStats: jest.fn(async () => ({ userCount: 1, capacity: 10 })),
    getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 9 })),
  } as never);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-cmd-'));
  const dbFile = path.join(dir, 'Conf.DB');
  const rec = deserializeConfBase(Buffer.alloc(CONFBASE_RECORD_SIZE));
  rec.ratio = 5; rec.ratioType = 1; rec.confYM = 40; rec.confRead = 41;
  fs.writeFileSync(dbFile, serializeConfBase(rec));
  jest.spyOn(messagePointerFileManager, 'getConfDbPath').mockReturnValue(dbFile);
});
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

test('CM marks the node Sysop Functions and clears the screen once; "+" redraws without clearing again', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'CM', '');
  const opened = c.out();
  expect(c.session.currentStat).toBe(EnvStat.SYSOP);
  expect(opened.startsWith('\x1b[2J')).toBe(true);
  expect(opened.split('\x1b[2J').length - 1).toBe(1);
  expect(opened).toContain('CONFERENCE MAINTENANCE');

  await handleCommand(c.socket, c.session, '+');
  await new Promise((r) => setTimeout(r, 40));
  const redrawn = c.out();
  expect(redrawn).toContain('CONFERENCE MAINTENANCE');
  expect(redrawn).not.toContain('\x1b[2J');
});

test('leaving CM with TAB loads the sysop\'s own Conf.DB record back as his ratio and read pointers', async () => {
  const c = caller('T'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'CM', '');
  await handleCommand(c.socket, c.session, '\t');
  await new Promise((r) => setTimeout(r, 40));
  expect(c.session.user.ratio).toBe(5);
  expect(c.session.user.ratioType).toBe(1);
  expect(c.session.lastMsgReadConf).toBe(40);
  expect(c.session.lastNewReadConf).toBe(41);
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});

test('CM without sysop access says "Command requires higher access." and draws nothing', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'CM', '');
  const out = c.out();
  expect(out).toContain('\r\nCommand requires higher access.\r\n');
  expect(out).not.toContain('CONFERENCE MAINTENANCE');
  expect(c.session.currentStat).not.toBe(EnvStat.SYSOP);
});
