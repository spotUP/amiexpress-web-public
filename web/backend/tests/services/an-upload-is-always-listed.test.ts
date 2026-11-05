/**
 * An upload that reaches the board's disk is always in a DIR listing.
 *
 * The filing moved the bytes, then wrote the catalogue row, then the DIR
 * entry - and a failed DIR write was only logged. So a catalogue insert that
 * threw stopped the listing being written, and a failed listing left the file
 * where nobody could see it: Conf3/Upload/lxt-ee4d.ZIP sat on the live board
 * from 2026-08-25, in no listing and no catalogue, until the sysop's
 * listing-vs-folder check found it (2026-09-29).
 *
 * The DIR entry is the board's record, so it is written straight after the
 * bytes; the catalogue (the web's mirror) follows and cannot block it; a
 * listing that cannot be written sends the file to HOLD with a HELD entry.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const createFileEntry = jest.fn();
jest.mock('../../src/database', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    createFileEntry: (...args: unknown[]) => createFileEntry(...args),
  },
}));
jest.mock('../../src/storage/storage-context', () => ({ getStorageContext: () => null }));
// A switch for the second test: the upload area's listing cannot be written.
let failActiveListing = false;
jest.mock('../../src/utils/dir-file.util', () => {
  const actual = jest.requireActual('../../src/utils/dir-file.util');
  return {
    ...actual,
    writeUploadToDirFile: async (...args: unknown[]) => {
      if (failActiveListing && args[7] === 'active') throw new Error('EACCES: DIR1');
      return (actual.writeUploadToDirFile as (...a: unknown[]) => Promise<void>)(...args);
    },
  };
});

import { config } from '../../src/config';
import { fileUploadedFile } from '../../src/services/upload-filing.service';

let root: string;
let spy: jest.SpyInstance;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filing-'));
  fs.mkdirSync(path.join(root, 'Conf1', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1', 'PlayPen'), { recursive: true });
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  createFileEntry.mockReset();
  failActiveListing = false;
  const { db } = require('../../src/database');
  (db.query as jest.Mock).mockImplementation(async () => ({ rows: [] }));
});

afterEach(() => {
  spy.mockRestore();
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function anUpload() {
  const playpenPath = path.join(root, 'Node1', 'PlayPen', 'LXT-TEST.ZIP');
  fs.writeFileSync(playpenPath, 'THE BYTES');
  return {
    playpenPath, filename: 'LXT-TEST.ZIP', size: 9, description: 'a real upload',
    fileArea: { id: 1 }, conferenceId: 1, nodeId: 1, uploader: { username: 'caller' },
    initialStatus: 'active' as const, marker: 'N' as const, addSentBy: false,
  };
}

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : '');

test('a catalogue insert that throws does not stop the DIR entry', async () => {
  createFileEntry.mockRejectedValue(new Error('SQLITE_BUSY'));
  await fileUploadedFile(anUpload());
  expect(read(path.join(root, 'Conf1', 'DIR1'))).toContain('LXT-TEST.ZIP');
});

test('a DIR entry that cannot be written sends the file to HOLD, listed in HELD', async () => {
  failActiveListing = true;
  const outcome = await fileUploadedFile(anUpload());

  expect(outcome.status).toBe('hold');
  expect(outcome.notices.map((n) => n.kind)).toContain('quarantined');
  expect(fs.existsSync(path.join(root, 'Conf1', 'HOLD', 'LXT-TEST.ZIP'))).toBe(true);
  expect(read(path.join(root, 'Conf1', 'HOLD', 'HELD'))).toContain('LXT-TEST.ZIP');
});

test('every filed upload is counted for the conference, whoever filed it (FTP included)', async () => {
  // express.e sysopULStats (18746-18790) after every move. Only the web/telnet
  // front end counted, so an FTP upload never reached NumULs - what an
  // auto-rejoin's "N new file(s) uploaded" reads (2026-10-04).
  await fileUploadedFile(anUpload());
  expect(read(path.join(root, 'Conf1', 'NumULs')).trim()).toBe('1');
});

describe('a duplicate is a file on the board, not a row in the catalogue', () => {
  // express.e:19356 runs checkForFile (18408-18447) on the conference's
  // directories. Filing asked file_entries instead, so a file the sysop had
  // deleted still had its row, and its re-upload went to HOLD as a duplicate.
  const REPO = path.resolve(__dirname, '../../../..');
  function conferenceFilesIn(dir: string): void {
    const { parseInfoFile, writeInfoFile, updateTooltype } = require('../../src/utils/info-file.util');
    const icon = path.join(root, 'Conf1.info');
    fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), 'DLPATH.1', path.join(root, dir), false));
  }

  test('a re-upload of a file the sysop deleted is filed, not held', async () => {
    conferenceFilesIn('Conf1/Files');
    const { db } = require('../../src/database');
    // The old row survives, for a file that lived on the board's disk (not in the pool).
    (db.query as jest.Mock).mockImplementation(async (sql: string) =>
      ({ rows: /storage_volume IS NOT NULL/.test(sql) ? [] : [{ id: 9, filename: 'LXT-TEST.ZIP' }] }));
    const outcome = await fileUploadedFile(anUpload());
    expect(outcome.status).toBe('active');
    expect(outcome.notices.map((n) => n.kind)).not.toContain('duplicate');
  });

  test('a file already in the conference goes to HOLD as a duplicate', async () => {
    conferenceFilesIn('Conf1/Files');
    fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'lxt-test.zip'), 'OLD BYTES');
    const outcome = await fileUploadedFile(anUpload());
    expect(outcome.status).toBe('hold');
    expect(outcome.notices.map((n) => n.kind)).toContain('duplicate');
  });
});
