/**
 * D asks express.e's checkRatiosAndTime before every filespec.
 *
 * express.e:20107-20124: the filespec loop calls checkRatiosAndTime
 * (19823-19926) for the set picked so far. Refused - no time, no daily byte
 * allowance, no ratio room - it prints the reason and D ends. The file
 * allowance used up exactly - it asks for no more and goes to LAST CHANCE.
 * Otherwise the prompt says what is left: "<mins> mins, <bytes> bytes,
 * Filespec(n):".
 *
 * The port never called it on D (the parity survey, 2026-09-29): a caller
 * with a 1:1 byte ratio and nothing uploaded could take the whole file area,
 * the prompt said "Infinite bytes", and "60 mins" whatever the clock said.
 *
 * Driven through D's real entry point on a temp board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../../src/config';
import { ACSPermission } from '../../../src/constants/acs-permissions';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { DownloadHandler } from '../../../src/handlers/file/download.handler';
import { handlePaginatedScreenInput } from '../../../src/handlers/screen.handler';
import { setStorageContext } from '../../../src/storage/storage-context';

/** 57600 baud: express.e's estimate is 5760 bytes a second. */
const CPS = 5760;

let dataDir: string;
let spy: jest.SpyInstance;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd-ratios-'));
  const files = path.join(dataDir, 'Conf1', 'Files');
  fs.mkdirSync(files, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Conf1.info'), 'NDIRS=1\n'); // express.e maxDirs = icon NDIRS
  fs.writeFileSync(path.join(files, 'SMALL.LHA'), Buffer.alloc(400));
  fs.writeFileSync(path.join(files, 'BIG.LHA'), Buffer.alloc(5000));
  // Two minutes of transfer at CPS.
  fs.writeFileSync(path.join(files, 'LONG.LHA'), Buffer.alloc(CPS * 120));
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  setStorageContext(null);
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** A caller who may download, with no time-limit override and no conference accounting. */
function aCaller(user: Record<string, unknown>) {
  const flags = 'T'.repeat(100).split('');
  flags[ACSPermission.OVERRIDE_TIMELIMIT] = 'F';
  flags[ACSPermission.CONFERENCE_ACCOUNTING] = 'F';
  const out: string[] = [];
  const socket: any = {
    id: `d-ratios-${Math.random()}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    connectionBaud: 57600,
    user: {
      id: 1, username: 'ratio', secLevel: 20, securityFlags: flags.join(''),
      timeTotal: 3600, timeUsed: 0, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
      ...user,
    },
  };
  return { socket, session, said: () => out.join(''), clear: () => { out.length = 0; } };
}

/** Type D, pressing a key at DownloadMsg's pause as a caller does. */
async function typeD(c: ReturnType<typeof aCaller>): Promise<void> {
  let done = false;
  const running = DownloadHandler.handleDownloadCommand(c.socket, c.session, '').finally(() => { done = true; });
  while (!done) {
    await new Promise((r) => setTimeout(r, 5));
    if (c.session.paginatedScreen?.kind === 'doPause') await handlePaginatedScreenInput(c.socket, c.session, '\r');
  }
  await running;
}

describe('D checks ratios and time (express.e:19823-19926, 20107-20124)', () => {
  test('the prompt shows the bytes the ratio leaves, and a file past them is refused', async () => {
    // 1:1 byte ratio, 1000 bytes uploaded.
    const c = aCaller({ secLibrary: 1, secBoard: 0, bytesUpload: 1000 });
    await typeD(c);
    expect(c.said()).toContain('60 mins, 1000 bytes, Filespec(1): ');

    await DownloadHandler.handleFilenameInput(c.socket, c.session, 'SMALL.LHA');
    expect(c.said()).toContain('60 mins, 600 bytes, Filespec(2): ');

    c.clear();
    await DownloadHandler.handleFilenameInput(c.socket, c.session, 'BIG.LHA');
    expect(c.said()).toContain('Not enough free bytes for requested downloads.\r\n\r\n');
    expect(c.said()).not.toContain('Filespec(');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('the last file the file ratio allows goes straight to LAST CHANCE', async () => {
    // File ratio 1: (1 * (0 uploads + 1)) - 0 downloads = one file.
    const c = aCaller({ secLibrary: 1, secBoard: 2 });
    await typeD(c);
    expect(c.said()).toContain('60 mins, 1 files, Filespec(1): ');

    c.clear();
    await DownloadHandler.handleFilenameInput(c.socket, c.session, 'SMALL.LHA');
    expect(c.said()).toContain('LAST CHANCE!');
    expect(c.said()).not.toContain('Filespec(2)');
  });

  test('a set that needs more minutes than are left is refused', async () => {
    // One minute left; LONG.LHA takes two.
    const c = aCaller({ secLibrary: 0, timeTotal: 60 });
    await typeD(c);
    expect(c.said()).toContain('1 mins, (Ratio Disabled), Filespec(1): ');

    c.clear();
    await DownloadHandler.handleFilenameInput(c.socket, c.session, 'LONG.LHA');
    expect(c.said()).toContain('Not enough time for requested downloads.\r\n\r\n');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
