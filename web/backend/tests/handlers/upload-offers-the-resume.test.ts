/**
 * The U command offers the caller his partial uploads, as express does.
 *
 * express runs `zresume := resumeStuff()` before the receive (express.e:19018),
 * on the uLFType=0 path - which is the U command. This port had it exactly
 * INVERTED: the RZ handler called resumeStuff (noting in a comment that this
 * was a deliberate divergence, since RZ is the de-facto entry point on
 * telnet/SSH) and U, the command express actually offers partials from, did
 * not call it at all.
 *
 * It matters now in a way it did not before: `cleanPlayPen` had no callers, so
 * `<conf>/PartUpload/` was always empty and resumeStuff had nothing to offer
 * whoever asked. With aborted uploads filed there, a caller who reconnects and
 * types U is offered the rest of his transfer instead of sending it again.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('starting an upload with U', () => {
  function uploadModule() {
    jest.resetModules();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-board-'));
    process.env.BBS_ROOT = root;
    process.env.BBS_DATA_DIR = root;

    const startResumeStuff = jest.fn();
    jest.doMock('../../src/services/resume-stuff.service', () => ({
      startResumeStuff,
      // The real module exports more; the upload path only calls this one.
      ...jest.requireActual('../../src/services/resume-stuff.service'),
      startResumeStuff,
    }));

    const handler = require('../../src/handlers/commands/user-commands.handler');
    return { handler, startResumeStuff, root };
  }

  function socket() {
    return {
      id: 'u', emit: jest.fn(),
      on: jest.fn(function (this: unknown) { return this; }),
      join: jest.fn(function (this: unknown) { return this; }),
    } as any;
  }

  it('asks about partial uploads before receiving anything', () => {
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };

    handler.startZmodemUpload(socket(), session);

    expect(startResumeStuff).toHaveBeenCalledTimes(1);
  });

  it('hands it the node playpen the receive will use', () => {
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 4, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };

    handler.startZmodemUpload(socket(), session);

    const playpen = startResumeStuff.mock.calls[0][2] as string;
    expect(playpen).toContain('Node4');
  });

  it('does not start the receive until the resume step reports back', () => {
    // The whole point of the callback: express asks first, receives after.
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };
    const s = socket();

    handler.startZmodemUpload(s, session);

    const output = s.emit.mock.calls
      .filter((c: unknown[]) => c[0] === 'ansi-output')
      .map((c: unknown[]) => String(c[1]))
      .join('');
    expect(output).not.toContain('Ready to receive');
    expect(typeof startResumeStuff.mock.calls[0][4]).toBe('function');
  });
});

/**
 * express names the protocol when the receiver starts, and nothing else.
 *
 * express.e:17795 answers the "Okay: (Enter) to Start" prompt with
 * `aePuts('\b\n\b\n')`, then fileReceive prints "Zmodem: Ready to Receive"
 * (17979) before the receive. This port once added "Ready to receive via
 * ZMODEM (lrzsz). Send with sz now." at four sites, then dropped every line,
 * express's own included.
 *
 * These drive the real path with the transfer services stubbed, so what is
 * asserted is what reaches the caller's terminal.
 */
describe('the bytes the caller sees when the receiver starts', () => {
  function moduleWithStubbedTransfers() {
    jest.resetModules();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-quiet-'));
    process.env.BBS_ROOT = root;
    process.env.BBS_DATA_DIR = root;

    const startResumeStuff = jest.fn();
    jest.doMock('../../src/services/resume-stuff.service', () => ({
      ...jest.requireActual('../../src/services/resume-stuff.service'),
      startResumeStuff,
    }));

    // Neither transfer engine may actually run: this is about the terminal.
    const start = jest.fn();
    jest.doMock('../../src/services/lrzsz-transfer.service', () => ({
      isLrzszAvailable: () => true,
      LrzszTransferManager: class {
        start = start;
        handleInput() { /* nothing arrives in this test */ }
      },
    }));
    jest.doMock('../../src/services/zmodem-transfer.service', () => ({
      ZmodemTransferManager: class {
        start = start;
        handleInput() { /* nothing arrives in this test */ }
      },
    }));

    const handler = require('../../src/handlers/commands/user-commands.handler');
    return { handler, startResumeStuff };
  }

  /** `socket()` above is scoped to the other describe; this is the same shape. */
  function testSocket() {
    return {
      id: 'u', emit: jest.fn(),
      on: jest.fn(function (this: unknown) { return this; }),
      once: jest.fn(function (this: unknown) { return this; }),
      off: jest.fn(function (this: unknown) { return this; }),
      removeListener: jest.fn(function (this: unknown) { return this; }),
      join: jest.fn(function (this: unknown) { return this; }),
    } as any;
  }

  function textSentTo(s: any): string {
    return s.emit.mock.calls
      .filter((c: unknown[]) => c[0] === 'ansi-output')
      .map((c: unknown[]) => String(c[1]))
      .join('');
  }

  /** Run the U path all the way through the resume step, as a caller does. */
  function runUpload(transportType: 'web' | 'telnet') {
    const { handler, startResumeStuff } = moduleWithStubbedTransfers();
    const s = testSocket();
    const session: any = {
      nodeId: 1, currentConf: 1, tempData: {}, transport: transportType,
      user: { slotNumber: 3, username: 'spot' },
    };

    handler.startZmodemUpload(s, session);
    const afterResume = startResumeStuff.mock.calls[0][4] as (...a: unknown[]) => void;

    // The web path arms a 120-SECOND "no file picked" timer
    // (user-commands.handler.ts:379). On real timers that handle keeps jest
    // alive for two minutes after the last assertion, so the clock is faked
    // for the call and the timer discarded with it.
    jest.useFakeTimers();
    try {
      afterResume(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }

    return textSentTo(s);
  }

  it("prints express's Ready to Receive line to a telnet caller", () => {
    expect(runUpload('telnet')).toBe('\r\nZmodem: Ready to Receive\r\n');
  });

  it("prints express's Ready to Receive line to a web caller", () => {
    expect(runUpload('web')).toBe('\r\nZmodem: Ready to Receive\r\n');
  });

  it('never mentions the tool that happens to be doing the receiving', () => {
    // `lrzsz`, `sz` and `rz` are implementation detail. express names none of
    // them, and a caller has no use for the name of a program on our host.
    for (const transportType of ['telnet', 'web'] as const) {
      const out = runUpload(transportType);
      expect(out).not.toMatch(/lrzsz/i);
      expect(out).not.toMatch(/Send with (sz|rz) now/i);
    }
  });
});
