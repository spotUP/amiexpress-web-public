/**
 * ONE reachability test: an FTP upload, through the board's own
 * `boardFtpDeps().acceptUpload` (what FtpSession's STOR calls), runs
 * express.e's ftpStartFileCheck / ftpWaitFileCheck flow (express.e:15205,
 * 15224; ftpd.e:1666-1686):
 *
 *  - the caller is told the file check is starting once the last byte is in;
 *  - the check - description, testFile in the node's own Work directory,
 *    filing, credit - runs on the background-file-check thread, which is
 *    waited for ten seconds at a time, a "please wait" for each;
 *  - a transfer that failed is never checked (ftpStartFileCheck `IF success`).
 *
 * Sentinel: testFile is held open by the test; the wait loop's `onChecking`
 * only fires while the thread is still inside it.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough, Readable } from 'stream';

import { getPlaypenDir } from '../../src/utils/bbs-paths.util';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('an FTP upload is checked on the background-file-check thread', () => {
  let root: string;
  let events: string[];
  let release: (() => void) | undefined;
  const testFileCalls: Array<{ file: string; workDir: string; options: any }> = [];

  async function load() {
    jest.resetModules();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-bg-'));
    events = [];
    testFileCalls.length = 0;
    jest.doMock('../../src/handlers/command-execution.handler', () => ({
      commandCache: { syscmd: new Map() },
    }));
    jest.doMock('../../src/utils/file-diz.util', () => ({
      extractAndReadDiz: jest.fn(async () => ['ARTPACK #7', 'twelve screens']),
    }));
    jest.doMock('../../src/utils/file-test.util', () => ({
      testFile: jest.fn(async (file: string, workDir: string, options: any) => {
        events.push('testFile');
        testFileCalls.push({ file, workDir, options });
        await new Promise<void>((resolve) => { release = resolve; });
        return 'success';
      }),
      TestResult: { SUCCESS: 'success', FAILURE: 'failure', NOT_TESTED: 'not_tested', NOT_ALLOWED: 'not_allowed' },
    }));
    jest.doMock('../../src/services/upload-filing.service', () => ({
      ...jest.requireActual('../../src/services/upload-filing.service'),
      areaForConference: jest.fn(async () => ({ id: 1, dlPath: 'Conf7/Files' })),
      fileUploadedFile: jest.fn(async () => {
        events.push('filed');
        return { orphaned: false, notices: [], status: 'active', duplicate: false };
      }),
    }));
    jest.doMock('../../src/database', () => ({
      db: { getUserById: async () => ({ slotNumber: 2 }), getConfigRepository: () => ({ getNodeConfig: () => ({}) }) },
    }));
    jest.doMock('../../src/config', () => ({
      config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
    }));
    return require('../../src/ftp/ftp-auth');
  }

  afterEach(() => {
    jest.useRealTimers();
    release?.();
    release = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const request = (user: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    filename: 'ARTPACK.LHA', nodeId: 3, conferenceId: 7, user, ...extra,
  });
  // The upload's first steps (mkdir, the write stream, the tagline read) are
  // real file I/O on libuv's thread pool. Spinning a fixed number of
  // setImmediate ticks does not wait for them - under load the 200 ticks ran
  // out before the I/O came back and the test failed, then leaked the still
  // running upload into the next test's event list. Wait on the real clock;
  // useFakeTimers replaces the global setTimeout, so the real one is kept.
  const realSetTimeout = setTimeout;
  const pause = (ms: number) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));
  async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 2000 && !condition(); i++) await pause(5);
    expect(condition()).toBe(true);
  }

  it('says the check has started, tests in Node3/Work, and says "please wait" for every ten seconds', async () => {
    const { boardFtpDeps, FTP_FILE_CHECK_WAIT_SECONDS } = await load();
    expect(FTP_FILE_CHECK_WAIT_SECONDS).toBe(10);
    // Only the timers the wait loop uses; the stream's own scheduling is real.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });

    const user: any = { id: 'u', username: 'Knut', uploads: 0, bytesUpload: 0, todaysBytesLimit: 0 };
    const accepted = boardFtpDeps().acceptUpload(
      request(user, {
        onReceived: () => events.push('received'),
        onChecking: () => events.push('wait'),
      }),
      Readable.from([Buffer.from('payload')]),
    );

    await until(() => events.includes('testFile'));
    // The caller was told before the check began, and the check is the thread's.
    expect(events).toEqual(['received', 'testFile']);
    expect(testFileCalls[0].workDir).toBe(path.join(root, 'Node3', 'Work'));
    expect(testFileCalls[0].options).toMatchObject({ nodeId: 3 });
    // No caller, so no FILECHECK door (express.e's bgChecking path).
    expect(testFileCalls[0].options.caller).toBeUndefined();

    await jest.advanceTimersByTimeAsync(10_000);
    expect(events).toEqual(['received', 'testFile', 'wait']);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(events).toEqual(['received', 'testFile', 'wait', 'wait']);

    release!();
    const outcome = await accepted;
    expect(events).toEqual(['received', 'testFile', 'wait', 'wait', 'filed']);
    expect(outcome).toMatchObject({ accepted: true, bytes: 7 });
    // doBackgroundCheck's credit: a passed, unheld file is one upload and its bytes.
    expect(user.uploads).toBe(1);
    expect(user.bytesUpload).toBe(7);
  });

  it('does not check, or file, a transfer that failed (ftpStartFileCheck IF success)', async () => {
    const { boardFtpDeps } = await load();
    const broken = new PassThrough();
    const accepted = boardFtpDeps().acceptUpload(request({ id: 'u', username: 'Knut' }), broken);
    // Once the board is reading (it makes the playpen first), the line drops.
    // The playpen file exists once the board's stream is open and piping.
    await until(() => fs.existsSync(path.join(getPlaypenDir(3, root), 'ARTPACK.LHA')));
    broken.write('half');
    broken.destroy(new Error('connection reset'));

    await expect(accepted).rejects.toThrow(/connection reset/);
    expect(events).toEqual([]);
  });
});
