/**
 * The `D` command driven through its real entry point, on a pooled area.
 *
 * The four call sites in beginDLF are the thing whose absence was the last
 * Critical finding, and unit tests around findFilesInConference cannot prove
 * they are wired: revert any one of them and those tests stay green. This
 * suite types the command instead - handleDownloadCommand, then the filespec
 * prompt, then LAST CHANCE - and reads what the caller would see.
 *
 * It also pins the two costs, which are behaviour and not detail: nothing is
 * fetched while the set is being LISTED, and the bytes are there by the time
 * the transfer starts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ZMODEM_MODULE = '../../src/handlers/commands/user-commands.handler';
const startZmodemDownload = jest.fn();
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  ...jest.requireActual('../../src/handlers/commands/user-commands.handler'),
  startZmodemDownload: (...args: unknown[]) => startZmodemDownload(...args),
}));

import { DownloadHandler } from '../../src/handlers/file/download.handler';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { config } from '../../src/config';
import { FileFlagManager } from '../../src/utils/file-flag.util';
import { FakeBackend } from './fake-backend';

interface Session {
  user: {
    id: number;
    username: string;
    securityFlags: string;
    secLibrary: number;
    slotNumber?: number;
  };
  currentConf: number;
  nodeId: number;
  subState?: unknown;
  tempData?: Record<string, unknown>;
  flaggedFiles?: { filename: string; confNum: number }[];
  flagManager?: FileFlagManager;
  connectionType?: string;
}

interface Harness {
  session: Session;
  socket: { emit: (event: string, payload: unknown) => void };
  written: () => string;
  clear: () => void;
  backend: FakeBackend;
  ctx: StorageContext;
  dataDir: string;
}

let restoreConfig: (() => void) | null = null;

function harness(): Harness {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-e2e-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });

  const original = config.get.bind(config);
  const spy = jest
    .spyOn(config, 'get')
    .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  restoreConfig = () => spy.mockRestore();

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
      cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-e2e-')),
      volumes,
      maxBytes: 1024 * 1024,
    }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(ctx);

  const out: string[] = [];
  return {
    session: {
      // 'T' at every ACS index: this caller may download, and may use wildcards.
      user: { id: 1, username: 'tester', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
    },
    socket: {
      emit: (event: string, payload: unknown) => {
        if (event === 'ansi-output') out.push(String(payload));
      },
    },
    written: () => out.join(''),
    clear: () => { out.length = 0; },
    backend,
    ctx,
    dataDir,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asHandlerArgs = (h: Harness): [any, any] => [h.socket as any, h.session as any];

afterEach(() => {
  setStorageContext(null);
  restoreConfig?.();
  restoreConfig = null;
  startZmodemDownload.mockClear();
});

describe('typing D on a pooled area', () => {
  it('queues the file and never says it is missing', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');

    expect(h.written()).toContain('DEMO.LHA');
    expect(h.written()).not.toContain('File not found');
    expect((h.session.tempData?.downloadFileList as unknown[]).length).toBe(1);
  });

  it('spends no egress while the set is only being listed', async () => {
    // The caller has not agreed to anything yet - LAST CHANCE has not even
    // been printed. Fetching here is the entire bill paid up front, and
    // refunded to nobody when the answer is "A".
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');

    expect(h.backend.gets).toBe(0);
  });

  it('lists a wildcard set without fetching any of it', async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) {
      await h.backend.put(`Conf1/Files/DEMO${i}.LHA`, Buffer.from(`payload-${i}`));
    }

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO*.LHA');

    expect((h.session.tempData?.downloadFileList as unknown[]).length).toBe(5);
    expect(h.backend.gets).toBe(0);
    expect(h.backend.lists).toBe(1);
  });

  it('prints the real size from the listing, not a zero', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');

    const [file] = h.session.tempData?.downloadFileList as { size: number }[];
    expect(file.size).toBe(7);
  });

  it('says the volume is unavailable, not that the file is missing', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    h.backend.down = true;

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');

    expect(h.written()).toContain('DRIVE.2');
    expect(h.written()).toContain('try again later');
    expect(h.written()).not.toContain('File not found');
  });

  it('still says a genuinely absent file is not found', async () => {
    const h = harness();

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'NOPE.LHA');

    expect(h.written()).toContain('File not found: NOPE.LHA');
    expect(h.written()).not.toContain('unavailable');
  });

  it('resolves a flagged pooled file instead of dropping it in silence', async () => {
    // F-then-D: the flagged file goes through the same walk, and a pooled one
    // used to vanish from the set without a word.
    const h = harness();
    await h.backend.put('Conf1/Files/FLAGGED.LHA', Buffer.from('flagged'));
    h.session.flaggedFiles = [{ filename: 'FLAGGED.LHA', confNum: 1 }];

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');

    expect((h.session.tempData?.downloadFileList as { name: string }[]).map(f => f.name)).toEqual([
      'FLAGGED.LHA',
    ]);
  });

  it('resolves a name typed at the filespec prompt', async () => {
    // The site a caller hits most: type D, get the prompt, type a name. It is
    // a different call site from the params one, in a different method.
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');
    h.clear();
    await DownloadHandler.handleFilenameInput(...asHandlerArgs(h), 'DEMO.LHA');

    expect((h.session.tempData?.downloadFileList as { name: string }[]).map(f => f.name)).toEqual([
      'DEMO.LHA',
    ]);
    expect(h.written()).not.toContain('File not found');
  });

  it('says the volume is unavailable at the filespec prompt, not that the file is missing', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');
    h.backend.down = true;
    h.clear();
    await DownloadHandler.handleFilenameInput(...asHandlerArgs(h), 'DEMO.LHA');

    expect(h.written()).toContain('DRIVE.2');
    expect(h.written()).toContain('try again later');
    expect(h.written()).not.toContain('File not found');
  });

  it('resolves a file flagged through the flag manager', async () => {
    // The other flag producer: FileFlagManager, not session.flaggedFiles.
    const h = harness();
    await h.backend.put('Conf1/Files/FLAGGED.LHA', Buffer.from('flagged'));
    const flags = new FileFlagManager(h.dataDir, 1, 1);
    flags.addFlag('FLAGGED.LHA', 1);
    h.session.flagManager = flags;

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');

    expect((h.session.tempData?.downloadFileList as { name: string }[]).map(f => f.name)).toEqual([
      'FLAGGED.LHA',
    ]);
  });

  it('reports the pooled outage for a flag-manager file too', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/FLAGGED.LHA', Buffer.from('flagged'));
    const flags = new FileFlagManager(h.dataDir, 1, 1);
    flags.addFlag('FLAGGED.LHA', 1);
    h.session.flagManager = flags;
    h.backend.down = true;

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');

    expect(h.written()).toContain('unavailable');
    expect(h.written()).not.toContain('File not found');
  });

  it('reports the pooled outage for a flagged file too', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/FLAGGED.LHA', Buffer.from('flagged'));
    h.session.flaggedFiles = [{ filename: 'FLAGGED.LHA', confNum: 1 }];
    h.backend.down = true;

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), '');

    expect(h.written()).toContain('unavailable');
    expect((h.session.tempData?.downloadFileList as unknown[]).length).toBe(0);
  });

  it('keeps the local half of a part-migrated conference downloadable while the bucket is down', async () => {
    const h = harness();
    fs.writeFileSync(path.join(h.dataDir, 'Conf1', 'Files', 'ONDISK.LHA'), 'on-disk');
    h.backend.down = true;

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'ONDISK.LHA');

    // Both truths, in one answer: the file is queued AND the pool is down.
    expect((h.session.tempData?.downloadFileList as { name: string }[]).map(f => f.name)).toEqual([
      'ONDISK.LHA',
    ]);
    expect(h.written()).toContain('unavailable');
    expect(h.written()).not.toContain('File not found');
  });
});

describe('the bytes arriving in time for the transfer', () => {
  async function confirmTransfer(h: Harness): Promise<void> {
    await DownloadHandler.handleFilenameInput(...asHandlerArgs(h), '');
    await DownloadHandler.handleConfirmInput(...asHandlerArgs(h), '\r');
  }

  it('fetches at send, and hands Zmodem a path with the real bytes', async () => {
    const h = harness();
    h.session.connectionType = 'telnet';
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');
    expect(h.backend.gets).toBe(0); // still nothing fetched at the prompt

    await confirmTransfer(h);

    expect(startZmodemDownload).toHaveBeenCalledTimes(1);
    const paths = startZmodemDownload.mock.calls[0][2] as string[];
    expect(paths).toHaveLength(1);
    expect(fs.readFileSync(paths[0], 'utf8')).toBe('payload');
    expect(h.backend.gets).toBe(1);
  });

  it('fetches again when the cache evicted the file at the prompt', async () => {
    const h = harness();
    h.session.connectionType = 'telnet';
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');
    await confirmTransfer(h);
    h.ctx.cache.evictTo(0);
    h.session.tempData = undefined;

    // A second D for the same file, with the cache emptied in between.
    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');
    await confirmTransfer(h);

    const paths = startZmodemDownload.mock.calls[1][2] as string[];
    expect(fs.readFileSync(paths[0], 'utf8')).toBe('payload');
  });

  it('does not start a transfer when the volume goes down between prompt and send', async () => {
    const h = harness();
    h.session.connectionType = 'telnet';
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await DownloadHandler.handleDownloadCommand(...asHandlerArgs(h), 'DEMO.LHA');
    h.backend.down = true;
    h.clear();
    await confirmTransfer(h);

    expect(startZmodemDownload).not.toHaveBeenCalled();
    expect(h.written()).toContain('unavailable');
    expect(h.written()).not.toContain('File not found');
  });
});
