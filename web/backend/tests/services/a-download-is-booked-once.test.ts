/**
 * A download is booked once, by the one set of books, on every transport.
 *
 * The browser path charged the caller twice: `D` booked the files through
 * bookDownloads at handoff, and then the terminal's `file-download-started`
 * ran a second booking in server/file-socket-handlers.ts - downloads and
 * bytes again, user.data again, a second callers-log line - for every file
 * with a catalogue row (DB/disk audit item 8, 2026-10-04). That second path
 * was also the only home of the FILE_DOWNLOADED webhook, the achievement
 * and the catalogue's per-file counter, so a telnet download never fired
 * them, and an attachment or ZOOM packet (downloadFile, which books nothing
 * in express.e) was charged if a file of the same name was catalogued.
 */
process.env.SKIP_DB_INIT = '1';

const catalogued = { id: 42, filename: 'DEMO.LHA', size: 1000, downloads: 3, uploadDate: new Date(0) };
const fileDb: Record<string, jest.Mock> = {
  getFileEntryByName: jest.fn(async () => catalogued),
  updateFileEntry: jest.fn(async () => undefined),
  updateUser: jest.fn(async () => undefined),
  run: jest.fn(async () => undefined),
  query: jest.fn(async () => ({ rows: [] })),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'General' })),
  getWebhooksByTrigger: jest.fn(async () => []),
};
(globalThis as any).__bookedOnceDb = fileDb;
jest.mock('../../src/database', () => ({
  ...jest.requireActual('../../src/database'),
  db: new Proxy({} as any, {
    get: (_t, prop) => (globalThis as any).__bookedOnceDb[prop] ?? jest.fn(async () => undefined),
  }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/utils/download-logging.util', () => ({ logDownload: jest.fn(async () => undefined) }));
const sendWebhook = jest.fn(async () => undefined);
jest.mock('../../src/services/webhook.service', () => ({
  ...jest.requireActual('../../src/services/webhook.service'),
  webhookService: { sendWebhook: (...a: unknown[]) => (sendWebhook as any)(...a) },
}));
const reportDownload = jest.fn(() => 1);
jest.mock('../../src/achievements/sites', () => ({
  ...jest.requireActual('../../src/achievements/sites'),
  reportDownload: (...a: unknown[]) => (reportDownload as any)(...a),
}));

import { bookDownloads } from '../../src/services/download-booking.service';
import { WebhookTrigger } from '../../src/services/webhook.service';

function caller(): any {
  return {
    nodeId: 1,
    currentConf: 1,
    conferences: [],
    user: { id: 'u1', username: 'caller', downloads: 0, bytesDownload: 0, slotNumber: 0, securityFlags: '' },
  };
}

beforeEach(() => {
  for (const m of Object.values(fileDb)) m.mockClear();
  sendWebhook.mockClear();
  reportDownload.mockClear();
});

test('the browser no longer books a download a second time when it starts fetching', () => {
  const { registerFileHandlers } = require('../../src/server/file-socket-handlers');
  const { setSession, deleteSession } = require('../../src/server/session-manager');
  const events: string[] = [];
  setSession('once', caller());
  try {
    registerFileHandlers({ id: 'once', emit: () => true, on: (event: string) => { events.push(event); } });
  } finally {
    deleteSession('once');
  }
  expect(events.length).toBeGreaterThan(0);
  expect(events).not.toContain('file-download-started');
});

test('one booking counts the catalogue row, sends the webhook and reports the achievement once', async () => {
  const session = caller();
  await bookDownloads(session, [{ name: 'DEMO.LHA', size: 1000, confNum: 1 }]);

  expect(session.user.downloads).toBe(1);
  expect(fileDb.getFileEntryByName).toHaveBeenCalledWith(1, 'DEMO.LHA');
  expect(fileDb.updateFileEntry).toHaveBeenCalledTimes(1);
  expect(fileDb.updateFileEntry).toHaveBeenCalledWith(42, { downloads: 4 });
  expect(sendWebhook).toHaveBeenCalledTimes(1);
  expect(sendWebhook.mock.calls[0][0]).toBe(WebhookTrigger.FILE_DOWNLOADED);
  expect(reportDownload).toHaveBeenCalledTimes(1);
});

test('a file with no catalogue row is still announced and reported', async () => {
  fileDb.getFileEntryByName.mockResolvedValueOnce(null as never);
  await bookDownloads(caller(), [{ name: 'LOOSE.ZIP', size: 50, confNum: 1 }]);
  expect(fileDb.updateFileEntry).not.toHaveBeenCalled();
  expect(sendWebhook).toHaveBeenCalledTimes(1);
  expect(reportDownload).toHaveBeenCalledTimes(1);
});
