/**
 * "N available for uploading" and the 2 MB floor, driven through
 * `displayUploadInterface` - the function the U command runs.
 *
 * express.e:18989-19014 prints TWO numbers and gates on the second:
 *
 *     tFShi,tFSlo        := freeDiskSpace()          the total across drives
 *     fSUploadingHi,..   := rFreeSpace(playpen)      room where rz writes
 *     IF fSUploadingHi<2 -> myError(9)               'Not enough free space'
 *
 * On a single-filesystem web board those were the same disk, so this handler
 * collapsed them into one statfs. With a pool they are different again:
 * freeDiskSpace() is the bucket total - which is what the number always meant
 * - while the playpen is still the local disk rz truncates against.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayUploadInterface, setFileAreas } from '../../src/handlers/file/file.handler';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import type { StorageVolume } from '../../src/storage/volume-config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { config } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';
import { FakeBackend } from './fake-backend';

/* eslint-disable @typescript-eslint/no-explicit-any */

const tempDirs: string[] = [];
let restoreConfig: (() => void) | null = null;

interface Harness {
  socket: any;
  session: any;
  written: () => string;
}

function volume(driveNumber: number, kind: 'local' | 's3', quotaBytes?: number): VolumeState {
  const vol: StorageVolume =
    kind === 's3'
      ? { driveNumber, kind: 's3', path: `bucket${driveNumber}`, egress: 'FREE', volumeClass: 'FREE', quotaBytes }
      : { driveNumber, kind: 'local', path: `/drive${driveNumber}`, egress: 'FREE', volumeClass: 'FREE', quotaBytes };
  return {
    volume: vol,
    backend: new FakeBackend({ driveNumber }),
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
}

/**
 * One conference, one file area on a real local directory, and whatever pool
 * the test asked for. `storageVolume` undefined means the area is local, which
 * is what every area on a board without a bucket looks like.
 */
function harness(opts: { states?: VolumeState[]; storageVolume?: number } = {}): Harness {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-space-'));
  tempDirs.push(dataDir);
  const areaDir = path.join(dataDir, 'Conf1', 'Files');
  fs.mkdirSync(areaDir, { recursive: true });

  const original = config.get.bind(config);
  const spy = jest
    .spyOn(config, 'get')
    .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  restoreConfig = () => spy.mockRestore();

  setFileAreas([
    {
      id: 1,
      conferenceId: 1,
      dirNumber: 1,
      name: 'Conf1 - Dir 1',
      dlPath: areaDir,
      ulPath: areaDir,
      storageVolume: opts.storageVolume,
    },
  ]);

  if (opts.states) {
    const volumes = new VolumeSet(opts.states);
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-space-cache-'));
    tempDirs.push(cacheDir);
    const areas: RemoteArea[] = [
      { id: 1, conferenceId: 1, dirNumber: 1, path: areaDir, storageVolume: opts.storageVolume },
    ];
    const ctx: StorageContext = {
      volumes,
      cache: new FileCache({ cacheDir, volumes, maxBytes: 1024 * 1024 }),
      names: new NameIndexRegistry(volumes),
      areas,
    };
    setStorageContext(ctx);
  }

  const out: string[] = [];
  const socketRef: any = {
    id: `socket-space-${tempDirs.length}`,
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
    // ansi-buffer.util registers a disconnect flush the first time it sees a
    // socket.
    on: () => undefined,
  };
  return {
    socket: socketRef,
    session: {
      user: { id: 1, username: 'tester', slotNumber: 1 },
      currentConf: 1,
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
    },
    // Output is buffered for 16ms before it reaches the socket; the caller's
    // screen is what the buffer holds plus what has already gone out.
    written: () => {
      flushOutput(socketRef);
      return out.join('');
    },
  };
}

afterEach(() => {
  setStorageContext(null);
  setFileAreas([]);
  restoreConfig?.();
  restoreConfig = null;
});

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('the free-space figure a caller is shown', () => {
  it('is the pool total when the upload area lives in the pool', () => {
    const h = harness({
      states: [volume(2, 's3', 10 * 1024 ** 3), volume(3, 's3', 5 * 1024 ** 3)],
      storageVolume: 2,
    });

    displayUploadInterface(h.socket, h.session, '');

    expect(h.written()).toContain('15.0 GB available for uploading.');
  });

  it('says "unlimited" rather than "Infinity" for a bucket with no declared quota', () => {
    const h = harness({ states: [volume(2, 's3')], storageVolume: 2 });

    displayUploadInterface(h.socket, h.session, '');

    expect(h.written()).toContain('unlimited available for uploading.');
    expect(h.written()).not.toContain('Infinity');
    expect(h.written()).not.toContain('NaN');
    // Unmeasured room is still room: the upload is allowed to start.
    expect(h.session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
  });

  it('still reports the local disk on a board whose drives are all local', () => {
    // This board's own Drives.info: two LOCAL drives, no bucket. `states` is
    // truthy here, and a pool figure built from it would read 0 free and
    // refuse every upload.
    const h = harness({ states: [volume(1, 'local'), volume(2, 'local')] });

    displayUploadInterface(h.socket, h.session, '');

    expect(h.written()).not.toContain('0.0 MB available for uploading.');
    expect(h.written()).not.toContain('Not enough free space for uploading!');
    expect(h.session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
  });

  it('reports the local disk for a local area even when the board has a bucket', () => {
    // The bytes land on local disk, so the bucket's room is not this area's
    // room - and quoting it would hide a full disk from the floor below.
    const h = harness({ states: [volume(2, 's3', 10 * 1024 ** 3)] });

    displayUploadInterface(h.socket, h.session, '');

    expect(h.written()).not.toContain('10.0 GB available for uploading.');
    expect(h.session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
  });

  it('prints the playpen figure as the "at one time" half, not the pool total', () => {
    const h = harness({ states: [volume(2, 's3', 10 * 1024 ** 3)], storageVolume: 2 });

    displayUploadInterface(h.socket, h.session, '');

    const line = h.written().match(/(\S+ \S+) available for uploading\.\s+(\S+ \S+) at one time\./);
    expect(line).not.toBeNull();
    expect(line![1]).toBe('10.0 GB');
    expect(line![2]).not.toBe('10.0 GB');
  });
});

describe('the upload gate', () => {
  it('refuses before the transfer starts when the pool has no room left', () => {
    const h = harness({ states: [volume(2, 's3', 1024), volume(3, 's3', 1024)], storageVolume: 2 });

    displayUploadInterface(h.socket, h.session, '');

    // express.e:18996 myError(9)
    expect(h.written()).toContain('Not enough free space for uploading!');
    expect(h.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(h.session.tempData).toBeUndefined();
  });

  it('lets a healthy pooled area start the upload', () => {
    const h = harness({ states: [volume(2, 's3', 10 * 1024 ** 3)], storageVolume: 2 });

    displayUploadInterface(h.socket, h.session, '');

    expect(h.written()).not.toContain('Not enough free space for uploading!');
    expect(h.session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
  });
});
