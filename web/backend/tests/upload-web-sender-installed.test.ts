/**
 * Regression: startZmodemUpload must install a real socket-emit sender
 * for web transport — `getTransferTransport` returns a no-op placeholder
 * function when `session.transferRawSend` is missing (always true for web,
 * since transferRawSend is only set by setupTelnetSSHHandler).
 *
 * Pre-fix bug shape:
 *   const transport = getTransferTransport(session);  // .send is no-op fn
 *   if (!transport.send) {  // function is truthy — branch NEVER fires
 *     transport.send = (buf) => socket.emit('transfer-raw:data', buf);
 *   }
 *
 * Result: lrzsz writes bytes to transport.send() → no-op → browser never
 * receives ZRINIT → zmodem.js Sentry never detects the session → 30s
 * client-side timeout fires → transfer-raw:cancel → rz killed by SIGTERM.
 * User-visible symptom: U-command multi-file upload picks files, "arming
 * Sentry" logs, then nothing for 30s, then "Upload cancelled."
 *
 * The RZ command (transfer-misc-commands.handler.ts) doesn't have this
 * bug because it builds its sender inline:
 *   const sender = session.transferRawSend || ((b) => socket.emit(...));
 *
 * Driven through the REAL user-commands.handler (technique of
 * handlers/upload-offers-the-resume.test.ts): the resume step and both
 * transfer engines are stubbed, the engine's constructor captures the
 * transport the handler gives it, and the test writes bytes into that
 * transport's send - they must come out of the socket as transfer-raw:data.
 * Whatever getTransferTransport returns, the bytes either reach the
 * browser or they do not; that is the property.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Transport = { type: string; send: (buf: Buffer) => void };

function loadWith(engine: 'lrzsz' | 'zmodem.js') {
  jest.resetModules();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ul-web-sender-'));
  process.env.BBS_ROOT = root;
  process.env.BBS_DATA_DIR = root;

  const startResumeStuff = jest.fn();
  jest.doMock('../src/services/resume-stuff.service', () => ({
    ...jest.requireActual('../src/services/resume-stuff.service'),
    startResumeStuff,
  }));
  const captured: { transport?: Transport } = {};
  class Engine {
    constructor(opts: { transport: Transport }) { captured.transport = opts.transport; }
    start() { /* no receive runs in this test */ }
    handleInput() { /* nothing arrives */ }
  }
  jest.doMock('../src/services/lrzsz-transfer.service', () => ({
    isLrzszAvailable: () => engine === 'lrzsz',
    LrzszTransferManager: Engine,
  }));
  jest.doMock('../src/services/zmodem-transfer.service', () => ({
    ZmodemTransferManager: Engine,
  }));

  const handler = require('../src/handlers/commands/user-commands.handler');
  return { handler, startResumeStuff, captured };
}

function socket() {
  return {
    id: 'ul', emit: jest.fn(),
    on: jest.fn(function (this: unknown) { return this; }),
    once: jest.fn(function (this: unknown) { return this; }),
    join: jest.fn(function (this: unknown) { return this; }),
  } as any;
}

/** A web caller types U; returns the socket and the transport the engine got. */
function uploadFromBrowser(engine: 'lrzsz' | 'zmodem.js') {
  const { handler, startResumeStuff, captured } = loadWith(engine);
  const s = socket();
  // No connectionType and no transferRawSend: a browser session.
  const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };
  handler.startZmodemUpload(s, session);
  // The web path arms a 120 s "no file picked" timer; fake the clock for it.
  jest.useFakeTimers();
  try {
    (startResumeStuff.mock.calls[0][4] as (r: unknown) => void)(false);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
  expect(captured.transport).toBeDefined();
  return { s, transport: captured.transport! };
}

describe('startZmodemUpload installs a real socket-emit sender for web', () => {
  test.each(['lrzsz', 'zmodem.js'] as const)(
    'bytes the %s receiver sends reach the browser as transfer-raw:data',
    (engine) => {
      const { s, transport } = uploadFromBrowser(engine);
      expect(transport.type).toBe('web');
      const zrinit = Buffer.from('**\x18B0100000023be50\r\n');
      transport.send(zrinit);
      const sent = s.emit.mock.calls.filter((c: unknown[]) => c[0] === 'transfer-raw:data');
      expect(sent).toHaveLength(1);
      expect(Buffer.from(sent[0][1]).equals(zrinit)).toBe(true);
    },
  );
});
