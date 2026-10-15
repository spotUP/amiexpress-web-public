/**
 * A Drives.info write that failed must not be reported as a drive deleted.
 *
 * `deleteDrive` carried the comment "This throws on failure, so reaching the
 * next line means the drive is really gone from the file the board reads."
 * It did not throw: `writeDrivesInfoFile` wrapped its entire body in
 * `catch (error) { console.error(...) }`, so a read-only filesystem, a full
 * disk or a `parseVolumes` throw on a hand-edited Drives.info all returned
 * normally. The mirror row was already deleted, the audit log then recorded a
 * DELETE that never happened, and the sysop was told the drive was gone while
 * Drives.info still named it and every door still read it. Local-only boards
 * included - none of this is behind the bucket feature.
 *
 * The writer now propagates, so all three of its callers stop lying. The
 * failure injected here is the write itself (`applyTooltypes`), because that
 * is the step every one of those real-world causes ends at, and because
 * chmod-based read-only fixtures are a no-op for a test run as root.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockWriteFailure: { error: Error | null } = { error: null };

jest.mock('../../src/utils/info-file.util', () => {
  const actual = jest.requireActual('../../src/utils/info-file.util');
  return {
    ...actual,
    applyTooltypes: (...args: unknown[]) => {
      if (mockWriteFailure.error) throw mockWriteFailure.error;
      return (actual.applyTooltypes as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import { readTooltypeMap } from '../../src/utils/info-file.util';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { config as appConfig } from '../../src/config';

const CONTEXT = { userId: '1', username: 'sysop' } as never;

function writeDrivesInfo(root: string, entries: Record<string, string>): void {
  const text = Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'Drives.info'), text);
}

function readDrivesInfo(root: string): Map<string, string> {
  return readTooltypeMap(path.join(root, 'Drives.info'));
}

/** A config repository that knows nothing, which is the live case. */
function emptyRepo() {
  return {
    getAllDrives: () => [],
    getDriveById: () => null,
    getDriveByNumber: () => null,
    createDrive: () => 1,
    updateDrive: () => true,
    deleteDrive: jest.fn(() => true),
    logConfigChange: jest.fn(() => undefined),
  };
}

function makeService(repo: ReturnType<typeof emptyRepo>): DriveConfigService {
  const database = {
    getConfigRepository: () => repo,
    usedBytesByVolume: () => new Map<number, number>(),
  } as never;
  return new DriveConfigService(database);
}

describe('a Drives.info write that failed', () => {
  let root: string;
  let originalDataDir: string;

  beforeEach(() => {
    mockWriteFailure.error = null;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'drives-fail-'));
    originalDataDir = appConfig.get('dataDir');
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', root);
  });

  afterEach(() => {
    mockWriteFailure.error = null;
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', originalDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is not a deleted drive - deleteDrive fails instead of answering true', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });
    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({ id: 2, drive_number: 2, drive_path: 'DH2:Files', enabled: true })) as never;

    mockWriteFailure.error = new Error('EROFS: read-only file system, open Drives.info');

    await expect(service.deleteDrive(2, CONTEXT)).rejects.toThrow(/EROFS/);

    // The file the board and every door actually read still names the drive.
    expect(readDrivesInfo(root).get('DRIVE.2')).toBe('DH2:Files');
    // And nothing wrote a DELETE into the audit log for a deletion that did
    // not happen.
    expect(repo.logConfigChange).not.toHaveBeenCalled();
  });

  it('is not a saved drive either - updateDrive fails instead of returning the edit', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files' });
    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({ id: 1, drive_number: 1, drive_path: 'DH1:Files', enabled: true })) as never;

    mockWriteFailure.error = new Error('ENOSPC: no space left on device, open Drives.info');

    await expect(service.updateDrive(1, { drive_path: 'DH1:Moved' }, CONTEXT)).rejects.toThrow(/ENOSPC/);

    expect(readDrivesInfo(root).get('DRIVE.1')).toBe('DH1:Files');
    expect(repo.logConfigChange).not.toHaveBeenCalled();
  });

  it('still deletes the drive when the write succeeds', async () => {
    writeDrivesInfo(root, { 'DRIVE.1': 'DH1:Files', 'DRIVE.2': 'DH2:Files' });
    const repo = emptyRepo();
    const service = makeService(repo);
    repo.getDriveById = (() => ({ id: 2, drive_number: 2, drive_path: 'DH2:Files', enabled: true })) as never;

    await expect(service.deleteDrive(2, CONTEXT)).resolves.toBe(true);

    const written = readDrivesInfo(root);
    expect(written.get('DRIVE.2')).toBeUndefined();
    expect(written.get('DRIVE.1')).toBe('DH1:Files');
    expect(repo.logConfigChange).toHaveBeenCalledTimes(1);
  });
});
