/**
 * The by-NAME download lookup has to carry the storage columns too.
 *
 * `server/file-socket-handlers.ts` finds a download by id through the
 * repository - a mapped FileEntry, `storageVolume` and all - but by name
 * through a raw `SELECT fe.*`, whose row is snake_case. `row.storageVolume` is
 * `undefined` there, and undefined is exactly what a genuinely local file
 * looks like: every by-name download of a pooled file would be quietly
 * classified as local and then not be found on disk.
 */
jest.mock('../../src/services/FileAreaManager', () => ({
  fileAreaManager: {
    addFileEntry: jest.fn(),
    updateFileEntry: jest.fn(),
    deleteFileEntry: jest.fn(),
    createAreaDirFile: jest.fn(),
  },
}));

import * as fs from 'fs';
import * as path from 'path';
import { FileRepository } from '../../src/database/file-repository';
import { remoteLocationFor } from '../../src/storage/remote-areas';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

const TEST_AREA_ID = 1;

describe('getFileEntryByName', () => {
  let repo: FileRepository;
  let rawDb: any;
  let conferenceId: number;
  let filename: string;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new FileRepository(rawDb);
    conferenceId = rawDb.prepare('SELECT conferenceid FROM file_areas WHERE id = ?').get(TEST_AREA_ID).conferenceid;
  }, 30000);

  beforeEach(async () => {
    rawDb.exec(`DELETE FROM file_entries WHERE uploader = 'byname'`);
    filename = `pooled_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.lha`;
    await repo.createFileEntry({
      filename,
      description: 'pooled file',
      size: 7,
      uploader: 'byname',
      uploadDate: new Date(),
      downloads: 0,
      areaId: TEST_AREA_ID,
      fileIdDiz: '',
      rating: 0,
      votes: 0,
      status: 'active',
      checked: 'N',
      comment: '',
      storageVolume: 2,
      objectKey: `Conf${conferenceId}/Files/${filename}`,
    });
  });

  it('finds the file by name within its conference', async () => {
    const found = await repo.getFileEntryByName(conferenceId, filename);
    expect(found?.filename).toBe(filename);
  });

  it('matches the name case-insensitively, the way the socket handler asks', async () => {
    const found = await repo.getFileEntryByName(conferenceId, filename.toUpperCase());
    expect(found?.filename).toBe(filename);
  });

  it('carries the storage columns in the mapped shape, not the raw one', async () => {
    const found = await repo.getFileEntryByName(conferenceId, filename);

    expect(found?.storageVolume).toBe(2);
    expect(found?.objectKey).toBe(`Conf${conferenceId}/Files/${filename}`);
    expect(remoteLocationFor(found!)).toEqual({
      driveNumber: 2,
      key: `Conf${conferenceId}/Files/${filename}`,
    });
  });

  it('is null for a name in another conference', async () => {
    const other = rawDb
      .prepare('SELECT id FROM conferences WHERE id != ? LIMIT 1')
      .get(conferenceId).id;
    expect(await repo.getFileEntryByName(other, filename)).toBeNull();
  });

  it('is null for a name nothing holds', async () => {
    expect(await repo.getFileEntryByName(conferenceId, 'no-such-file.lha')).toBeNull();
  });
});

describe('the download socket handler', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  it('looks a download up by name through the repository', () => {
    expect(source).toMatch(/db\.getFileEntryByName\(/);
  });

  it('no longer runs its own SELECT for it, which lost the storage columns', () => {
    expect(source).not.toMatch(/SELECT fe\.\* FROM file_entries/);
  });
});
