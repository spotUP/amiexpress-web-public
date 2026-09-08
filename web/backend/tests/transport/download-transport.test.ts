/**
 * A BATCH DOWNLOAD SENDS BYTES, OR SAYS IT CANNOT.
 *
 * TP-11. `download.handler.ts` has routed telnet and SSH callers to ZMODEM
 * since the fix whose comment says the BBS "used to fake-complete the
 * transfer in 1 second without actually sending bytes". The BATCH path
 * never got that fix: it emitted the browser's `download-file` trigger per
 * file whatever the transport was, printed "Batch download complete! N
 * file(s) queued. / Check your browser downloads.", booked the download
 * statistics and cleared the caller's flags - with zero bytes sent.
 *
 * These drive `BatchDownloadHandler.handleBatchConfirm`, the method a
 * caller reaches by answering Y at "Start batch download?", on each
 * transport.
 */
process.env.SKIP_DB_INIT = '1';

const startZmodemDownload = jest.fn();
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  startZmodemDownload: (...args: unknown[]) => startZmodemDownload(...args),
}));
jest.mock('../../src/storage/storage-context', () => ({ getStorageContext: () => null }));
jest.mock('../../src/storage/remote-download', () => ({
  // No pool in these tests: a file is already where it says it is.
  rematerialise: async (file: any) => file.fullPath ?? file.path,
  storageFailureText: (error: unknown) => String(error),
}));

import { BatchDownloadHandler } from '../../src/handlers/transfer/batch-download.handler';
import {
  deliveryRouteFor,
  negotiateBinaryForTransfer,
  NO_TRANSFER_NOTICE,
} from '../../src/handlers/file/file-delivery';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const FILES = [
  { name: 'ART.LHA', size: 1024, fullPath: '/board/Conf1/ART.LHA', confNum: 1, dirNum: 1 },
  { name: 'DEMO.DMS', size: 2048, fullPath: '/board/Conf1/DEMO.DMS', confNum: 1, dirNum: 1 },
];

function makeCaller(connectionType: string) {
  const events: { event: string; payload: any }[] = [];
  const socket: any = { id: 'caller', emit: (event: string, payload: any) => events.push({ event, payload }) };
  const session: any = {
    connectionType,
    currentConf: 1,
    user: { id: 1, username: 'SPOT' },
    nodeId: 1,
    tempData: { waitingForBatchConfirm: true, batchDownloadList: FILES.map((f) => ({ ...f })) },
    flagManager: { clearAll: jest.fn(), save: jest.fn().mockResolvedValue(undefined) },
  };
  const said = () => events.filter((e) => e.event === 'ansi-output').map((e) => String(e.payload)).join('');
  const downloadFileEvents = () => events.filter((e) => e.event === 'download-file');
  return { socket, session, said, downloadFileEvents };
}

let stats: jest.SpyInstance;
let confStats: jest.SpyInstance;

beforeEach(() => {
  startZmodemDownload.mockClear();
  stats = jest.spyOn(BatchDownloadHandler as any, 'updateDownloadStats').mockResolvedValue(undefined);
  confStats = jest.spyOn(BatchDownloadHandler as any, 'updateConferenceDownloadStats').mockResolvedValue(undefined);
});

afterEach(() => {
  stats.mockRestore();
  confStats.mockRestore();
});

