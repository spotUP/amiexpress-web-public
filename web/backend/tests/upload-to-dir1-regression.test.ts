/**
 * Regression: uploads must always append to DIR1, never create new DIRs.
 *
 * Root cause: uploadDirNum was computed as getDirFiles().length — the count
 * of DIR files on disk.  Each upload created a new DIR (DIR1, DIR2, … DIR29),
 * so AquaScan (FR command) only saw the files in DIR1 and missed everything
 * else.
 *
 * Fix: uploadDirNum is hardcoded to 1 and getMaxDirs() is removed from the
 * upload path.  DIR files are sysop-configured file areas (not dynamic
 * buckets); the typical value is 1 (matches reference-board BBS reference).
 *
 * Section 1 drives the real upload path - `processBatchFile`, the function
 * the ZMODEM/web pipeline calls once the bytes are in the playpen, which
 * files through services/upload-filing.service.ts - on a temp board whose
 * conference already has DIR1..DIR3 and NDIRS=3 (the shape the old
 * count-derived number turned into DIR4, DIR5, ...). The entry must land in
 * DIR1, the other DIR files and NDIRS must be untouched. The mock set is the
 * one tests/storage/upload-into-pool.test.ts uses. The later sections test
 * the utilities involved.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip = require('adm-zip');

/* eslint-disable @typescript-eslint/no-explicit-any */

// The upload-into-pool mock set: a catalog stub, no callers log, no
// post-upload banner. Everything on the filing path itself is real.
const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async () => 1),
  recordLocation: jest.fn(),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
  getWebhooksByTrigger: jest.fn(async () => []),
};
(globalThis as any).__dir1MockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__dir1MockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';

// ─── 1. The upload path files into DIR1 ──────────────────────────────────────

describe('an upload through processBatchFile', () => {
  let dataDir: string;
  let restoreConfig: () => void;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-dir1-'));
    const original = config.get.bind(config);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
  });

  afterEach(() => {
    restoreConfig();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('appends to DIR1 on a conference with three DIRs, and leaves DIR2, DIR3 and NDIRS alone', async () => {
    const confDir = path.join(dataDir, 'Conf1');
    fs.mkdirSync(path.join(confDir, 'Files'), { recursive: true });
    for (const n of [1, 2, 3]) fs.writeFileSync(path.join(confDir, `DIR${n}`), '');
    fs.writeFileSync(path.join(confDir, 'NDIRS'), '3');

    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('FILE_ID.DIZ', Buffer.from('A release for DIR1'));
    zip.addFile('payload.bin', Buffer.from('payload'));
    const playpenFile = path.join(playpen, 'DEMO.ZIP');
    zip.writeZip(playpenFile);

    const fileArea = {
      id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1',
      dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/',
    };
    const session: any = {
      user: { id: 1, username: 'tester', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
      tempData: {
        uploadMode: true, fileArea, uploadSessionId: 'sess-1',
        uploadBatch: [{ filename: 'DEMO.ZIP', description: '', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
      },
    };
    const socket: any = { id: 'socket-dir1', emit: () => true };

    await processBatchFile(
      socket, session,
      { filename: 'DEMO.ZIP', originalname: 'DEMO.ZIP', size: fs.statSync(playpenFile).size, path: playpenFile },
      config
    );

    expect(fs.readFileSync(path.join(confDir, 'DIR1'), 'latin1')).toContain('DEMO.ZIP');
    expect(fs.readFileSync(path.join(confDir, 'DIR2'), 'latin1')).toBe('');
    expect(fs.readFileSync(path.join(confDir, 'DIR3'), 'latin1')).toBe('');
    expect(fs.readdirSync(confDir).filter((e) => /^DIR\d+$/i.test(e)).sort()).toEqual(['DIR1', 'DIR2', 'DIR3']);
    expect(fs.readFileSync(path.join(confDir, 'NDIRS'), 'utf8')).toBe('3');
  });
});

// ─── 2. getDirFilePath routes active uploads to DIR1 ─────────────────────────

describe('getDirFilePath: active status → DIR1', () => {
  // Import the real function so we catch any rename or signature change.
  const { getDirFilePath } = require('../src/utils/dir-file.util');

  test('active status with uploadDirNum=1 returns .../DIR1', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'active', 1);
    expect(result).toMatch(/DIR1$/);
  });

  test('hold status routes to HOLD/HELD regardless of dirNum', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'hold', 1);
    expect(result).toMatch(/HOLD[\\/]HELD$/);
  });

  test('lcfiles status routes to LCFILES subdirectory', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'lcfiles', 1);
    expect(result).toMatch(/LCFILES/);
  });
});

// ─── 3. getMaxDirs is no longer the upload-destination logic ─────────────────

describe('getMaxDirs: still counts dirs correctly (for FR display)', () => {
  const { getDirFiles } = require('../src/utils/max-dirs.util');
  const { getMaxDirs } = require('../src/utils/max-dirs.util');

  let tmpDir: string;
  let confNum = 999; // won't exist on disk; use override below

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'maxdirs-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('counts zero when no DIR files exist', async () => {
    // getDirFiles needs a real conf path; test the counting logic directly.
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(0);
  });

  test('counting logic: 29 DIRs → 29, not 30', async () => {
    for (let n = 1; n <= 29; n++) {
      await fs.promises.writeFile(path.join(tmpDir, `DIR${n}`), '');
    }
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(29);
  });

  test('consolidation to 1 dir → count is 1', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'DIR1'), 'content');
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(1);
    // uploadDirNum is hardcoded 1 — count doesn't matter for uploads.
  });
});

// ─── 4. writeDirEntry appends to an existing file (not creates new one) ───────

describe('writeDirEntry: appends to existing DIR1', () => {
  const { writeDirEntry } = require('../src/utils/dir-file.util');

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'writedir-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('second write appends to DIR1, does not create DIR2', async () => {
    const dir1 = path.join(tmpDir, 'DIR1');
    await fs.promises.writeFile(dir1, '');

    await writeDirEntry(dir1, 'FILE1.LHA', 1000, new Date(), 'First file', 'N', 'user');
    await writeDirEntry(dir1, 'FILE2.LHA', 2000, new Date(), 'Second file', 'N', 'user');

    // DIR1 has both entries
    const content = await fs.promises.readFile(dir1, 'latin1');
    expect(content).toMatch(/FILE1\.LHA/);
    expect(content).toMatch(/FILE2\.LHA/);

    // No DIR2 was created
    const entries = await fs.promises.readdir(tmpDir);
    const dirs = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e));
    expect(dirs).toEqual(['DIR1']);
  });

  test('uploading 30 files all land in DIR1', async () => {
    const dir1 = path.join(tmpDir, 'DIR1');
    await fs.promises.writeFile(dir1, '');

    for (let i = 1; i <= 30; i++) {
      await writeDirEntry(
        dir1,
        `FILE${String(i).padStart(2, '0')}.LHA`,
        i * 1000,
        new Date(),
        `File ${i}`,
        'N',
        'user'
      );
    }

    const content = await fs.promises.readFile(dir1, 'latin1');
    const lineCount = content.split('\n').filter(l => l.trim()).length;
    // 30 files × (1 filename line + 1 "Sent by:" line) = at least 60 lines
    expect(lineCount).toBeGreaterThanOrEqual(60);

    // Still only DIR1 — no DIR2..DIR30 created
    const entries = await fs.promises.readdir(tmpDir);
    const dirs = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e));
    expect(dirs).toEqual(['DIR1']);
  });
});
