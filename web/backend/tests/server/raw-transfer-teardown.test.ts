/**
 * Regression: the SECOND zmodem transfer of a telnet/SSH session must work.
 *
 * Live bug (2026-09-08): "the second file transferred via zmodem fails via
 * telnet/ssh". While a transfer runs, classifyTerminalInput routes EVERY
 * inbound byte to session.transferRawSink and nowhere else. The only code that
 * cleared that routing lived in socket.io handlers ('transfer-raw:complete' /
 * ':cancel') - the BROWSER announcing the transfer was over. A telnet or SSH
 * caller sends no such event, so after his first transfer transferRawActive
 * stayed true and transferRawSink still pointed at the finished transfer's dead
 * lrzsz manager. Every later byte went into that corpse, so transfer #2 could
 * never work. Reconnecting "fixed" it only because the disconnect path cleared
 * the same fields.
 *
 * Two properties are tested here:
 *  1. Tearing down actually stops the real classifier routing.
 *  2. Every transfer entry point a caller can reach - U (startZmodemUpload),
 *     D (startZmodemDownload) on both the lrzsz and the zmodem.js paths, and
 *     RZ (handleZmodemUploadCommand) - arms the raw routing and, when its
 *     transfer ends, tears it down again. Driven through the real handlers
 *     with fake transfer managers (no rz/sz runs): each entry point is
 *     started, the fake manager's onComplete is fired, and the classifier
 *     must stop answering 'transfer-sink'.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
/** Every transfer manager the entry points construct, newest last. */
const managers: Array<{ opts: any }> = [];
let lrzszInstalled = true;
jest.mock('../../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => lrzszInstalled,
  LrzszTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; managers.push(this); }
    start() { /* no rz/sz */ }
    handleInput() { /* no rz/sz */ }
  },
}));
jest.mock('../../src/services/zmodem-transfer.service', () => ({
  ZmodemTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; managers.push(this); }
    start() { return Promise.resolve(); }
    handleInput() { /* no transfer */ }
  },
}));
jest.mock('../../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _sess: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));
jest.mock('../../src/services/post-download.service', () => ({ runPostDownload: jest.fn(async () => undefined) }));
jest.mock('../../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));

import { classifyTerminalInput } from '../../src/server/terminal-input';
import { endRawTransfer } from '../../src/utils/raw-transfer-teardown.util';
import { startZmodemUpload, startZmodemDownload } from '../../src/handlers/commands/user-commands.handler';
import {
  handleZmodemUploadCommand,
  setTransferMiscCommandsDependencies,
} from '../../src/handlers/commands/transfer-misc-commands.handler';

describe('raw transfer teardown - the second transfer must not be swallowed', () => {
  function sessionMidTransfer(sink: (b: Buffer) => void): any {
    return { transferRawActive: true, transferRawSink: sink };
  }

  it('routes input to the transfer sink while a transfer is running', () => {
    const sink = jest.fn();
    const decision = classifyTerminalInput(sessionMidTransfer(sink) as any, 'abc');
    expect(decision.kind).toBe('transfer-sink');
  });

  it('stops routing to the finished transfer once it is torn down', () => {
    const sink = jest.fn();
    const session = sessionMidTransfer(sink);

    endRawTransfer(session);

    // The bug: without teardown this still answers 'transfer-sink', so the
    // next transfer's bytes are handed to the previous, dead manager.
    const decision = classifyTerminalInput(session as any, 'abc');
    expect(decision.kind).not.toBe('transfer-sink');
    expect(session.transferRawActive).toBe(false);
    expect(session.transferRawSink).toBeUndefined();
  });

  it('also drops a stale manager-based sink', () => {
    const session: any = {
      transferRawActive: true,
      transferManager: { handleInput: jest.fn() },
    };
    expect(classifyTerminalInput(session as any, 'x').kind).toBe('transfer-sink');

    endRawTransfer(session);

    expect(classifyTerminalInput(session as any, 'x').kind).not.toBe('transfer-sink');
    expect(session.transferManager).toBeUndefined();
  });

  it('is safe to call twice, and on a session with no transfer', () => {
    const session: any = {};
    expect(() => {
      endRawTransfer(session);
      endRawTransfer(session);
      endRawTransfer(undefined);
    }).not.toThrow();
  });

});

describe('every transfer entry point tears its raw routing down when the transfer ends', () => {
  let board: string;
  let file: string;
  beforeAll(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-teardown-'));
    file = path.join(board, 'DEMO.LHA');
    fs.writeFileSync(file, Buffer.alloc(512));
    setTransferMiscCommandsDependencies({ setEnvStat: jest.fn() } as any);
  });
  afterAll(() => fs.rmSync(board, { recursive: true, force: true }));
  beforeEach(() => { managers.length = 0; });

  function aTelnetCaller(): { socket: any; session: any } {
    const socket: any = { id: 'raw-teardown', emit: () => true, on: () => undefined, once: () => undefined };
    const session: any = {
      nodeId: 1,
      currentConf: 1,
      bbsPath: board,
      connectionType: 'telnet',
      transferRawSend: jest.fn(),
      transferRawSendUnescaped: jest.fn(),
      user: { username: 'sysop', securityFlags: 'T'.repeat(64) },
      tempData: {},
    };
    return { socket, session };
  }

  const entryPoints: Array<[string, boolean, (socket: any, session: any) => unknown]> = [
    ['U over lrzsz', true, (so, se) => startZmodemUpload(so, se)],
    ['U over zmodem.js', false, (so, se) => startZmodemUpload(so, se)],
    ['D over lrzsz', true, (so, se) => startZmodemDownload(so, se, [file])],
    ['D over zmodem.js', false, (so, se) => startZmodemDownload(so, se, [file])],
    ['RZ over lrzsz', true, (so, se) => handleZmodemUploadCommand(so, se)],
  ];

  it.each(entryPoints)('%s', async (_name, installed, begin) => {
    lrzszInstalled = installed;
    const { socket, session } = aTelnetCaller();

    await begin(socket, session);

    expect(managers).toHaveLength(1);
    expect(classifyTerminalInput(session, 'abc').kind).toBe('transfer-sink');

    await managers[0].opts.onComplete(false, {});

    expect(session.transferRawActive).toBe(false);
    expect(classifyTerminalInput(session, 'abc').kind).not.toBe('transfer-sink');
  });
});
