/**
 * Regression: D5 (express.e:20249 clearFlagItems) — after a successful
 * ZMODEM batch download via startZmodemDownload, the user's flagged-
 * files queue must be cleared so they don't see the same files queued
 * next session.
 *
 * Two flag managers exist in this codebase:
 *   - session.flagManager (web batch path, FileFlagManager)
 *     → already cleared at batch-download.handler.ts:228
 *   - flaggedFilesManager (telnet/SSH path, singleton, FlaggedFilesManager)
 *     → cleared here in user-commands.handler.ts onComplete (lrzsz + zmodem.js)
 *
 * Driven through the REAL user-commands.handler (the technique of
 * handlers/upload-offers-the-resume.test.ts): both transfer engines are
 * stubbed to capture the onComplete the handler hands them, the real
 * flaggedFilesManager singleton holds a queue, and each onComplete is fired
 * with ok=true (queue gone) and ok=false (queue kept - losing it on a
 * network blip would force the caller to re-flag every file).
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type OnComplete = (ok: boolean, detail: any) => Promise<void>;

function loadWith(engine: 'lrzsz' | 'zmodem.js') {
  jest.resetModules();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-clear-flagged-'));
  process.env.BBS_ROOT = root;
  process.env.BBS_DATA_DIR = root;
  const file = path.join(root, 'GAME.LHA');
  fs.writeFileSync(file, 'x'.repeat(100));

  const captured: { onComplete?: OnComplete } = {};
  class Engine {
    constructor(opts: { onComplete: OnComplete }) { captured.onComplete = opts.onComplete; }
    start() { /* no bytes move in this test */ }
    handleInput() { /* nothing arrives */ }
  }
  jest.doMock('../src/services/lrzsz-transfer.service', () => ({
    isLrzszAvailable: () => engine === 'lrzsz',
    LrzszTransferManager: Engine,
  }));
  jest.doMock('../src/services/zmodem-transfer.service', () => ({
    ZmodemTransferManager: Engine,
  }));
  const runPostDownload = jest.fn().mockResolvedValue(undefined);
  jest.doMock('../src/services/post-download.service', () => ({ runPostDownload }));

  const handler = require('../src/handlers/commands/user-commands.handler');
  const { flaggedFilesManager } = require('../src/services/FlaggedFilesManager');
  return { handler, flaggedFilesManager, captured, file, runPostDownload };
}

function socket() {
  return {
    id: 'dl', emit: jest.fn(),
    on: jest.fn(function (this: unknown) { return this; }),
    once: jest.fn(function (this: unknown) { return this; }),
    join: jest.fn(function (this: unknown) { return this; }),
  } as any;
}

async function download(engine: 'lrzsz' | 'zmodem.js', ok: boolean) {
  const { handler, flaggedFilesManager, captured, file, runPostDownload } = loadWith(engine);
  flaggedFilesManager.addFile(42, { fileName: 'GAME.LHA', filePath: file, fileSize: 100 });
  // A telnet caller: the engine starts at once, no browser handshake.
  const session: any = {
    nodeId: 1, currentConf: 1, tempData: {}, connectionType: 'telnet',
    transferRawSend: jest.fn(),
    user: { id: 42, username: 'spot' },
  };
  handler.startZmodemDownload(socket(), session, [file]);
  expect(captured.onComplete).toBeDefined();
  await captured.onComplete!(ok, { exitCode: ok ? 0 : 1, signal: null });
  // The onComplete really finished: it reached the post-download pipeline.
  expect(runPostDownload).toHaveBeenCalledTimes(1);
  return flaggedFilesManager.getFiles(42);
}

describe('ZMODEM download clears flaggedFilesManager queue on success (D5)', () => {
  test('lrzsz onComplete clears flaggedFilesManager when ok', async () => {
    expect(await download('lrzsz', true)).toEqual([]);
  });

  test('zmodem.js fallback onComplete clears flaggedFilesManager when ok', async () => {
    expect(await download('zmodem.js', true)).toEqual([]);
  });

  test('clearFiles is NOT called on transfer failure (ok=false), on either engine', async () => {
    expect(await download('lrzsz', false)).toHaveLength(1);
    expect(await download('zmodem.js', false)).toHaveLength(1);
  });
});
