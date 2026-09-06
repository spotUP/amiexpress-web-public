/**
 * Whole-branch review finding 6: `pooledUploadArea` matched on
 * `candidate.id === area.id`, but `storage.areas` is built once by
 * `server/initialization.ts` from a conference scan
 * (`loadFileAreasFromDisk` assigns `id` POSITIONALLY, by array index) and
 * rebuilt independently by `DriveConfigService.refreshLiveStorage` from its
 * own, separately-derived list. The two scans have no reason to agree on
 * array position, only on the tooltype identity - conference number and
 * directory number. Any divergence silently lands an upload on local disk
 * where no reader looks, because `usableAreasFor`'s pooled answer is
 * resolved by a stale `id`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pooledUploadArea, poolSpaceFor, type UploadAreaRef } from '../../src/storage/remote-upload';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import type { StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

const tempDirs: string[] = [];

function contextWith(areas: RemoteArea[]): StorageContext {
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 10 * 1024 ** 3 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-upload-area-'));
  tempDirs.push(cacheDir);
  return {
    volumes,
    cache: new FileCache({ cacheDir, volumes, maxBytes: 1024 * 1024 }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('pooledUploadArea matches on stable identity, not a positional id', () => {
  it('finds the pooled area by conferenceId + dirNumber even when the ids from two independent scans disagree', () => {
    // storage.areas as DriveConfigService's independently-derived scan built
    // it - this area happened to land at array index 6, so its id is 7.
    const storageAreas: RemoteArea[] = [
      { id: 7, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    ];
    // The uploader's own scan (initialization.ts's fileAreas, or whatever
    // built the FileArea object the upload handler holds) is a SEPARATE
    // array with no reason to agree on position - conferenceId/dirNumber are
    // the only identity that means anything across the two.
    const uploadRef: UploadAreaRef = { conferenceId: 1, dirNumber: 1 };

    const found = pooledUploadArea(uploadRef, contextWith(storageAreas));

    expect(found).not.toBeNull();
    expect(found!.storageVolume).toBe(2);
  });

  it('poolSpaceFor resolves too, through the same matcher', () => {
    const storageAreas: RemoteArea[] = [
      { id: 99, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    ];
    const uploadRef: UploadAreaRef = { conferenceId: 1, dirNumber: 1 };

    const space = poolSpaceFor(uploadRef, contextWith(storageAreas));

    expect(space).not.toBeNull();
    expect(space!.driveNumber).toBe(2);
  });

  it('still answers null (local disk) for a genuinely different directory', () => {
    const storageAreas: RemoteArea[] = [
      { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    ];
    const uploadRef: UploadAreaRef = { conferenceId: 1, dirNumber: 2 };

    expect(pooledUploadArea(uploadRef, contextWith(storageAreas))).toBeNull();
  });

  it('answers null with no storage context at all', () => {
    expect(pooledUploadArea({ conferenceId: 1, dirNumber: 1 }, null)).toBeNull();
  });
});
