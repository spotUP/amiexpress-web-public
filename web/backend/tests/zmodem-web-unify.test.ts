/**
 * Regression tests for the ZMODEM web unification (commit c67e50385 +
 * follow-ups). Each test holds a discrete invariant in the lrzsz
 * transport / web upload pipeline so a future refactor can't silently
 * regress the live web upload flow:
 *   - chunk-split removed → browser Sentry stops detecting ZRINIT
 *   - duplicate-ZRINIT suppression broken or never reset → the browser Send
 *     session throws, or hangs after the first file
 *   - MuffinTerm rewrite re-applied to web → ZFILE buffered forever,
 *     rz aborts at code 128
 *   - server handshake fallback timer reintroduced → rz spawns before
 *     user picks file, races the file picker, aborts
 *   - multi-file batch loop reverted to emit show-file-upload → ZMODEM
 *     batch turns into HTTP picker after first file
 *
 * All of it runs through the real modules. `LrzszTransferManager` is the
 * real class with `child_process.spawn` replaced by a fake child (no rz or
 * sz ever runs); its stdout pipeline is fed through `processStdoutChunk`,
 * the seam tests/lrzsz-transport-pipeline.test.ts uses. The RZ, U and D
 * commands are called for real, on a temp board, with the catalog stubbed
 * as in tests/storage/upload-into-pool.test.ts.
 *
 * Not re-tested here: the walk of files 2..N after each description and the
 * end-of-batch completion are driven by the two-file RZ batches in
 * tests/upload-completion-banner.test.ts and
 * tests/upload-diz-batch-substate.test.ts. The withdrawn ZRINIT CANFC32
 * patch (patchZrinitFlags, e7e1f9836) is no longer called by anything, so
 * there is no behaviour of it left to hold.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip = require('adm-zip');

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every child the code under test spawned: binary, args, and the fake process. */
const spawned: Array<{ binary: string; args: string[]; proc: any }> = [];
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawnSync: () => ({ status: 0, stdout: 'sz (lrzsz) 0.12.21rc', stderr: '' }),
  spawn: (binary: string, args: string[]) => {
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: () => true, end: () => undefined };
    proc.kill = () => true;
    spawned.push({ binary, args, proc });
    return proc;
  },
}));
jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
const createdEntries: any[] = [];
const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async (entry: any) => { createdEntries.push(entry); return createdEntries.length; }),
  recordLocation: jest.fn(),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
  getWebhooksByTrigger: jest.fn(async () => []),
  getFileAreas: jest.fn(async () => [{
    id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/',
  }]),
};
(globalThis as any).__unifyMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__unifyMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
jest.mock('../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _sess: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));

import { LrzszTransferManager } from '../src/services/lrzsz-transfer.service';
import {
  handleZmodemUploadCommand,
  setTransferMiscCommandsDependencies,
} from '../src/handlers/commands/transfer-misc-commands.handler';
import { startZmodemUpload, startZmodemDownload } from '../src/handlers/commands/user-commands.handler';
import { BBSPaths } from '../src/utils/bbs-paths.util';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

// A ZRINIT exactly as rz writes it: 18 header bytes, then CR, high-bit LF, XON.
const ZRINIT = Buffer.concat([Buffer.from('2a2a18423031303030303030323362653530', 'hex'), Buffer.from([0x0d, 0x8a, 0x11])]);
// A ZACK (type 03) - never a ZRINIT.
const ZACK = Buffer.concat([Buffer.from('2a2a18423033303130303030303039383636', 'hex'), Buffer.from([0x0d, 0x8a, 0x11])]);

function pipeline(type: 'telnet' | 'web') {
  const sent: Buffer[] = [];
  const manager: any = new LrzszTransferManager({
    session: { nodeId: 1 } as never,
    transport: { type, send: (b: Buffer) => { sent.push(Buffer.from(b)); } },
    direction: 'upload',
    paths: ['/tmp'],
  });
  return { feed: (chunk: Buffer) => manager.processStdoutChunk(Buffer.from(chunk)), sent };
}

beforeEach(() => {
  spawned.length = 0;
  createdEntries.length = 0;
});

describe('ZMODEM web unification — lrzsz-transfer.service.ts', () => {
  test('stdout splits at `**\\x18B` boundaries before transport.send', () => {
    // zmodem.js Sentry requires exactly one initial header per consume()
    // for detection (zsentry.js _parse). lrzsz emits two back-to-back
    // ZRINITs in one stdout chunk on spawn; we must split before passing
    // them on. Telnet, so duplicate suppression does not hide the second.
    const p = pipeline('telnet');
    p.feed(Buffer.concat([ZRINIT, ZRINIT]));
    expect(p.sent.map((b) => b.length)).toEqual([21, 21]);
  });

  test('a web session suppresses keepalive ZRINITs, and forwards the next one once the protocol moves on', () => {
    // rz keepalive ZRINITs after the first must be suppressed so the
    // browser Send session doesn't choke. But after data flow begins
    // (ZRPOS / ZACK arrive), the NEXT ZRINIT — sent post-EOF as "next
    // file or finish?" — must reach the browser so the Send session
    // can emit ZFIN and rz exits cleanly.
    const p = pipeline('web');
    p.feed(ZRINIT);
    p.feed(ZRINIT);
    expect(p.sent).toHaveLength(1);
    p.feed(ZACK);
    p.feed(ZRINIT);
    expect(p.sent).toHaveLength(3);
    expect(p.sent[2].slice(4, 6).toString('ascii')).toBe('01');
  });

  test('only a lone ZRINIT counts as a keepalive: a longer chunk that starts with one is forwarded', () => {
    // A chunk over 28 bytes is not a single hex header; ZDATA and friends
    // behind a ZRINIT header must still reach the browser.
    const p = pipeline('web');
    p.feed(ZRINIT);
    p.feed(Buffer.concat([ZRINIT, Buffer.alloc(19, 0x41)]));
    expect(p.sent).toHaveLength(2);
  });

  test('a web upload does not go through the MuffinTerm rewrite', () => {
    // zmodem.js correctly uses ZCRCW (0x6b). The MuffinTerm-only rewrite
    // scans for ZCRCE (0x68) and, when absent, buffers the chunk
    // indefinitely - for web that means ZFILE bytes never reach rz stdin and
    // the transfer aborts. A rewrite that came back for web would fail
    // this, and a reworded condition would not.
    const frame = Buffer.from([
      0x2a, 0x18, 0x41, 0x18, 0x44,       // `*` ZDLE 'A' ZDLE 'D' - ZBIN ZFILE
      0x30, 0x30, 0x30, 0x30, 0x11, 0x22, // position + header CRC
      ...Buffer.from('WEB.LHA\x00100 0 0 0 1 100\x00', 'latin1'),
      0x18, 0x6b, 0x33, 0x44,             // ZDLE ZCRCW + CRC
    ]);

    const written: Buffer[] = [];
    const manager = new LrzszTransferManager({
      session: { nodeId: 1 } as never,
      transport: { type: 'web', send: () => { /* nothing goes back on this path */ } },
      direction: 'upload',
      paths: ['/tmp'],
    });
    (manager as any).proc = { stdin: { write: (b: Buffer) => { written.push(Buffer.from(b)); return true; } } };

    manager.handleInput(frame);

    // Byte for byte: nothing buffered, nothing rewritten.
    expect(Buffer.concat(written)).toEqual(frame);
  });

  test('rz is spawned with a 60 s per-retry timeout (-t 600), resuming on telnet and overwriting on web', () => {
    // Default rz timeout is ~1s/tenth which races the post-ZACK file-
    // pick window. -t 600 = 60 s safety margin.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unify-args-'));
    try {
      for (const type of ['telnet', 'web'] as const) {
        new LrzszTransferManager({
          session: { nodeId: 1 } as never,
          transport: { type, send: () => undefined },
          direction: 'upload',
          paths: [dir],
        }).start();
      }
      expect(spawned.map((s) => [s.binary, s.args])).toEqual([
        ['rz', ['-b', '-r', '-t', '600', '-vv']],
        ['rz', ['-b', '-y', '-t', '600', '-vv']],
      ]);
    } finally {
      for (const s of spawned) s.proc.emit('close', 1, null);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

let board: string;
let restoreConfig: () => void;
function useTempBoard(): void {
  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'zmodem-unify-'));
    fs.mkdirSync(path.join(board, 'Conf1', 'Files'), { recursive: true });
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setTransferMiscCommandsDependencies({ setEnvStat: jest.fn() } as any);
  });
  afterEach(() => {
    jest.useRealTimers();
    restoreConfig();
    for (const s of spawned) s.proc.emit('close', 1, null);
    fs.rmSync(board, { recursive: true, force: true });
  });
}

function aCaller(connectionType: 'web' | 'telnet') {
  const events: Array<{ event: string; payload: any }> = [];
  const once = new Map<string, () => void>();
  const socket: any = {
    id: `unify-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: any) => { events.push({ event, payload }); return true; },
    on: () => undefined,
    once: (event: string, fn: () => void) => { once.set(event, fn); },
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    bbsPath: board,
    connectionType,
    user: { id: 'u1', username: 'spot', name: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
    tempData: {},
  };
  if (connectionType === 'telnet') {
    session.transferRawSend = jest.fn();
    session.transferRawSendUnescaped = jest.fn();
  }
  const said = () => events.filter((e) => e.event === 'ansi-output').map((e) => String(e.payload)).join('');
  const inits = () => events.filter((e) => e.event === 'transfer-raw:init').map((e) => e.payload.direction);
  return { socket, session, said, inits, fire: (event: string) => once.get(event)?.() };
}

describe('ZMODEM web unification — server handshake (transfer-misc-commands)', () => {
  useTempBoard();

  test('web RZ arms the browser and defers the rz spawn until the client emits transfer-raw:start', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const c = aCaller('web');

    await handleZmodemUploadCommand(c.socket, c.session);

    expect(c.inits()).toEqual(['upload']);
    expect(spawned).toHaveLength(0);
    c.fire('transfer-raw:start');
    expect(spawned.map((s) => s.binary)).toEqual(['rz']);
  });

  test('handshake has NO short fallback timer (only the 120 s safety cleanup)', async () => {
    // Earlier code had setTimeout(spawn, 1500) which raced the file
    // picker. The 120 s timer is a graceful cleanup, not a spawn.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const c = aCaller('web');

    await handleZmodemUploadCommand(c.socket, c.session);
    jest.advanceTimersByTime(119_000);
    expect(spawned).toHaveLength(0);
    expect(c.said()).not.toContain('Upload timed out');

    jest.advanceTimersByTime(1_000);
    expect(spawned).toHaveLength(0);
    expect(c.said()).toContain('Upload timed out (no file picked).');
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('a finished rz hands the first file to the description prompt and queues files 2..N', async () => {
    // processBatchFile alone would bypass the description prompt + DIZ
    // extraction; the first file must go through
    // handleDizExtractionAndDescription (express.e:17720), and the rest
    // wait in pendingZmodemFiles.
    const c = aCaller('telnet');
    await handleZmodemUploadCommand(c.socket, c.session);
    expect(spawned).toHaveLength(1);

    const playpen = new BBSPaths(board).node(1).playpen();
    for (const name of ['FIRST.ZIP', 'SECOND.ZIP']) {
      const zip = new AdmZip();
      zip.addFile('payload.bin', Buffer.from(`payload of ${name}`)); // no FILE_ID.DIZ
      zip.writeZip(path.join(playpen, name));
    }
    spawned[0].proc.emit('close', 0, null);
    for (let i = 0; i < 100 && c.session.subState !== LoggedOnSubState.UPLOAD_DESC_INPUT; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(c.session.subState).toBe(LoggedOnSubState.UPLOAD_DESC_INPUT);
    expect(c.said()).toContain('Please enter a description');
    expect(c.said()).toContain('FIRST.ZIP');
    expect(c.session.tempData.webUploadMode).toBe(true);
    expect(c.session.tempData.pendingZmodemFiles.map((f: any) => f.name)).toEqual(['SECOND.ZIP']);
    expect(createdEntries).toEqual([]);
  });
});

describe('ZMODEM web unification — Z/D commands (user-commands)', () => {
  useTempBoard();

  test('a web U goes through lrzsz: it arms the browser, then spawns rz on transfer-raw:start', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const c = aCaller('web');

    startZmodemUpload(c.socket, c.session);

    expect(c.inits()).toEqual(['upload']);
    c.fire('transfer-raw:start');
    expect(spawned.map((s) => s.binary)).toEqual(['rz']);
  });

  test('a web D goes through lrzsz: it arms the browser, then spawns sz on transfer-raw:start', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const file = path.join(board, 'Conf1', 'Files', 'DEMO.LHA');
    fs.writeFileSync(file, Buffer.alloc(64));
    const c = aCaller('web');

    startZmodemDownload(c.socket, c.session, [file]);

    expect(c.inits()).toEqual(['download']);
    c.fire('transfer-raw:start');
    expect(spawned.map((s) => [s.binary, s.args[s.args.length - 1]])).toEqual([['sz', file]]);
  });
});
