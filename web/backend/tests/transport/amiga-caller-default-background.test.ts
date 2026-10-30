/**
 * An Amiga telnet caller gets black where the board writes "default background".
 *
 * The board's art and code write SGR 49 instead of 40 (a4b68ddef) so macOS
 * Terminal shows its own background. An Amiga telnet client ignores 49 and
 * keeps the previous background: a caller's photo of the SWEDISH HEADQUARTERS
 * logo showed the blue of one row painted across every cell the art meant to
 * clear (2026-10-30). The web terminal was fine. This drives the real
 * connection emitter - the one place a screen string becomes bytes for a
 * telnet or SSH caller - and the fold where it lives.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { foldDefaultBackgroundToBlack } from '../../src/utils/true-colour-fold.util';

function wire(session: any) {
  const writes: Buffer[] = [];
  const connection: any = {
    sessionId: 'amiga-bg',
    session,
    write: (data: Buffer | string) => { writes.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)); },
    on: () => undefined, off: () => undefined, close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);
  return { emitter, bytes: () => Buffer.concat(writes).toString('latin1') };
}

const row = '\x1b[0;44m LOGO \x1b[49m  \x1b[1;37;49mTITLE\x1b[0m\r\n';

describe('default background on the wire', () => {
  it('an Amiga caller gets 40 for every 49; a modern caller keeps 49', () => {
    const amiga = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, unicodeCapable: false, isAmigaTerminal: true });
    amiga.emitter.emit('ansi-output', row);
    expect(amiga.bytes()).toBe('\x1b[0;44m LOGO \x1b[40m  \x1b[1;37;40mTITLE\x1b[0m\r\n');

    const modern = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, unicodeCapable: true });
    modern.emitter.emit('ansi-output', row);
    expect(modern.bytes()).toBe(row);
  });

  it('a caller that named no terminal type is treated like the Amiga', () => {
    const unknown = wire({ terminalType: 'modern', petsciiMode: false, screenWidth: 80 });
    unknown.emitter.emit('ansi-output', '\x1b[49m');
    expect(unknown.bytes()).toBe('\x1b[40m');
  });
});

describe('foldDefaultBackgroundToBlack', () => {
  it('leaves extended-colour arguments of 49 alone', () => {
    expect(foldDefaultBackgroundToBlack('\x1b[38;5;49m')).toBe('\x1b[38;5;49m');
    expect(foldDefaultBackgroundToBlack('\x1b[48;2;49;49;49;49m')).toBe('\x1b[48;2;49;49;49;40m');
  });

  it('leaves non-SGR sequences and text alone', () => {
    expect(foldDefaultBackgroundToBlack('\x1b[49H 49m')).toBe('\x1b[49H 49m');
  });
});
