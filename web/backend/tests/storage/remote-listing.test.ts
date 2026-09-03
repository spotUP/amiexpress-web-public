/**
 * Listing pooled areas: one row per name, and one warning per problem.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { listRemoteMatches, rematerialise } from '../../src/storage/remote-download';
import type { StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

const anyName = () => true;

function contextWith(areas: RemoteArea[], drives = [2]): { ctx: StorageContext; backends: FakeBackend[] } {
  const backends = drives.map(driveNumber => new FakeBackend({ driveNumber }));
  const states: VolumeState[] = backends.map(backend => ({
    volume: {
      driveNumber: backend.driveNumber,
      kind: 's3',
      path: 'bucket',
      egress: 'FREE',
      volumeClass: 'FREE',
    },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  }));
  const volumes = new VolumeSet(states);
  return {
    ctx: {
      volumes,
      cache: new FileCache({
        cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-list-')),
        volumes,
        maxBytes: 1024 * 1024,
      }),
      names: new NameIndexRegistry(volumes),
      areas,
    },
    backends,
  };
}

describe('listRemoteMatches', () => {
  it('returns metadata, not bytes', async () => {
    const { ctx, backends } = contextWith([
      { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    ]);
    await backends[0].put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const [found] = await listRemoteMatches(anyName, 1, ctx);

    expect(found.name).toBe('DEMO.LHA');
    expect(found.size).toBe(7);
    expect(found.key).toBe('Conf1/Files/DEMO.LHA');
    expect(backends[0].gets).toBe(0);
    expect(fs.existsSync(found.localPath)).toBe(false);
    // The send-time shape the download handler keeps: where the bytes go,
    // and which object they come from.
    const atSend = { fullPath: found.localPath, driveNumber: found.driveNumber, objectKey: found.key };
    expect(fs.readFileSync(await rematerialise(atSend, ctx), 'utf8')).toBe('payload');
  });

  it('delivers one file per NAME when two pooled areas both hold it', async () => {
    // Two entries meant two cache paths on telnet (the path dedupe cannot
    // collapse them, so the caller got the file twice) and one URL on web (the
    // browser fetched the first area's object twice and the second file was
    // never delivered at all).
    const { ctx, backends } = contextWith([
      { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
      { id: 2, conferenceId: 1, dirNumber: 2, path: 'BBS:Conf1/Extra/', storageVolume: 2 },
    ]);
    await backends[0].put('Conf1/Files/DEMO.LHA', Buffer.from('from-files'));
    await backends[0].put('Conf1/Extra/DEMO.LHA', Buffer.from('from-extra'));

    const found = await listRemoteMatches(anyName, 1, ctx);

    expect(found).toHaveLength(1);
    // Declaration order decides: dir 1 before dir 2, the same precedence a
    // prefix collision gets and the local walk gives its search directories.
    expect(found[0].key).toBe('Conf1/Files/DEMO.LHA');
  });

  it('still lists the differently-named files of the second area', async () => {
    const { ctx, backends } = contextWith([
      { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
      { id: 2, conferenceId: 1, dirNumber: 2, path: 'BBS:Conf1/Extra/', storageVolume: 2 },
    ]);
    await backends[0].put('Conf1/Files/A.LHA', Buffer.from('a'));
    await backends[0].put('Conf1/Extra/B.LHA', Buffer.from('b'));

    const found = await listRemoteMatches(anyName, 1, ctx);

    expect(found.map(f => f.name).sort()).toEqual(['A.LHA', 'B.LHA']);
  });
});

describe('the warning about an area that cannot be honoured', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  it('is one line, not one per download', async () => {
    const { ctx } = contextWith([
      { id: 1, conferenceId: 41, dirNumber: 1, path: 'BBS:Conf41/Files/', storageVolume: 91 },
    ]);

    await listRemoteMatches(anyName, 41, ctx);
    await listRemoteMatches(anyName, 41, ctx);

    expect(warn.mock.calls.filter(c => String(c[0]).includes('DRIVE.91'))).toHaveLength(1);
  });

  it('is said again after the window, so a re-broken Drives.info is not silent', async () => {
    // A Set that never forgets means a sysop who fixes the file and breaks it
    // again is told nothing the second time, for the life of the process.
    const { ctx } = contextWith([
      { id: 1, conferenceId: 42, dirNumber: 1, path: 'BBS:Conf42/Files/', storageVolume: 92 },
    ]);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T10:00:00Z'));
    await listRemoteMatches(anyName, 42, ctx);
    jest.setSystemTime(new Date('2026-09-03T10:06:00Z'));
    await listRemoteMatches(anyName, 42, ctx);

    expect(warn.mock.calls.filter(c => String(c[0]).includes('DRIVE.92'))).toHaveLength(2);
  });
});
