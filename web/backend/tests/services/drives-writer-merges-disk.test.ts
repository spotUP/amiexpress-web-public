/**
 * Saving one drive must not delete the drives that exist only on disk.
 *
 * Drives.info is read from disk and used to be rewritten from the `drives`
 * TABLE - the same asymmetry that erased screen types, computer types and
 * transfer protocols. With a stale or empty table, saving one drive wiped
 * every other one, and the page shows what is on disk, so it looked right
 * until the next read.
 *
 * The old writer also rebuilt the tooltype map from nothing, so any key in
 * Drives.info that was not a DRIVE.n went with it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InfoFileParser } from '../../src/services/info-file-parser';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { config as appConfig } from '../../src/config';

function writeDrivesInfo(root: string, entries: Record<string, string>): void {
  const parser = new InfoFileParser();
  const map = new Map(Object.entries(entries));
  fs.writeFileSync(path.join(root, 'Drives.info'), parser.write(map));
}

function readDrivesInfo(root: string): Map<string, string> {
  const parsed = new InfoFileParser().parse(fs.readFileSync(path.join(root, 'Drives.info')));
  const out = new Map<string, string>();
  for (const [key, value] of parsed.toolTypes.entries()) out.set(key.toUpperCase(), value);
  return out;
}

/** A config repository that knows nothing, which is the live case. */
function emptyRepo() {
  return {
    getAllDrives: () => [],
    getDriveById: () => null,
    getDriveByNumber: () => null,
    createDrive: () => 1,
    updateDrive: () => true,
    deleteDrive: () => true,
    logConfigChange: () => undefined,
  };
}

function makeService(repo: ReturnType<typeof emptyRepo>): DriveConfigService {
  const database = { getConfigRepository: () => repo } as never;
  return new DriveConfigService(database);
}

describe('Drives.info writer', () => {
  let root: string;
  let originalDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'drives-'));
    originalDataDir = appConfig.get('dataDir');
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', root);
  });

  afterEach(() => {
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', originalDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads the drives that are on disk', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });

    const drives = await makeService(emptyRepo()).getAllDrives();

    expect(drives.map(d => d.drive_path)).toEqual(['DH1:Files', 'DH2:Files']);
  });

  it('keeps the other drives when the database knows nothing', async () => {
    // The live shape: entries on disk, an empty table.
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files', 'DRIVE.3': 'DH3:Files' });

    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({
      id: 2,
      drive_number: 2,
      drive_path: 'DH2:Changed',
      enabled: true,
    })) as never;

    await service.updateDrive(2, { drive_path: 'DH2:Changed' }, { userId: '1', username: 'sysop' } as never);

    const written = readDrivesInfo(root);
    expect(written.get('DRIVE.1')).toBe('DH1:Files');
    expect(written.get('DRIVE.2')).toBe('DH2:Changed');
    expect(written.get('DRIVE.3')).toBe('DH3:Files');
  });

  it('keeps tooltypes it does not own', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', SOMETHING_ELSE: 'keep me' });

    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({ id: 1, drive_number: 1, drive_path: 'DH1:Moved', enabled: true })) as never;

    await service.updateDrive(1, { drive_path: 'DH1:Moved' }, { userId: '1', username: 'sysop' } as never);

    expect(readDrivesInfo(root).get('SOMETHING_ELSE')).toBe('keep me');
  });

  it('removes only the drive that was deleted', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });

    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({ id: 2, drive_number: 2, drive_path: 'DH2:Files', enabled: true })) as never;

    await service.deleteDrive(2, { userId: '1', username: 'sysop' } as never);

    const written = readDrivesInfo(root);
    expect(written.get('DRIVE.1')).toBe('DH1:Files');
    expect(written.has('DRIVE.2')).toBe(false);
  });
});
