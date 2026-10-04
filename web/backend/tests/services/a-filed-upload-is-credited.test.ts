/**
 * A filed upload is in the CallersLog the way express.e writes it, so Global
 * Last Callers credits it.
 *
 * GLCUpdater (utils/glc-updater.ts, GLCUpdater.e:691-714) counts an upload's
 * kbytes only from a summary whose PREVIOUS line carries `Uploading ` or
 * `Upload moved`, and lists the file from `\tUpload moved to <path>`; SAmiLog
 * sets its upload flag from `Uploading`. The board wrote the summary and
 * nothing before it, so no upload was ever credited (2026-10-04).
 *
 * Driven through fileUploadedFile - the one filing path for web, telnet and
 * FTP - and runPostUpload, the summary writer every menu transport shares; the
 * log is then read back with the real GLC parser.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    createFileEntry: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/storage/storage-context', () => ({ getStorageContext: () => null }));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/utils/upload-notify.util', () => ({
  ...jest.requireActual('../../src/utils/upload-notify.util'),
  doUploadNotify: jest.fn(async () => undefined),
}));

import { config } from '../../src/config';
import { fileUploadedFile } from '../../src/services/upload-filing.service';
import { runPostUpload } from '../../src/services/post-upload.service';
import { callersLogManager, SOCKET_CONNECT_STRING } from '../../src/services/CallersLogManager';
import { findCallStart, parseCalls } from '../../src/utils/glc-updater';
import { formatUploadingLine } from '../../src/utils/download-logging.util';

const NODE = 6;
const logoffMode = { ignoreLocal: true, ignoreSysop: true, ignoreSysopUser: false, processAll: false };

let root: string;
let spy: jest.SpyInstance;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'credited-'));
  fs.mkdirSync(path.join(root, 'Conf1', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(root, `Node${NODE}`, 'PlayPen'), { recursive: true });
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
});

function upload(filename: string, bytes: number, extra: Record<string, unknown> = {}) {
  const playpenPath = path.join(root, `Node${NODE}`, 'PlayPen', filename);
  fs.writeFileSync(playpenPath, Buffer.alloc(bytes, 0x41));
  return {
    playpenPath, filename, size: bytes, description: 'an upload',
    fileArea: { id: 1, dlPath: path.join(root, 'Conf1', 'Files') }, conferenceId: 1, nodeId: NODE,
    uploader: { username: 'uploader' }, initialStatus: 'active' as const, marker: 'N' as const,
    ...extra,
  };
}

function startCall(): void {
  callersLogManager.logLogin(NODE, {
    slotNumber: 42, name: 'uploader', connectString: SOCKET_CONNECT_STRING, location: 'Here', isNew: false,
  });
}

const logLines = () => fs.readFileSync(callersLogManager.logPathFor(NODE), 'latin1').split('\n');

test("express.e's `\\s[12]` is padded AND cut to twelve (%-12.12s)", () => {
  expect(formatUploadingLine('AYS1995.LHA', 277169)).toBe('\tUploading AYS1995.LHA  277169 bytes');
  expect(formatUploadingLine('A-VERY-LONG-NAME.LHA', 5)).toBe('\tUploading A-VERY-LONG- 5 bytes');
});

test('a menu upload writes logUDFile and the move, and GLCUpdater credits it', async () => {
  startCall();
  await fileUploadedFile(upload('MUSIC.LHA', 54321));
  await fileUploadedFile(upload('DEMO.DMS', 20480));
  const session: any = {
    nodeId: NODE, user: { id: 'u1', username: 'uploader', name: 'uploader', location: 'Here', slotNumber: 42 },
    tempData: {},
  };
  await runPostUpload({ emit: () => true }, session, {
    uploadStartTime: Date.now() - 9000, uploadedFiles: 2, uploadedBytes: 54321 + 20480,
  });
  callersLogManager.logLogoff(NODE, 'uploader');

  const lines = logLines();
  // express.e:9483-9486, then express.e:16221's move, once per file.
  expect(lines.slice(2, 6)).toEqual([
    '\tUploading MUSIC.LHA    54321 bytes',
    '\tUpload moved to BBS:Conf1/Files/MUSIC.LHA',
    '\tUploading DEMO.DMS     20480 bytes',
    '\tUpload moved to BBS:Conf1/Files/DEMO.DMS',
  ]);
  expect(lines[6]).toMatch(/^\t 2 file\(s\), 73k bytes, 0 minute\(s\)\. \d+ second\(s\), \d+ cps, 100% efficiency\.$/);

  const log = fs.readFileSync(callersLogManager.logPathFor(NODE));
  const [call] = parseCalls(log, findCallStart(log, false)!, logoffMode);
  expect(call.uploads).toBe(73);
  expect(call.upFiles).toEqual(['MUSIC.LHA', 'DEMO.DMS']);
  expect(call.actions[1]).toBe('U');
});

test('an FTP upload writes ftpUploadFileEnd\'s two lines, and GLCUpdater credits it', async () => {
  startCall();
  await fileUploadedFile(upload('FTPFILE.ZIP', 4096, { ftp: { seconds: 61.4, cps: 66 } }));
  callersLogManager.logLogoff(NODE, 'uploader');

  // express.e:15084-15088, then the move.
  expect(logLines().slice(2, 5)).toEqual([
    '\tUploading FTPFILE.ZIP 4096 bytes',
    '\t 1 file(s), 4k bytes, 1 minute(s). 1 second(s), 66 cps, N/A % efficiency.',
    '\tUpload moved to BBS:Conf1/Files/FTPFILE.ZIP',
  ]);
  const log = fs.readFileSync(callersLogManager.logPathFor(NODE));
  const [call] = parseCalls(log, findCallStart(log, false)!, logoffMode);
  expect(call.uploads).toBe(4);
  expect(call.upFiles).toEqual(['FTPFILE.ZIP']);
});
