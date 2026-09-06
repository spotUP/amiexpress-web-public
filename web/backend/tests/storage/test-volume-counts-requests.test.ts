/**
 * Task 12, carry-forward 4: `testVolume`'s connectivity probe spends one
 * real `list()` request against the provider, and the admin page's
 * "Requests This Month" figure must not silently pretend that request never
 * happened - see `drive-config.service.ts`'s `requestsThisMonth` docstring.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { config as appConfig } from '../../src/config';
import { DriveConfigService } from '../../src/services/config-services/drive-config.service';
import { setStorageContext } from '../../src/storage/storage-context';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { FakeBackend } from './fake-backend';

function boardWith(drivesInfoTooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testvolume-'));
  applyTooltypes(
    path.join(root, 'Drives.info'),
    drivesInfoTooltypes.map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq), line.slice(eq + 1)] as const;
    })
  );
  return root;
}

/** A config repository stub - testVolume never touches it. */
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

describe('DriveConfigService.testVolume request counting', () => {
  let root: string;
  let originalDataDir: string;

  beforeEach(() => {
    root = boardWith(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    fs.mkdirSync(path.join(root, 'Storage'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Storage', '1.key'), 'sekrit');
    originalDataDir = appConfig.get('dataDir');
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', root);
  });

  afterEach(() => {
    (appConfig as unknown as { set: (k: string, v: string) => void }).set?.('dataDir', originalDataDir);
    setStorageContext(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  function liveVolumesWith(fake: FakeBackend): VolumeSet {
    const state: VolumeState = {
      volume: { driveNumber: 1, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
      backend: fake,
      usedBytes: 0,
      requestsThisMonth: 0,
      egressBytesThisMonth: 0,
      degraded: false,
    };
    return new VolumeSet([state]);
  }

  it('charges a successful connectivity test against the live volume state', async () => {
    const fake = new FakeBackend({ driveNumber: 1 });
    const volumes = liveVolumesWith(fake);
    setStorageContext({ volumes, cache: null as never, names: new NameIndexRegistry(volumes), areas: [] });

    const service = new DriveConfigService({ getConfigRepository: () => emptyRepo() } as never, () => fake);
    const result = await service.testVolume(1);

    expect(result.reachable).toBe(true);
    expect(volumes.byNumber(1)?.requestsThisMonth).toBe(1);
  });

  it('still charges the request when the probe fails - the call was made either way', async () => {
    const fake = new FakeBackend({ driveNumber: 1 });
    fake.down = true;
    const volumes = liveVolumesWith(fake);
    setStorageContext({ volumes, cache: null as never, names: new NameIndexRegistry(volumes), areas: [] });

    const service = new DriveConfigService({ getConfigRepository: () => emptyRepo() } as never, () => fake);
    const result = await service.testVolume(1);

    expect(result.reachable).toBe(false);
    expect(volumes.byNumber(1)?.requestsThisMonth).toBe(1);
  });

  it('does not throw when no storage context is live - there is simply nothing to count against', async () => {
    setStorageContext(null);
    const fake = new FakeBackend({ driveNumber: 1 });

    const service = new DriveConfigService({ getConfigRepository: () => emptyRepo() } as never, () => fake);
    const result = await service.testVolume(1);

    expect(result.reachable).toBe(true);
  });
});
