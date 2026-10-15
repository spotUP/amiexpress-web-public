import { emitText } from '../../src/utils/ansi-buffer.util';

function makeSocket(session?: any) {
  const emitted: string[] = [];
  const socket: any = {
    id: `wrap-test-${Math.random()}`,
    session,
    emitted,
    emit(event: string, data: string) { if (event === 'ansi-output') emitted.push(data); return true; },
    on() { return socket; },
  };
  return socket;
}

describe('emitText session-width choke', () => {
  it('wraps prose to 40 for a C64 session', () => {
    const socket = makeSocket({ screenWidth: 40, petsciiMode: true });
    emitText(socket, 'word '.repeat(20).trim() + '\r\n', true);
    for (const line of socket.emitted.join('').split('\r\n')) {
      expect(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
    }
  });
  it('is byte-for-byte identity for an 80-column session', () => {
    const text = '\x1b[32m' + 'x'.repeat(120) + '\x1b[0m\r\n';
    const socket = makeSocket({ screenWidth: 80 });
    emitText(socket, text, true);
    expect(socket.emitted.join('')).toBe(text);
  });
  it('is identity when the socket carries no session (pre-login, tests)', () => {
    const text = 'y'.repeat(120);
    const socket = makeSocket(undefined);
    emitText(socket, text, true);
    expect(socket.emitted.join('')).toBe(text);
  });
  it('is byte-for-byte identity for a narrow non-PETSCII session (mobile/resized xterm never pays for C64 support)', () => {
    // socket-handlers.ts sets session.screenWidth from real xterm dimensions
    // for EVERY web socket, C64 or not. Wrapping must gate on petsciiMode,
    // not on screenWidth alone, or an ordinary user with a narrow browser
    // window gets their help/mail/bulletins reflowed.
    const text = 'word '.repeat(20).trim() + '\r\n';
    const socket = makeSocket({ screenWidth: 40, petsciiMode: false });
    emitText(socket, text, true);
    expect(socket.emitted.join('')).toBe(text);
  });
});
