/**
 * One reachability test: scripts/remove-upload.ts undoes an upload that went
 * through the entry the web/Zmodem socket path uses (processBatchFile ->
 * testFile -> the real 68K checker -> fileUploadedFile), a FILED one and a
 * HELD one, and every store the upload touched is byte for byte what it was
 * before the upload (backups aside):
 *
 *   bytes, DIR1 / HOLD/HELD, Upload/FILES.BBS, Conf1/NumULs,
 *   SysopStats/NumULs_1 and NumULs_1HOLD, Conf1/Conf.DB uploadTracking,
 *   Conf1/ctop.data, user.data / user.keys / user.misc, and the SQL rows
 *   (file_entries, users, user_stats).
 *
 * Sentinels: the upload really moved each counter (the stores differ after
 * it), deleteEntry really ran, a dry run and a run with a caller online write
 * nothing, and a second run finds nothing to do.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import BetterSqlite3 from 'better-sqlite3';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
(globalThis as any).__removeUploadMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__removeUploadMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => false,
  runSysCommandInFlow: jest.fn(async () => -1),
}));

// Call-through: the sentinel is that the board's own FM D body ran for each removal.
jest.mock('../src/services/file-list.service', () => {
  const actual = jest.requireActual('../src/services/file-list.service');
  return { ...actual, deleteEntry: jest.fn(actual.deleteEntry) };
});

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';
import { clearFileCheckerCache } from '../src/utils/file-test.util';
import * as fileList from '../src/services/file-list.service';
import { FileRepository } from '../src/database/file-repository';
import { UserFileManager } from '../src/services/UserFileManager';
import { MessagePointerFileManager } from '../src/services/MessagePointerFileManager';
import { writeUploadToDirFile } from '../src/utils/dir-file.util';
import { writeToFilesBBS } from '../src/utils/files-bbs.util';
import { appendCtopRecord } from '../src/utils/ctop-updater.util';
import { removeUpload } from '../src/scripts/remove-upload';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECKER = path.join(REPO_ROOT, 'board', 'Doors', 'multi-check', 'mULTI-cHECK');
const ADVERT = path.join(REPO_ROOT, 'board', 'Doors', 'multi-check', 'uprough.txt');
const ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.lha');
const LHA = path.join(REPO_ROOT, 'board', 'C', 'LhA');
const runnable = [CHECKER, ADVERT, ARCHIVE, LHA].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

describeMaybe('remove-upload undoes an upload in every store it touched', () => {
  let dataDir: string;
  let dbPath: string;
  let sql: BetterSqlite3.Database;
  let restoreConfig: () => void;
  const savedRamDir = process.env.RAM_DIR;
  const logged: string[] = [];
  /** The size each upload arrived with: what the board lists, counts and credits. */
  const received: Record<string, number> = {};

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-upload-'));
    process.env.RAM_DIR = path.join(dataDir, 'ram');
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
    clearFileCheckerCache();
    logged.length = 0;

    // The board: the shipped checker, archiver and icon.
    const confDir = path.join(dataDir, 'Conf1');
    fs.mkdirSync(path.join(confDir, 'Files'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'C'));
    fs.copyFileSync(LHA, path.join(dataDir, 'C', 'LhA'));
    fs.mkdirSync(path.join(dataDir, 'Doors', 'multi-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(dataDir, 'Doors', 'multi-check', 'mULTI-cHECK'));
    fs.copyFileSync(ADVERT, path.join(dataDir, 'Doors', 'multi-check', 'uprough.txt'));
    fs.mkdirSync(path.join(dataDir, 'FCheck'));
    fs.copyFileSync(path.join(REPO_ROOT, 'board', 'FCheck', 'LHA.info'), path.join(dataDir, 'FCheck', 'LHA.info'));
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(playpen, 'GOOD.LHA'));
    const bad = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) bad[i] ^= 0x5a;
    fs.writeFileSync(path.join(playpen, 'BAD.LHA'), bad);

    // What the board already held before the upload: one earlier filed file,
    // one earlier held file, their FILES.BBS and ctop records, counters, and
    // two accounts with their Conf.DB records.
    const before = new Date('2026-01-02T03:04:05Z');
    await writeUploadToDirFile('OLD.LHA', 1234, before, 'an earlier upload', 'P', 'spot', confDir, 'active', 1, false);
    await writeUploadToDirFile('OLDHELD.LHA', 999, before, 'an earlier held upload', 'F', 'spot', confDir, 'hold', 1, false);
    await writeToFilesBBS(confDir, 'OLD.LHA', 1234, before, 'an earlier upload', 'P', 'spot', false, 'Upload');
    await appendCtopRecord(confDir, 'spot', 'Oslo', 1234);
    fs.writeFileSync(path.join(confDir, 'NumULs'), '3\n');
    fs.mkdirSync(path.join(dataDir, 'SysopStats'));
    fs.writeFileSync(path.join(dataDir, 'SysopStats', 'NumULs_1'), '3\n');
    fs.writeFileSync(path.join(dataDir, 'SysopStats', 'NumULs_1HOLD'), '2\n');

    const ufm = new UserFileManager(dataDir);
    const account = (username: string, slot: number, uploads: number, bytes: number) => ({
      id: `id-${username}`, username, realname: 'Real Name', location: 'Oslo', phone: '000',
      secLevel: 30, slotNumber: slot, uploads, downloads: 0, bytesUpload: bytes, bytesDownload: 0,
      timeTotal: 0, timeLimit: 60, timeUsed: 0, calls: 1, callsToday: 1, expert: false,
      ansi: true, linesPerScreen: 23, confAccess: 'XXXXXXXXXX',
      created: new Date('2026-01-01T00:00:00Z'), updated: new Date('2026-01-01T00:00:00Z'),
      lastLogin: new Date('2026-01-01T00:00:00Z'),
    } as any);
    ufm.writeUserFiles(account('spot', 1, 5, 1000), 1);
    ufm.writeUserFiles(account('other', 2, 0, 0), 2);
    const mpf = new MessagePointerFileManager(dataDir);
    mpf.patchRecord(1, 1, { uploadTracking: 3 });
    mpf.patchRecord(1, 2, { uploadTracking: 3 });

    // The SQL file: the tables the script and the filing read.
    dbPath = path.join(dataDir, 'amiexpress.db');
    sql = new BetterSqlite3(dbPath);
    sql.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, slotnumber INTEGER, uploads INTEGER, bytesupload INTEGER);
      CREATE TABLE user_stats (user_id TEXT PRIMARY KEY, bytes_uploaded INTEGER, files_uploaded INTEGER);
      CREATE TABLE file_areas (id INTEGER PRIMARY KEY, conferenceid INTEGER);
      CREATE TABLE file_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, description TEXT, size INTEGER NOT NULL,
        uploader TEXT NOT NULL, uploaddate INTEGER, downloads INTEGER, areaid INTEGER NOT NULL, fileiddiz TEXT,
        rating REAL, votes INTEGER, status TEXT, checked TEXT, comment TEXT, storage_volume INTEGER, object_key TEXT,
        UNIQUE(filename, areaid));
      CREATE TABLE node_sessions (id TEXT PRIMARY KEY, nodeid INTEGER, status TEXT);
      INSERT INTO file_areas VALUES (1, 1);
      INSERT INTO users VALUES ('id-spot', 'spot', 1, 5, 1000), ('id-other', 'other', 2, 0, 0);
      INSERT INTO user_stats VALUES ('id-spot', 1000, 5);
    `);
    const repo = new FileRepository(sql);
    (mockDb.createFileEntry as jest.Mock).mockImplementation((entry: any) => repo.createFileEntry(entry));
    await repo.createFileEntry({
      filename: 'OLD.LHA', description: 'an earlier upload', size: 1234, uploader: 'spot', uploadDate: before,
      downloads: 0, areaId: 1, status: 'active', checked: 'P',
    } as any);
  });

  afterEach(() => {
    restoreConfig();
    clearFileCheckerCache();
    sql.close();
    if (savedRamDir === undefined) delete process.env.RAM_DIR;
    else process.env.RAM_DIR = savedRamDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  async function upload(filename: string): Promise<void> {
    const playpenFile = path.join(dataDir, 'Node1', 'Playpen', filename);
    received[filename] = fs.statSync(playpenFile).size;
    const session: any = {
      user: { id: 1, username: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
      subState: 'upload_in_progress',
      tempData: {
        uploadMode: true,
        fileArea: { id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/' },
        uploadSessionId: 'sess-1',
        uploadBatch: [{ filename, description: '', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
      },
    };
    await processBatchFile(
      { id: 'socket-rm', emit: () => true } as any,
      session,
      { filename, originalname: filename, size: fs.statSync(playpenFile).size, path: playpenFile },
      config,
    );
  }

  /** Every store the upload can touch, as bytes; backups and .bak copies are not stores. */
  function snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    const confDir = path.join(dataDir, 'Conf1');
    const stores = [
      'Conf1/DIR1', 'Conf1/HOLD/HELD', 'Conf1/Upload/FILES.BBS', 'Conf1/NumULs', 'Conf1/ctop.data', 'Conf1/Conf.DB',
      'SysopStats/NumULs_1', 'SysopStats/NumULs_1HOLD', 'user.data', 'user.keys', 'user.misc',
    ];
    for (const rel of stores) {
      const file = path.join(dataDir, rel);
      out[rel] = fs.existsSync(file) ? fs.readFileSync(file).toString('latin1') : '(absent)';
    }
    const names = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => !/\.(backup|bak)$/i.test(n)).sort().join(',') : '(absent)');
    out['Conf1/Files (names)'] = names(path.join(confDir, 'Files'));
    out['Conf1/HOLD (names)'] = names(path.join(confDir, 'HOLD'));
    out['Conf1/Upload (names)'] = names(path.join(confDir, 'Upload'));
    out.sql = JSON.stringify({
      file_entries: sql.prepare('SELECT filename, size, uploader, status FROM file_entries ORDER BY filename').all(),
      users: sql.prepare('SELECT * FROM users ORDER BY id').all(),
      user_stats: sql.prepare('SELECT * FROM user_stats ORDER BY user_id').all(),
    });
    return out;
  }

  /** Stand in for what the callers' logoff and auto-rejoin write after an upload. */
  function afterTheCallersLogOff(files: string[]): void {
    const ufm = new UserFileManager(dataDir);
    const mpf = new MessagePointerFileManager(dataDir);
    for (const file of files) {
      const size = received[file];
      const now = sql.prepare("SELECT uploads, bytesupload FROM users WHERE id = 'id-spot'").get() as any;
      sql.prepare("UPDATE users SET uploads = ?, bytesupload = ? WHERE id = 'id-spot'").run(now.uploads + 1, now.bytesupload + size);
      sql.prepare("UPDATE user_stats SET files_uploaded = files_uploaded + 1, bytes_uploaded = bytes_uploaded + ? WHERE user_id = 'id-spot'").run(size);
      const disk = ufm.readUserBySlot(1)!;
      ufm.updateUserDataFile({ uploads: disk.uploads + 1, bytesUpload: disk.bytesUpload + size }, 1);
    }
    // 'other' rejoined and was told about the new file: tracking == NumULs.
    const num = parseInt(fs.readFileSync(path.join(dataDir, 'Conf1', 'NumULs'), 'utf8').trim(), 10);
    mpf.patchRecord(1, 2, { uploadTracking: num });
    mpf.patchRecord(1, 1, { uploadTracking: num });
  }

  const run = (file: string, extra: Partial<Parameters<typeof removeUpload>[0]> = {}) =>
    removeUpload({
      conf: 1, file, uploader: 'spot', dryRun: false, force: false, bbsRoot: dataDir, dbPath,
      stamp: '20261012', log: (line) => logged.push(line), ...extra,
    });

  test('a filed and a held upload are removed from every store, byte for byte, once', async () => {
    const preUpload = snapshot();

    await upload('GOOD.LHA');
    await upload('BAD.LHA');
    afterTheCallersLogOff(['GOOD.LHA', 'BAD.LHA']);
    const postUpload = snapshot();

    // Sentinel: the upload moved every store the script has to put back.
    expect(fs.existsSync(path.join(dataDir, 'Conf1', 'Files', 'GOOD.LHA'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'Conf1', 'HOLD', 'BAD.LHA'))).toBe(true);
    for (const store of ['Conf1/DIR1', 'Conf1/HOLD/HELD', 'Conf1/Upload/FILES.BBS', 'Conf1/NumULs', 'Conf1/ctop.data',
      'Conf1/Conf.DB', 'SysopStats/NumULs_1', 'SysopStats/NumULs_1HOLD', 'user.data', 'user.misc', 'sql']) {
      expect({ store, same: postUpload[store] === preUpload[store] }).toEqual({ store, same: false });
    }

    const removed = fileList.deleteEntry as unknown as jest.Mock;

    // A caller online: refused, nothing written.
    sql.prepare("INSERT INTO node_sessions VALUES ('s1', 1, 'online')").run();
    await expect(run('GOOD.LHA')).resolves.toBe('refused');
    expect(logged.join('\n')).toMatch(/Callers are online/);
    sql.prepare("DELETE FROM node_sessions").run();
    expect(removed).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(postUpload);

    // A dry run says what it would do and writes nothing.
    logged.length = 0;
    await expect(run('GOOD.LHA', { dryRun: true })).resolves.toBe('dry-run');
    expect(logged.join('\n')).toMatch(/NumULs: 4 -> 3/);
    expect(removed).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(postUpload);

    // The real runs.
    logged.length = 0;
    await expect(run('GOOD.LHA')).resolves.toBe('removed');
    await expect(run('BAD.LHA')).resolves.toBe('removed');
    expect(removed).toHaveBeenCalledTimes(2);
    const report = logged.join('\n');
    expect(report).toMatch(/Conf1[\\/]NumULs: 4 -> 3/);
    expect(report).toMatch(/NumULs_1: 4 -> 3/);
    expect(report).toMatch(/NumULs_1HOLD: 3 -> 2/);
    expect(report).toMatch(/slot 2 4 -> 3/);

    expect(snapshot()).toEqual(preUpload);

    // Backups: every written file kept its pre-removal copy under the named suffix.
    expect(fs.existsSync(path.join(dataDir, 'Conf1', 'NumULs.remove-GOOD.LHA-20261012.backup'))).toBe(true);
    expect(fs.readFileSync(path.join(dataDir, 'Conf1', 'NumULs.remove-GOOD.LHA-20261012.backup'), 'utf8')).toBe('4\n');
    // The upload's bytes are backed up outside every file area, beside the SQL backup.
    expect(fs.existsSync(path.join(dataDir, 'Conf1', 'Files', 'GOOD.LHA.remove-GOOD.LHA-20261012.backup'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(dbPath), 'remove-upload-backups', 'GOOD.LHA-20261012', 'Conf1', 'Files', 'GOOD.LHA'))).toBe(true);
    expect(fs.existsSync(`${dbPath}.remove-BAD.LHA-20261012.backup`)).toBe(true);

    // Idempotent: the file is in no listing now, so nothing is counted twice.
    logged.length = 0;
    await expect(run('GOOD.LHA')).resolves.toBe('nothing-to-do');
    await expect(run('BAD.LHA')).resolves.toBe('nothing-to-do');
    expect(snapshot()).toEqual(preUpload);
  }, 240_000);
});