describe('a batch download, by transport', () => {
  it('sends the bytes over ZMODEM on telnet, and never claims the browser has them', async () => {
    const caller = makeCaller('telnet');

    await BatchDownloadHandler.handleBatchConfirm(caller.socket, caller.session, 'Y');

    expect(startZmodemDownload).toHaveBeenCalledTimes(1);
    expect(startZmodemDownload.mock.calls[0][2]).toEqual([
      '/board/Conf1/ART.LHA',
      '/board/Conf1/DEMO.DMS',
    ]);
    expect(caller.said()).toContain('SENDING 2 FILE(S) VIA ZMODEM');
    // The lie this task exists to delete.
    expect(caller.said()).not.toContain('Check your browser downloads');
    expect(caller.said()).not.toContain('Batch download complete');
  });

  it('never sends the browser trigger to a byte transport', async () => {
    for (const transport of ['telnet', 'ssh']) {
      const caller = makeCaller(transport);
      await BatchDownloadHandler.handleBatchConfirm(caller.socket, caller.session, 'Y');
      expect(caller.downloadFileEvents()).toEqual([]);
    }
  });

  it('books no statistics for a transfer it refused', async () => {
    // A transport that can receive neither. Not reachable from today's
    // three, and the point of the arm: a refusal books nothing, clears no
    // flag, and says why.
    const caller = makeCaller('carrier-pigeon');

    await BatchDownloadHandler.handleBatchConfirm(caller.socket, caller.session, 'Y');

    expect(stats).not.toHaveBeenCalled();
    expect(confStats).not.toHaveBeenCalled();
    expect(startZmodemDownload).not.toHaveBeenCalled();
    expect(caller.downloadFileEvents()).toEqual([]);
    expect(caller.said()).toContain(NO_TRANSFER_NOTICE);
    expect(caller.session.flagManager.clearAll).not.toHaveBeenCalled();
    expect(caller.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('is unchanged for a browser: one trigger per file, and the two lines', async () => {
    const caller = makeCaller('web');

    await BatchDownloadHandler.handleBatchConfirm(caller.socket, caller.session, 'Y');

    const triggers = caller.downloadFileEvents().map((e) => e.payload);
    expect(triggers).toHaveLength(2);
    expect(triggers[0]).toMatchObject({
      filename: 'ART.LHA',
      size: 1024,
      url: '/api/download/1/1/ART.LHA',
      batchIndex: 0,
      batchTotal: 2,
    });
    expect(caller.said()).toContain('-> Downloading: ART.LHA');
    expect(caller.said()).toContain('[OK] Batch download complete! 2 file(s) queued.');
    expect(caller.said()).toContain('Check your browser downloads.');
    expect(startZmodemDownload).not.toHaveBeenCalled();
    expect(stats).toHaveBeenCalledTimes(2);
  });
});

describe('the one route decision', () => {
  it('answers for every transport the board has, and for one it does not', () => {
    expect(deliveryRouteFor({ connectionType: 'telnet' } as any)).toBe('zmodem');
    expect(deliveryRouteFor({ connectionType: 'ssh' } as any)).toBe('zmodem');
    expect(deliveryRouteFor({ connectionType: 'web' } as any)).toBe('http');
    // A session before its transport is known is the browser, which is what
    // session-manager creates.
    expect(deliveryRouteFor({} as any)).toBe('http');
    expect(deliveryRouteFor(null)).toBe('http');
    expect(deliveryRouteFor({ connectionType: 'carrier-pigeon' } as any)).toBe('refused');
  });
});

describe('IAC BINARY before a ZMODEM transfer (divergence 20)', () => {
  const withRawSend = (connectionType: string) => {
    const sent: Buffer[] = [];
    const session: any = {
      connectionType,
      transferRawSendUnescaped: (buf: Buffer) => sent.push(buf),
    };
    return { session, sent };
  };

  it('goes out on telnet, unescaped, as WILL BINARY then DO BINARY', () => {
    const { session, sent } = withRawSend('telnet');

    expect(negotiateBinaryForTransfer(session)).toBe(true);
    expect(sent).toHaveLength(1);
    expect([...sent[0]]).toEqual([255, 251, 0, 255, 253, 0]);
  });

  it('does not go out on web or SSH, which have no NVT to escape', () => {
    for (const transport of ['web', 'ssh']) {
      const { session, sent } = withRawSend(transport);
      expect(negotiateBinaryForTransfer(session)).toBe(false);
      expect(sent).toEqual([]);
    }
  });

  it('is skipped, not thrown, when the transfer sink is not armed yet', () => {
    expect(negotiateBinaryForTransfer({ connectionType: 'telnet' } as any)).toBe(false);
  });
});
