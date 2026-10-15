/**
 * A browser download's cps is the board's own measurement of the transfer.
 *
 * The board hands the files to the browser and timed that hand-off - a few
 * milliseconds, floored to a second - so the "cps" was the file's size and
 * went onto the top download list. Downloads and uploads with no figure at
 * all were booked a random modem speed. Now the download route times its
 * stream and books express.e's cps (bytes over 1/50 s ticks, 15946-15953);
 * the hand-off books none.
 */
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).__cpsDb = { query: jest.fn(async () => ({ rows: [] })) };
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__cpsDb[prop] ?? jest.fn(async () => undefined) }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { config } from '../../src/config';
import { setStorageContext } from '../../src/storage/storage-context';
import { bookDownloadCps, runPostDownload } from '../../src/services/post-download.service';
import { updateDownloadStats, updateUploadStats } from '../../src/utils/download-ratios.util';

let dataDir = '';
let spy: jest.SpyInstance;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-cps-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  setStorageContext(null);
});
afterEach(() => {
  spy.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('the download route reports the bytes it streamed and how long it took', async () => {
  const { applyTooltypes } = require('../../src/utils/info-file.util');
  applyTooltypes(path.join(dataDir, 'Conf1.info'), [['NDIRS', '1'], ['DLPATH.1', 'BBS:Conf1/Files/']]);
  fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'BIG.LHA'), Buffer.alloc(4096));
  const { registerHttpRoutes } = require('../../src/server/routes-setup');
  const app = express();
  registerHttpRoutes(app, { emit: () => undefined });
  const served = jest.fn();
  const { issueAreaDownloadTicket } = require('../../src/handlers/file/download-ticket');
  const res = await request(app).get(issueAreaDownloadTicket(1, 1, 'BIG.LHA', served));
  expect(res.status).toBe(200);
  expect(served).toHaveBeenCalledTimes(1);
  expect(served.mock.calls[0][0]).toBe(4096);
  expect(served.mock.calls[0][1]).toBeGreaterThanOrEqual(0);
});

test('the cps booked is express.e\'s: bytes x 50 over the ticks', () => {
  const session: any = { user: { topDownloadCPS: 1000 } };
  expect(bookDownloadCps(session, 100_000, 2000)).toBe(50_000); // 100 ticks
  expect(session.user.topDownloadCPS).toBe(50_000);
  expect(session.user.lastDlCPS).toBe(50_000);
  bookDownloadCps(session, 1000, 1000);
  expect(session.user.topDownloadCPS).toBe(50_000); // a slower one keeps the record
  expect(session.user.lastDlCPS).toBe(1000);
});

test('the hand-off to the browser books no cps', async () => {
  const session: any = { user: { id: 'u1', username: 'caller', topDownloadCPS: 0 }, nodeId: 1 };
  const said: string[] = [];
  await runPostDownload({ emit: (_e: string, t: unknown) => said.push(String(t)) }, session, {
    downloadStartTime: Date.now(), downloadedFiles: 1, downloadedBytes: 5_000_000, measured: false, success: true,
  });
  expect(session.user.topDownloadCPS).toBe(0);
  expect(session.user.lastDlCPS).toBeUndefined();
  expect(said.join('')).toContain(' 0 cps,');
});

test('a booking with no measured cps leaves the top cps alone', async () => {
  const user: any = { username: 'caller', topDownloadCPS: 0, topUploadCPS: 0, downloads: 0, bytesDownload: 0 };
  await updateDownloadStats(user, 1000);
  await updateUploadStats(user, 1000);
  expect(user.topDownloadCPS).toBe(0);
  expect(user.topUploadCPS).toBe(0);
});
