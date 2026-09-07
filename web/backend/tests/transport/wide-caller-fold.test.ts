/**
 * A caller wider than 80 columns gets the board's screens folded at 80 - AT
 * THE WIRE, whichever path the bytes took to get there.
 *
 * The sysop's telnet window negotiated NAWS 200x66. The board's screens are
 * 80-column documents that rely on the terminal wrapping at 80, so at 200
 * their art arrived strung out to the right. The first fix folded them in
 * `emitText`, and the MENU came right while BBSTITLE stayed "wide as ever":
 * a screen carrying a wipe code leaves through emitText, a screen without one
 * leaves through the MCI parser's INLINE mode, which writes to the socket
 * itself. `emitText` was never the choke for bytes. The connection emitter's
 * `ansi-output` branch is the one place every screen string becomes bytes for
 * a telnet or SSH caller, so this drives THAT - the real emitter, a fake wire
 * - with a direct `socket.emit`, exactly the bypass that got past emitText.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';

function wire(session: any) {
  const writes: Buffer[] = [];
  const connection: any = {
    sessionId: 'wide-fold',
    session,
    write: (data: Buffer | string) => { writes.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)); },
    on: () => undefined, off: () => undefined, close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);
  return { emitter, bytes: () => Buffer.concat(writes).toString('latin1') };
}

const ansi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const rowWidths = (s: string) => ansi(s).split('\r\n').map((r) => r.length);

describe('a 200-column telnet caller reads 80-column screens', () => {
  it('a screen emitted straight at the socket - the inline-MCI path - is folded at 80', () => {
    const { emitter, bytes } = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 200, screenHeight: 66 });
    emitter.emit('ansi-output', '\x1b[1;36m' + '|'.repeat(159) + '\x1b[0m\r\n');
    expect(rowWidths(bytes())).toEqual([80, 79, 0]);
  });

  it('a screen that arrives in two chunks folds where the terminal would have, not at each chunk', () => {
    const { emitter, bytes } = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 200, screenHeight: 66 });
    emitter.emit('ansi-output', 'a'.repeat(50));
    emitter.emit('ansi-output', 'a'.repeat(50) + '\r\n');
    expect(rowWidths(bytes())).toEqual([80, 20, 0]);
  });

  it('an 80-column caller gets every byte exactly as before', () => {
    const { emitter, bytes } = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 });
    const text = '\x1b[1;36m' + '|'.repeat(159) + '\x1b[0m\r\n';
    emitter.emit('ansi-output', text);
    expect(bytes()).toBe(text);
  });

  it('a positioned frame - a door, art with cursor addressing - is passed through untouched', () => {
    const { emitter, bytes } = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 200, screenHeight: 66 });
    const frame = '\x1b[2J\x1b[5;10H' + 'x'.repeat(120);
    emitter.emit('ansi-output', frame);
    expect(bytes()).toBe(frame);
  });
});
