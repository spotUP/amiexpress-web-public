/**
 * Regression for #11: socket.io's maxHttpBufferSize must be sane.
 *
 * Background — two-phase history of the upload pipeline:
 *
 * 1. Original bug: BBSTerminal emitted file uploads through the socket as
 *    a JSON-serialized number array (Array.from(new Uint8Array(buf))).
 *    That inflates each byte to ~3 chars on the wire, so a 10MB file
 *    became ~30MB. With maxHttpBufferSize at 1MB, anything > ~330KB
 *    blew the cap mid-upload and socket.io disconnected with a
 *    "transport error", bouncing the user back to login. Short-term
 *    fix: bump the buffer to 64MB to fit the JSON-inflated worst case.
 *
 * 2. Real fix: switch BBSTerminal to multipart HTTP POST against the
 *    already-wired /api/upload (multer) endpoint. The file body never
 *    touches the websocket; the frontend only emits a small
 *    `file-upload-ready` event with the file metadata after multer
 *    has written it. With binary off the socket the buffer can be
 *    reasonable (4MB) — large enough for non-file payloads, small
 *    enough that any binary on the socket is caught early.
 *
 * This test asserts the post-migration invariants:
 *   - maxHttpBufferSize is set to a sane non-pathological value (1-16MB).
 *   - maxFileSize (HTTP upload cap) can comfortably exceed it because
 *     uploads no longer go through the socket.
 *   - The legacy regression case (1MB cap, JSON-array uploads) is gone.
 *
 * The buffer size is read off the REAL socket.io server `src/index.ts`
 * builds (importing index.ts starts nothing under jest since d9f9bfe72),
 * maxFileSize off the real config, and the backend half of the HTTP path is
 * driven: `registerFileHandlers` on a fake socket, a `file-upload-ready`
 * event for a file multer "wrote", and the door-archive callback that
 * processFileUpload fires with the copied file. The frontend half stays a
 * source check - see the comment on that test.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { registerFileHandlers } from '../../src/server/file-socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';

function socketIoBufferSize(): number {
  require('../../src/index');
  const io = (global as any).io;
  return io.engine.opts.maxHttpBufferSize;
}

describe('socket.io upload buffer sizing (regression for #11)', () => {
  test('the board\'s socket.io server has a maxHttpBufferSize', () => {
    const value = socketIoBufferSize();
    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThan(0);
  });

  test("an HTTP upload over the board's maxFileSize is refused, and one under it is taken", async () => {
    // The cap was a second literal 10 MB in routes-setup.ts while this setting
    // was read by nothing, so changing it changed no upload.
    const express = require('express');
    const request = require('supertest');
    const { registerHttpRoutes } = require('../../src/server/routes-setup');
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-cap-'));
    const previous = { dataDir: config.get('dataDir'), max: config.get('maxFileSize') };
    const quiet = [jest.spyOn(console, 'log').mockImplementation(() => {}), jest.spyOn(console, 'error').mockImplementation(() => {})];
    try {
      config.set('dataDir', dataDir);
      config.set('maxFileSize', 32);
      const app = express();
      registerHttpRoutes(app, {} as never);

      // Each upload carries the one-time ticket the board issues with the
      // request (BBSApi.requestArchiveUpload); see the-open-routes-ask-who-is-calling.
      const { issueUploadTicket } = require('../../src/handlers/file/download-ticket');
      const over = await request(app).post(issueUploadTicket('cap-socket')).attach('file', Buffer.alloc(64, 1), 'BIG.LHA');
      expect(over.status).toBe(500);
      expect(String(over.body.error)).toMatch(/too large/i);

      const under = await request(app).post(issueUploadTicket('cap-socket')).attach('file', Buffer.alloc(16, 1), 'SMALL.LHA');
      expect(under.status).toBe(200);
      expect(under.body.size).toBe(16);
    } finally {
      for (const q of quiet) q.mockRestore();
      config.set('dataDir', previous.dataDir);
      config.set('maxFileSize', previous.max);
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('maxHttpBufferSize is at least 1MB (covers ANSI screens, AREXX I/O, etc.)', () => {
    expect(socketIoBufferSize()).toBeGreaterThanOrEqual(1 * 1024 * 1024);
  });

  test('maxHttpBufferSize is at most 16MB — file bodies must NOT go through the socket', () => {
    // The migration moved file uploads to HTTP /api/upload (multer). The
    // websocket should never carry a file body. If maxHttpBufferSize creeps
    // above 16MB, someone may have re-introduced a binary-on-socket pattern
    // that #11 was meant to permanently eliminate.
    expect(socketIoBufferSize()).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  test('frontend BBSTerminal emits file-upload-ready (multipart HTTP path), not file-upload (JSON array)', () => {
    // REASONABLE source check: BBSTerminal.tsx is a React component in
    // packages/terminal, outside this jest project; the backend suite has no
    // way to run it, and its emit is only observable in a browser.
    const bbs = fs.readFileSync(
      path.resolve(__dirname, '../../../../packages/terminal/src/components/BBSTerminal.tsx'),
      'utf8'
    );

    // The multipart path must be present.
    expect(bbs).toMatch(/socket\.emit\(\s*['"]file-upload-ready['"]/);

    // The legacy JSON-array path (Array.from(new Uint8Array(...))) MUST NOT
    // appear. Any code that re-introduces it brings #11 right back.
    expect(bbs).not.toMatch(/Array\.from\s*\(\s*new\s+Uint8Array\s*\([^)]*\)\s*\)/);

    // Must use fetch against the multer endpoint.
    expect(bbs).toMatch(/fetch\(\s*[^,)]*uploadUrl[\s\S]*?method:\s*['"]POST['"]/);
  });

  test('backend listens for file-upload-ready and completes the door with the file /api/upload saved', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-ready-'));
    const multerFile = path.join(dataDir, 'multer-upload.tmp');
    fs.writeFileSync(multerFile, 'archive bytes');
    const original = config.get.bind(config);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));

    const handlers = new Map<string, (data: any) => Promise<void>>();
    const socket: any = {
      id: 'upload-ready-socket',
      emit: () => true,
      on: (event: string, fn: (data: any) => Promise<void>) => { handlers.set(event, fn); },
    };
    const delivered: Array<{ path: string; filename: string }> = [];
    const session: any = {
      nodeId: 97,
      // A door asks for an upload inside a logged-on call; the event is
      // refused for a socket that has not logged on (server/socket-guard.ts).
      user: { id: 97, username: 'Uploader', secLevel: 20 },
      pendingDoorUpload: true,
      pendingDoorUploadCallback: (r: { path: string; filename: string }) => delivered.push(r),
      // What /api/upload records for the ticketed session; the event's own
      // `path` is the browser's word and is not used.
      doorUploadSavedPath: path.join(dataDir, 'DOOR.LHA'),
    };
    fs.renameSync(multerFile, path.join(dataDir, 'DOOR.LHA'));
    setSession(socket.id, session);
    try {
      registerFileHandlers(socket);
      const ready = handlers.get('file-upload-ready');
      expect(ready).toBeDefined();

      await ready!({ filename: 'DOOR.LHA', size: 13, path: '/etc/passwd' });

      expect(delivered).toEqual([{ path: path.join(dataDir, 'Doors', 'archives', 'DOOR.LHA'), filename: 'DOOR.LHA' }]);
      expect(fs.readFileSync(delivered[0].path, 'utf8')).toBe('archive bytes');
    } finally {
      deleteSession(socket.id);
      spy.mockRestore();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
