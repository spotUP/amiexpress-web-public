/**
 * DS and VS: the sysop's download and view of any file on a mounted device -
 * express.e downloadAFile with sysopdl (20038-20056, 12862-12895) and
 * viewAFile's VS branch (20435-20450).
 *
 * The port dropped the command code at the dispatcher, so DS was a plain D
 * and VS a plain V: a sysop's path was refused as "special symbols" and
 * nothing reached the CallersLog. Driven through handleCommand on a fixture
 * board, with a file that is in no file area. The browser fetches the file on
 * its one-time ticket. A caller without ACS_SYSOP_DOWNLOAD / ACS_SYSOP_VIEW
 * gets D and V, as express.e gives them.
 */
process.env.SKIP_DB_INIT = '1';

/** The UDLog writer, counted. */
const udLog = jest.fn(async (_line: string, _node: number) => undefined);
jest.mock('../../src/utils/download-logging.util', () => ({
  ...jest.requireActual('../../src/utils/download-logging.util'),
  writeToUDLog: (line: string, node: number) => udLog(line, node),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { ACSPermission } from '../../src/constants/acs-permissions';
import { flushOutput } from '../../src/utils/output.util';
import { callersLogManager } from '../../src/services/CallersLogManager';

let root: string;
let previousDataDir: string;
const savedEnv = process.env.BBS_DATA_DIR;
let callersLog: jest.SpyInstance;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sysop-ds-vs-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  process.env.BBS_DATA_DIR = root; // the BBS: assign
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Conf1', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
  // In no file area: only a sysop path reaches it.
  fs.mkdirSync(path.join(root, 'S'));
  fs.writeFileSync(path.join(root, 'S', 'secret.txt'), 'TOP SECRET\n');
  callersLog = jest.spyOn(callersLogManager, 'logActivity').mockImplementation(() => undefined);
  udLog.mockClear();
});

afterEach(() => {
  callersLog.mockRestore();
  config.set('dataDir', previousDataDir);
  if (savedEnv === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedEnv;
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
function caller(sysop: boolean) {
  const bytes: string[] = [];
  const downloads: any[] = [];
  const flags = 'T'.repeat(64).split('');
  if (!sysop) {
    flags[ACSPermission.SYSOP_DOWNLOAD] = 'F';
    flags[ACSPermission.SYSOP_VIEW] = 'F';
  }
  const socket = {
    id: `sysop-ds-vs-${++n}`,
    emit: (event: string, data: unknown) => {
      if (event === 'download-file') downloads.push(data);
      else if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
      return true;
    },
    on: () => {}, off: () => {}, once: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.PROCESS_COMMAND,
    connectionType: 'web',
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    inputBuffer: '',
    commandHistory: [],
    user: {
      id: 1, username: 'spot', name: 'spot', secLevel: 255, secLibrary: 0,
      securityFlags: flags.join(''), expert: 'X',
    },
    tempData: {},
  };
  const run = async (line: string) => {
    session.subState = LoggedOnSubState.PROCESS_COMMAND;
    session.commandText = line;
    await handleCommand(socket, session, '\r');
  };
  // Line input takes the caller's keys one at a time, as a terminal sends them.
  const type = async (text: string) => {
    for (const ch of text) await handleCommand(socket, session, ch);
    await new Promise((r) => setTimeout(r, 30));
  };
  const wire = () => { flushOutput(socket); const t = bytes.join(''); bytes.length = 0; return t; };
  const logged = () => callersLog.mock.calls.map((c) => String(c[1]));
  return { socket, session, downloads, run, type, wire, logged };
}

async function fetchTicket(url: string): Promise<{ status: number; body: string }> {
  const app = express();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../src/server/routes-setup').registerHttpRoutes(app, { emit: () => undefined });
  const got = await request(app).get(url).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (d: Buffer) => chunks.push(d));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  return { status: got.status, body: Buffer.isBuffer(got.body) ? got.body.toString() : '' };
}

describe('DS - sysop download', () => {
  it('sends a file from any mounted path and logs SYSOP DOWNLOAD to the CallersLog and UDLog', async () => {
    const c = caller(true);
    await c.run('DS BBS:S/secret.txt');
    const listed = c.wire();
    expect(listed).toContain('\r\nChecking...\r\n');
    expect(listed).toMatch(/ 0k, 0 mins 0\d secs secret\.txt\r\n/);
    expect(listed).not.toContain('special symbols');
    expect(c.logged()).toContain('\tSYSOP DOWNLOAD: DS');
    expect(udLog).toHaveBeenCalledWith('\tSYSOP DOWNLOAD: DS', 1);
    expect(c.session.subState).toBe(LoggedOnSubState.DOWNLOAD_FILENAME_INPUT);

    // A wildcard is refused in the sysop's words; the prompt comes back.
    await c.type('BBS:S/*.txt\r');
    expect(c.wire()).toContain('\r\nSysop download doesn\'t support wildcards\r\n');

    await c.type('\r'); // blank filespec: on to LAST CHANCE
    expect(c.wire()).toContain('LAST CHANCE!');
    await c.type('\r'); // start

    expect(c.downloads.map((d) => d.filename)).toEqual(['secret.txt']);
    const got = await fetchTicket(c.downloads[0].url);
    expect(got.status).toBe(200);
    expect(got.body).toBe('TOP SECRET\n');
  });

  it('says a path on no mounted device is not found', async () => {
    const c = caller(true);
    await c.run('DS NOSUCHDEV:secret.txt');
    expect(c.wire()).toContain('       File (NOSUCHDEV:secret.txt) not found.\r\n');
  });

  it('is a plain D for a caller without ACS_SYSOP_DOWNLOAD: the path is refused and nothing is logged', async () => {
    const c = caller(false);
    await c.run('DS BBS:S/secret.txt');
    expect(c.wire()).toContain('You may not include any special symbols');
    expect(c.logged().some((l) => l.includes('SYSOP DOWNLOAD'))).toBe(false);
    expect(udLog).not.toHaveBeenCalled();
    expect(c.downloads).toHaveLength(0);
  });
});

describe('VS - sysop view', () => {
  it('shows a file from any mounted path and logs SysopView', async () => {
    const c = caller(true);
    await c.run('VS BBS:S/secret.txt');
    const shown = c.wire();
    expect(shown).toContain('TOP SECRET');
    expect(c.logged().map((l) => l.toUpperCase())).toContain('\tSYSOPVIEW BBS:S/SECRET.TXT');
  });

  it('says a missing path is not found, in express.e\'s words', async () => {
    const c = caller(true);
    await c.run('VS BBS:S/gone.txt');
    expect(c.wire().toUpperCase()).toContain('FILE BBS:S/GONE.TXT NOT FOUND.\r\n\r\n');
    expect(c.logged().some((l) => l.includes('SysopView'))).toBe(false);
  });

  it('is a plain V for a caller without ACS_SYSOP_VIEW: the path is refused and nothing is logged', async () => {
    const c = caller(false);
    await c.run('VS BBS:S/secret.txt');
    const shown = c.wire();
    expect(shown).toContain('You may not include any special symbols');
    expect(shown).not.toContain('TOP SECRET');
    expect(c.logged().some((l) => l.includes('SysopView'))).toBe(false);
  });
});
