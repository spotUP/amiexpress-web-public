/**
 * A registration caller typed `Sandbox` at `Group:` and saw
 *
 *   Group: Sand
 *   Phone Number: box
 *
 * (sandbox board, 2026-10-24). The typed characters are echoed through
 * emitText, which holds text for up to 16 ms (ansi-buffer.util.ts); Enter
 * printed the next prompt with a direct socket.emit('ansi-output'), which
 * reached the wire while `box` was still held. The connection emitter is the
 * innermost choke for telnet/SSH, so it sends the held text first.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { emitText, releaseAnsiBuffer } from '../../src/utils/ansi-buffer.util';

function telnetCaller() {
  const written: Buffer[] = [];
  const connection: any = {
    write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
    session: { connectionType: 'telnet', screenWidth: 80 },
    sessionId: 'echo-order-test',
    on() {}, off() {}, close() {},
  };
  const emitter = buildConnectionEmitter(connection);
  return { emitter, wire: () => Buffer.concat(written).toString('latin1') };
}

describe('a direct emit does not overtake the echo emitText still holds', () => {
  it('prints the typed group before the phone prompt', () => {
    const { emitter, wire } = telnetCaller();
    for (const key of 'box') emitText(emitter, key);
    emitter.emit('ansi-output', '\r\nPhone Number: ');

    expect(wire()).toBe('box\r\nPhone Number: ');
    releaseAnsiBuffer(emitter);
  });

  it('sends held text once, not again when its timer would have fired', () => {
    jest.useFakeTimers();
    try {
      const { emitter, wire } = telnetCaller();
      emitText(emitter, 'box');
      emitter.emit('ansi-output', '\r\n');
      jest.advanceTimersByTime(50);

      expect(wire()).toBe('box\r\n');
      releaseAnsiBuffer(emitter);
    } finally {
      jest.useRealTimers();
    }
  });
});
