/**
 * A POOLED DRIVE'S QUOTA COUNTS WHAT THE BUCKET HOLDS.
 *
 * The quota used to be seeded from the SQL catalogue (`file_entries
 * .storage_volume`), and a pooled file with no row - filed by another node,
 * put there by hand, or orphaned by a lost `recordLocation` - occupied the
 * bucket and was never counted: the drive reported room it did not have and
 * could overfill (db-disk audit 2026-10-04, §6 "Storage quota").
 *
 * Driven through `refreshStorageContext` with `measureVolumeBytes`, exactly as
 * `server/initialization.ts` calls it at boot and on the conference bus (the
 * boot-wiring suite proves production passes that seeder).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { measureVolumeBytes, refreshStorageContext, usedBytesMeasured } from '../../src/storage/index';
import { getStorageContext, setStorageContext } from '../../src/storage/storage-context';
import type { ObjectHead } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

const MB = 1024 * 1024;

function poolBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-bucket-'));
  applyTooltypes(path.join(root, 'Drives.info'), [
    ['DRIVE.1', 's3://bucket'],
    ['DRIVE.1.QUOTA', '10M'],
    ['DRIVE.1.KEYID', 'k'],
  ]);
  fs.mkdirSync(path.join(root, 'Storage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Storage', '1.key'), 'sekrit');
  return root;
}

/** A bucket whose listing can be held open, to model a slow provider. */
class SlowListingBackend extends FakeBackend {
  private release: (() => void) | null = null;
  hold = false;
  async list(prefix: string): Promise<ObjectHead[]> {
    if (this.hold) await new Promise<void>((resolve) => { this.release = resolve; });
    return super.list(prefix);
  }
  letGo(): void {
    this.hold = false;
    this.release?.();
  }
}

let warn: jest.SpyInstance;
let log: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  log.mockRestore();
  setStorageContext(null);
});

describe('a pooled drive quota counts what the bucket holds', () => {
  it('a bucket already holding 8 MB with no catalogue rows leaves 2 MB of a 10 MB quota', async () => {
    const root = poolBoard();
    const fake = new FakeBackend({ driveNumber: 1 });
    await fake.put('Conf1/Files/BIG.LHA', Buffer.alloc(5 * MB));
    await fake.put('Conf2/Files/OTHER.LHA', Buffer.alloc(3 * MB));

    await refreshStorageContext(root, [], { backendFactory: () => fake, usedBytesByVolume: measureVolumeBytes });
    const storage = getStorageContext()!;
    await usedBytesMeasured(storage);

    expect(storage.volumes.byNumber(1)!.usedBytes).toBe(8 * MB);
    expect(storage.volumes.freeBytesOn(1)).toBe(2 * MB);
  });

  it('a rebuild keeps the measured figure while its own listing is still in flight, then takes the new one', async () => {
    const root = poolBoard();
    const fake = new SlowListingBackend({ driveNumber: 1 });
    await fake.put('Conf1/Files/BIG.LHA', Buffer.alloc(8 * MB));

    await refreshStorageContext(root, [], { backendFactory: () => fake, usedBytesByVolume: measureVolumeBytes });
    await usedBytesMeasured(getStorageContext()!);
    expect(getStorageContext()!.volumes.byNumber(1)!.usedBytes).toBe(8 * MB);

    // An admin save rebuilds the pool while the provider is slow to list.
    fake.hold = true;
    await refreshStorageContext(root, [], { backendFactory: () => fake, usedBytesByVolume: measureVolumeBytes });
    const rebuilt = getStorageContext()!;
    // Not 0: a drive must not read as empty - QUOTA unenforced - meanwhile.
    expect(rebuilt.volumes.byNumber(1)!.usedBytes).toBe(8 * MB);

    // Another node filed 1 MB into the bucket; the listing now lands.
    await fake.put('Conf1/Files/MORE.LHA', Buffer.alloc(1 * MB));
    fake.letGo();
    await usedBytesMeasured(rebuilt);
    expect(rebuilt.volumes.byNumber(1)!.usedBytes).toBe(9 * MB);
  });

  it('a bucket that cannot be listed keeps the figure it had rather than reading as empty', async () => {
    const root = poolBoard();
    const fake = new FakeBackend({ driveNumber: 1 });
    await fake.put('Conf1/Files/BIG.LHA', Buffer.alloc(8 * MB));
    await refreshStorageContext(root, [], { backendFactory: () => fake, usedBytesByVolume: measureVolumeBytes });
    await usedBytesMeasured(getStorageContext()!);

    fake.down = true;
    await refreshStorageContext(root, [], { backendFactory: () => fake, usedBytesByVolume: measureVolumeBytes });
    await usedBytesMeasured(getStorageContext()!);
    expect(getStorageContext()!.volumes.byNumber(1)!.usedBytes).toBe(8 * MB);
  });
});
