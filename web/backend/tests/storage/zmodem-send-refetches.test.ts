/**
 * The paths handed to ZMODEM are fetched at SEND time, not at listing time.
 *
 * A caller sits at the download prompt after `D` has resolved the file, and
 * another node's fetch can evict the clean cached copy in that window.
 * `startZmodemDownload` existsSync-checks every path it is given, so a stale
 * path means "files not found" about a file the bucket is still holding.
 *
 * download-command-remote.test.ts used to pin this by matching the source of
 * download.handler.ts. The decision moved into file-delivery.ts - one place
 * for how files travel, shared with the batch path - and the pin went red
 * over a refactor that changed nothing it was protecting. This drives the
 * real function instead, so it follows the code wherever the decision lives.
 */

jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  startZmodemDownload: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deliverFilesToCaller } from '../../src/handlers/file/file-delivery';
import { startZmodemDownload } from '../../src/handlers/commands/user-commands.handler';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { rematerialise } from '../../src/storage/remote-download';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

const sent = startZmodemDownload as unknown as jest.Mock;

interface Fixture {
  ctx: StorageContext;
  backend: FakeBackend;
  dataDir: string;
}

function fixture(): Fixture {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zmodem-send-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });

  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  const areas: RemoteArea[] = [
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
  ];
  const ctx: StorageContext = {
    volumes,
    cache: new FileCache({
      cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'zmodem-cache-')),
      volumes,
      maxBytes: 1024 * 1024,
    }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(ctx);
  return { ctx, backend, dataDir };
}

/** A caller on telnet, which is the transport that receives by ZMODEM. */
function telnetSession(): any {
  return { connectionType: 'telnet', currentConf: 1 };
}

function socketSpy(): { socket: any; written: () => string } {
  const out: string[] = [];
  const socket: any = {
    emit: (event: string, payload: string) => { if (event === 'ansi-output') out.push(payload); },
  };
  return { socket, written: () => out.join('') };
}

afterEach(() => {
  setStorageContext(null);
  sent.mockClear();
});

describe('a pooled file on its way to a telnet caller', () => {
  it('is fetched again after the cache dropped it, so the path exists at send', async () => {
    const { ctx, backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const file = {
      name: 'DEMO.LHA',
      size: 7,
      confNum: 1,
      fullPath: path.join(dataDir, 'Conf1', 'Files', 'DEMO.LHA'),
      driveNumber: 2,
      objectKey: 'Conf1/Files/DEMO.LHA',
    };

    // The listing fetched it once; another node's fetch then evicted it.
    await rematerialise(file as any, ctx);
    ctx.cache.evictTo(0);
    expect(fs.existsSync(file.fullPath)).toBe(false);

    const { socket } = socketSpy();
    const route = await deliverFilesToCaller(socket, telnetSession(), [file as any]);

    expect(route).toBe('zmodem');
    expect(sent).toHaveBeenCalledTimes(1);

    const paths: string[] = sent.mock.calls[0][2];
    expect(paths).toHaveLength(1);
    expect(fs.existsSync(paths[0])).toBe(true);
    expect(fs.readFileSync(paths[0], 'utf8')).toBe('payload');
  });

  it('tells the caller and sends nothing when the volume cannot be reached', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    const { socket, written } = socketSpy();
    const route = await deliverFilesToCaller(socket, telnetSession(), [{
      name: 'DEMO.LHA',
      size: 7,
      confNum: 1,
      fullPath: path.join(dataDir, 'Conf1', 'Files', 'DEMO.LHA'),
      driveNumber: 2,
      objectKey: 'Conf1/Files/DEMO.LHA',
    } as any]);

    expect(route).toBe('refused');
    expect(sent).not.toHaveBeenCalled();
    expect(written()).toContain('DEMO.LHA');
  });
});
