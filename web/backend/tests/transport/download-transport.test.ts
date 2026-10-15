/**
 * The transfer route a caller's transport gets, and the IAC BINARY a telnet
 * ZMODEM transfer starts with. (The DB command these once drove is gone:
 * flagged files download through D, as in express.e.)
 */
process.env.SKIP_DB_INIT = '1';

const startZmodemDownload = jest.fn();
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  startZmodemDownload: (...args: unknown[]) => startZmodemDownload(...args),
}));
jest.mock('../../src/storage/storage-context', () => ({ getStorageContext: () => null }));
const bookDownloads = jest.fn(async () => undefined);
jest.mock('../../src/services/download-booking.service', () => ({
  ...jest.requireActual('../../src/services/download-booking.service'),
  bookDownloads: (...args: unknown[]) => (bookDownloads as any)(...args),
}));
jest.mock('../../src/storage/remote-download', () => ({
  // No pool in these tests: a file is already where it says it is.
  rematerialise: async (file: any) => file.fullPath ?? file.path,
  storageFailureText: (error: unknown) => String(error),
}));

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

beforeEach(() => {
  startZmodemDownload.mockClear();
  bookDownloads.mockClear();
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
