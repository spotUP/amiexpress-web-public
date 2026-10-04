/**
 * A local DRIVE.n in the drives API says whether it names a real volume here.
 *
 * The live board's Drives.info carried DRIVE.1=DH1: and DRIVE.2=DH2: over from
 * the original Amiga, and the admin listed both as configured drives on a
 * Linux host that has neither. `GET /api/config/drives` is
 * `DriveConfigService.getAllDrives()` (config-routes.ts); a local entry now
 * carries the host directory it resolves to and that disk's free space, or
 * `resolvedPath: null` when it names nothing on this host.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { config as appConfig } from '../../src/config';

function makeService(): DriveConfigService {
  const repo = {
    getAllDrives: () => [],
    getDriveById: () => null,
    getDriveByNumber: () => null,
  };
  const database = {
    getConfigRepository: () => repo,
    usedBytesByVolume: () => new Map<number, number>(),
  } as never;
  return new DriveConfigService(database);
}

describe('local drives in the drives API', () => {
  let root: string;
  let restore: () => void;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'drives-local-'));
    const original = appConfig.get.bind(appConfig);
    const spy = jest
      .spyOn(appConfig, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
    restore = () => spy.mockRestore();
  });

  afterEach(() => {
    restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('flags an Amiga volume this host does not have instead of listing it as a working drive', async () => {
    applyTooltypes(path.join(root, 'Drives.info'), [['DRIVE.1', 'BBS:'], ['DRIVE.2', 'DH1:']]);

    const drives = await makeService().getAllDrives();
    const byNumber = new Map(drives.map((d) => [d.drive_number, d]));

    expect(byNumber.get(1)?.resolvedPath).toBe(path.resolve(root));
    expect(byNumber.get(1)?.freeBytes).toBeGreaterThan(0);
    expect(byNumber.get(2)?.resolvedPath).toBeNull();
    expect(byNumber.get(2)?.freeBytes).toBeUndefined();
  });

  it('flags a folder that is not there, and resolves one that is', async () => {
    const real = path.join(root, 'Files');
    fs.mkdirSync(real);
    applyTooltypes(path.join(root, 'Drives.info'), [
      ['DRIVE.1', real],
      ['DRIVE.2', path.join(root, 'gone')],
    ]);

    const drives = await makeService().getAllDrives();

    expect(drives.map((d) => d.resolvedPath)).toEqual([real, null]);
  });
});
