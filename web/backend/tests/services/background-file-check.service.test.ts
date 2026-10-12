/**
 * The background file check's own rules (express.e createBackgroundFileCheck
 * Thread 16922, doBgCheck 18474, backgroundFileCheckThread 18495,
 * ftpWaitFileCheck 15224, doBackgroundCheck's credit 19626-19686). The whole
 * path - an upload through the RZ command with a real checker - is proved once
 * in a-background-file-check-files-the-upload-while-the-transfer-runs.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  BackgroundFileCheck,
  backgroundFileCheckWanted,
  creditCheckedUpload,
  doBgCheck,
  finishBackgroundFileCheck,
} from '../../src/services/background-file-check.service';
import { UserFlag } from '../../src/constants/express-flags';
import { config } from '../../src/config';
import { clearNodeTooltypeCache } from '../../src/utils/node-tooltypes.util';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the thread checks one file at a time, in the order posted', () => {
  it('counts only what it filed, and BG_EXIT waits for the queue', async () => {
    const seen: string[] = [];
    const thread = new BackgroundFileCheck(async (name) => {
      seen.push(`start ${name}`);
      await delay(name === 'A' ? 40 : 5);
      seen.push(`end ${name}`);
      return name === 'B' ? null : { bytes: 100 };
    });
    thread.post('A');
    thread.post('B');
    thread.post('C');
    expect(thread.working).toBe(true);
    await thread.exit();
    expect(seen).toEqual(['start A', 'end A', 'start B', 'end B', 'start C', 'end C']);
    // B left the file alone (no description): not counted.
    expect(thread.checkedCount).toBe(2);
    expect(thread.checkedBytes).toBe(200);
    expect(thread.running).toBe(false);
  });

  it('ignores a file posted after the port is gone (FindPort fails, 18480)', async () => {
    const check = jest.fn(async () => ({ bytes: 1 }));
    const thread = new BackgroundFileCheck(check);
    await thread.exit();
    thread.post('LATE');
    await thread.exit();
    expect(check).not.toHaveBeenCalled();
  });

  it('a check that throws does not stop the next file', async () => {
    let calls = 0;
    const thread = new BackgroundFileCheck(async () => {
      if (++calls === 1) throw new Error('boom');
      return { bytes: 7 };
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    thread.post('A');
    thread.post('B');
    await thread.exit();
    expect(thread.checkedCount).toBe(1);
  });
});

describe('ftpWaitFileCheck: done when the thread is gone, not done after the timeout', () => {
  it('answers false while the check runs and true once it ends', async () => {
    const thread = new BackgroundFileCheck(async () => { await delay(120); return { bytes: 1 }; });
    thread.postThenQuit('ONE.LHA');
    expect(await thread.waitForExit(0.03)).toBe(false);
    expect(await thread.waitForExit(2)).toBe(true);
    expect(thread.checkedCount).toBe(1);
  });

  it('is done at once when no check was started (bgChecking=FALSE, 15227)', async () => {
    expect(await new BackgroundFileCheck(async () => null).waitForExit(0.01)).toBe(true);
  });
});

describe('who gets a background check (express.e 17280, 18478)', () => {
  let board: string;
  let restore: () => void;
  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-wanted-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
    restore = () => spy.mockRestore();
    clearNodeTooltypeCache();
  });
  afterEach(() => { restore(); clearNodeTooltypeCache(); fs.rmSync(board, { recursive: true, force: true }); });

  const session = (over: Record<string, unknown>) => ({ nodeId: 1, user: { userFlags: 0 }, ...over }) as never;

  it('needs bgFileCheck AND (the caller\'s flag OR the node\'s FORCE_BGFILECHECK)', () => {
    expect(backgroundFileCheckWanted(session({ bgFileCheck: false, user: { userFlags: UserFlag.BGFILECHECK } }))).toBe(false);
    expect(backgroundFileCheckWanted(session({ bgFileCheck: true }))).toBe(false);
    expect(backgroundFileCheckWanted(session({ bgFileCheck: true, user: { userFlags: UserFlag.BGFILECHECK } }))).toBe(true);
    fs.writeFileSync(path.join(board, 'Node1.info'), 'FORCE_BGFILECHECK\n');
    clearNodeTooltypeCache();
    expect(backgroundFileCheckWanted(session({ bgFileCheck: true }))).toBe(true);
    expect(backgroundFileCheckWanted(session({ bgFileCheck: false }))).toBe(false);
  });

  it('a file is posted only when the thread is there and wanted (doBgCheck)', async () => {
    const check = jest.fn(async () => ({ bytes: 1 }));
    const thread = new BackgroundFileCheck(check);
    const s: any = session({ bgFileCheck: true, user: { userFlags: UserFlag.BGFILECHECK }, backgroundFileCheck: thread });
    doBgCheck(s, 'A.LHA');
    s.bgFileCheck = false;
    doBgCheck(s, 'B.LHA');
    const socket = { emit: jest.fn() };
    const done = await finishBackgroundFileCheck(socket, s);
    expect(check).toHaveBeenCalledTimes(1);
    expect(done).toEqual({ count: 1, bytes: 1 });
    expect(s.backgroundFileCheck).toBeUndefined();
  });

  it('says it is waiting only when the thread is still busy at BG_EXIT (17337)', async () => {
    const busy: any = session({ bgFileCheck: true, user: { userFlags: UserFlag.BGFILECHECK } });
    busy.backgroundFileCheck = new BackgroundFileCheck(async () => { await delay(30); return { bytes: 1 }; });
    busy.backgroundFileCheck.post('A');
    const socket = { emit: jest.fn() };
    await finishBackgroundFileCheck(socket, busy);
    expect(socket.emit).toHaveBeenCalledWith('ansi-output', 'Waiting for background filecheck to complete...\r\n\r\n');

    const idle: any = session({ bgFileCheck: true });
    idle.backgroundFileCheck = new BackgroundFileCheck(async () => null);
    const quiet = { emit: jest.fn() };
    await finishBackgroundFileCheck(quiet, idle);
    expect(quiet.emit).not.toHaveBeenCalled();
  });

  it('no thread: nothing to wait for, nothing filed', async () => {
    expect(await finishBackgroundFileCheck({ emit: jest.fn() }, session({}))).toEqual({ count: 0, bytes: 0 });
  });
});

describe('what a filed file earns the uploader (express.e 19626-19630, 19676-19686)', () => {
  const user = () => ({ uploads: 0, bytesUpload: 0, todaysBytesLimit: 1000 }) as any;
  const book = (u: any) => (units: number) => { u.uploads += 1; u.bytesUpload += units; };

  it('a passed file counts one upload and its bytes, and raises today\'s limit', async () => {
    const u = user();
    await creditCheckedUpload(u, { held: false, bytes: 500 }, book(u));
    expect(u).toMatchObject({ uploads: 1, bytesUpload: 500, todaysBytesLimit: 1500 });
  });

  it('a held file earns no upload and no bytes, but still raises today\'s limit', async () => {
    const u = user();
    await creditCheckedUpload(u, { held: true, bytes: 500 }, book(u));
    expect(u).toMatchObject({ uploads: 0, bytesUpload: 0, todaysBytesLimit: 1500 });
  });

  it('an unlimited caller (limit 0) gains nothing on the limit', async () => {
    const u = { ...user(), todaysBytesLimit: 0 };
    await creditCheckedUpload(u, { held: false, bytes: 500 }, book(u));
    expect(u.todaysBytesLimit).toBe(0);
    expect(u.uploads).toBe(1);
  });
});
